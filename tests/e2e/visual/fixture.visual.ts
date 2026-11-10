// Pixel oracle for the signed-in screens rendered by the Vite fixture (local only, never CI).
import { test, expect } from "@playwright/test";
import type { ViteDevServer } from "vite";
import { startFixtureServer } from "../../browser-fixtures/server.mjs";
import { contextOptions, prepare, states } from "../../../scripts/visual/states.mjs";

let server: ViteDevServer;
let origin: string;
test.beforeAll(async () => {
  // Parallel workers each run this hook; separate caches keep their dependency bundles apart.
  ({ server, origin } = await startFixtureServer({
    cacheDir: `node_modules/.vite/visual-${test.info().parallelIndex}`,
  }));
});
test.afterAll(async () => {
  await server?.close();
});

for (const state of states.filter((entry) => entry.kind === "fixture" && entry.screenshot))
  test(state.id, async ({ browser }) => {
    const context = await browser.newContext(contextOptions(state));
    try {
      const page = await context.newPage();
      await prepare(page, state, { fixture: origin });
      await expect(page).toHaveScreenshot(`${state.id}.png`, { fullPage: true });
    } finally {
      await context.close();
    }
  });
