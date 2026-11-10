// @ts-check
// DOM and computed-style oracle for CSS refactors that must not change what users see.
// For every state in scripts/visual/states.mjs it records a normalized DOM (tags, sorted
// attributes, text) and the full getComputedStyle of every element, of generated ::before and
// ::after boxes, of ::placeholder and of ::selection, plus every custom property declared in the
// stylesheets as read on :root and body.
//
// Usage (against a production preview, never a dev server):
//   node scripts/visual/snapshot.mjs --base=http://127.0.0.1:3131            write the baseline
//   node scripts/visual/snapshot.mjs --base=http://127.0.0.1:3131 --compare  print exact differences
//   node scripts/visual/snapshot.mjs --from=current                         re-compare stored captures
// Options: --states=<regex> --concurrency=<n> --label=<name> (default "baseline" or "current").
// Captures are written gzipped to artifacts/visual/styles/<label>/ (gitignored).
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import { startFixtureServer } from "../../tests/browser-fixtures/server.mjs";
import { contextOptions, prepare, select } from "./states.mjs";

/** @param {string} name */
const argument = (name) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const from = argument("from");
const compare = process.argv.includes("--compare") || from !== undefined;
const base = argument("base") ?? process.env.E2E_BASE_URL;
const label = argument("label") ?? (compare ? "current" : "baseline");
const concurrency = Number(argument("concurrency") ?? "4");
const selected = select(argument("states"));
const root = "artifacts/visual/styles";
if (!base && !from) throw new Error("Pass --base=<production preview origin> or set E2E_BASE_URL.");
if (!/^[a-z0-9_-]+$/i.test(from ?? label)) throw new Error("Invalid --label or --from");
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16)
  throw new Error("Invalid --concurrency");
if (!selected.length) throw new Error("No state matches --states");

/**
 * @typedef {{
 *   id: string,
 *   dom: string[],
 *   properties: string[],
 *   values: string[],
 *   rows: { key: string, pseudo: string, values: number[] }[],
 *   custom: Record<string, Record<string, number>>,
 *   customNames: string[],
 * }} Capture
 */

/**
 * Runs in the page. Returns the normalized DOM and dictionary-encoded computed styles.
 * @param {string[]} knownCustomNames custom properties to read even if no stylesheet declares them
 */
