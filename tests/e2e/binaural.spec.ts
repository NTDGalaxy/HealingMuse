import {
  test,
  expect,
  expectAccessible,
  expectNoHorizontalOverflow,
  expectPaused,
  expectPlaying,
  seedDownload,
  waitForAudioClock,
} from "./support/test";
import { mkdir, writeFile } from "node:fs/promises";
import { hostedInstrumental, preparedAudio } from "./support/catalogue";
import { size, style } from "./support/contracts";
import { Binaural, FixtureHarness, Recordings, Shell } from "./support/pages";

let fixtureServer: FixtureHarness | undefined;
test.afterAll(async () => {
  await fixtureServer?.close();
});
test("real OfflineAudioContext renders all presets into separate ears", async ({ page }) => {
  fixtureServer = await FixtureHarness.binauralAudio();
  await page.goto(fixtureServer.audioUrl);
  await page.waitForFunction(() => !!window.verifyBinauralStereo);
  const results = await page.evaluate(() => window.verifyBinauralStereo());
  expect(results).toHaveLength(13);
  for (const result of results) {
    expect(result.left).toBeCloseTo(0.25, 3);
    expect(result.right).toBeCloseTo(0.25, 3);
    expect(result.leftLeak).toBeLessThan(0.002);
    expect(result.rightLeak).toBeLessThan(0.002);
  }
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/binaural-stereo.json", JSON.stringify(results, null, 2));
});

test("guest session pauses on navigation, resumes explicitly and never creates duplicate contexts", async ({
  page,
}) => {
  const binaural = new Binaural(page);
  const shell = new Shell(page);
  await binaural.instrumentAudio();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let sessionWrites = 0;
  await page.route("**/api/sessions", (route) => {
    sessionWrites++;
    return route.abort();
  });
  await binaural.open();
  const contextStates = () => binaural.contextStates();
  const start = binaural.button("start");
  await expect(start).toBeEnabled();
  expect(await contextStates()).toEqual([]);
  await start.click();
  await binaural.expectState("playing");
  await expect.poll(contextStates).toEqual(["running"]);
  await binaural.mode("theta").check();
  await expect(binaural.frequencies).toContainText("206");
  await binaural.preset.selectOption("4");
  await expect(binaural.frequencies).toContainText("204");
  await binaural.invokeMediaSession("pause");
  await binaural.expectState("paused");
  const progress = await binaural.progress.getAttribute("value");
  // The paused session must not advance while audio time keeps running.
  await waitForAudioClock(page, 0.65);
  expect(await binaural.progress.getAttribute("value")).toBe(progress);
  await binaural.button("resume").click();
  await expect.poll(contextStates).toEqual(["running"]);
  await shell.languageLink("vi").click();
  await expect(page).toHaveURL(/\/vi\/brainwave-entrainment$/);
  await binaural.expectState("playing");
  expect(await contextStates()).toEqual(["running"]);
  await shell.languageLink("en").click();
  await expect(binaural.button("pause")).toBeVisible();
  await shell.sideNavLink("/en/explore").click();
  await expect(page).toHaveURL(/\/en\/explore$/);
  await expect.poll(contextStates).toEqual(["suspended"]);
  await shell.sideNavLink("/en/brainwave-entrainment").click();
  await expect(binaural.button("resume")).toBeEnabled();
  expect(await contextStates()).toEqual(["suspended"]);
  await binaural.button("resume").click();
  await binaural.button("stop").click();
  await expect.poll(contextStates).toEqual(["closed"]);
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.playbackState)).toBe("none");
  expect(sessionWrites).toBe(0);
  expect(errors).toEqual([]);
});

test("native keyboard controls select modes and presets, and calm mode disables decorative motion", async ({
  page,
}) => {
  const binaural = new Binaural(page);
  await binaural.open();
  const beta = binaural.mode("beta");
  await beta.focus();
  await page.keyboard.press("Space");
  await expect(beta).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(binaural.mode("alpha")).toBeChecked();
  await binaural.preset.focus();
  await page.keyboard.press("ArrowDown");
  await expect(binaural.frequencies).toContainText("212");
  await binaural.button("start").focus();
  await page.keyboard.press("Enter");
  await expect(binaural.button("pause")).toBeFocused();
  await new Shell(page).applyCalmClass();
  expect(await binaural.visualizerAnimation()).toBe(style.none);
  await page.keyboard.press("Enter");
  await binaural.expectState("paused");
});

