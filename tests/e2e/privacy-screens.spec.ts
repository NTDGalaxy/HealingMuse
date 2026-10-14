import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const locale of ["vi", "en"])
  test(`guest boundaries and settings remain accessible in ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ["library", "mood", "admin", "settings", "downloads", "privacy", "terms"]) {
      await page.goto(`/${locale}/${route}`);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        await page
          .locator("main p, .setting-row > span > span")
          .evaluateAll((elements) =>
            elements.every(
              (element) =>
                !element.getClientRects().length ||
                Number.parseFloat(getComputedStyle(element).fontSize) >= 16,
            ),
          ),
      ).toBe(true);
      if (["library", "mood", "admin"].includes(route))
        await expect(page.locator(".empty-state")).toContainText(
          locale === "vi" ? "Đăng nhập" : "Sign in",
        );
    }
  });
test("reduced motion and zoom-equivalent reflow keep discovery controls accessible", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // 720 CSS pixels represents a 1440-pixel desktop at 200% browser zoom.
  // This checks reflow geometry, not a physical browser's zoom or a screen reader.
  for (const locale of ["vi", "en"])
    for (const width of [720, 320]) {
      await page.setViewportSize({ width, height: 740 });
      await page.goto(`/${locale}/explore`);
      // Next streams a hidden copy outside main before committing the route content.
      // Inspect the controls in the actual reading region.
      const facets = page.locator("#main-content .catalog-facets");
      await page.locator("#main-content .catalog-filter-details summary").click();
      await expect(facets).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
      ).toBe(true);
      const selects = facets.getByRole("combobox");
      await expect(selects).toHaveCount(4);
      for (const select of await selects.all()) {
        await select.focus();
        await expect(select).toBeFocused();
        expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({ path: `test-results/reflow-${locale}-${width}.png`, fullPage: true });
    }
});
