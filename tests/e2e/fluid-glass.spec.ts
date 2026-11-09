import { test, expect, expectAccessible, expectMotionSettled, expectPlaying } from "./support/test";
import { dialog as dialogs, shell as chrome, size, style } from "./support/contracts";
import {
  cardArrived,
  cardMoved,
  expectMotionStarted,
  resetCardArrivals,
  sameAudioStillPlaying,
  watchCardArrivals,
  watchCardMoves,
} from "./support/motion";
import { Binaural, Explore, Recordings, Settings, Shell } from "./support/pages";

test.beforeEach(async ({ appearance }) => {
  await appearance({ theme: "day", garden: "still" });
});

test("route and reused catalogue results arrive without moving listening targets", async ({
  page,
}) => {
  const shell = new Shell(page);
  const recordings = new Recordings(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en");
  await recordings.featuredPlay.click();
  await expectPlaying(page);
  await watchCardArrivals(page);
  await shell.mobileNav.getByRole("link", { name: shell.t("nav.explore"), exact: true }).click();
  await expect(page).toHaveURL(/\/en\/explore$/);
  expect(
    await shell.pageHeading.evaluate((element) => getComputedStyle(element).animationName),
  ).toBe(style.headingArrival);
  await expect(shell.pageHeading).not.toHaveAttribute("style", /transform|opacity/);
  expect(await sameAudioStillPlaying(page)).toBe(true);
  // The GSAP layer starts after the first sound; reveals are observed only once it runs.
  await expectMotionStarted(page);
  await expectMotionSettled(page);
  await resetCardArrivals(page);
  const title = await recordings.titles.first().textContent();
  await new Explore(page).filterChips.nth(1).click();
  await expect(page).toHaveURL(/category=instrumental/);
  await expect.poll(() => cardArrived(page)).toBe(true);
  await expect(recordings.titles.first()).toHaveText(title!);
  await expect
    .poll(() => recordings.cards.first().evaluate((element) => getComputedStyle(element).transform))
    .toBe(style.none);
  await expectMotionSettled(page, recordings.cards.first());
  await expect(recordings.cards.first()).not.toHaveAttribute("style", /opacity|transform/);
});

test("dialog entrances and exits keep repeated keyboard focus restoration", async ({ page }) => {
  const shell = new Shell(page);
  await page.goto("/en");
  const details = new Recordings(page).featuredActionButtons.last();
  for (const trigger of [details, shell.gardenButton, details]) {
    await trigger.click();
    const dialog = shell.dialog;
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => getComputedStyle(element).animationName)).toBe(
      style.dialogArrival,
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await details.click();
  await expectAccessible(page, dialogs.role, { allRules: true });
});

test("later phone cards rise while the first listening target stays stationary", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await watchCardMoves(page);
  await page.goto("/vi");
  await expectMotionStarted(page);
  await expectMotionSettled(page);
  await new Recordings(page, "vi").moreCards.last().scrollIntoViewIfNeeded();
  await expect.poll(() => cardMoved(page, "later")).toBe(true);
  expect(await cardMoved(page, "first")).toBe(false);
});

for (const preference of ["calm", "reduced"] as const) {
  test(`${preference} stops page, dialog and selection decoration`, async ({
    page,
    appearance,
  }) => {
    const shell = new Shell(page);
    const binaural = new Binaural(page);
    await page.setViewportSize({ width: 390, height: 844 });
    if (preference === "reduced") await page.emulateMedia({ reducedMotion: "reduce" });
    else await appearance({ calm: true });
    await page.goto(binaural.path);
    await binaural.modeChoices.nth(2).click();
    const more = shell.moreButton;
    await more.hover();
    const resting = await more.boundingBox();
    await page.mouse.down();
    expect(await more.boundingBox()).toEqual(resting);
    await page.mouse.up();
    await expect(shell.dialogNavLink("settings")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(shell.dialog).toHaveCount(0);
    await shell.gardenButton.click();
    const dialog = shell.dialog;
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => getComputedStyle(element).animationName)).toBe(
      style.none,
    );
    const close = dialog.getByRole("button", { name: shell.t("common.close"), exact: true });
    await close.hover();
    await page.mouse.down();
    expect(await close.evaluate((element) => getComputedStyle(element).scale)).toBe(style.none);
    await page.mouse.up();
    // A held-pointer probe checks :active, not click dispatch after a layout/focus update.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await shell.gardenButton.click();
    expect(
      await binaural.selectedModeInput.evaluate(
        (element) => getComputedStyle(element).animationName,
      ),
    ).toBe(style.none);
    await page.keyboard.press("Escape");
    expect(await shell.pageHeading.evaluate((element) => element.getAttribute("style"))).toBeNull();
  });
}

test("glass remains readable in both themes and becomes opaque with reduced transparency", async ({
  page,
  appearance,
}) => {
  const shell = new Shell(page);
  for (const theme of ["day", "night"] as const) {
    await appearance({ theme, garden: "still" });
    await page.goto("/en/settings");
    await shell.expectTheme(theme);
    const panel = new Settings(page).panels.first();
    expect(await panel.evaluate((element) => getComputedStyle(element).backgroundColor)).toMatch(
      style.translucent,
    );
    await expectMotionSettled(page);
    await expectAccessible(page, chrome.main, { allRules: true });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ ...style.reducedTransparency }],
    });
    expect(await panel.evaluate((element) => getComputedStyle(element).backgroundColor)).toMatch(
      style.opaque,
    );
    expect(
      await shell.sidebar.evaluate((element) => getComputedStyle(element).backdropFilter),
    ).toBe(style.none);
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });
    await cdp.detach();
  }
});

test("phone Calm and secondary recording labels remain attached to their controls", async ({
  page,
}) => {
  const settings = new Settings(page, "vi");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/vi/settings");
  const text = (await settings.appearanceRowLabel.boundingBox())!;
  const checkbox = (await settings.appearanceRowControl.boundingBox())!;
  expect(checkbox.y).toBeLessThan(text.y + text.height);
  expect(checkbox.x).toBeGreaterThan(text.x + text.width);
  await page.goto("/vi");
  for (const label of await new Recordings(page, "vi").morePlayLabels.all())
    expect((await label.boundingBox())!.height).toBeLessThanOrEqual(size.compactLabel);
});
