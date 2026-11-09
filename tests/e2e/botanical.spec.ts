import {
  test,
  expect,
  expectAccessible,
  expectNoHorizontalOverflow,
  expectPlaying,
  holdRequests,
} from "./support/test";
import {
  dialog as dialogs,
  shell as chrome,
  garden,
  localAudioRoute,
  size,
} from "./support/contracts";
import { firstSoundTime, pageTime, sceneWaitedForSound, watchFirstSound } from "./support/motion";
import { Binaural, Explore, Player, Recordings, Shell, TrackCard } from "./support/pages";
test.use({ launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });

test("home discovery does not promote unavailable nature recordings", async ({ page }) => {
  await page.goto("/en");
  await expect(new Explore(page).mainCategoryLink("nature")).toHaveCount(0);
});

test("phone recording actions stay above fixed navigation when reached by keyboard", async ({
  page,
}) => {
  const shell = new Shell(page, "vi");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/vi");
  const card = new TrackCard(new Recordings(page, "vi").cards.first());
  await card.play.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const control = shell.focused;
  await expect(control).toBeVisible();
  expect(
    await control.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return hit !== null && element.contains(hit);
    }),
  ).toBe(true);
});

test("keyboard focus under the expanded player is revealed above it on a phone", async ({
  page,
}) => {
  const shell = new Shell(page);
  const player = new Player(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/explore");
  await new Recordings(page).mainPlays.first().click();
  await player.button("expand").click();
  // Keyboard modality, then focus that the browser does not scroll (as assistive technology or a
  // returning dialog may move it): the player bar, not only the navigation, must be avoided.
  await page.keyboard.press("Tab");
  const bar = (await player.bar.boundingBox())!;
  const nav = (await shell.mobileNav.boundingBox())!;
  const outcome = await shell.main.getByRole("button").evaluateAll(
    (buttons, { barTop, navTop }) => {
      const target = (buttons as HTMLElement[]).find((element) => {
        const box = element.getBoundingClientRect();
        return box.height > 0 && box.top + box.height / 2 > barTop + 4 && box.bottom < navTop;
      });
      if (!target) return "no control under the player";
      target.focus({ preventScroll: true });
      const box = target.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return hit !== null && target.contains(hit) ? "revealed" : "covered";
    },
    { barTop: bar.y, navTop: nav.y },
  );
  expect(outcome).toBe("revealed");
});

for (const locale of ["en", "vi"] as const)
  for (const theme of ["day", "night"] as const) {
    test(`${locale} ${theme} keeps the first recording identified and immediately playable`, async ({
      page,
      appearance,
    }) => {
      const shell = new Shell(page, locale);
      await page.setViewportSize({ width: 390, height: 844 });
      await appearance({ theme, garden: "still" });
      await page.goto(`/${locale}`);
      await shell.expectTheme(theme);
      await expect(new Player(page, locale).bar).toBeHidden();
      const first = new Recordings(page, locale).featured;
      for (const part of [first.title, first.descriptionText, first.play]) {
        const bounds = (await part.boundingBox())!;
        expect(bounds.y).toBeGreaterThan(0);
        expect(bounds.y + bounds.height).toBeLessThan((await shell.mobileNav.boundingBox())!.y);
      }
      await expect(first.playLabel).toBeVisible();
      const label = await first.playLabel.boundingBox();
      expect(label!.height).toBeLessThanOrEqual(size.compactLabel);
      const art = await first.art.boundingBox();
      const description = await first.description.boundingBox();
      expect(art!.x + art!.width).toBeLessThan(description!.x);
      await expectNoHorizontalOverflow(page);
      await expect(shell.gardenCanvas).toHaveCount(0);
    });
  }

test("stored Still, Calm and reduced motion hydrate the server markup without a mismatch", async ({
  page,
  appearance,
}) => {
  // The motion policy reads the live preferences during hydration; markup must never follow it.
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await appearance({ theme: "night", garden: "still", calm: true });
  await page.goto("/en");
  const shell = new Shell(page);
  await shell.expectGardenState("still");
  await new Recordings(page).featuredPlay.click();
  await expectPlaying(page);
  expect(errors).toEqual([]);
});

test("global appearance persists and More restores keyboard focus", async ({ page }) => {
  const shell = new Shell(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en");
  await shell.gardenButton.click();
  const dialog = shell.dialog;
  await shell.appearanceSelect.selectOption("night");
  await shell.gardenDetailSelect.selectOption("still");
  await dialog.getByRole("checkbox").check();
  await shell.expectCalm();
  await page.keyboard.press("Escape");
  await expect(shell.gardenButton).toBeFocused();
  await page.reload();
  await shell.expectTheme("night");
  await expect(shell.gardenCanvas).toHaveCount(0);
  const more = shell.moreButton;
  await more.click();
  await expect(shell.dialogNavLink("downloads")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await more.click();
  await shell.dialogNavLink("settings").click();
  await expect(page).toHaveURL(/\/en\/settings$/);
  await shell.expectCurrentMoreButton();
  await expect(shell.dialog).toHaveCount(0);
});

test("renderer startup failure leaves working recording controls and a poster", async ({
  page,
}) => {
  const shell = new Shell(page);
  await page.addInitScript(() => {
    window.Worker = class {
      constructor() {
        throw new Error("Synthetic worker startup failure");
      }
    } as unknown as typeof Worker;
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args) {
      if (String(args[0]).includes("webgl")) return null;
      return Reflect.apply(getContext, this, args);
    } as typeof getContext;
  });
  await page.goto("/en");
  await shell.expectGardenState("still");
  await new Recordings(page).featuredPlay.click();
  await expectPlaying(page);
  await expect(new Player(page).bar).toBeVisible();
});

test("the active listening queue remains readable in Night appearance", async ({
  page,
  appearance,
}) => {
  const shell = new Shell(page);
  const player = new Player(page);
  await appearance({ theme: "night", garden: "still" });
  await page.goto("/en");
  await shell.expectTheme("night");
  await new Recordings(page).featuredPlay.click();
  await player.button("queue").click();
  await expect(player.currentQueueItem).toHaveCount(1);
  await expectAccessible(page, dialogs.content);
  await page.keyboard.press("Escape");
  await shell.sideNavLink("/en/explore").hover();
  await expectAccessible(page, chrome.sidebar);
});

test.describe("WebGL lifecycle", () => {
  test("sustained slow frames reduce quality and fall back without blocking audio", async ({
    page,
  }) => {
    const shell = new Shell(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, "Worker", { value: undefined, configurable: true });
      const request = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => request((time) => callback(time * 20));
    });
    await page.goto("/en");
    await shell.expectGardenState("still");
    await shell.expectGardenQuality("0");
    await expect(shell.gardenHostCanvas).toHaveCount(0);
    await shell.expectGardenDetail("auto");
    await new Recordings(page).featuredPlay.click();
    await expectPlaying(page);
  });

  test("the scene's drawing buffer follows a viewport resize", async ({ page }) => {
    const shell = new Shell(page);
    // The main-thread canvas exposes its drawing-buffer size; the worker's is transferred.
    await page.addInitScript(() =>
      Object.defineProperty(window, "Worker", { value: undefined, configurable: true }),
    );
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/en");
    await shell.expectGardenState("ready");
    const buffer = () =>
      shell.gardenHostCanvas.evaluate((canvas) => {
        const { width, height } = canvas as HTMLCanvasElement;
        return { width, height, scale: width / innerWidth };
      });
    const { scale } = await buffer();
    await page.setViewportSize({ width: 800, height: 600 });
    await expect
      .poll(buffer)
      .toEqual({ width: Math.floor(800 * scale), height: Math.floor(600 * scale), scale });
  });

  test("main-thread fallback and context loss preserve active audio", async ({ page }) => {
    const shell = new Shell(page);
    await page.addInitScript(() =>
      Object.defineProperty(window, "Worker", { value: undefined, configurable: true }),
    );
    await page.goto("/en");
    await shell.expectGardenState("ready");
    await shell.expectGardenRenderer("main");
    await new Recordings(page).featuredPlay.click();
    await expectPlaying(page);
    await shell.gardenHostCanvas.evaluate((canvas) =>
      (canvas as HTMLCanvasElement)
        .getContext("webgl2")!
        .getExtension("WEBGL_lose_context")!
        .loseContext(),
    );
    await shell.expectGardenState("still");
    await expect(shell.gardenHostCanvas).toHaveCount(0);
    await expectPlaying(page);
  });
});

