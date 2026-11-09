// @ts-check
// Timed 3 s gate for every route (see the gate definition in the plan and CLAUDE.md).
// Usage: node scripts/perf/run.mjs --base=http://127.0.0.1:3127 [--routes=all|home,explore]
//   [--locales=vi] [--theme=day | --themes=day,night] [--samples=30 | --quick] [--label=name] [--resume]
import { chromium, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { contracts, pathFor } from "./contracts.mjs";
import { sceneOrder, summarize } from "./stats.mjs";

/** @param {string} name @param {string} fallback */
const argument = (name, fallback) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const flag = (/** @type {string} */ name) => process.argv.includes(`--${name}`);

const base = argument("base", "http://127.0.0.1:3127");
const samples = flag("quick") ? 5 : Number(argument("samples", "30"));
const label = argument("label", "gate").replace(/[^a-zA-Z0-9_-]/g, "");
const themes = argument("themes", argument("theme", "day,night")).split(",");
const locales = argument("locales", "vi").split(",");
const routeKeys = argument("routes", "all");
const selected =
  routeKeys === "all" ? contracts : contracts.filter((c) => routeKeys.split(",").includes(c.key));
if (!Number.isInteger(samples) || samples < 1 || samples > 200) throw new Error("Invalid samples");
if (themes.some((theme) => !["day", "night"].includes(theme))) throw new Error("Invalid theme");
if (locales.some((locale) => !["vi", "en"].includes(locale))) throw new Error("Invalid locale");
if (!selected.length || (routeKeys !== "all" && selected.length !== routeKeys.split(",").length))
  throw new Error(`Unknown route in --routes=${routeKeys}`);

export const THRESHOLD_MS = 3000;
export const MIN_SAMPLES = 30;
const THROTTLE = { latencyMs: 150, downloadKbps: 1600, uploadKbps: 750, cpuSlowdown: 4 };
const pixel = devices["Pixel 7"];
const PROFILE = {
  ...pixel,
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
};

const cells = selected.flatMap((contract) =>
  locales.flatMap((locale) =>
    themes.map((theme) => ({
      id: `${contract.key}:${locale}:${theme}`,
      contract,
      locale,
      theme,
      path: pathFor(locale, contract),
    })),
  ),
);

const outDir = "artifacts/perf";
const jsonl = `${outDir}/${label}.jsonl`;
await mkdir(outDir, { recursive: true });
/** @type {Map<string, any[]>} */
const results = new Map(cells.map((cell) => [cell.id, []]));
if (flag("resume")) {
  const previous = await readFile(jsonl, "utf8").catch(() => "");
  for (const line of previous.split("\n").filter(Boolean)) {
    const row = JSON.parse(line);
    results.get(row.cell)?.push(row);
  }
} else await writeFile(jsonl, "");

/** In-page probe: readiness, click-to-audio and web vitals, measured inside the document. */
function probe(/** @type {{ kind: string, audio: string | null }} */ contract) {
  const w = /** @type {any} */ (window);
  const m = (w.__hm = { ready: 0, click: 0, audio: 0, lcp: 0, cls: 0, interaction: 0 });
  const visible = (/** @type {Element} */ el) =>
    el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  const check = () => {
    if (m.ready) return;
    if (contract.kind === "shell") {
      const mark = performance.getEntriesByName("hm:shell-ready", "mark")[0];
      if (mark) m.ready = mark.startTime;
      return;
    }
    const ready = [...document.querySelectorAll("[data-primary][data-hydrated]")].some(
      (el) => !(/** @type {HTMLButtonElement} */ (el).disabled) && visible(el),
    );
    if (ready) m.ready = performance.now();
  };
  new MutationObserver(check).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-hydrated", "disabled"],
  });
  new PerformanceObserver(check).observe({ type: "mark", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) m.lcp = entry.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of /** @type {any[]} */ (list.getEntries()))
      if (!entry.hadRecentInput) m.cls += entry.value;
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of /** @type {any[]} */ (list.getEntries()))
      if (entry.interactionId) m.interaction = Math.max(m.interaction, entry.duration);
  }).observe(/** @type {any} */ ({ type: "event", buffered: true, durationThreshold: 16 }));
  /** @type {AnalyserNode | undefined} */
  let analyser;
  if (contract.audio === "webaudio") {
    const createGain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const gain = createGain.call(this);
      const connect = gain.connect;
      gain.connect = /** @type {any} */ (
        function (/** @type {any[]} */ ...args) {
          const result = Reflect.apply(connect, this, args);
          if (args[0] === this.context.destination) {
            analyser = this.context.createAnalyser();
            analyser.fftSize = 256;
            Reflect.apply(connect, this, [analyser]);
          }
          return result;
        }
      );
      return gain;
    };
  }
  document.addEventListener(
    "click",
    (event) => {
      const target = /** @type {Element} */ (event.target);
      if (m.click || !target.closest("[data-primary]")) return;
      m.click = performance.now();
      if (contract.audio !== "webaudio") return;
      const data = new Float32Array(256);
      const observe = () => {
        if (analyser) {
          analyser.getFloatTimeDomainData(data);
          if (data.some((value) => Math.abs(value) > 0.00001)) {
            m.audio = performance.now();
            return;
          }
        }
        requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    },
    true,
  );
  document.addEventListener(
    "playing",
    () => {
      if (contract.audio === "media" && m.click && !m.audio) m.audio = performance.now();
    },
    true,
  );
}

