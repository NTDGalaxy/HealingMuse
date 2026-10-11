import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
const argument = (name, fallback) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const base = argument("base", "http://localhost:3011");
const samples = Number(argument("samples", "30"));
const label = argument("label", "sanctuary").replace(/[^a-zA-Z0-9_-]/g, "");
if (!Number.isInteger(samples) || samples < 1 || samples > 100)
  throw new Error("Invalid sample count");
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const browser = await chromium.launch({ headless: true });
const scenarios = ["/vi", "/vi/explore"];
const results = [];
try {
  for (const route of scenarios) {
    const observations = [];
    for (let sample = 0; sample < samples; sample++) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 150,
        downloadThroughput: 1_600_000 / 8,
        uploadThroughput: 750_000 / 8,
        connectionType: "cellular3g",
      });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await page.addInitScript(() => {
        window.__metrics = { lcp: 0, cls: 0, interaction: 0, click: 0, playing: 0 };
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__metrics.lcp = e.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) window.__metrics.cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            if (e.interactionId)
              window.__metrics.interaction = Math.max(window.__metrics.interaction, e.duration);
        }).observe({ type: "event", buffered: true, durationThreshold: 16 });
        document.addEventListener(
          "click",
          (event) => {
            if (event.target.closest(".card-play")) window.__metrics.click = performance.now();
          },
          true,
        );
        document.addEventListener(
          "playing",
          () => {
            if (!window.__metrics.playing) window.__metrics.playing = performance.now();
          },
          true,
        );
      });
      const errors = [];
      page.on("pageerror", () => errors.push("page_error"));
      await page.goto(new URL(route, base).href, { waitUntil: "domcontentloaded" });
      // Confirm the recording control has a React click handler, not merely server-rendered HTML.
      await page.waitForFunction(() => {
        const button = document.querySelector(".card-play");
        return (
          button &&
          Object.keys(button).some(
            (key) => key.startsWith("__reactProps$") && typeof button[key]?.onClick === "function",
          ) &&
          document.querySelector("audio")
        );
      });
      await page.locator(".card-play").first().click({ trial: true });
      const readiness = await page.evaluate(() => performance.now());
      await page.locator(".card-play").first().click();
      await page.waitForFunction(() => window.__metrics.playing > 0, null, { timeout: 15000 });
      const observation = await page.evaluate(() => ({
        ...window.__metrics,
        resources: performance.getEntriesByType("resource").map((r) => ({
          path: new URL(r.name).pathname,
          start: r.startTime,
          duration: r.duration,
          bytes: r.transferSize,
        })),
      }));
      observations.push({
        sample: sample + 1,
        readinessMs: readiness,
        clickToAudioMs: observation.playing - observation.click,
        lcpMs: observation.lcp,
        cls: observation.cls,
        interactionMs: observation.interaction,
        errors,
        ...(sample === 0 ? { waterfall: observation.resources } : {}),
      });
      await context.close();
      if ((sample + 1) % 5 === 0)
        console.log(
          JSON.stringify({
            event: "browser_measurement_progress",
            route,
            completed: sample + 1,
            samples,
          }),
        );
    }
    const summary = {
      route,
      samples,
      readinessP95Ms: percentile(
        observations.map((o) => o.readinessMs),
        0.95,
      ),
      clickToAudioP95Ms: percentile(
        observations.map((o) => o.clickToAudioMs),
        0.95,
      ),
      lcpP95Ms: percentile(
        observations.map((o) => o.lcpMs),
        0.95,
      ),
      clsMax: Math.max(...observations.map((o) => o.cls)),
      interactionP95Ms: percentile(
        observations.map((o) => o.interactionMs),
        0.95,
      ),
    };
    results.push({ ...summary, observations });
    console.log(JSON.stringify({ event: "browser_measurement_result", ...summary }));
  }
} finally {
  await browser.close();
}
await mkdir("artifacts", { recursive: true });
const report = {
  measuredAt: new Date().toISOString(),
  label,
  environment: new URL(base).hostname,
  throttle: {
    width: 390,
    height: 844,
    latencyMs: 150,
    downloadMbps: 1.6,
    uploadMbps: 0.75,
    cpuSlowdown: 4,
  },
  freshContexts: true,
  serviceWorkers: "blocked",
  readinessDefinition:
    "Hydrated, visible and actionable recording choice with persistent audio mounted",
  performanceGate:
    samples >= 30 && results.every((r) => r.readinessP95Ms <= 3000 && r.clickToAudioP95Ms <= 3000),
  results,
};
await writeFile(`artifacts/performance-${label}.json`, JSON.stringify(report, null, 2) + "\n");
// Report source compression as a conservative motion-specific ceiling, separate from Next's shared runtime.
const motionBytes = gzipSync(await readFile("src/components/scenery.tsx")).length;
console.log(
  JSON.stringify({
    event: "motion_budget",
    sourceGzipBytes: motionBytes,
    budgetBytes: 10240,
    withinBudget: motionBytes <= 10240,
  }),
);
if (samples >= 30 && !report.performanceGate) process.exitCode = 1;
