// Pixel oracle for the Next.js app (local only, never CI). Run against a production preview:
// E2E_BASE_URL=http://127.0.0.1:3131 npm run visual:check (see scripts/visual/states.mjs).
import { test, expect } from "@playwright/test";
import { contextOptions, prepare, states } from "../../../scripts/visual/states.mjs";

test.beforeAll(() => {
  if (!process.env.E2E_BASE_URL)
    throw new Error("The visual oracle needs a production preview: set E2E_BASE_URL.");
});

for (const state of states.filter((entry) => entry.kind === "app" && entry.screenshot))
  test(state.id, async ({ browser, baseURL }) => {
    const context = await browser.newContext(contextOptions(state));
    try {
      const page = await context.newPage();
      await prepare(page, state, { app: baseURL });
      await expect(page).toHaveScreenshot(`${state.id}.png`, { fullPage: state.action === null });
    } finally {
      await context.close();
    }
  });