const browser = await chromium.launch({ headless: true });
const commit = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
})();

/** CPU calibration: a fixed workload under the same throttle, reported with the results. */
async function calibrate() {
  const context = await browser.newContext(PROFILE);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE.cpuSlowdown });
  const ms = await page.evaluate(() => {
    const start = performance.now();
    let value = 0;
    for (let index = 0; index < 5_000_000; index++) value = (value + index * 7) % 1_000_003;
    return performance.now() - start + (value < 0 ? 1 : 0);
  });
  await context.close();
  return Math.round(ms);
}

/** @param {(typeof cells)[number]} cell @param {number} sample */
async function measure(cell, sample) {
  const context = await browser.newContext({ ...PROFILE, serviceWorkers: "block" });
  await context.addInitScript(
    (theme) =>
      localStorage.setItem(
        "healingmuse-appearance-v1",
        JSON.stringify({ appearance: theme, garden: "auto" }),
      ),
    cell.theme,
  );
  await context.addInitScript(probe, { kind: cell.contract.kind, audio: cell.contract.audio });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: THROTTLE.latencyMs,
    downloadThroughput: (THROTTLE.downloadKbps * 1000) / 8,
    uploadThroughput: (THROTTLE.uploadKbps * 1000) / 8,
    connectionType: "cellular3g",
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE.cpuSlowdown });
  let bytes = 0;
  let requests = 0;
  cdp.on("Network.loadingFinished", ({ encodedDataLength }) => {
    bytes += encodedDataLength;
    requests += 1;
  });
  let errors = 0;
  page.on("pageerror", () => (errors += 1));
  await page.goto(new URL(cell.path, base).href, { waitUntil: "commit" });
  const got = async (/** @type {string} */ expression, /** @type {number} */ timeout) =>
    page
      .waitForFunction(expression, null, { timeout })
      .then(() => true)
      .catch(() => false);
  const ready = await got("window.__hm && window.__hm.ready > 0", 20000);
  let heard = false;
  if (ready && cell.contract.audio) {
    await page.locator("[data-primary][data-hydrated]:visible").first().tap();
    heard = await got("window.__hm.audio > 0", 15000);
  }
  const scene = await got(
    `["ready","still"].includes(document.querySelector(".garden-canvas")?.getAttribute("data-state"))`,
    15000,
  );
  const metrics = await page.evaluate(() => ({
    .../** @type {any} */ (window).__hm,
    sceneReadyMs: Number(document.querySelector(".garden-canvas")?.getAttribute("data-ready-ms")),
    sceneStartMs: performance.getEntriesByName("hm:scene-start", "mark")[0]?.startTime ?? null,
  }));
  await context.close();
  return {
    cell: cell.id,
    sample,
    readinessMs: ready ? Math.round(metrics.ready) : null,
    audioMs: heard ? Math.round(metrics.audio - metrics.click) : null,
    lcpMs: metrics.lcp ? Math.round(metrics.lcp) : null,
    cls: Number(metrics.cls.toFixed(4)),
    interactionMs: Math.round(metrics.interaction),
    sceneReadyMs: scene && metrics.sceneReadyMs ? Math.round(metrics.sceneReadyMs) : null,
    sceneStartMs: metrics.sceneStartMs === null ? null : Math.round(metrics.sceneStartMs),
    sceneOrder: cell.contract.audio
      ? sceneOrder({
          clickMs: metrics.click,
          audioAtMs: heard ? metrics.audio : 0,
          sceneStartMs: metrics.sceneStartMs,
        })
      : undefined,
    errors,
    bytes,
    requests,
  };
}

