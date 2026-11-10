import { test, expect, expectNoHorizontalOverflow, expectPlaying } from "./support/test";
import type { Locator } from "@playwright/test";
import { size } from "./support/contracts";
import { Player, Recordings, Shell } from "./support/pages";
test("the phone player exposes its complete keyboard-operable controls", async ({ page }) => {
  const shell = new Shell(page);
  const player = new Player(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/en");
  await new Recordings(page).featuredPlay.click();
  await player.button("expand").click();
  for (const key of ["previous", "next", "repeat", "queue", "finish"] as const) {
    const button = player.button(key);
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(size.touchTarget);
    expect(box!.height).toBeGreaterThanOrEqual(size.touchTarget);
  }
  await player.button("queue").click();
  await expect(shell.dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(player.button("queue")).toBeFocused();
  await expectNoHorizontalOverflow(page);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`a playing recording's player covers no page content at ${viewport.width}px`, async ({
    page,
  }) => {
    const shell = new Shell(page, "vi");
    const player = new Player(page, "vi");
    const recordings = new Recordings(page, "vi");
    await page.setViewportSize(viewport);
    await page.goto("/vi");
    await recordings.featuredPlay.click();
    await expectPlaying(page);
    await expect(player.bar).toBeVisible();
    const playerTop = (await player.bar.boundingBox())!.y;
    const bottomOf = async (locator: Locator) => {
      const box = (await locator.boundingBox())!;
      return box.y + box.height;
    };
    if (await shell.sidebar.isVisible()) {
      // The foot of the sidebar stays above the player bar.
      for (const key of ["privacy", "terms", "credits"] as const)
        expect(await bottomOf(shell.sidebarLegalLink(key))).toBeLessThanOrEqual(playerTop);
    } else {
      // The first recording up next stays in the first view above the mini player.
      expect(await bottomOf(recordings.moreCards.first())).toBeLessThanOrEqual(playerTop);
    }
    // The end of the page scrolls clear of the player.
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }),
    );
    await expect.poll(() => bottomOf(shell.pageFooter)).toBeLessThanOrEqual(playerTop);
  });
}
