import {
  test,
  expect,
  contentBox,
  expectNoHorizontalOverflow,
  expectPrimaryReady,
  pageScrolls,
} from "./support/test";
import type { Locator } from "@playwright/test";
import { size } from "./support/contracts";
import { Binaural, Explore, Recordings, Settings, Shell } from "./support/pages";

// A wide desktop window, the size the owner reviews on: the page fills the space beside the
// sidebar, and what belongs together stays together however much width there is.
const wide = { width: 1920, height: 1080 };
const box = async (locator: Locator) => (await locator.boundingBox())!;
const right = ({ x, width }: { x: number; width: number }) => x + width;
const bottom = ({ y, height }: { y: number; height: number }) => y + height;
const middle = ({ y, height }: { y: number; height: number }) => y + height / 2;

for (const path of ["", "/explore", "/settings"]) {
  test(`at 1920 px ${path || "Home"} fills the space beside the sidebar and shares the top bar's edges`, async ({
    page,
  }) => {
    const shell = new Shell(page);
    await page.setViewportSize(wide);
    await page.goto(`/en${path}`);
    await expect(shell.topbar).toBeVisible();
    // The app's right edge, inside any room kept for a desktop scrollbar.
    const app = await box(shell.app);
    const main = await box(shell.main);
    expect(main.x).toBeCloseTo(right(await box(shell.sidebar)), 0);
    expect(right(main)).toBeCloseTo(right(app), 0);
    expect(right(app)).toBeGreaterThan(wide.width - 20);
    // The top bar's controls end where the page's content ends, on both sides.
    const content = await contentBox(shell.main);
    const bar = await contentBox(shell.topbar);
    expect(bar.left).toBeCloseTo(content.left, 0);
    expect(bar.right).toBeCloseTo(content.right, 0);
    await expectNoHorizontalOverflow(page);
  });
}

// Desktop browsers on Windows and Linux draw a scrollbar that takes width; headless Chromium hides
// it, so this test launches one that shows it, with the suite's launch otherwise unchanged.
test("the top bar keeps its place between a page that scrolls and one that does not", async ({
  playwright,
  baseURL,
}) => {
  const browser = await playwright.chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
  try {
    const page = await browser.newPage({ viewport: wide, baseURL });
    const shell = new Shell(page);
    await page.goto("/en/explore");
    await expect(new Recordings(page).mainCards.first()).toBeVisible();
    expect(await pageScrolls(page)).toBe(true);
    const scrolling = await contentBox(shell.topbar);
    await page.goto("/en/library");
    await expect(shell.topbar).toBeVisible();
    expect(await pageScrolls(page)).toBe(false);
    const still = await contentBox(shell.topbar);
    expect(still.right).toBeCloseTo(scrolling.right, 0);
  } finally {
    await browser.close();
  }
});

for (const width of [820, 1440, wide.width]) {
  test(`Listen's favourite, download and details sit beside it at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: wide.height });
    await page.goto("/en");
    await expectPrimaryReady(page);
    const featured = new Recordings(page).featured;
    const listen = await box(featured.play);
    const first = await box(featured.actionIconButtons.filter({ visible: true }).first());
    expect(first.x - right(listen)).toBeGreaterThanOrEqual(0);
    expect(first.x - right(listen)).toBeLessThanOrEqual(size.nearGap);
    expect(middle(first)).toBeCloseTo(middle(listen), 0);
  });
}

test("Explore keeps its search, kinds and filters together at 1920 px", async ({ page }) => {
  const explore = new Explore(page);
  await page.setViewportSize(wide);
  await page.goto("/en/explore");
  await expect(explore.recordings.mainCards.first()).toBeVisible();
  const search = await box(explore.searchField);
  const kinds = await box(explore.kinds);
  const toggle = explore.mainFilterSummary;
  // The filters open from the kinds' row, at the end of the search field's width.
  expect(middle(await box(toggle))).toBeCloseTo(middle(kinds), 0);
  expect(right(await box(toggle))).toBeCloseTo(right(search), 0);
  expect(search.width).toBeLessThan(wide.width / 2);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(explore.mainFacets).toBeVisible();
  const facets = await box(explore.mainFacets);
  expect(facets.y).toBeGreaterThanOrEqual(bottom(kinds));
  expect(right(facets)).toBeCloseTo(right(search), 0);
  await toggle.click();
  await expect(explore.mainFacets).toBeHidden();
});

test("form fields and their controls stay together at 1920 px", async ({ page }) => {
  const settings = new Settings(page);
  const binaural = new Binaural(page);
  await page.setViewportSize(wide);
  await page.goto("/en/settings");
  for (const label of [settings.t("appearance.theme"), settings.t("appearance.garden")])
    expect((await box(page.getByLabel(label, { exact: true }))).width).toBeLessThanOrEqual(
      size.fieldMax,
    );
  // Calm's switch ends within a field's width of where its name begins.
  const calm = await box(settings.calmText);
  expect(right(await box(settings.calmSwitch)) - calm.x).toBeLessThanOrEqual(size.fieldMax);
  await page.goto(binaural.path);
  expect((await box(binaural.duration)).width).toBeLessThanOrEqual(size.fieldMax);
  const preset = await box(binaural.preset);
  expect(preset.width).toBeLessThanOrEqual(size.fieldMax);
  const favorite = await box(binaural.favoritePreset);
  expect(favorite.x - right(preset)).toBeLessThanOrEqual(size.nearGap);
  expect(favorite.x - right(preset)).toBeGreaterThanOrEqual(0);
});
