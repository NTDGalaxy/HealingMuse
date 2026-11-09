import { test, expect, countDownloads, currentTime, expectPlaying } from "./support/test";
import { recordings as prepared } from "./support/contracts";
import { Recordings, Shell } from "./support/pages";
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
