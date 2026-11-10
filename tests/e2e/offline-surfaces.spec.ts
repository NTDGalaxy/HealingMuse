import type { Page } from "@playwright/test";
import {
  test,
  expect,
  blockScriptsContaining,
  countDownloads,
  expectOnDemandReady,
  expectPlaying,
  expectSameListeningSession,
  markListeningSession,
} from "./support/test";
import { chunkMarkers, recordings as prepared } from "./support/contracts";
import { Player, Recordings, Shell } from "./support/pages";

const title = prepared.first.title.en;

/** Saves the featured recording, reopens the app on Downloads and plays the saved copy. */
async function playSavedRecording(page: Page) {
  const recordings = new Recordings(page);
  await page.goto("/en");
  await recordings.download(title).click();
  await expect.poll(() => countDownloads(page)).toBe(1);
  await page.goto("/en/downloads");
  await recordings.listen(title).click();
  await expectPlaying(page);
  await markListeningSession(page, "saved");
}

test("the queue, sleep timer, details and sign-in still open offline while a saved recording plays", async ({
  page,
  context,
}) => {
  const shell = new Shell(page);
  const player = new Player(page);
  const recordings = new Recordings(page);
  await playSavedRecording(page);
  // After the first sound the page fetched its dialog code while idle.
  await expectOnDemandReady(page);
  await context.setOffline(true);
  await player.button("queue").click();
  await expect(player.queueItems).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(shell.dialog).toHaveCount(0);
  await player.button("timer").click();
  await expect(shell.dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(shell.dialog).toHaveCount(0);
  await recordings.details(title).click();
  await expect(shell.dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(shell.dialog).toHaveCount(0);
  await shell.signInButton.click();
  await expect(shell.dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(shell.dialog).toHaveCount(0);
  await expectSameListeningSession(page, "saved");
  await context.setOffline(false);
});

test("a dialog whose code cannot download stays closed, says so and keeps playback running", async ({
  page,
}) => {
  const shell = new Shell(page);
  const player = new Player(page);
  const dialogCode = await blockScriptsContaining(page, chunkMarkers.dialog);
  await playSavedRecording(page);
  await player.button("queue").click();
  await expect(shell.toast).toHaveText(shell.t("errors.unavailable"));
  await expect(shell.dialog).toHaveCount(0);
  await expect(shell.app).toBeVisible();
  await expectSameListeningSession(page, "saved");
  // The next attempt downloads the code again instead of repeating the failure.
  dialogCode.unblock();
  await player.button("queue").click();
  await expect(player.queueItems).toHaveCount(1);
  await expectSameListeningSession(page, "saved");
});
test("a sign-in dialog whose code cannot download stays closed and opens on the next try", async ({
  page,
}) => {
  const shell = new Shell(page);
  const signInCode = await blockScriptsContaining(page, chunkMarkers.authDialog);
  await page.goto("/en");
  await shell.signInButton.click();
  await expect(shell.toast).toHaveText(shell.t("errors.unavailable"));
  await expect(shell.dialog).toHaveCount(0);
  await expect(shell.app).toBeVisible();
  signInCode.unblock();
  await shell.signInButton.click();
  await expect(shell.dialog).toBeVisible();
});
