import { test, expect } from "@playwright/test";

test("phone discovery shows playable choices and expands native listening filters by keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/vi/explore");
  const firstPlay = page.locator("#main-content .card-play").first();
  await expect(firstPlay).toBeVisible();
  const bounds = (await firstPlay.boundingBox())!;
  const playerTop = (await page.locator(".player-bar").boundingBox())!.y;
  expect(bounds.y + bounds.height).toBeLessThan(playerTop);
  const summary = page.locator("#main-content .catalog-filter-details summary");
  await summary.focus();
  await page.keyboard.press("Space");
  const facets = page.locator("#main-content .catalog-facets");
  await expect(facets).toBeVisible();
  await facets.locator("#filter-genre").selectOption("classical");
  await expect(page).toHaveURL(/genre=classical/);
  await expect(facets.locator("#filter-genre")).toHaveValue("classical");
  await facets.locator("#filter-genre").selectOption("");
  await expect(firstPlay).toBeVisible();
});

test("reduced motion, stored Calm mode and reduced transparency remove decorative effects", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en");
  await expect(page.locator("#main-content h1")).toBeVisible();
  expect(
    await page.locator("#main-content h1").evaluate((heading) => heading.getAnimations().length),
  ).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => localStorage.setItem("healingmuse-calm", "true"));
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveClass(/calm-mode/);
  await page.evaluate(() => scrollTo(0, 500));
  expect(
    await page
      .locator("#sanctuary-scenery")
      .evaluate((element) => element.style.getPropertyValue("--scenic-shift")),
  ).toBe("");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });
  for (const selector of [".topbar", ".search-box", ".player-bar"]) {
    expect(
      await page
        .locator(selector)
        .first()
        .evaluate((element) => getComputedStyle(element).backdropFilter),
    ).toBe("none");
  }
});
