import { test, expect } from "@playwright/test";
test("switching language preserves the native listening session", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("button", { name: "Listen to A quiet beginning", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(1);
  await page.locator('.language-switch a[lang="vi"]').first().click();
  await expect(page).toHaveURL(/\/vi$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 1),
    )
    .toBe(true);
});
