import {
  test,
  expect,
  countDownloads,
  currentTime,
  expectPlaying,
  expectPrimaryReady,
  expectSameListeningSession,
  expectNoHorizontalOverflow,
  holdRequests,
  markListeningSession,
} from "./support/test";
import { recordings as prepared, size, uniqueSearchTerm } from "./support/contracts";
import { Explore, Recordings, Shell } from "./support/pages";
import type { SideNavRoute } from "./support/pages/shell";

// These tests hold requests with page.route, which does not see a request once a service worker
// controls the page. The worker takes over about half a second after the app loads, so on a busy
// machine a held request was missed now and then and its test waited out the whole timeout.
// None of them needs the worker.
test.use({ serviceWorkers: "block" });
test("switching language preserves the native listening session", async ({ page }) => {
  await page.goto("/en");
  await new Recordings(page).listen(prepared.first.title.en).click();
  await expect.poll(() => currentTime(page)).toBeGreaterThan(1);
  await new Shell(page).languageLink("vi").first().click();
  await expect(page).toHaveURL(/\/vi$/);
  await new Shell(page, "vi").expectLang("vi");
  await expectPlaying(page, { beyond: 1 });
});
test("switching language keeps an in-flight download", async ({ page }) => {
  const recording = prepared.first;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let reached!: () => void;
  const requested = new Promise<void>((resolve) => (reached = resolve));
  await page.route(`**/api/local-audio/${recording.id}`, async (route) => {
    reached();
    await held;
    // An aborted download can no longer be continued; the assertions below report it.
    await route.continue().catch(() => {});
  });
  await page.goto("/en");
  await new Recordings(page).download(recording.title.en).click();
  await requested;
  await new Shell(page).languageLink("vi").first().click();
  await expect(page).toHaveURL(/\/vi$/);
  const shell = new Shell(page, "vi");
  // The progress line is rewritten in Vietnamese while the recording is still being fetched.
  await expect(shell.downloadProgress).toContainText(recording.title.vi);
  release();
  await expect.poll(() => countDownloads(page)).toBe(1);
  await expect(shell.downloadStatus).toHaveCount(0);
  await expect(shell.toast).toContainText(recording.title.vi);
});
test("Home search opens results on the same listening session", async ({ page }) => {
  await page.goto("/en");
  await new Recordings(page).listen(prepared.first.title.en).click();
  await expectPlaying(page);
  await markListeningSession(page, "home-search");
  await new Explore(page).searchFor(uniqueSearchTerm);
  await expect(page).toHaveURL(new RegExp(`/en/explore\\?q=${uniqueSearchTerm}$`));
  await expect(new Recordings(page).visibleCards).toHaveCount(1);
  await expectSameListeningSession(page, "home-search");
});

test("Explore Next keeps keyboard focus while the next page loads", async ({ page }) => {
  const explore = new Explore(page);
  // Small pages give every catalogue a next page (CI's synthetic one has 20 recordings, one
  // default page), and Explore keeps the page size when it moves on.
  await page.goto("/en/explore?limit=6");
  await expectPrimaryReady(page);
  // Hold the next page so the navigation stays pending, as it does on a slow connection.
  const held = await holdRequests(page, "**/en/explore?*cursor=*");
  await explore.nextPage.focus();
  await page.keyboard.press("Enter");
  await held.reached;
  await expect(explore.nextPage).toBeDisabled();
  await expect(explore.nextPage).toBeFocused();
  // A second press while the page loads opens nothing more.
  await page.keyboard.press("Enter");
  held.release();
  await expect(page).toHaveURL(/cursor=/);
  await expect(explore.nextPage).toBeEnabled();
  // The new query string remounts the Explore view (the App Router keys the page segment by its
  // search parameters), so focus restarts at the top as on a page load; keeping the controls
  // mounted across pages is redesign work.
});

for (const viewport of [
  { width: 320, height: 740 },
  { width: 1440, height: 900 },
]) {
  test(`language and legal links are full-size targets at ${viewport.width}px`, async ({
    page,
  }) => {
    const shell = new Shell(page, "vi");
    await page.setViewportSize(viewport);
    await page.goto("/vi");
    // The narrowest top bar offers only the other language; wider ones offer both.
    const offered = viewport.width <= 380 ? (["en"] as const) : (["vi", "en"] as const);
    for (const locale of offered) {
      const box = (await shell.languageLink(locale).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(size.touchTarget);
      expect(box.height).toBeGreaterThanOrEqual(size.touchTarget);
    }
    if (viewport.width <= 380) await expect(shell.languageLink("vi")).toBeHidden();
    if (await shell.sidebar.isVisible())
      for (const key of ["privacy", "terms", "credits"] as const)
        expect((await shell.sidebarLegalLink(key).boundingBox())!.height).toBeGreaterThanOrEqual(
          size.touchTarget,
        );
    await expectNoHorizontalOverflow(page);
  });
}
const sideNavRoutes = [
  "home",
  "explore",
  "binaural",
  "library",
  "downloads",
  "mood",
  "settings",
] as const satisfies readonly SideNavRoute[];
// 1024 and 1100 px take the narrower 216 px sidebar; 1440 px the full one.
for (const width of [1024, 1100, 1440])
  for (const locale of ["vi", "en"] as const)
    test(`the sidebar's destinations and legal links read cleanly at ${width}px in ${locale}`, async ({
      page,
    }) => {
      const shell = new Shell(page, locale);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${locale}`);
      for (const key of sideNavRoutes)
        expect(
          (await shell.sideNavLink(key).boundingBox())!.height,
          `${key} keeps its name on one line`,
        ).toBeLessThanOrEqual(size.sideNavItem);
      // Only the three links: no separator a line break could leave stranded at a line's end.
      await expect(shell.sidebarLegalItems).toHaveText(
        (["privacy", "terms", "credits"] as const).map((key) => shell.t(`nav.${key}`)),
      );
    });

// 320 px is the narrowest supported phone; at 360 px and below the labels drop to 13 px.
for (const width of [320, 360])
  for (const locale of ["vi", "en"] as const)
    test(`the phone tabs' labels stay apart at ${width}px in ${locale}`, async ({ page }) => {
      const shell = new Shell(page, locale);
      await page.setViewportSize({ width, height: 740 });
      await page.goto(`/${locale}/explore`);
      const boxes = [];
      for (const label of await shell.mobileNavLabels.all())
        boxes.push((await label.boundingBox())!);
      expect(boxes).toHaveLength(5);
      for (let index = 1; index < boxes.length; index++) {
        const before = boxes[index - 1];
        expect(
          boxes[index].x - (before.x + before.width),
          `space before tab ${index + 1}`,
        ).toBeGreaterThanOrEqual(size.tabLabelGap);
      }
      for (const tab of await shell.mobileNav.getByRole("link").all())
        expect((await tab.boundingBox())!.width).toBeGreaterThanOrEqual(size.touchTarget);
      await expectNoHorizontalOverflow(page);
    });
