// @ts-check
// Deterministic per-route budgets read from the production build manifests: no browser, no
// timing and no network. Startup bytes are re-gzipped at level 9 so results do not depend on how
// a server compresses them. Ceilings, limits and the policy for raising them live in budgets.json.
//
// Usage: node scripts/check-budgets.mjs [--dir=.next] [--record] [--base=http://127.0.0.1:3127]
//   --dir     build output to measure (the budget build uses placeholder public Supabase env)
//   --record  rewrite budgets.json ceilings from this build (current value plus headroom); it
//             never adds a module allowance and prints every raised or lowered ceiling
//   --base    also report catalogue-dependent HTML bytes from a running server (never gated)
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { gzipSync } from "node:zlib";
import { graphicsMarkers } from "../src/lib/garden/budget-markers.ts";
import { fallbackScene, locales, routeHref, routes } from "../src/lib/routes.ts";

export const KIB = 1024;
/** Headroom on byte ceilings, in percent of the measured value. */
export const HEADROOM_PERCENT = 4;
const BUDGETS = "budgets.json";
const REPORT = "artifacts/budget-report.json";
const THEMES = /** @type {const} */ (["day", "night"]);

/**
 * A detector finds a module in emitted chunk text by a string that survives minification.
 * @typedef {{ id: string, label: string, marker: string }} Detector
 */

/**
 * Modules that must never ship in a route's startup JS. budgets.json may list one under a
 * route's `ratchetModules` while it still ships there today; that allowance can only be removed.
 * @type {readonly Detector[]}
 */
export const MODULES = [
  { id: "radix-dialog", label: "Radix dialog", marker: '"DialogContentModal"' },
  { id: "three", label: "three.js", marker: "THREE.WebGLRenderer" },
  { id: "gsap", label: "GSAP", marker: "GreenSockGlobals" },
  { id: "binaural-engine", label: "binaural engine", marker: "createChannelMerger" },
  { id: "zod", label: "Zod", marker: "ZodError" },
  { id: "supabase-js", label: "supabase-js", marker: "supabase-js" },
  { id: "youtube-embed", label: "YouTube embed", marker: "youtube-nocookie.com/embed" },
];

/**
 * Every emitted chunk that contains one of these counts toward the graphics total: three.js and
 * GSAP by strings their builds contain, and the garden scenes, worker and GSAP layer by the
 * explicit markers of src/lib/garden/budget-markers.ts (including whatever shares their chunks).
 * The startup chunk that hosts the scene is gated with the route's startup JS instead.
 * @type {readonly Detector[]}
 */
export const GRAPHICS = [
  { id: "three", label: "three.js", marker: "THREE." },
  { id: "gsap", label: "GSAP", marker: "ScrollTrigger" },
  ...Object.entries(graphicsMarkers).map(([id, { label, marker }]) => ({
    id: `garden-${id}`,
    label,
    marker,
  })),
];

/**
 * Gated per-route metrics and their units. Byte metrics get headroom; counts get none.
 * @type {Readonly<Record<RouteMetric, "bytes" | "count">>}
 */
export const METRICS = {
  startupJsGzip: "bytes",
  startupCssGzip: "bytes",
  fontBytes: "bytes",
  fontRequests: "count",
  mobilePosterBytes: "bytes",
};

/**
 * @typedef {"startupJsGzip" | "startupCssGzip" | "fontBytes" | "fontRequests" | "mobilePosterBytes"} RouteMetric
 * @typedef {Record<RouteMetric, number>} RouteMeasurement
 * @typedef {RouteMeasurement & { ratchetModules: string[] }} RouteBudget
 * @typedef {{ graphicsJsGzip: number, mobilePosterBytes: number }} Limits
 * @typedef {{ policy: string[], limits: Limits, routes: Record<string, RouteBudget> }} Budgets
 * @typedef {{ path: string, bytes: Buffer }} Chunk
 * @typedef {{ url: string, format: string | null }} FontSource
 * @typedef {{ family: string, weight: string, style: string, ranges: [number, number][], sources: FontSource[] }} FontFace
 */

/** Gzip size at level 9, independent of any server's compression settings. @param {Uint8Array} bytes */
export function gzipSize(bytes) {
  return gzipSync(bytes, { level: 9 }).length;
}

/**
 * Ceiling for a measured value: bytes get HEADROOM_PERCENT rounded up to the next KiB, counts none.
 * @param {number} value @param {"bytes" | "count"} unit
 */
export function ceilingFor(value, unit) {
  if (unit === "count") return value;
  return Math.ceil((value * (100 + HEADROOM_PERCENT)) / (100 * KIB)) * KIB;
}

