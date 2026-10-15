import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createServer, type ViteDevServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Track } from "@/lib/types";

let fixtureServer: ViteDevServer;
async function openBinaural(page: Page, locale = "en") {
  await page.goto(`/${locale}/brainwave-entrainment`);
  await expect(
    page.getByRole("button", {
      name: locale === "en" ? "Start session" : "Bắt đầu nghe",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(page.locator(".binaural-player")).toHaveCount(1);
}
test.afterAll(async () => {
  await fixtureServer?.close();
});
test("real OfflineAudioContext renders all presets into separate ears", async ({ page }) => {
  fixtureServer = await createServer({
    configFile: false,
    cacheDir: "node_modules/.vite/binaural-audio",
    optimizeDeps: { entries: ["tests/browser-fixtures/binaural-audio.html"] },
    server: { host: "127.0.0.1", port: 0, watch: null },
  });
  await fixtureServer.listen();
  await page.goto(
    `${fixtureServer.resolvedUrls!.local[0]}tests/browser-fixtures/binaural-audio.html`,
  );
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
  await page.addInitScript(() => {
    const NativeContext = window.AudioContext;
    const contexts: AudioContext[] = [];
    Object.defineProperty(window, "binauralTestContexts", { value: contexts });
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        contexts.push(this);
      }
    };
    if ("mediaSession" in navigator) {
      const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler | null>> = {};
      const set = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
      Object.defineProperty(window, "binauralTestActions", { value: handlers });
      navigator.mediaSession.setActionHandler = (action, handler) => {
        handlers[action] = handler;
        set(action, handler);
      };
    }
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let sessionWrites = 0;
  await page.route("**/api/sessions", (route) => {
    sessionWrites++;
    return route.abort();
  });
  await openBinaural(page);
  const contextStates = () =>
    page.evaluate(() =>
      (window as unknown as { binauralTestContexts: AudioContext[] }).binauralTestContexts.map(
        (context) => context.state,
      ),
    );
  const start = page.getByRole("button", { name: "Start session", exact: true });
  await expect(start).toBeEnabled();
  expect(await contextStates()).toEqual([]);
  await start.click();
  await expect(page.locator(".binaural-player")).toHaveAttribute("data-state", "playing");
  await expect.poll(contextStates).toEqual(["running"]);
  await page.getByRole("radio", { name: /Theta/ }).check();
  await expect(page.locator(".binaural-frequencies")).toContainText("206");
  await page.locator("#binaural-preset").selectOption("4");
  await expect(page.locator(".binaural-frequencies")).toContainText("204");
  await page.evaluate(() =>
    (
      window as unknown as {
        binauralTestActions: Partial<Record<MediaSessionAction, MediaSessionActionHandler>>;
      }
    ).binauralTestActions.pause?.({ action: "pause" }),
  );
  await expect(page.locator(".binaural-player")).toHaveAttribute("data-state", "paused");
  const progress = await page
    .getByRole("progressbar", { name: "Session progress" })
    .getAttribute("value");
  await page.waitForTimeout(650);
  expect(
    await page.getByRole("progressbar", { name: "Session progress" }).getAttribute("value"),
  ).toBe(progress);
  await page.getByRole("button", { name: "Resume session", exact: true }).click();
  await expect.poll(contextStates).toEqual(["running"]);
  await page.locator('.language-switch a[lang="vi"]').click();
  await expect(page).toHaveURL(/\/vi\/brainwave-entrainment$/);
  await expect(page.locator(".binaural-player")).toHaveAttribute("data-state", "playing");
  expect(await contextStates()).toEqual(["running"]);
  await page.locator('.language-switch a[lang="en"]').click();
  await expect(page.getByRole("button", { name: "Pause session", exact: true })).toBeVisible();
  await page.locator('.side-nav a[href="/en/explore"]').click();
  await expect(page).toHaveURL(/\/en\/explore$/);
  await expect.poll(contextStates).toEqual(["suspended"]);
  await page.locator('.side-nav a[href="/en/brainwave-entrainment"]').click();
  await expect(page.getByRole("button", { name: "Resume session", exact: true })).toBeEnabled();
  expect(await contextStates()).toEqual(["suspended"]);
  await page.getByRole("button", { name: "Resume session", exact: true }).click();
  await page.getByRole("button", { name: "Stop session", exact: true }).click();
  await expect.poll(contextStates).toEqual(["closed"]);
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.playbackState)).toBe("none");
  expect(sessionWrites).toBe(0);
  expect(errors).toEqual([]);
});

test("native keyboard controls select modes and presets, and calm mode disables decorative motion", async ({
  page,
}) => {
  await openBinaural(page);
  const beta = page.getByRole("radio", { name: /Beta/ });
  await beta.focus();
  await page.keyboard.press("Space");
  await expect(beta).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /Alpha/ })).toBeChecked();
  await page.locator("#binaural-preset").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".binaural-frequencies")).toContainText("212");
  await page.getByRole("button", { name: "Start session", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Pause session", exact: true })).toBeFocused();
  await page.locator(".app-shell").evaluate((element) => element.classList.add("calm-mode"));
  expect(
    await page
      .locator(".binaural-visualizer i")
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  await page.keyboard.press("Enter");
  await expect(page.locator(".binaural-player")).toHaveAttribute("data-state", "paused");
});

for (const locale of ["en", "vi"])
  test(`binaural controls reflow and pass axe in ${locale}`, async ({ page }) => {
    await openBinaural(page, locale);
    for (const width of [390, 820, 1440, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.locator(".binaural-buttons button").first()).toBeEnabled();
      if (width === 390) {
        const button = (await page.locator(".binaural-buttons button").first().boundingBox())!;
        expect(button.y + button.height).toBeLessThanOrEqual(777);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      for (const button of await page.locator(".binaural-buttons button").all()) {
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({
        path: `test-results/binaural-${locale}-${width}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const mode of ["Beta", "Theta", "Delta"]) {
      await page.getByRole("radio", { name: new RegExp(mode) }).check();
      await page.locator(".binaural-advanced").evaluate((element) => {
        (element as HTMLDetailsElement).open = true;
      });
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({
        path: `test-results/binaural-${locale}-${mode.toLowerCase()}.png`,
        fullPage: true,
      });
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator(".binaural-buttons button").first().click();
    expect(
      await page
        .locator(".binaural-visualizer i")
        .first()
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe("none");
  });

test("custom duration, favorites and opt-in settings restore without autoplay", async ({
  page,
}) => {
  await openBinaural(page);
  await page.getByRole("button", { name: "Start session", exact: true }).waitFor();
  await page.locator("#binaural-duration").selectOption("custom");
  await page.locator("#binaural-custom-duration").fill("0");
  await expect(page.getByRole("button", { name: "Start session", exact: true })).toBeDisabled();
  await expect(page.locator("#binaural-custom-duration")).toHaveAttribute("aria-invalid", "true");
  await page.locator("#binaural-custom-duration").fill("2");
  await page.getByRole("button", { name: "Favorite this preset", exact: true }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("healingmuse-binaural-preferences-v1")),
  ).toBeNull();
  await page.getByRole("checkbox", { name: "Remember settings on this device" }).check();
  await expect
    .poll(() => page.evaluate(() => !!localStorage.getItem("healingmuse-binaural-preferences-v1")))
    .toBe(true);
  await page.reload();
  await expect(page.locator("#binaural-custom-duration")).toHaveValue("2");
  // Streaming can briefly retain a hidden SSR copy while saved preferences hydrate.
  await expect(page.locator(".binaural-player")).toHaveCount(1);
  await expect(page.locator(".binaural-player")).toHaveAttribute("data-state", "idle");
  await expect(
    page.getByRole("button", { name: "Favorite this preset", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Clear saved settings and reset", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("healingmuse-binaural-preferences-v1")))
    .toBeNull();
});

test("licensed background uses one fresh grant, mixes independently and yields to ordinary playback", async ({
  page,
}) => {
  const recordings: Track[] = JSON.parse(await readFile("media/prepared/catalog.json", "utf8"));
  const track = recordings.find(
    (item) => item.category === "instrumental" && item.source.kind === "hosted",
  )!;
  if (track.source.kind !== "hosted") throw new Error("missing_hosted_fixture");
  const audio = await readFile(`media/prepared/${track.source.path}`);
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
  await page.addInitScript(() => {
    const original = AudioContext.prototype.createMediaElementSource;
    const media: HTMLMediaElement[] = [];
    Object.defineProperty(window, "binauralTestMedia", { value: media });
    AudioContext.prototype.createMediaElementSource = function (element) {
      media.push(element);
      return original.call(this, element);
    };
  });
  const musicState = () =>
    page.evaluate(() =>
      (window as unknown as { binauralTestMedia: HTMLMediaElement[] }).binauralTestMedia.map(
        (item) => !item.paused,
      ),
    );
  await openBinaural(page);
  expect(grants).toBe(0);
  await page.locator(".binaural-background").scrollIntoViewIfNeeded();
  await page.locator(".binaural-background .card-play").first().click();
  await expect(page.getByRole("button", { name: "Start session", exact: true })).toBeEnabled();
  expect(grants).toBe(1);
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await expect.poll(musicState).toEqual([true]);
  await page.locator("#binaural-backgroundVolume").fill("10");
  await page.locator("#binaural-toneVolume").fill("30");
  await expect(page.locator("#binaural-masterVolume")).toHaveValue("60");
  await page.getByRole("button", { name: "Pause session", exact: true }).click();
  await expect.poll(musicState).toEqual([false]);
  fail = true;
  // A retry requires a new grant and leaves controls available after a quota-like failure.
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.getByRole("button", { name: "Tones only", exact: true }).click();
  await page.locator(".binaural-background .card-play").first().click();
  await expect(
    page.getByRole("button", { name: "Prepare music again", exact: true }),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Prepare music again", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume session", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Resume session", exact: true }).click();
  await expect.poll(musicState).toEqual([true]);
  await page.locator('.side-nav a[href="/en/explore"]').click();
  await expect.poll(musicState).toEqual([false]);
  await page.locator(".card-play").first().click();
  await expect
    .poll(() => page.locator("audio").evaluate((element: HTMLAudioElement) => !element.paused))
    .toBe(true);
  await page.locator('.side-nav a[href="/en/brainwave-entrainment"]').click();
  await page.getByRole("button", { name: "Resume session", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((element: HTMLAudioElement) => element.paused))
    .toBe(true);
  await expect.poll(musicState).toEqual([true]);
});

test("audio-clock deadline completes a one-minute session without a UI countdown dependency", async ({
  page,
}) => {
  test.setTimeout(90000);
  await openBinaural(page);
  await page.locator("#binaural-duration").selectOption("custom");
  await page.locator("#binaural-custom-duration").fill("1");
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await expect(page.locator(".binaural-player")).toHaveAttribute("data-state", "playing");
  await expect(page.locator(".binaural-player")).toHaveAttribute("data-state", "completed", {
    timeout: 65000,
  });
  await expect(page.getByRole("progressbar", { name: "Session progress" })).toHaveAttribute(
    "value",
    "60",
  );
  await expect(page.getByRole("button", { name: "Start session", exact: true })).toBeEnabled();
});

test("unavailable Web Audio offers ordinary music as an alternative", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", { value: undefined });
  });
  await openBinaural(page);
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await expect(page.locator(".binaural-player")).toHaveAttribute("data-state", "unsupported");
  await expect(
    page.getByRole("link", { name: "Browse ordinary music", exact: true }),
  ).toBeVisible();
});

test("a failed engine download announces recovery and retries without autoplay", async ({
  page,
}) => {
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
  await page.goto("/en/brainwave-entrainment");
  await expect(page.locator(".binaural-player").getByRole("alert")).toContainText(
    "The listening controls could not load",
  );
  fail = false;
  await page.getByRole("button", { name: "Load listening controls again", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start session", exact: true })).toBeEnabled();
  await expect(page.locator(".binaural-player")).toHaveAttribute("data-state", "idle");
  expect(errors).toEqual([]);
});

test("a CORS-blocked private background leaves tones and retry controls available", async ({
  page,
}) => {
  const recordings: Track[] = JSON.parse(await readFile("media/prepared/catalog.json", "utf8"));
  const track = recordings.find(
    (item) => item.category === "instrumental" && item.source.kind === "hosted",
  )!;
  if (track.source.kind !== "hosted") throw new Error("missing_hosted_fixture");
  const audio = await readFile(`media/prepared/${track.source.path}`);
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
  await openBinaural(page);
  await page.locator(".binaural-background").scrollIntoViewIfNeeded();
  await page.locator(".binaural-background .card-play").first().click();
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Prepare music again", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".binaural-player")).toHaveAttribute("data-state", "playing");
  await page.getByRole("button", { name: "Continue with tones only", exact: true }).click();
  await page.getByRole("button", { name: "Resume session", exact: true }).click();
  await expect(page.locator(".binaural-player")).toHaveAttribute("data-state", "playing");
});

test("previously downloaded instrumental mixes offline without requesting a grant", async ({
  page,
  context,
}) => {
  const recordings: Track[] = JSON.parse(await readFile("media/prepared/catalog.json", "utf8"));
  const track = recordings.find(
    (item) => item.category === "instrumental" && item.source.kind === "hosted",
  )!;
  if (track.source.kind !== "hosted") throw new Error("missing_hosted_fixture");
  const audio = await readFile(`media/prepared/${track.source.path}`);
  await page.route("**/offline-binaural-fixture.mp3", (route) =>
    route.fulfill({ contentType: "audio/mpeg", body: audio }),
  );
  let grants = 0;
  await page.route("**/api/grants/*", (route) => {
    grants++;
    return route.abort();
  });
  await openBinaural(page);
  await page.evaluate(async (track) => {
    const blob = await (await fetch("/offline-binaural-fixture.mp3")).blob();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("healingmuse-downloads", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("recordings", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("recordings", "readwrite");
      tx.objectStore("recordings").put({
        id: track.id,
        track,
        blob,
        bytes: blob.size,
        downloadedAt: new Date().toISOString(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, track);
  await page.reload();
  await expect(page.getByRole("button", { name: "Start session", exact: true })).toBeEnabled();
  await expect(page.locator(".binaural-player")).toHaveCount(1);
  await context.setOffline(true);
  await page.locator(".binaural-background").scrollIntoViewIfNeeded();
  const catalogue = page.locator(".binaural-background");
  await expect(catalogue.locator(".track-card")).toHaveCount(1);
  await catalogue
    .getByRole("searchbox", { name: "Search recordings", exact: true })
    .fill("no matching local recording");
  await catalogue.getByRole("searchbox", { name: "Search recordings", exact: true }).press("Enter");
  await expect(
    catalogue.getByRole("heading", { name: "No recordings found", exact: true }),
  ).toBeVisible();
  await catalogue
    .locator(".filter-row")
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(catalogue.locator(".track-card")).toHaveCount(1);
  await page.locator(".binaural-background .card-play").first().click();
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await expect(page.locator(".binaural-player")).toHaveAttribute("data-state", "playing");
  await expect(page.getByRole("button", { name: "Prepare music again", exact: true })).toHaveCount(
    0,
  );
  expect(grants).toBe(0);
  await page.getByRole("button", { name: "Stop session", exact: true }).click();
  await context.setOffline(false);
});
