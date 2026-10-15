import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const option = (key, fallback) =>
  process.argv.find((value) => value.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const base = option("base", "http://127.0.0.1:3107");
const samples = Number(option("samples", "30"));
const theme = option("theme", "day");
const label = option("label", "binaural").replace(/[^a-zA-Z0-9_-]/g, "");
if (!["day", "night"].includes(theme)) throw new Error("invalid_theme");
if (!Number.isInteger(samples) || samples < 1 || samples > 100) throw new Error("invalid_samples");
const observations = [];
const browser = await chromium.launch({ headless: true });
try {
  for (let sample = 0; sample < samples; sample++) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    await context.addInitScript(
      (theme) =>
        localStorage.setItem(
          "healingmuse-appearance-v1",
          JSON.stringify({ appearance: theme, garden: "auto" }),
        ),
      theme,
    );
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    const transfers = [];
    const requests = new Map();
    cdp.on("Network.responseReceived", ({ requestId, response }) =>
      requests.set(requestId, { path: new URL(response.url).pathname, mime: response.mimeType }),
    );
    cdp.on("Network.loadingFinished", ({ requestId, encodedDataLength }) => {
      const request = requests.get(requestId);
      if (request) transfers.push({ ...request, bytes: encodedDataLength });
    });
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: 1600000 / 8,
      uploadThroughput: 750000 / 8,
      connectionType: "cellular3g",
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      const metrics = (window.__binauralMeasurement = {
        ready: 0,
        click: 0,
        signal: 0,
        lcp: 0,
        cls: 0,
        interaction: 0,
      });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          if (!entry.hadRecentInput) metrics.cls += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          if (entry.interactionId)
            metrics.interaction = Math.max(metrics.interaction, entry.duration);
      }).observe({ type: "event", buffered: true, durationThreshold: 16 });
      new MutationObserver(() => {
        const button = document.querySelector(".binaural-buttons button");
        if (
          !metrics.ready &&
          button &&
          !button.disabled &&
          Object.keys(button).some(
            (key) => key.startsWith("__reactProps$") && typeof button[key]?.onClick === "function",
          )
        )
          metrics.ready = performance.now();
      }).observe(document, { subtree: true, childList: true, attributes: true });
      let analyser;
      const createGain = AudioContext.prototype.createGain;
      AudioContext.prototype.createGain = function () {
        const gain = createGain.call(this),
          connect = gain.connect;
        gain.connect = function (...args) {
          const result = Reflect.apply(connect, this, args);
          if (args[0] === this.context.destination) {
            analyser = this.context.createAnalyser();
            analyser.fftSize = 256;
            Reflect.apply(connect, this, [analyser]);
          }
          return result;
        };
        return gain;
      };
      document.addEventListener(
        "click",
        (event) => {
          if (!event.target.closest(".binaural-buttons button:first-child")) return;
          metrics.click = performance.now();
          const data = new Float32Array(256);
          const observe = () => {
            if (analyser) {
              analyser.getFloatTimeDomainData(data);
              if (data.some((value) => Math.abs(value) > 0.00001)) {
                metrics.signal = performance.now();
                return;
              }
            }
            requestAnimationFrame(observe);
          };
          requestAnimationFrame(observe);
        },
        true,
      );
    });
    const errors = [];
    page.on("pageerror", () => errors.push("page_error"));
    await page.goto(new URL("/vi/brainwave-entrainment", base).href, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(() => window.__binauralMeasurement.ready > 0);
    await page.locator(".binaural-buttons button").first().click();
    await page.waitForFunction(() => window.__binauralMeasurement.signal > 0);
    await page.waitForFunction(
      () =>
        ["ready", "still"].includes(
          document.querySelector(".garden-canvas")?.getAttribute("data-state"),
        ),
      null,
      { timeout: 12000 },
    );
    const measurement = await page.evaluate(() => ({
      ...window.__binauralMeasurement,
      sceneState: document.querySelector(".garden-canvas")?.getAttribute("data-state"),
      sceneReadyMs: Number(
        document.querySelector(".garden-canvas")?.getAttribute("data-ready-ms") || 0,
      ),
      resources: performance.getEntriesByType("resource").map((entry) => ({
        path: new URL(entry.name).pathname,
        bytes: entry.transferSize,
        duration: entry.duration,
      })),
    }));
    observations.push({
      sample: sample + 1,
      readinessMs: measurement.ready,
      clickToRenderedSignalMs: measurement.signal - measurement.click,
      lcpMs: measurement.lcp,
      cls: measurement.cls,
      interactionMs: measurement.interaction,
      errors,
      sceneState: measurement.sceneState,
      sceneReadyMs: measurement.sceneReadyMs || null,
      transferredBytes: transfers.reduce((sum, resource) => sum + resource.bytes, 0),
      ...(sample === 0 ? { waterfall: measurement.resources, networkTransfers: transfers } : {}),
    });
    await context.close();
    if ((sample + 1) % 5 === 0)
      console.log(
        JSON.stringify({ event: "binaural_measurement_progress", completed: sample + 1, samples }),
      );
  }
} finally {
  await browser.close();
}
const p95 = (key) =>
  [...observations.map((item) => item[key])].sort((a, b) => a - b)[Math.ceil(samples * 0.95) - 1];
const summary = {
  samples,
  theme,
  viewport: "390x844",
  latencyMs: 150,
  downloadMbps: 1.6,
  cpuSlowdown: 4,
  readinessP95Ms: p95("readinessMs"),
  clickToRenderedSignalP95Ms: p95("clickToRenderedSignalMs"),
  lcpP95Ms: p95("lcpMs"),
  clsP95: p95("cls"),
  sampledInteractionP95Ms: p95("interactionMs"),
  limitations:
    "Local production preview; rendered signal detected through an AnalyserNode, not physical headphone output. Sampled event durations are not a field INP measurement.",
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  `artifacts/performance-${label}.json`,
  JSON.stringify({ summary, observations }, null, 2),
);
console.log(JSON.stringify(summary));
if (
  summary.readinessP95Ms > 3000 ||
  summary.clickToRenderedSignalP95Ms > 3000 ||
  observations.some((item) => item.errors.length)
)
  process.exitCode = 1;