function capture(knownCustomNames) {
  const skip = new Set(["SCRIPT", "STYLE", "LINK", "NOSCRIPT", "TEMPLATE"]);
  /** @type {Map<string, number>} */
  const index = new Map();
  /** @type {string[]} */
  const values = [];
  const intern = (/** @type {string} */ value) => {
    let position = index.get(value);
    if (position === undefined) {
      position = values.length;
      values.push(value);
      index.set(value, position);
    }
    return position;
  };
  const customNames = new Set(knownCustomNames);
  /** @param {CSSRuleList} rules */
  const collect = (rules) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule)
        for (let item = 0; item < rule.style.length; item++) {
          const name = rule.style.item(item);
          if (name.startsWith("--")) customNames.add(name);
        }
      if ("cssRules" in rule && rule.cssRules) collect(/** @type {CSSRuleList} */ (rule.cssRules));
    }
  };
  for (const sheet of document.styleSheets) collect(sheet.cssRules);
  const sortedCustom = [...customNames].sort();
  const reference = getComputedStyle(document.documentElement);
  /** @type {string[]} */
  const properties = [];
  for (let item = 0; item < reference.length; item++) properties.push(reference.item(item));
  /** @type {{ key: string, pseudo: string, values: number[] }[]} */
  const rows = [];
  /** @type {Record<string, Record<string, number>>} */
  const custom = {};
  /** @type {string[]} */
  const dom = [];
  // React's useId values (and the Radix ids built from them) depend on how many lazily loaded
  // components mounted first, so they are renamed in order of appearance.
  /** @type {Map<string, string>} */
  const ids = new Map();
  const canonical = (/** @type {string} */ text) =>
    text.replace(/_r_[0-9a-z]+_|«r[0-9a-z]+»|:r[0-9a-z]+:/gi, (id) => {
      if (!ids.has(id)) ids.set(id, `<id${ids.size + 1}>`);
      return /** @type {string} */ (ids.get(id));
    });
  /** @param {Element} element @param {string} key @param {string} pseudo */
  const record = (element, key, pseudo) => {
    const style = getComputedStyle(element, pseudo || null);
    rows.push({
      key,
      pseudo,
      values: properties.map((name) => intern(style.getPropertyValue(name))),
    });
  };
  /** @param {Element} element @param {string} key @param {number} depth */
  const walk = (element, key, depth) => {
    const pad = "  ".repeat(depth);
    const attributes = [...element.attributes]
      .map((attribute) => `${attribute.name}=${JSON.stringify(canonical(attribute.value))}`)
      .sort();
    dom.push(`${pad}<${element.localName}${attributes.length ? " " : ""}${attributes.join(" ")}>`);
    record(element, key, "");
    for (const pseudo of ["::before", "::after"]) {
      const content = getComputedStyle(element, pseudo).content;
      if (content !== "none" && content !== "normal") record(element, key, pseudo);
    }
    if (element.matches("input[placeholder], textarea[placeholder]"))
      record(element, key, "::placeholder");
    if (element === document.documentElement || element === document.body) {
      record(element, key, "::selection");
      const style = getComputedStyle(element);
      custom[key] = Object.fromEntries(
        sortedCustom.map((name) => [name, intern(style.getPropertyValue(name))]),
      );
    }
    /** @type {Map<string, number>} */
    const seen = new Map();
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        dom.push(`${pad}  #text ${JSON.stringify(node.nodeValue)}`);
        continue;
      }
      if (!(node instanceof Element) || skip.has(node.tagName)) continue;
      if (element === document.documentElement && node.localName === "head") continue;
      const classes = [...node.classList].sort().join(".");
      const id = node.id ? `#${canonical(node.id)}` : "";
      const name = `${node.localName}${id}${classes ? `.${classes}` : ""}`;
      const nth = seen.get(name) ?? 0;
      seen.set(name, nth + 1);
      walk(node, `${key} > ${name}${nth ? `:${nth}` : ""}`, depth + 1);
    }
  };
  walk(document.documentElement, "html", 0);
  // Head metadata that can change rendering (theme color, viewport, title) without assets.
  for (const meta of document.head.querySelectorAll("meta, title"))
    dom.unshift(
      `head <${meta.localName} ${[...meta.attributes]
        .map((attribute) => `${attribute.name}=${JSON.stringify(attribute.value)}`)
        .sort()
        .join(" ")}>${meta.localName === "title" ? JSON.stringify(meta.textContent) : ""}`,
    );
  return { dom, properties, values, rows, custom, customNames: sortedCustom };
}

/** @param {string} directory @param {string} id */
const file = (directory, id) => `${root}/${directory}/${id}.json.gz`;
/** @param {string} path @returns {Promise<Capture | null>} */
async function load(path) {
  const data = await readFile(path).catch(() => null);
  return data ? JSON.parse(gunzipSync(data).toString("utf8")) : null;
}

/**
 * @param {Capture} before
 * @param {Capture} after
 * @returns {{ topic: string, text: string }[]} human-readable differences, each with the property
 *   (or "dom" / "box") it concerns
 */
function differences(before, after) {
  /** @type {{ topic: string, text: string }[]} */
  const out = [];
  const domLength = Math.max(before.dom.length, after.dom.length);
  for (let line = 0; line < domLength; line++)
    if (before.dom[line] !== after.dom[line])
      out.push({
        topic: "dom",
        text: `dom line ${line + 1}: ${before.dom[line] ?? "(none)"}\n          now: ${after.dom[line] ?? "(none)"}`,
      });
  /** @param {Capture} capture */
  const rowsOf = (capture) =>
    new Map(
      capture.rows.map((row) => [
        `${row.key}${row.pseudo}`,
        new Map(
          capture.properties.map((name, position) => [name, capture.values[row.values[position]]]),
        ),
      ]),
    );
  const left = rowsOf(before);
  const right = rowsOf(after);
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(key);
    const b = right.get(key);
    if (!a || !b) {
      out.push({ topic: "box", text: `${key}: ${a ? "box removed" : "box added"}` });
      continue;
    }
    for (const name of new Set([...a.keys(), ...b.keys()]))
      if (a.get(name) !== b.get(name))
        out.push({
          topic: name,
          text: `${key} ${name}: ${a.get(name) ?? "(absent)"} -> ${b.get(name) ?? "(absent)"}`,
        });
  }
  for (const key of new Set([...Object.keys(before.custom), ...Object.keys(after.custom)]))
    for (const name of new Set([
      ...Object.keys(before.custom[key] ?? {}),
      ...Object.keys(after.custom[key] ?? {}),
    ])) {
      const a = before.custom[key]?.[name];
      const b = after.custom[key]?.[name];
      const va = a === undefined ? "(absent)" : before.values[a];
      const vb = b === undefined ? "(absent)" : after.values[b];
      if (va !== vb)
        out.push({
          topic: name,
          text: `${key} ${name}: ${JSON.stringify(va)} -> ${JSON.stringify(vb)}`,
        });
    }
  return out;
}

