import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /\.visual\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Local visual-equivalence oracle (npm run visual:baseline / visual:check), never in CI.
      // Every state is an independent fresh context, so the matrix can run fully parallel.
      name: "visual",
      testMatch: /\.visual\.ts$/,
      fullyParallel: true,
      // Software raster and compositing only. On the default GPU path (SwiftShader) Chromium
      // occasionally rasterizes some tiles of a long page another way, which changes the
      // anti-aliasing of rounded clips (about 2 in 900 runs differed by 130-180 corner pixels);
      // with one raster path, 684 of 684 stress runs were identical.
      use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--disable-gpu"] } },
      snapshotPathTemplate: "artifacts/visual/screenshots/{arg}{ext}",
      expect: {
        // No pixel may differ. The per-pixel threshold only absorbs the +-1 channel raster noise
        // measured in blurred (backdrop-filter) regions between identical runs; 0.01 still flags
        // any colour change above about 2/255 per channel. Computed styles are compared exactly by
        // scripts/visual/snapshot.mjs.
        toHaveScreenshot: {
          maxDiffPixels: 0,
          threshold: 0.01,
          animations: "disabled",
          caret: "hide",
          scale: "css",
        },
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: process.env.CI
          ? "npm run build:preview && npm run start:preview"
          : "npm run dev:preview",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: process.env.CI ? 300000 : 120000,
      },
});
