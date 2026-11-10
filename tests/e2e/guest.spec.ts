import {
  test,
  expect,
  countDownloads,
  currentTime,
  expectAccessible,
  expectNoHorizontalOverflow,
  expectPlaying,
  serviceWorkerReady,
} from "./support/test";
import { recordings as prepared, uniqueSearchTerm } from "./support/contracts";
import { Explore, Player, Recordings, Shell } from "./support/pages";
const title = prepared.first.title.en;
test("guest listens, navigates without losing playback, downloads, and starts offline", async ({
  page,
  context,
}) => {
  const shell = new Shell(page);
  const player = new Player(page);
  const recordings = new Recordings(page);
  await page.goto("/en");
  await expect(page.getByRole("heading", { name: shell.t("home.title") })).toBeVisible();
  await recordings.featuredPlay.click();
  await expectPlaying(page, { beyond: 0 });
  await shell.navLink("explore").first().click();
  await expect(page).toHaveURL(/\/en\/explore$/);
  await expectPlaying(page);
  await player.seek.fill("20");
  await expect.poll(() => currentTime(page)).toBeGreaterThan(19);
  await player.button("timer").click();
  await player.timerOption(5).click();
  await expect(player.activeTimer(5)).toBeVisible();
  await recordings.download(title).click();
  await expect(recordings.download(title)).toBeDisabled();
  await expect.poll(() => countDownloads(page)).toBe(1);
  await shell.navLink("downloads").first().click();
  await expect(page).toHaveURL(/\/en\/downloads$/);
  await page.reload();
  // Streamed markup can retain a hidden copy before hydration completes.
  const downloadsHeading = page.getByRole("heading", {
    level: 1,
    name: shell.t("downloads.title"),
    exact: true,
  });
  await expect(downloadsHeading).toHaveCount(1);
  await expect(downloadsHeading).toBeVisible();
  await serviceWorkerReady(page);
  await context.setOffline(true);
  await page.goto("/en/downloads");
  await expect(page.getByRole("heading", { name: shell.t("downloads.title") })).toBeVisible();
  await recordings.listen(title).click();
  await expectPlaying(page);
  await expectAccessible(page);
  await recordings.removeDownload(title).click();
  await expect(recordings.heading(title)).toHaveCount(0);
});
for (const locale of ["en", "vi"] as const)
  test(`accessible ${locale} screens at phone, tablet, and desktop sizes`, async ({ page }) => {
    const shell = new Shell(page, locale);
    for (const width of [390, 820, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/${locale}`);
      await shell.expectLang(locale);
      await expectNoHorizontalOverflow(page);
      await expectAccessible(page);
      await page.screenshot({ path: `test-results/home-${locale}-${width}.png`, fullPage: true });
    }
    await page.goto(`/${locale}/explore`);
    await expectAccessible(page);
  });
test("keyboard dialogs, guest privacy, search, and uncached responses", async ({
  page,
  request,
}) => {
  const shell = new Shell(page);
  const explore = new Explore(page);
  await page.goto("/en/explore");
  await explore.searchFor(uniqueSearchTerm);
  await expect(explore.recordings.visibleCards).toHaveCount(1);
  await shell.signInButton.click();
  await expect(shell.dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(shell.dialog).toHaveCount(0);
  await expect(shell.signInButton).toBeFocused();
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
