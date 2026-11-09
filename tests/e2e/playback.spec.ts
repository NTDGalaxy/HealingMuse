import {
  test,
  expect,
  countDownloads,
  expectPaused,
  expectPlaying,
  playbackGrantRequests,
} from "./support/test";
import { recordings as prepared } from "./support/contracts";
import { Player, Recordings, Shell, TrackCard } from "./support/pages";

test("offline Downloads queues only the recordings it shows and never streams", async ({
  page,
  context,
}) => {
  const shell = new Shell(page);
  const player = new Player(page);
  const recordings = new Recordings(page);
  await page.goto("/en");
  // Save the featured recording and a later Home recording, skipping the one in between, so a
  // queue built from everything Home showed would step into a recording that is not saved.
  const first = prepared.first.title.en;
  const later = (await new TrackCard(recordings.moreCards.nth(1)).title.textContent())!;
  await recordings.download(first).click();
  await expect.poll(() => countDownloads(page)).toBe(1);
  await recordings.download(later).click();
  await expect.poll(() => countDownloads(page)).toBe(2);
  await shell.navLink("downloads").first().click();
  await expect(page).toHaveURL(/\/en\/downloads$/);
  await expect(recordings.listen(later)).toBeVisible();

  const grants = playbackGrantRequests(page);
  await recordings.listen(first).click();
  await expectPlaying(page);
  await player.button("queue").click();
  await expect(player.queueItems).toHaveCount(2);
  await expect(player.queueItems.nth(0)).toContainText(first);
  await expect(player.queueItems.nth(1)).toContainText(later);
  await page.keyboard.press("Escape");
  await expect(shell.dialog).toHaveCount(0);

  await context.setOffline(true);
  await player.button("next").click();
  await expect(player.currentTitle).toHaveText(later);
  await expectPlaying(page);
  // The end of the visible list ends listening instead of streaming another recording.
  await player.button("next").click();
  await expectPaused(page);
  await expect(player.currentTitle).toHaveText(later);
  await expect(player.errorAlert).toHaveCount(0);
  expect(grants).toEqual([]);
  await context.setOffline(false);
});