/**
 * Parses a CSS unicode-range value into inclusive code point pairs.
 * @param {string} value
 * @returns {[number, number][]}
 */
export function parseUnicodeRange(value) {
  return value.split(",").map((part) => {
    const token = part.trim().toUpperCase().replace(/^U\+/, "");
    // A single point, a start-end pair, or a point with trailing "?" wildcards.
    const match = /^([0-9A-F]{1,6})(?:-([0-9A-F]{1,6}))?$|^([0-9A-F]{0,5}\?{1,6})$/.exec(token);
    const wildcard = match?.[3];
    /** @type {[number, number]} */
    const range = wildcard
      ? [parseInt(wildcard.replaceAll("?", "0"), 16), parseInt(wildcard.replaceAll("?", "F"), 16)]
      : [parseInt(match?.[1] ?? "", 16), parseInt(match?.[2] ?? match?.[1] ?? "", 16)];
    if (!match || range[0] > range[1]) throw new Error(`Invalid unicode-range part: ${part}`);
    return range;
  });
}

/**
 * Splits a declaration block at top-level semicolons, so data URLs and quoted values stay whole.
 * @param {string} block
 * @returns {Map<string, string>}
 */
function declarations(block) {
  const result = new Map();
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let index = 0; index <= block.length; index++) {
    const character = block[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") quote = character;
    else if (character === "(") depth++;
    else if (character === ")") depth--;
    else if (depth === 0 && (character === ";" || index === block.length)) {
      const declaration = block.slice(start, index);
      start = index + 1;
      const colon = declaration.indexOf(":");
      if (colon > 0)
        result.set(
          declaration.slice(0, colon).trim().toLowerCase(),
          declaration.slice(colon + 1).trim(),
        );
    }
  }
  return result;
}

/** @param {string | undefined} value */
const unquote = (value) => (value ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");

/**
 * Extracts @font-face rules from minified or formatted CSS. A face without unicode-range covers
 * every code point, exactly as browsers treat it.
 * @param {string} css
 * @returns {FontFace[]}
 */
export function fontFaces(css) {
  return [...css.matchAll(/@font-face\s*\{((?:[^}"']|"[^"]*"|'[^']*')*)\}/g)].map((match) => {
    const rule = declarations(match[1]);
    const range = rule.get("unicode-range");
    const sources = [
      ...(rule.get("src") ?? "").matchAll(
        /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)\s*(?:format\(\s*['"]?([^'")]+)['"]?\s*\))?/g,
      ),
    ].map((source) => ({ url: source[1] ?? source[2] ?? source[3], format: source[4] ?? null }));
    return {
      family: unquote(rule.get("font-family")),
      weight: rule.get("font-weight") ?? "400",
      style: rule.get("font-style") ?? "normal",
      ranges: range ? parseUnicodeRange(range) : [[0, 0x10ffff]],
      sources,
    };
  });
}

/**
 * Code points of every string in a message tree.
 * @param {unknown} messages
 * @returns {Set<number>}
 */
export function codePointsOf(messages) {
  const result = new Set();
  /** @param {unknown} value */
  const visit = (value) => {
    if (typeof value === "string")
      for (const character of value) result.add(character.codePointAt(0));
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(messages);
  return result;
}

/**
 * True when the ranges include at least one of the code points.
 * @param {[number, number][]} ranges @param {Iterable<number>} codePoints
 */
export function covers(ranges, codePoints) {
  for (const point of codePoints)
    if (ranges.some(([start, end]) => point >= start && point <= end)) return true;
  return false;
}

/**
 * Detectors whose marker matches no emitted chunk. Such a detector can no longer see its module,
 * so its absence from startup would prove nothing.
 * @param {readonly Detector[]} detectors @param {readonly Chunk[]} chunks
 */
export function staleDetectors(detectors, chunks) {
  return detectors.filter(
    (detector) => !chunks.some((chunk) => chunk.bytes.includes(detector.marker)),
  );
}

/**
 * Ids of the detectors whose marker appears in any of the chunks.
 * @param {readonly Detector[]} detectors @param {readonly Chunk[]} chunks
 */
export function detected(detectors, chunks) {
  return detectors
    .filter((detector) => chunks.some((chunk) => chunk.bytes.includes(detector.marker)))
    .map((detector) => detector.id);
}

/**
 * True when the client bundle inlines a public Supabase project URL. Without one, sign-in code
 * is dead and the bundle is smaller than production, so the ceilings would pass vacuously.
 * @param {readonly Chunk[]} chunks
 */
export function productionShaped(chunks) {
  return chunks.some((chunk) =>
    /https:\/\/[a-z0-9-]+\.supabase\.(?:co|in)\b/.test(chunk.bytes.toString("latin1")),
  );
}

/**
 * Compares measurements with ceilings. A measured metric without a ceiling fails, and so does a
 * budgeted route that was not measured, so budgets.json cannot silently drift from the registry.
 * @param {Record<string, RouteMeasurement>} measured
 * @param {Record<string, Partial<RouteMeasurement>>} ceilings
 */
export function compareCeilings(measured, ceilings) {
  /** @type {string[]} */
  const failures = [];
  for (const [route, values] of Object.entries(measured))
    for (const metric of /** @type {RouteMetric[]} */ (Object.keys(METRICS))) {
      const ceiling = ceilings[route]?.[metric];
      if (typeof ceiling !== "number")
        failures.push(`${route}.${metric}: no ceiling in ${BUDGETS}`);
      else if (values[metric] > ceiling)
        failures.push(`${route}.${metric}: ${values[metric]} exceeds the ceiling ${ceiling}`);
    }
  for (const route of Object.keys(ceilings))
    if (!(route in measured)) failures.push(`${route}: budgeted but not a registered route`);
  return failures;
}

/**
 * Startup modules against the per-route ratchet allowances. A module that ships without an
 * allowance is forbidden; an allowance for a module that no longer ships is stale and must be
 * removed, so the ratchet only ever tightens.
 * @param {Record<string, string[]>} present
 * @param {Record<string, string[] | undefined>} allowed
 * @param {readonly Detector[]} modules
 */
export function moduleFindings(present, allowed, modules) {
  const label = (/** @type {string} */ id) =>
    modules.find((module) => module.id === id)?.label ?? id;
  /** @type {string[]} */
  const failures = [];
  for (const [route, ids] of Object.entries(present)) {
    const allowances = allowed[route] ?? [];
    for (const id of ids)
      if (!allowances.includes(id))
        failures.push(`${route}: ${label(id)} is forbidden in startup JS`);
    for (const id of allowances)
      if (!modules.some((module) => module.id === id))
        failures.push(`${route}: unknown module "${id}" in ratchetModules`);
      else if (!ids.includes(id))
        failures.push(
          `${route}: ${label(id)} no longer ships in startup; remove it from ratchetModules`,
        );
  }
  return failures;
}

/** @param {string} directory @returns {Promise<string[]>} */
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
      ),
    )
  ).flat();
}

