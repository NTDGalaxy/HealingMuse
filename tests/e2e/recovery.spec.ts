import { test, expect, audioSource, expectPaused, expectPlaying } from "./support/test";
import { recordings as prepared, storage } from "./support/contracts";
import { t } from "./support/i18n";
import { Player, Recordings } from "./support/pages";
const A = prepared.first.id,
  B = prepared.second.id;
const first = prepared.first.title.en,
  second = prepared.second.title.en;
test("a temporarily limited download explains waiting and supports retry", async ({ page }) => {
  const recordings = new Recordings(page);
  let attempts = 0;
  await page.route(`**/api/grants/${A}?download=1`, (route) => {
    attempts++;
    return attempts === 1
      ? route.fulfill({ status: 429, json: { error: { code: "rate_limited" } } })
      : route.continue();
  });
  await page.goto("/en");
  await recordings.download(first).click();
  await expect(page.getByText(t("en", "errors.rate_limited"), { exact: true })).toBeVisible();
  await recordings.download(first).click();
  await expect.poll(() => recordings.downloadedBadges.count()).toBe(1);
});
test("an expired playback grant is renewed when the listener retries", async ({ page }) => {
  const player = new Player(page);
  let grants = 0;
  await page.route(`**/api/grants/${A}`, (route) => {
    grants++;
    return grants === 1
      ? route.fulfill({
          json: { url: "/expired-recording.mp3", expiresAt: "2020-01-01T00:00:00Z" },
        })
      : route.continue();
  });
  await page.route("**/expired-recording.mp3", (route) =>
    route.fulfill({ status: 403, body: "Expired playback grant" }),
  );
  await page.goto("/en");
  await new Recordings(page).listen(first).click();
  await expect(player.error).toBeVisible();
  await player.retry.click();
  await expectPlaying(page, { beyond: 0 });
  expect(grants).toBe(2);
});
test("failed recording transition retries the selected recording", async ({ page }) => {
  const player = new Player(page);
  const recordings = new Recordings(page);
  await page.goto("/en");
  await recordings.listen(first).click();
  await expectPlaying(page);
  let attempts = 0;
  await page.route(`**/api/grants/${B}`, async (route) => {
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
});
test("a failed home-screen download is visible and can be retried", async ({ page }) => {
  const recordings = new Recordings(page);
  await page.goto("/en");
  await page.route(`**/api/local-audio/${A}`, (route) => route.abort("failed"));
  await recordings.download(first).click();
  await expect(page.getByText(t("en", "downloads.interrupted"), { exact: true })).toBeVisible();
  await page.unroute(`**/api/local-audio/${A}`);
  await recordings.download(first).click();
  await expect.poll(() => recordings.downloadedBadges.count()).toBe(1);
});
test("latest player transition wins and the local timer stops playback", async ({ page }) => {
  const player = new Player(page);
  const recordings = new Recordings(page);
  await page.goto("/en");
  await page.route(`**/api/grants/${A}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await recordings.listen(first).click();
  await recordings.listen(second).click();
  await expect.poll(() => audioSource(page)).toContain(B);
  await expectPlaying(page, { beyond: 1 });
  expect(await audioSource(page)).toContain(B);
  await page.clock.install();
  await player.button("timer").click();
  await player.timerOption(5).click();
  await page.clock.fastForward(300001);
  await expectPaused(page);
  await expect(player.timerEnded).toBeVisible();
});
test("quota denial never commits a partial offline recording", async ({ page }) => {
  const recordings = new Recordings(page);
  await page.goto("/en/explore");
  await page.evaluate((store) => {
    const prototype = IDBObjectStore.prototype;
    const original = prototype.put;
    (window as unknown as { restorePut: () => void }).restorePut = () => {
      prototype.put = original;
    };
    prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === store)
        throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      return original.apply(this, args);
    };
  }, storage.downloads.store);
  await recordings.download(first).click();
  await expect(page.getByText(t("en", "downloads.storageFull"), { exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as { restorePut: () => void }).restorePut());
  await recordings.download(first).click();
  await expect.poll(() => recordings.downloadedBadges.count()).toBe(1);
});

for (const locale of ["en", "vi"] as const)
  test(`B2 quota failure announces recovery in ${locale} and retries with a fresh grant`, async ({
    page,
  }) => {
    const player = new Player(page, locale);
    let grants = 0;
    await page.route(`**/api/grants/${A}`, (route) => {
      grants++;
      return grants === 1
        ? route.fulfill({
            json: {
              url: "https://s3.us-west-004.backblazeb2.com/synthetic-only/quota.mp3?versionId=synthetic",
              expiresAt: new Date(Date.now() + 600000).toISOString(),
            },
          })
        : route.continue();
    });
    await page.route("https://s3.us-west-004.backblazeb2.com/**", (route) =>
      route.fulfill({ status: 403, body: "Synthetic download cap" }),
    );
    await page.goto(`/${locale}`);
    await new Recordings(page, locale).plays.first().click();
    await expect(player.errorAlert).toBeVisible();
    const retry = player.retry;
    await retry.focus();
    await retry.press("Enter");
    await expectPlaying(page, { beyond: 0 });
    expect(grants).toBe(2);
  });
