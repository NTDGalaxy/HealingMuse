import { test, expect, expectMotionSettled } from "./support/test";
import { Explore, Shell } from "./support/pages";

test.use({ serviceWorkers: "block" });

for (const width of [390, 1440]) {
  test(`content clicks preserve scroll position across routes at ${width}px`, async ({
    page,
    appearance,
  }) => {
    const shell = new Shell(page);
    await page.setViewportSize({ width, height: 844 });
    await appearance({ theme: "night", garden: "still" });
    for (const path of ["/en", "/en/explore", "/en/brainwave-entrainment", "/en/settings"]) {
      await page.goto(path);
      // Let hydration attach the shared focus handler before reproducing the text click.
      await shell.expectTheme("night");
      await shell.gardenButton.click();
      await expect(shell.dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(shell.dialog).toHaveCount(0);
      // A lazily loaded recording list (Binaural) inserts content when scrolled near, and scroll
      // anchoring then moves scrollY. Settle it first so only the user's click is measured.
      const lazyList = new Explore(page).loadingResultsNote;
      if (await lazyList.count()) {
        await lazyList.scrollIntoViewIfNeeded();
        await expect(lazyList).toHaveCount(0);
        await page.evaluate(() => scrollTo(0, 0));
      }
      // The heading's entrance moves it for 550 ms; a click meanwhile measures the animation,
      // not the click (the dialog above can now open with no download and finish sooner).
      await expectMotionSettled(page);
      const before = await page.evaluate(() => scrollY);
      await page.getByRole("heading", { level: 1 }).click();
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
      // Clicking supporting copy after scrolling used to refocus the entire main container.
      const copy = shell.mainCopy.last();
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
  const shell = new Shell(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/explore");
  await shell.skipLink.focus();
  await page.keyboard.press("Enter");
  await expect(shell.main).toBeFocused();
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
  expect(await page.evaluate(() => scrollY)).toBeLessThan(200);
});