/** @param {string} path */
const json = async (path) => JSON.parse(await readFile(path, "utf8"));

/**
 * The page's client reference manifest, evaluated without executing anything else.
 * @param {string} path @param {string} page
 * @returns {Promise<{ entryJSFiles: Record<string, string[]>, entryCSSFiles: Record<string, { path: string, inlined: boolean }[]> }>}
 */
async function clientManifest(path, page) {
  /** @type {Record<string, any>} */
  const sandbox = {};
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  runInNewContext(await readFile(path, "utf8"), sandbox, { timeout: 1000 });
  const manifest = sandbox.__RSC_MANIFEST?.[page];
  if (!manifest?.entryJSFiles || !manifest.entryCSSFiles)
    throw new Error(`${path} has no entry files for ${page}`);
  return manifest;
}

/**
 * Resolves a font URL from a CSS file in the build to a path inside the build directory.
 * @param {string} dir @param {string} css @param {string} url
 */
function fontPath(dir, css, url) {
  const clean = url.replace(/[?#].*$/, "");
  if (/^[a-z]+:/i.test(clean) || clean.startsWith("//"))
    throw new Error(`Startup font ${url} is not served from the build`);
  return clean.startsWith("/_next/")
    ? join(dir, clean.slice("/_next/".length))
    : join(dir, posix.join(posix.dirname(css), clean));
}

/** @param {string} name @param {string} fallback */
const argument = (name, fallback) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

async function main() {
  const dir = argument("dir", ".next");
  const base = argument("base", "");
  const record = process.argv.includes("--record");
  /** @type {Budgets} */
  const budgets = await json(BUDGETS);
  const failures = [];

  const build = await json(join(dir, "build-manifest.json"));
  const appPaths = await json(join(dir, "server/app-paths-manifest.json"));
  /** @type {Chunk[]} */
  const emitted = [];
  for (const path of await files(join(dir, "static")))
    if (path.endsWith(".js"))
      emitted.push({
        path: relative(dir, path).split(sep).join("/"),
        bytes: await readFile(path),
      });
  const chunk = (/** @type {string} */ path) => {
    const found = emitted.find((candidate) => candidate.path === path);
    if (!found) throw new Error(`Manifest chunk ${path} was not emitted`);
    return found;
  };

  if (!productionShaped(emitted))
    failures.push(
      `${dir} was built without public Supabase env; rebuild with NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co and a dummy NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
    );
  for (const detector of staleDetectors([...MODULES, ...GRAPHICS], emitted))
    failures.push(
      `detector stale: "${detector.marker}" (${detector.label}) matches no emitted chunk; update the marker`,
    );

  const graphics = emitted.filter((candidate) => detected(GRAPHICS, [candidate]).length);
  const graphicsJsGzip = graphics.reduce((sum, candidate) => sum + gzipSize(candidate.bytes), 0);
  if (graphicsJsGzip > budgets.limits.graphicsJsGzip)
    failures.push(
      `graphics JS ${graphicsJsGzip} exceeds the limit ${budgets.limits.graphicsJsGzip} (gzip)`,
    );

  const posters = (await readdir("public/gardens")).filter((name) => name.endsWith("-480.avif"));
  /** @type {Record<string, number>} */
  const posterBytes = {};
  for (const name of posters) posterBytes[name] = (await stat(join("public/gardens", name))).size;
  for (const [name, bytes] of Object.entries(posterBytes))
    if (bytes > budgets.limits.mobilePosterBytes)
      failures.push(
        `mobile poster ${name} is ${bytes} bytes, over ${budgets.limits.mobilePosterBytes}`,
      );
  for (const scene of new Set([...routes.map((entry) => entry.scene), fallbackScene]))
    for (const theme of THEMES)
      if (!(`${scene}-${theme}-480.avif` in posterBytes))
        failures.push(`mobile poster ${scene}-${theme}-480.avif is missing`);

  const vietnamese = codePointsOf(await json("src/messages/vi.json"));
  const latin = codePointsOf(await json("src/messages/en.json"));
  const rootFiles = build.rootMainFiles.filter(
    (/** @type {string} */ file) => !build.polyfillFiles.includes(file),
  );

  /** @type {Record<string, RouteMeasurement>} */
  const measured = {};
  /** @type {Record<string, string[]>} */
  const present = {};
  /** @type {Record<string, object>} */
  const details = {};
  for (const entry of routes) {
    const page = `/[locale]${entry.segment ? `/${entry.segment}` : ""}/page`;
    if (!appPaths[page]) throw new Error(`${page} is missing from app-paths-manifest.json`);
    const manifest = await clientManifest(
      join(dir, "server", appPaths[page].replace(/\.js$/, "_client-reference-manifest.js")),
      page,
    );
    const js = [...new Set([...rootFiles, ...Object.values(manifest.entryJSFiles).flat()])].map(
      chunk,
    );
    const css = [
      ...new Map(
        Object.values(manifest.entryCSSFiles)
          .flat()
          .map((file) => [file.path, file]),
      ).values(),
    ];
    /** @type {{ path: string, inlined: boolean, text: string }[]} */
    const stylesheets = [];
    for (const file of css)
      stylesheets.push({ ...file, text: await readFile(join(dir, file.path), "utf8") });
    /** @type {Map<string, { url: string, bytes: number, weight: string, style: string }>} */
    const fonts = new Map();
    for (const sheet of stylesheets)
      for (const face of fontFaces(sheet.text)) {
        if (!covers(face.ranges, vietnamese) && !covers(face.ranges, latin)) continue;
        // Browsers fetch the first source in a format they support (woff2 here); a data URL
        // is already counted in the stylesheet bytes.
        const source = face.sources[0];
        if (!source || source.url.startsWith("data:")) continue;
        const path = fontPath(dir, sheet.path, source.url);
        fonts.set(path, {
          url: source.url,
          bytes: (await stat(path)).size,
          weight: face.weight,
          style: face.style,
        });
      }
    const poster = Object.fromEntries(
      THEMES.map((theme) => [theme, posterBytes[`${entry.scene}-${theme}-480.avif`] ?? 0]),
    );
    measured[entry.key] = {
      startupJsGzip: js.reduce((sum, file) => sum + gzipSize(file.bytes), 0),
      startupCssGzip: stylesheets.reduce(
        (sum, sheet) => sum + gzipSize(Buffer.from(sheet.text)),
        0,
      ),
      fontBytes: [...fonts.values()].reduce((sum, font) => sum + font.bytes, 0),
      fontRequests: fonts.size,
      mobilePosterBytes: Math.max(poster.day, poster.night),
    };
    present[entry.key] = detected(MODULES, js);
    details[entry.key] = {
      js: js.map((file) => ({ path: file.path, gzipBytes: gzipSize(file.bytes) })),
      css: stylesheets.map((sheet) => ({
        path: sheet.path,
        inlined: sheet.inlined,
        gzipBytes: gzipSize(Buffer.from(sheet.text)),
      })),
      fonts: [...fonts.values()],
      mobilePosters: poster,
      modules: present[entry.key],
    };
  }

  /** @type {Record<string, number>} */
  const artwork = {};
  for (const name of (await readdir("public/artwork")).sort())
    artwork[name] = (await stat(join("public/artwork", name))).size;
  /** @type {Record<string, { bytes: number, gzipBytes: number }>} */
  const html = {};
  if (base)
    for (const locale of locales)
      for (const entry of routes) {
        const href = routeHref(locale, entry.key);
        const response = await fetch(new URL(href, base));
        if (!response.ok) throw new Error(`${href} returned ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        html[href] = { bytes: bytes.length, gzipBytes: gzipSize(bytes) };
      }

  if (record) {
    if (!productionShaped(emitted)) throw new Error("Refusing to record ceilings from this build");
    /** @type {Record<string, RouteBudget>} */
    const next = {};
    for (const entry of routes) {
      const previous = budgets.routes[entry.key];
      const values = measured[entry.key];
      next[entry.key] = /** @type {RouteBudget} */ ({
        ...Object.fromEntries(
          /** @type {RouteMetric[]} */ (Object.keys(METRICS)).map((metric) => {
            const ceiling = ceilingFor(values[metric], METRICS[metric]);
            const old = previous?.[metric];
            if (old !== ceiling)
              console.log(
                `${old === undefined || ceiling > old ? "raised" : "lowered"} ${entry.key}.${metric}: ${old ?? "none"} -> ${ceiling}`,
              );
            return [metric, ceiling];
          }),
        ),
        ratchetModules: (previous?.ratchetModules ?? []).filter((id) =>
          present[entry.key].includes(id),
        ),
      });
    }
    budgets.routes = next;
    const { default: prettier } = await import("prettier");
    await writeFile(
      BUDGETS,
      await prettier.format(JSON.stringify(budgets), {
        ...(await prettier.resolveConfig(BUDGETS)),
        filepath: BUDGETS,
      }),
    );
    console.log(`Wrote ${BUDGETS}; state every raised ceiling in the commit message.`);
  }

  failures.push(...compareCeilings(measured, budgets.routes));
  failures.push(
    ...moduleFindings(
      present,
      Object.fromEntries(
        Object.entries(budgets.routes).map(([key, value]) => [key, value.ratchetModules]),
      ),
      MODULES,
    ),
  );

  const report = {
    passed: failures.length === 0,
    failures,
    build: dir,
    gzipLevel: 9,
    limits: budgets.limits,
    graphics: {
      gzipBytes: graphicsJsGzip,
      chunks: graphics.map((candidate) => ({
        path: candidate.path,
        gzipBytes: gzipSize(candidate.bytes),
      })),
    },
    mobilePosters: posterBytes,
    routes: Object.fromEntries(
      routes.map((entry) => [
        entry.key,
        {
          measured: measured[entry.key],
          ceilings: budgets.routes[entry.key],
          ...details[entry.key],
        },
      ]),
    ),
    reportedOnly: { artwork, html: base ? html : "pass --base=<url> to measure HTML" },
  };
  await mkdir("artifacts", { recursive: true });
  await writeFile(REPORT, JSON.stringify(report, null, 2) + "\n");

  const kib = (/** @type {number} */ bytes) => (bytes / KIB).toFixed(1).padStart(6);
  console.log(
    "route           JS gz KiB  CSS gz KiB  font KiB  fonts  poster KiB  startup modules",
  );
  for (const entry of routes) {
    const values = measured[entry.key];
    console.log(
      `${entry.key.padEnd(15)} ${kib(values.startupJsGzip)}     ${kib(values.startupCssGzip)}      ${kib(values.fontBytes)}  ${String(values.fontRequests).padStart(5)}      ${kib(values.mobilePosterBytes)}  ${present[entry.key].join(", ") || "-"}`,
    );
  }
  console.log(
    `graphics JS ${kib(graphicsJsGzip)} KiB gzip of ${kib(budgets.limits.graphicsJsGzip)}; largest mobile poster ${kib(Math.max(...Object.values(posterBytes)))} KiB of ${kib(budgets.limits.mobilePosterBytes)}`,
  );
  console.log(`Report: ${REPORT}`);
  if (failures.length) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exitCode = 1;
  } else console.log("Budgets passed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
