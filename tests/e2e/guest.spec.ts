import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("guest listens, navigates without losing playback, downloads, and starts offline", async ({
  page,
  context,
}) => {
  await page.goto("/en");
  await expect(page.getByRole("heading", { name: "Find a quieter moment." })).toBeVisible();
  await page.getByRole("button", { name: "Find something to listen to", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("audio")
        .first()
        .evaluate((audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 0),
    )
    .toBe(true);
  await page.getByRole("link", { name: "Explore", exact: true }).first().click();
  await expect(page).toHaveURL(/\/en\/explore$/);
  await expect
    .poll(() =>
      page
        .locator("audio")
        .first()
        .evaluate((audio: HTMLAudioElement) => !audio.paused),
    )
    .toBe(true);
  await page.getByRole("slider", { name: "Playback position" }).fill("20");
  await expect
    .poll(() =>
      page
        .locator("audio")
        .first()
        .evaluate((audio: HTMLAudioElement) => audio.currentTime),
    )
    .toBeGreaterThan(19);
  await page.getByRole("button", { name: "Sleep timer", exact: true }).click();
  await page.getByRole("button", { name: "5 min", exact: true }).click();
  await expect(page.getByRole("button", { name: "Timer: 5 min remaining" })).toBeVisible();
  await page.getByRole("button", { name: "Download A quiet beginning", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Download A quiet beginning", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const request = indexedDB.open("healingmuse-downloads", 1);
          request.onsuccess = () => resolve(request.result);
        });
        const n = await new Promise<number>((resolve) => {
          const request = db.transaction("recordings").objectStore("recordings").count();
          request.onsuccess = () => resolve(request.result);
        });
        db.close();
        return n;
      }),
    )
    .toBe(1);
  await page.getByRole("link", { name: "Downloads", exact: true }).first().click();
  await expect(page).toHaveURL(/\/en\/downloads$/);
  await page.reload();
  await expect(page.getByText("Music to take with you", { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.goto("/en/downloads");
  await expect(page.getByRole("heading", { name: "Music to take with you" })).toBeVisible();
  await page.getByRole("button", { name: "Listen to A quiet beginning", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused))
    .toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Remove: A quiet beginning", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A quiet beginning", exact: true })).toHaveCount(
    0,
  );
});
for (const locale of ["en", "vi"])
  test(`accessible ${locale} screens at phone, tablet, and desktop sizes`, async ({ page }) => {
    for (const width of [390, 820, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/${locale}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations).toEqual([]);
      await page.screenshot({ path: `test-results/home-${locale}-${width}.png`, fullPage: true });
    }
    await page.goto(`/${locale}/explore`);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
test("keyboard dialogs, guest privacy, search, and uncached responses", async ({
  page,
  request,
}) => {
  await page.goto("/en/explore");
  await page.getByRole("searchbox", { name: "Search recordings" }).fill("woodland");
  await page.getByRole("searchbox", { name: "Search recordings" }).press("Enter");
  await expect(page.locator(".track-card:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeFocused();
  for (const path of [
    "/api/me",
    "/api/admin/tracks",
    "/api/grants/00000000-0000-4000-8000-000000000001",
  ]) {
    const response = await request.get(path);
    expect(response.headers()["cache-control"]).toContain("no-store");
    if (path !== "/api/grants/00000000-0000-4000-8000-000000000001")
      expect(response.ok()).toBe(false);
  }
  await page.evaluate(async () => {
    const names = await caches.keys();
    for (const name of names) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      if (
        keys.some(
          (key) =>
            new URL(key.url).pathname.startsWith("/api/") ||
            /^\/(en|vi)(\/|$)/.test(new URL(key.url).pathname),
        )
      )
        throw new Error("Private content cached");
    }
  });
});