/** @param {Partial<Record<string, number>>} counts */
function orderText(counts) {
  const entries = Object.entries(counts);
  return entries.length ? entries.map(([order, n]) => `${order} ${n}`).join(", ") : "-";
}

const startedAt = new Date().toISOString();
const calibrationMs = await calibrate();
try {
  for (let sample = 1; sample <= samples; sample++) {
    // Rotate the cell order each sample so machine drift spreads evenly across cells.
    const order = cells.map((_, index) => cells[(index + sample) % cells.length]);
    for (const cell of order) {
      const rows = /** @type {any[]} */ (results.get(cell.id));
      if (rows.some((row) => row.sample === sample)) continue;
      const row = await measure(cell, sample);
      rows.push(row);
      await appendFile(jsonl, JSON.stringify(row) + "\n");
    }
    console.log(JSON.stringify({ event: "perf_progress", sample, of: samples }));
  }
} finally {
  await browser.close();
}

const summaries = cells.map((cell) => ({
  cell: cell.id,
  path: cell.path,
  ...summarize(/** @type {any[]} */ (results.get(cell.id)), {
    audio: Boolean(cell.contract.audio),
    thresholdMs: THRESHOLD_MS,
    minSamples: MIN_SAMPLES,
  }),
}));
const report = {
  schemaVersion: 1,
  label,
  commit,
  startedAt,
  finishedAt: new Date().toISOString(),
  base: new URL(base).host,
  profile: { device: "Pixel 7", viewport: PROFILE.viewport, dpr: PROFILE.deviceScaleFactor },
  throttle: THROTTLE,
  calibrationMs,
  thresholdMs: THRESHOLD_MS,
  gatePassed: summaries.every((summary) => summary.passed),
  summaries,
};
await writeFile(`${outDir}/${label}.json`, JSON.stringify(report, null, 2) + "\n");
console.log(
  "\n| Cell | n | ready p95 | audio p95 | LCP p95 | CLS max | scene p95 | scene start | pass |",
);
console.log("|---|---|---|---|---|---|---|---|---|");
for (const s of summaries)
  console.log(
    `| ${s.cell} | ${s.samples} | ${s.readinessP95Ms ?? "missing"} | ${s.audioP95Ms ?? "-"} | ${s.lcpP95Ms ?? "-"} | ${s.clsMax} | ${s.sceneReadyP95Ms ?? "-"} | ${orderText(s.sceneOrder)} | ${s.passed ? "yes" : "NO"} |`,
  );
const misordered = summaries.reduce((sum, s) => sum + (s.sceneOrder["before-audio"] ?? 0), 0);
console.log(
  `\nscene start vs first sound (reported, not gated): ${misordered ? `${misordered} sample(s) started the scene after the tap but before the first sound` : "no sample started the scene between the tap and the first sound"}`,
);
console.log(`\ngate ${report.gatePassed ? "PASSED" : "FAILED"}; calibration ${calibrationMs} ms`);
if (samples >= MIN_SAMPLES && !report.gatePassed) process.exitCode = 1;
