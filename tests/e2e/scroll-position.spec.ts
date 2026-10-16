import { test, expect } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const width of [390, 1440]) {
  test(`content clicks preserve scroll position across routes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() =>
      localStorage.setItem(
        "healingmuse-appearance-v1",
        JSON.stringify({ appearance: "night", garden: "still" }),
      ),
    );
    for (const path of ["/en", "/en/explore", "/en/brainwave-entrainment", "/en/settings"]) {
      await page.goto(path);
      // Let hydration attach the shared focus handler before reproducing the text click.
      await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
      await page.getByRole("button", { name: "Your garden", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const before = await page.evaluate(() => scrollY);
      await page.getByRole("heading", { level: 1 }).click();
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
      // Clicking supporting copy after scrolling used to refocus the entire main container.
      const copy = page.locator("#main-content p:visible").last();
      // Finish the test driver's preparatory scrolling before measuring the user's click.
      await copy.click({ trial: true });
      await page.evaluate(() => (document.activeElement as HTMLElement).blur());
      const point = await copy.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      });
      const copyY = await page.evaluate(() => scrollY);
      await page.mouse.click(point.x, point.y);
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(copyY);
    }
  });
}

test("skip navigation focuses the beginning of content without a bottom scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/explore");
  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
  expect(await page.evaluate(() => scrollY)).toBeLessThan(200);
});
