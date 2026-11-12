import {
  test,
  expect,
  audioSource,
  countDownloads,
  expectPaused,
  expectPlaying,
  expectResponseHandled,
  holdRequests,
  playbackGrantRequests,
  responsesReceived,
} from "./support/test";
import { playbackGrantPath, recordings as prepared } from "./support/contracts";
import { Player, Recordings, Shell, TrackCard } from "./support/pages";

// These tests hold requests with page.route, which does not see a request once a service worker
// controls the page. The worker takes over about half a second after the app loads, so on a busy
// machine a held request was missed now and then and its test waited out the whole timeout.
// None of them needs the worker.
test.use({ serviceWorkers: "block" });

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
  await expect(player.error).toHaveCount(0);
  expect(grants).toEqual([]);
  await context.setOffline(false);
});

const A = prepared.first.id;
const B = prepared.second.id;
const first = prepared.first.title.en;
const second = prepared.second.title.en;

test("Finish while a recording is still loading keeps it from starting later", async ({ page }) => {
  const player = new Player(page);
  const recordings = new Recordings(page);
  await page.goto("/en");
  const grant = await holdRequests(page, `**${playbackGrantPath}${A}`);
  await recordings.listen(first).click();
  await grant.reached;
  await player.button("finish").click();
  const before = await responsesReceived(page, `${playbackGrantPath}${A}`);
  grant.release();
  await expectResponseHandled(page, `${playbackGrantPath}${A}`, before);
  await expectPaused(page);
  expect(await audioSource(page)).toBeNull();
  await expect(player.playButton).toBeEnabled();
});

test("a late source from an earlier Retry never replaces the recording chosen since", async ({
  page,
}) => {
  const player = new Player(page);
  const recordings = new Recordings(page);
  await page.goto("/en");
  // The first recording fails to load, so the player offers Retry.
  await page.route(`**/api/local-audio/${A}`, (route) => route.abort("failed"));
  await recordings.listen(first).click();
  await expect(player.error).toBeVisible();
  await page.unroute(`**/api/local-audio/${A}`);
  // Retry asks for a fresh source; the listener picks another recording before it arrives.
  const retry = await holdRequests(page, `**${playbackGrantPath}${A}`, { pass: 0 });
  await player.retry.click();
  await retry.reached;
  await recordings.listen(second).click();
  await expectPlaying(page);
  await expect(player.currentTitle).toHaveText(second);
  const before = await responsesReceived(page, `${playbackGrantPath}${A}`);
  retry.release();
  await expectResponseHandled(page, `${playbackGrantPath}${A}`, before);
  expect(await audioSource(page)).toContain(B);
  await expect(player.currentTitle).toHaveText(second);
  await expectPlaying(page);
});

test("Retry after a saved recording recovers a streamed recording that failed", async ({
  page,
}) => {
  const player = new Player(page);
  const recordings = new Recordings(page);
  await page.goto("/en");
  await recordings.download(first).click();
  await expect.poll(() => countDownloads(page)).toBe(1);
  await recordings.listen(first).click();
  await expectPlaying(page);
  let attempts = 0;
  await page.route(`**${playbackGrantPath}${B}`, async (route) => {
    attempts++;
    if (attempts === 1)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "unavailable" } }),
      });
    else await route.continue();
  });
  await recordings.listen(second).click();
  await expect(player.error).toContainText(player.t("player.playbackError"));
  await player.retry.click();
  await expect.poll(() => audioSource(page)).toContain(B);
  await expectPlaying(page);
  expect(attempts).toBe(2);
});

test("choosing another recording while one loads shows no autoplay error", async ({ page }) => {
  const player = new Player(page);
  const recordings = new Recordings(page);
  await page.goto("/en");
  // The first recording's audio never arrives, so its play() request is still pending when
  // the listener moves on and the newer recording interrupts it.
  const audio = await holdRequests(page, `**/api/local-audio/${A}`);
  await recordings.listen(first).click();
  await audio.reached;
  await recordings.listen(second).click();
  await expectPlaying(page);
  await expect(player.currentTitle).toHaveText(second);
  await expect(player.error).toHaveCount(0);
  audio.release();
});
