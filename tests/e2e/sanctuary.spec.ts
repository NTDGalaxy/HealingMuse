import { test, expect, storeCalm } from "./support/test";
import { style } from "./support/contracts";
import { Explore, Player, Recordings, Shell } from "./support/pages";

test("phone discovery shows playable choices and expands native listening filters by keyboard", async ({
  page,
}) => {
  const shell = new Shell(page, "vi");
  const explore = new Explore(page, "vi");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/vi/explore");
  const firstPlay = new Recordings(page, "vi").mainPlays.first();
  await expect(firstPlay).toBeVisible();
  const bounds = (await firstPlay.boundingBox())!;
  await expect(new Player(page, "vi").bar).toBeHidden();
  const playerTop = (await shell.mobileNav.boundingBox())!.y;
  expect(bounds.y + bounds.height).toBeLessThan(playerTop);
  const summary = explore.mainFilterSummary;
  await summary.focus();
  await page.keyboard.press("Space");
  const facets = explore.mainFacets;
  await expect(facets).toBeVisible();
  await explore.facet("genre", facets).selectOption("classical");
  await expect(page).toHaveURL(/genre=classical/);
  await expect(explore.facet("genre", facets)).toHaveValue("classical");
  await explore.facet("genre", facets).selectOption("");
  await expect(firstPlay).toBeVisible();
});

test("reduced motion, stored Calm mode and reduced transparency remove decorative effects", async ({
  page,
}) => {
  const shell = new Shell(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en");
  await expect(shell.mainHeading).toBeVisible();
  expect(await shell.mainHeading.evaluate((heading) => heading.getAnimations().length)).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await storeCalm(page);
  await page.reload();
  await shell.expectCalm();
  // Calm also keeps scroll parallax off: botanical.spec.ts proves the GSAP layer that drives it is
  // never downloaded under Calm or reduced motion.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ ...style.reducedTransparency }],
  });
  for (const surface of [shell.topbar, shell.searchField, new Player(page).bar]) {
    expect(
      await surface.first().evaluate((element) => getComputedStyle(element).backdropFilter),
    ).toBe(style.none);
  }
});
