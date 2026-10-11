import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const count = 25;
const browser = await chromium.launch();
const contexts = [];
try {
  // Warm framework compilation separately from the defined simultaneous-listener scenario.
  const warm = await browser.newPage();
  await warm.goto(`${baseURL}/en`);
  await warm.close();
  const pages = await Promise.all(
    Array.from({ length: count }, async () => {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      await page.goto(`${baseURL}/en`);
      return page;
    }),
  );
  const samples = await Promise.all(
    pages.map(async (page) => {
      const start = performance.now();
      await page.getByRole("button", { name: "Find something to listen to", exact: true }).click();
      await page.waitForFunction(
        () => {
          const audio = document.querySelector("audio");
          return audio && !audio.paused && audio.currentTime > 0;
        },
        {},
        { timeout: 15000 },
      );
      return performance.now() - start;
    }),
  );
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
  const report = {
    time: new Date().toISOString(),
    environment:
      process.env.LOAD_ENVIRONMENT ??
      (new URL(baseURL).hostname === "localhost"
        ? "local server, warm application, unthrottled Linux Chromium; record server mode"
        : "remote deployment, unthrottled Linux Chromium"),
    concurrentListeners: count,
    startupP95Ms: Math.round(p95),
    startupTargetMs: 3000,
    passed: p95 <= 3000,
    samplesMs: samples.map(Math.round),
    personalSync: "Requires configured Supabase staging; run test:sync-load separately.",
  };
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/playback-load.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
} finally {
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
}
