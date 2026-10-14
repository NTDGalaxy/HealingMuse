import { chromium } from "@playwright/test";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
const origin = process.env.E2E_BASE_URL || "http://127.0.0.1:3001";
const browser = await chromium.launch({ headless: true });
const inspections = [];
await mkdir("artifacts/design", { recursive: true });
await mkdir(".impeccable/review", { recursive: true });
try {
  for (const locale of ["vi", "en"]) {
    for (const width of [390, 820, 1440]) {
      const page = await browser.newPage({
        viewport: { width, height: width === 390 ? 844 : 1000 },
        reducedMotion: "reduce",
      });
      await page.goto(`${origin}/${locale}`);
      await page.locator(".track-card:visible").first().waitFor();
      await page.evaluate(async () => {
        await document.fonts.ready;
        // Load below-the-fold lazy images before a full-page capture.
        for (const img of document.querySelectorAll("img")) {
          if (img.getClientRects().length) img.loading = "eager";
        }
        await Promise.all(
          [...document.querySelectorAll("img")]
            .filter((img) => img.getClientRects().length)
            .map((img) => img.decode().catch(() => {})),
        );
        scrollTo(0, 0);
      });
      const inspection = await page.evaluate(() => ({
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyFont: getComputedStyle(document.body).fontFamily,
        bodySize: getComputedStyle(document.body).fontSize,
        visibleCards: [...document.querySelectorAll(".track-card")].filter(
          (x) => x.getClientRects().length,
        ).length,
        brokenImages: [...document.querySelectorAll("img")]
          .filter((x) => x.getClientRects().length && (!x.complete || !x.naturalWidth))
          .map((x) => x.getAttribute("src")),
      }));
      if (inspection.documentWidth > width || inspection.brokenImages.length)
        throw new Error(`Invalid capture: ${locale} ${width}`);
      const path = `artifacts/design/home-${locale}-${width}.png`;
      await page.screenshot({ path, fullPage: true, animations: "disabled" });
      inspections.push({ locale, ...inspection, path });
      if (locale === "vi" && width !== 820)
        await copyFile(path, `.impeccable/review/${width === 390 ? "mobile" : "desktop"}.png`);
      await page.close();
    }
  }
  await writeFile("artifacts/design/inspection.json", JSON.stringify(inspections, null, 2) + "\n");
  console.log(JSON.stringify(inspections));
} finally {
  await browser.close();
}