// Audio-first ordering, asserted without depending on machine speed: the start stays pending
// until the test releases it, and the check accepts either order the contract allows (after the
// sound, or after decorationMayStart's whole wait). The timing itself is unit tested in
// tests/unit/garden-audio-first.test.ts.
test.describe("audio-first decoration", () => {
  /** Switches Still to Automatic and waits until the scenery has taken the change. */
  async function allowScene(shell: Shell) {
    await shell.gardenButton.click();
    await shell.gardenDetailSelect.selectOption("auto");
    await shell.page.keyboard.press("Escape");
    await expect(shell.gardenHost).not.toHaveAttribute(garden.state, "still");
  }

  test("a scene allowed while a recording starts begins after its first sound", async ({
    page,
    appearance,
  }) => {
    const shell = new Shell(page);
    await appearance({ theme: "day", garden: "still" });
    await watchFirstSound(page);
    const recording = await holdRequests(page, localAudioRoute);
    await page.goto("/en");
    await shell.expectGardenState("still");
    await new Recordings(page).featuredPlay.click();
    await recording.reached;
    const allowed = await pageTime(page);
    await allowScene(shell);
    recording.release();
    await expectPlaying(page);
    await shell.expectGardenState("ready");
    const sound = await firstSoundTime(page);
    expect(sound).not.toBeNull();
    expect(await sceneWaitedForSound(page, { allowed, sound: sound! })).toBe(true);
  });

  test("a scene allowed while binaural tones start begins after they start", async ({
    page,
    appearance,
  }) => {
    const shell = new Shell(page);
    const binaural = new Binaural(page);
    await appearance({ theme: "day", garden: "still" });
    const releaseTones = await binaural.holdToneStart();
    await binaural.open();
    await shell.expectGardenState("still");
    await binaural.button("start").click();
    await binaural.expectState("starting");
    const allowed = await pageTime(page);
    await allowScene(shell);
    const sound = await releaseTones();
    await binaural.expectState("playing");
    await shell.expectGardenState("ready");
    expect(await sceneWaitedForSound(page, { allowed, sound })).toBe(true);
  });
});
