import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const origin = process.env.E2E_BASE_URL || "http://127.0.0.1:3001";
const browser = await chromium.launch();
const report = {
  measuredAt: new Date().toISOString(),
  originKind:
    process.env.MEASURE_ENVIRONMENT || "isolated production preview with local prepared metadata",
  samples: [],
};
try {
  for (const throttled of [false, true]) {
    for (let index = 0; index < 5; index++) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__hmMetrics = { lcp: 0, cls: 0 };
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) window.__hmMetrics.lcp = entry.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (!entry.hadRecentInput) window.__hmMetrics.cls += entry.value;
        }).observe({ type: "layout-shift", buffered: true });
      });
      if (throttled) {
        const client = await context.newCDPSession(page);
        await client.send("Network.enable");
        await client.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: 150,
          downloadThroughput: (1.6 * 1024 * 1024) / 8,
          uploadThroughput: (750 * 1024) / 8,
        });
        await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      }
      const started = Date.now();
      await page.goto(`${origin}/vi`);
      await page.getByRole("button", { name: "Nghe Một khoảng bình yên", exact: true }).waitFor();
      const readyMs = Date.now() - started;
      await page.waitForTimeout(2500);
      report.samples.push({
        scenario: throttled ? "mobile-150ms-1.6Mbps-CPU4x" : "mobile-unthrottled",
        readyMs,
        ...(await page.evaluate(() => ({
          ...window.__hmMetrics,
          ttfb: performance.getEntriesByType("navigation")[0].responseStart,
          transferBytes: performance
            .getEntriesByType("resource")
            .reduce((n, r) => n + r.transferSize, 0),
        }))),
      });
      await context.close();
    }
  }
  for (const scenario of ["mobile-unthrottled", "mobile-150ms-1.6Mbps-CPU4x"]) {
    const samples = report.samples.filter((x) => x.scenario === scenario);
    const lcp = samples.map((x) => x.lcp).sort((a, b) => a - b);
    report[scenario] = {
      lcpMedianMs: Math.round(lcp[2]),
      lcpP95Ms: Math.round(lcp[4]),
      maxCLS: Math.max(...samples.map((x) => x.cls)),
      targets: { lcpMs: 2500, cls: 0.1 },
      lcpTargetPassed: lcp[4] < 2500,
      clsTargetPassed: samples.every((x) => x.cls < 0.1),
    };
  }
  await writeFile("artifacts/page-performance.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
  if (
    ["mobile-unthrottled", "mobile-150ms-1.6Mbps-CPU4x"].some(
      (scenario) => !report[scenario].lcpTargetPassed || !report[scenario].clsTargetPassed,
    )
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
