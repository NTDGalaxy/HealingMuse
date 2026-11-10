import {
  test,
  expect,
  countDownloads,
  currentTime,
  expectPlaying,
  expectPrimaryReady,
  expectSameListeningSession,
  holdRequests,
  markListeningSession,
} from "./support/test";
import { recordings as prepared, uniqueSearchTerm } from "./support/contracts";
import { Explore, Recordings, Shell } from "./support/pages";
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
