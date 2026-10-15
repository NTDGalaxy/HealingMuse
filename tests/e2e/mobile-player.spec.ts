import { test, expect } from "@playwright/test";
test("the phone player exposes its complete keyboard-operable controls", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/en");
  await page.locator(".featured-recording:visible .card-play").click();
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  for (const name of [
    "Previous recording",
    "Next recording",
    "Repeat queue",
    "Listening queue",
    "Finish session",
  ]) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: "Listening queue", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Listening queue", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
