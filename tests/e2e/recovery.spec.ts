import { test, expect } from "@playwright/test";
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002";
test("a temporarily limited download explains waiting and supports retry", async ({ page }) => {
  let attempts = 0;
  await page.route(`**/api/grants/${A}?download=1`, (route) => {
    attempts++;
    return attempts === 1
      ? route.fulfill({ status: 429, json: { error: { code: "rate_limited" } } })
      : route.continue();
  });
  await page.goto("/en");
  await page.getByRole("button", { name: "Download A quiet beginning", exact: true }).click();
  await expect(
    page.getByText("Please wait a moment before trying again.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Download A quiet beginning", exact: true }).click();
  await expect.poll(() => page.locator(".downloaded-badge").count()).toBe(1);
});
test("an expired playback grant is renewed when the listener retries", async ({ page }) => {
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
  await page.getByRole("button", { name: "Listen to A quiet beginning", exact: true }).click();
  await expect(page.locator(".player-error")).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 0),
    )
    .toBe(true);
  expect(grants).toBe(2);
});
test("failed recording transition retries the selected recording", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("button", { name: "Listen to A quiet beginning", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused))
    .toBe(true);
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
  await page.getByRole("button", { name: "Listen to Rain and forest birds", exact: true }).click();
  await expect(page.locator(".player-error")).toContainText(
    "This recording couldn't start. Try again or choose another one.",
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect.poll(() => page.locator("audio").getAttribute("src")).toContain(B);
  await expect
    .poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused))
    .toBe(true);
});
test("a failed home-screen download is visible and can be retried", async ({ page }) => {
  await page.goto("/en");
  await page.route(`**/api/local-audio/${A}`, (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Download A quiet beginning", exact: true }).click();
  await expect(
    page.getByText("The download was interrupted. Reconnect and try again.", { exact: true }),
  ).toBeVisible();
  await page.unroute(`**/api/local-audio/${A}`);
  await page.getByRole("button", { name: "Download A quiet beginning", exact: true }).click();
  await expect.poll(() => page.locator(".downloaded-badge").count()).toBe(1);
});
test("latest player transition wins and the local timer stops playback", async ({ page }) => {
  await page.goto("/en");
  await page.route(`**/api/grants/${A}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.getByRole("button", { name: "Listen to A quiet beginning", exact: true }).click();
  await page.getByRole("button", { name: "Listen to Rain and forest birds", exact: true }).click();
  await expect.poll(() => page.locator("audio").getAttribute("src")).toContain(B);
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 1),
    )
    .toBe(true);
  expect(await page.locator("audio").getAttribute("src")).toContain(B);
  await page.clock.install();
  await page.getByRole("button", { name: "Sleep timer", exact: true }).click();
  await page.getByRole("button", { name: "5 min", exact: true }).click();
  await page.clock.fastForward(300001);
  await expect
    .poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.paused))
    .toBe(true);
  await expect(
    page.locator('[role="status"]').filter({ hasText: "Your timer has ended. Take your time." }),
  ).toBeVisible();
});
test("quota denial never commits a partial offline recording", async ({ page }) => {
  await page.goto("/en/explore");
  await page.evaluate(() => {
    const prototype = IDBObjectStore.prototype;
    const original = prototype.put;
    (window as unknown as { restorePut: () => void }).restorePut = () => {
      prototype.put = original;
    };
    prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "recordings")
        throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Download A quiet beginning", exact: true }).click();
  await expect(
    page.getByText(
      "There isn't enough device storage. Remove a download or free space, then try again.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.evaluate(() => (window as unknown as { restorePut: () => void }).restorePut());
  await page.getByRole("button", { name: "Download A quiet beginning", exact: true }).click();
  await expect.poll(() => page.locator(".downloaded-badge").count()).toBe(1);
});