const commit = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
})();
/** @type {{ id: string, problems: { topic: string, text: string }[] }[]} */
const failures = [];
let identical = 0;
const started = Date.now();
if (from) {
  for (const state of selected) {
    const stored = await load(file("baseline", state.id));
    const current = await load(file(from, state.id));
    if (!stored || !current)
      failures.push({ id: state.id, problems: [{ topic: "missing", text: "capture missing" }] });
    else {
      const problems = differences(stored, current);
      if (problems.length) failures.push({ id: state.id, problems });
      else identical += 1;
    }
  }
} else await captureAll();

async function captureAll() {
  await mkdir(`${root}/${label}`, { recursive: true });
  const needsFixture = selected.some((state) => state.kind === "fixture");
  const fixture = needsFixture
    ? await startFixtureServer({ cacheDir: "node_modules/.vite/visual-snapshot" })
    : null;
  const browser = await chromium.launch({ headless: true });
  const browserVersion = browser.version();
  const queue = [...selected];
  try {
    const worker = async () => {
      for (let state = queue.shift(); state; state = queue.shift()) {
        const context = await browser.newContext(contextOptions(state));
        try {
          const page = await context.newPage();
          await prepare(page, state, { app: base, fixture: fixture?.origin });
          const stored = compare ? await load(file("baseline", state.id)) : null;
          if (compare && !stored) {
            failures.push({
              id: state.id,
              problems: [{ topic: "missing", text: "no baseline capture" }],
            });
            continue;
          }
          const result = await page.evaluate(capture, stored?.customNames ?? []);
          /** @type {Capture} */
          const current = { id: state.id, ...result };
          await writeFile(file(label, state.id), gzipSync(JSON.stringify(current)));
          if (stored) {
            const problems = differences(stored, current);
            if (problems.length) failures.push({ id: state.id, problems });
            else identical += 1;
          }
          process.stdout.write(".");
        } catch (error) {
          failures.push({
            id: state.id,
            problems: [{ topic: "error", text: `capture failed: ${String(error)}` }],
          });
          process.stdout.write("x");
        } finally {
          await context.close();
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
  } finally {
    await browser.close();
    await fixture?.server.close();
  }
  process.stdout.write("\n");
  await writeFile(
    `${root}/${label}/manifest.json`,
    JSON.stringify(
      {
        commit,
        createdAt: new Date().toISOString(),
        browser: browserVersion,
        states: selected.map((state) => state.id),
        failures: failures.map((failure) => failure.id),
      },
      null,
      2,
    ) + "\n",
  );
}
for (const failure of failures.sort((a, b) => a.id.localeCompare(b.id))) {
  console.log(`\n${failure.id}: ${failure.problems.length} difference(s)`);
  for (const problem of failure.problems.slice(0, 40)) console.log(`  ${problem.text}`);
  if (failure.problems.length > 40) console.log(`  ... ${failure.problems.length - 40} more`);
}
if (failures.length) {
  /** @type {Map<string, { count: number, states: Set<string> }>} */
  const topics = new Map();
  for (const failure of failures)
    for (const problem of failure.problems) {
      const topic = topics.get(problem.topic) ?? { count: 0, states: new Set() };
      topic.count += 1;
      topic.states.add(failure.id);
      topics.set(problem.topic, topic);
    }
  console.log("\nDifferences by property:");
  for (const [name, topic] of [...topics].sort((a, b) => b[1].count - a[1].count))
    console.log(`  ${name}: ${topic.count} in ${topic.states.size} state(s)`);
}
const seconds = Math.round((Date.now() - started) / 1000);
console.log(
  compare
    ? `\n${identical}/${selected.length} states identical to the baseline (${seconds} s).`
    : `\nCaptured ${selected.length - failures.length}/${selected.length} states into ${root}/${label} (${seconds} s).`,
);
if (failures.length) process.exitCode = 1;
