import { test, expect, expectNoHorizontalOverflow } from "./support/test";
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
