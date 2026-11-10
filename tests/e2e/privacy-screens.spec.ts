import { test, expect, expectAccessible, expectNoHorizontalOverflow } from "./support/test";
import { size } from "./support/contracts";
import { Explore, Shell } from "./support/pages";
for (const locale of ["vi", "en"] as const)
  test(`guest boundaries and settings remain accessible in ${locale}`, async ({ page }) => {
    const shell = new Shell(page, locale);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ["library", "mood", "admin", "settings", "downloads", "privacy", "terms"]) {
      await page.goto(`/${locale}/${route}`);
      await expectAccessible(page);
      await expectNoHorizontalOverflow(page);
      expect(
        await shell.readableText.evaluateAll(
          (elements, minimum) =>
            elements.every(
              (element) =>
                !element.getClientRects().length ||
                Number.parseFloat(getComputedStyle(element).fontSize) >= minimum,
            ),
          size.readableFont,
        ),
      ).toBe(true);
      if (["library", "mood", "admin"].includes(route))
        await expect(shell.emptyState).toContainText(shell.t("nav.signIn"));
    }
  });
test("reduced motion and zoom-equivalent reflow keep discovery controls accessible", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // 720 CSS pixels represents a 1440-pixel desktop at 200% browser zoom.
  // This checks reflow geometry, not a physical browser's zoom or a screen reader.
  for (const locale of ["vi", "en"] as const)
    for (const width of [720, 320]) {
      const explore = new Explore(page, locale);
      await page.setViewportSize({ width, height: 740 });
      await page.goto(`/${locale}/explore`);
      // Next streams a hidden copy outside main before committing the route content.
      // Inspect the controls in the actual reading region.
      const facets = explore.mainFacets;
      await explore.mainFilterSummary.click();
      await expect(facets).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(
        await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
      ).toBe(true);
      const selects = facets.getByRole("combobox");
      await expect(selects).toHaveCount(4);
      for (const select of await selects.all()) {
        await select.focus();
        await expect(select).toBeFocused();
        expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(size.touchTarget);
      }
      await expectAccessible(page);
      await page.screenshot({ path: `test-results/reflow-${locale}-${width}.png`, fullPage: true });
    }
});