for (const locale of ["en", "vi"] as const)
  test(`binaural controls reflow and pass axe in ${locale}`, async ({ page }) => {
    const binaural = new Binaural(page, locale);
    await binaural.open();
    for (const width of [390, 820, 1440, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(binaural.buttons.first()).toBeEnabled();
      if (width === 390) {
        const button = (await binaural.buttons.first().boundingBox())!;
        expect(button.y + button.height).toBeLessThanOrEqual(777);
      }
      await expectNoHorizontalOverflow(page);
      await expectAccessible(page);
      for (const button of await binaural.buttons.all()) {
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(size.touchTarget);
      }
      await page.screenshot({
        path: `test-results/binaural-${locale}-${width}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const mode of ["beta", "theta", "delta"] as const) {
      await binaural.mode(mode).check();
      await binaural.openAdvanced();
      await expectAccessible(page);
      await page.screenshot({
        path: `test-results/binaural-${locale}-${mode}.png`,
        fullPage: true,
      });
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await binaural.buttons.first().click();
    expect(await binaural.visualizerAnimation()).toBe(style.none);
  });

test("custom duration, favorites and opt-in settings restore without autoplay", async ({
  page,
}) => {
  const binaural = new Binaural(page);
  await binaural.open();
  await binaural.button("start").waitFor();
  await binaural.duration.selectOption("custom");
  await binaural.customDuration.fill("0");
  await expect(binaural.button("start")).toBeDisabled();
  await expect(binaural.customDuration).toHaveAttribute("aria-invalid", "true");
  await binaural.customDuration.fill("2");
  await binaural.button("favoritePreset").click();
  expect(await binaural.storedPreferences()).toBeNull();
  await binaural.remember.check();
  await expect.poll(async () => !!(await binaural.storedPreferences())).toBe(true);
  await page.reload();
  await expect(binaural.customDuration).toHaveValue("2");
  // Streaming can briefly retain a hidden SSR copy while saved preferences hydrate.
  await expect(binaural.player).toHaveCount(1);
  await binaural.expectState("idle");
  await expect(binaural.button("favoritePreset")).toHaveAttribute("aria-pressed", "true");
  await binaural.button("reset").click();
  await expect.poll(() => binaural.storedPreferences()).toBeNull();
});

test("licensed background uses one fresh grant, mixes independently and yields to ordinary playback", async ({
  page,
}) => {
  const binaural = new Binaural(page);
  const shell = new Shell(page);
  const track = await hostedInstrumental();
  const audio = await preparedAudio(track);
  let grants = 0,
    fail = false;
  await page.route("**/api/catalog?*", (route) =>
    route.fulfill({ json: { items: [track], total: 1, nextCursor: null } }),
  );
  await page.route("**/api/grants/*", (route) => {
    grants++;
    return fail
      ? route.fulfill({ status: 503, json: { error: { code: "unavailable" } } })
      : route.fulfill({
          json: {
            url: "/binaural-fixture.mp3",
            expiresAt: new Date(Date.now() + 600000).toISOString(),
            bytes: audio.length,
            sha256: "a".repeat(64),
          },
        });
  });
  await page.route("**/binaural-fixture.mp3", (route) =>
    route.fulfill({ contentType: "audio/mpeg", body: audio }),
  );
  await binaural.instrumentBackgroundMedia();
  const musicState = () => binaural.backgroundMediaPlaying();
  await binaural.open();
  expect(grants).toBe(0);
  await binaural.background.scrollIntoViewIfNeeded();
  await binaural.backgroundPlay.click();
  await expect(binaural.button("start")).toBeEnabled();
  expect(grants).toBe(1);
  await binaural.button("start").click();
  await expect.poll(musicState).toEqual([true]);
  await binaural.volume("background").fill("10");
  await binaural.volume("tone").fill("30");
  await expect(binaural.volume("master")).toHaveValue("60");
  await binaural.button("pause").click();
  await expect.poll(musicState).toEqual([false]);
  fail = true;
  // A retry requires a new grant and leaves controls available after a quota-like failure.
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await binaural.button("none").click();
  await binaural.backgroundPlay.click();
  await expect(binaural.button("retryMusic")).toBeVisible();
  fail = false;
  await binaural.button("retryMusic").click();
  await expect(binaural.button("resume")).toBeEnabled();
  await binaural.button("resume").click();
  await expect.poll(musicState).toEqual([true]);
  await shell.sideNavLink("/en/explore").click();
  await expect.poll(musicState).toEqual([false]);
  await new Recordings(page).plays.first().click();
  await expectPlaying(page);
  await shell.sideNavLink("/en/brainwave-entrainment").click();
  await binaural.button("resume").click();
  await expectPaused(page);
  await expect.poll(musicState).toEqual([true]);
});

test("audio-clock deadline completes a one-minute session without a UI countdown dependency", async ({
  page,
}) => {
  test.setTimeout(90000);
  const binaural = new Binaural(page);
  await binaural.open();
  await binaural.duration.selectOption("custom");
  await binaural.customDuration.fill("1");
  await binaural.button("start").click();
  await binaural.expectState("playing");
  await binaural.expectState("completed", { timeout: 65000 });
  await expect(binaural.progress).toHaveAttribute("value", "60");
  await expect(binaural.button("start")).toBeEnabled();
});

test("unavailable Web Audio offers ordinary music as an alternative", async ({ page }) => {
  const binaural = new Binaural(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", { value: undefined });
  });
  await binaural.open();
  await binaural.button("start").click();
  await binaural.expectState("unsupported");
  await expect(binaural.ordinaryMusic).toBeVisible();
});

test("a failed engine download announces recovery and retries without autoplay", async ({
  page,
}) => {
  const binaural = new Binaural(page);
  let fail = true;
  const errors: string[] = [];
  page.on("pageerror", () => errors.push("unhandled_error"));
  await page.route("**/_next/static/chunks/*.js", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (fail && body.includes("createChannelMerger") && body.includes("createOscillator"))
      return route.abort("failed");
    return route.fulfill({ response, body });
  });
  await page.goto(binaural.path);
  await expect(binaural.engineAlert).toContainText(binaural.t("binaural.engineError"));
  fail = false;
  await binaural.button("retryEngine").click();
  await expect(binaural.button("start")).toBeEnabled();
  await binaural.expectState("idle");
  expect(errors).toEqual([]);
});

test("a CORS-blocked private background leaves tones and retry controls available", async ({
  page,
}) => {
  const binaural = new Binaural(page);
  const track = await hostedInstrumental();
  const audio = await preparedAudio(track);
  await page.route("**/api/catalog?*", (route) =>
    route.fulfill({ json: { items: [track], total: 1, nextCursor: null } }),
  );
  await page.route("**/api/grants/*", (route) =>
    route.fulfill({
      json: {
        url: "https://audio.invalid/binaural-fixture.mp3",
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      },
    }),
  );
  await page.route("https://audio.invalid/**", (route) =>
    route.fulfill({
      contentType: "audio/mpeg",
      body: audio,
      headers: { "Access-Control-Allow-Origin": "https://different-origin.invalid" },
    }),
  );
  await binaural.open();
  await binaural.background.scrollIntoViewIfNeeded();
  await binaural.backgroundPlay.click();
  await binaural.button("start").click();
  await expect(binaural.button("retryMusic")).toBeVisible();
  await binaural.expectState("playing");
  await binaural.button("tonesOnly").click();
  await binaural.button("resume").click();
  await binaural.expectState("playing");
});

test("previously downloaded instrumental mixes offline without requesting a grant", async ({
  page,
  context,
}) => {
  const binaural = new Binaural(page);
  const track = await hostedInstrumental();
  const audio = await preparedAudio(track);
  await page.route("**/offline-binaural-fixture.mp3", (route) =>
    route.fulfill({ contentType: "audio/mpeg", body: audio }),
  );
  let grants = 0;
  await page.route("**/api/grants/*", (route) => {
    grants++;
    return route.abort();
  });
  await binaural.open();
  await seedDownload(page, track, "/offline-binaural-fixture.mp3");
  await page.reload();
  await expect(binaural.button("start")).toBeEnabled();
  await expect(binaural.player).toHaveCount(1);
  await context.setOffline(true);
  await binaural.background.scrollIntoViewIfNeeded();
  const catalogue = binaural.catalogue;
  await expect(catalogue.recordings.cards).toHaveCount(1);
  await catalogue.searchFor("no matching local recording", { exact: true });
  await expect(catalogue.noResults).toBeVisible();
  await catalogue.clearFilters.click();
  await expect(catalogue.recordings.cards).toHaveCount(1);
  await binaural.backgroundPlay.click();
  await binaural.button("start").click();
  await binaural.expectState("playing");
  await expect(binaural.button("retryMusic")).toHaveCount(0);
  expect(grants).toBe(0);
  await binaural.button("stop").click();
  await context.setOffline(false);
});
