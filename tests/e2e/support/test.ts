import { test as base, expect, type Browser, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Track } from "@/lib/types";
import {
  chunkRoute,
  marks,
  motionTargets,
  personalDataPath,
  playbackGrantPath,
  player,
  shell,
  storage,
} from "./contracts";

export { expect };

export type Theme = "day" | "night";
export type GardenDetail = "auto" | "still";
/** Stored appearance preferences, or Calm mode on its own over whatever else is stored. */
export type AppearanceOptions =
  | { theme: Theme; garden: GardenDetail; calm?: boolean }
  | { theme?: undefined; garden?: undefined; calm: true };

/**
 * Stores appearance preferences before every document of this page loads, exactly as the
 * appearance dialog persists them.
 */
export async function setAppearance(page: Page, options: AppearanceOptions) {
  if (options.theme !== undefined)
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: storage.appearance,
      value: JSON.stringify({ appearance: options.theme, garden: options.garden }),
    });
  if (options.calm)
    await page.addInitScript((key) => localStorage.setItem(key, "true"), storage.calm);
}

/** Stores Calm mode in the current document now; it applies from the next load. */
export async function storeCalm(page: Page) {
  await page.evaluate((key) => localStorage.setItem(key, "true"), storage.calm);
}

/** GPU renderers that are software rasterizers: Chromium's SwiftShader, Mesa's and Windows WARP. */
const softwareRenderer = /swiftshader|llvmpipe|lavapipe|softpipe|swrast|microsoft basic render/i;
/** The two GPU features that move page drawing onto the GPU process. */
const pageDrawingFeatures = ["gpu_compositing", "rasterization"];

/**
 * Fails when the browser composites or rasterizes pages on a software rasterizer posing as a GPU,
 * such as SwiftShader or llvmpipe. With page drawing there, the deferred teardown of the previous
 * document's compositor, a second after every navigation, waits synchronously on the GPU process:
 * it took 6 to 8 s on 2 cores (0.1 ms in software compositing) and froze pages for up to 11 s on a
 * loaded CI runner, with the scene and every check waiting behind it. Headless Chromium composites
 * pages in software and keeps SwiftShader for WebGL alone, which is all the scenes need; a launch
 * flag such as --use-angle=swiftshader moves page drawing onto it. A real GPU passes, because its
 * renderer is not a software one, and so does a headed run that falls back to software compositing.
 */
async function expectNoEmulatedCompositing(browser: Browser) {
  const session = await browser.newBrowserCDPSession();
  try {
    const { gpu } = await session.send("SystemInfo.getInfo");
    const status = gpu.featureStatus ?? {};
    // A renamed feature would otherwise make this check pass without looking at anything.
    expect(Object.keys(status), "Chromium's GPU feature names").toEqual(
      expect.arrayContaining(pageDrawingFeatures),
    );
    const renderer = gpu.auxAttributes?.glRenderer ?? "";
    const accelerated = pageDrawingFeatures.filter((feature) =>
      status[feature].startsWith("enabled"),
    );
    expect(
      softwareRenderer.test(renderer) ? accelerated : [],
      `page drawing accelerated on a software rasterizer (${renderer})`,
    ).toEqual([]);
  } finally {
    await session.detach();
  }
}

export const test = base.extend<
  {
    /** Stores appearance preferences with an init script; call it before navigating. */
    appearance: (options: AppearanceOptions) => Promise<void>;
  },
  {
    /** Checks once per worker that its browser draws pages in software or on a real GPU. */
    compositing: void;
  }
>({
  appearance: async ({ page }, use) => {
    await use((options) => setAppearance(page, options));
  },
  compositing: [
    async ({ browser }, use) => {
      await expectNoEmulatedCompositing(browser);
      await use();
    },
    { scope: "worker", auto: true },
  ],
});

/** The WCAG tags every accessibility scan enforces. */
export const wcagTags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] as const;

export interface AxeOptions {
  /** Run axe's complete default rule set, best-practice rules included, instead of the WCAG tags. */
  allRules?: boolean;
  /** Run only these rule ids. */
  only?: string[];
  /** Opt in to rules outside the WCAG tags on top of them. No scan enables extra rules yet. */
  extraRules?: string[];
}

/** An axe scan of the page or of one scope within it, limited to the WCAG tags by default. */
export function axe(page: Page, scope?: string, options: AxeOptions = {}): AxeBuilder {
  let builder = new AxeBuilder({ page });
  if (scope) builder = builder.include(scope);
  if (options.only) return builder.withRules(options.only);
  if (options.allRules) return builder;
  if (options.extraRules?.length)
    return builder.options({
      runOnly: { type: "tag", values: [...wcagTags] },
      rules: Object.fromEntries(options.extraRules.map((rule) => [rule, { enabled: true }])),
    });
  return builder.withTags([...wcagTags]);
}

export async function expectAccessible(page: Page, scope?: string, options?: AxeOptions) {
  await test.step(
    `axe finds no violations${scope ? ` in ${scope}` : ""}`,
    async () => {
      // Contrast is a property of the settled page, not of a frame inside an entrance.
      await expectMotionSettled(page);
      expect((await axe(page, scope, options).analyze()).violations).toEqual([]);
    },
    { box: true },
  );
}

/** No horizontal page scroll; a failure names the first elements that reach past the viewport. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    (every) =>
      document.documentElement.scrollWidth <= innerWidth
        ? []
        : [...document.querySelectorAll(every)]
            .filter((element) => element.getBoundingClientRect().right > innerWidth + 0.5)
            .slice(0, 6)
            .map(
              (element) => `${element.tagName.toLowerCase()}.${[...element.classList].join(".")}`,
            ),
    shell.everyElement,
  );
  expect(overflow, "elements reaching past the viewport").toEqual([]);
}

/** An element's content box (its border box less borders and padding), in viewport pixels. */
export function contentBox(locator: Locator) {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
    const right = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
    return { left, right };
  });
}

/** The width of the rule drawn beneath each element `locator` matches. */
export function rulesBeneath(locator: Locator) {
  return locator.evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).borderBottomWidth),
  );
}

/** Whether the document is taller than the viewport, so the page scrolls. */
export function pageScrolls(page: Page) {
  return page.evaluate(() => document.documentElement.scrollHeight > innerHeight);
}

/** Whether a person can see the element (rendered, CSS-visible, no fully transparent ancestor). */
function seen(locator: Locator) {
  return locator.evaluate((element) =>
    element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
  );
}

/**
 * A person can see the element: it is rendered, not hidden by CSS and neither it nor an ancestor
 * is fully transparent. Playwright's visibility ignores opacity; the timed gate does not.
 */
export async function expectSeen(locator: Locator) {
  await test.step(
    `${locator} can be seen`,
    async () => {
      await expect
        .poll(() => seen(locator), {
          message: "rendered, not hidden by CSS and not fully transparent",
        })
        .toBe(true);
    },
    { box: true },
  );
}

/** The element is present but a person cannot see it (for example, transparent until hover). */
export async function expectUnseen(locator: Locator) {
  await test.step(
    `${locator} cannot be seen`,
    async () => {
      await expect(locator).toBeAttached();
      await expect
        .poll(() => seen(locator), { message: "hidden by CSS or fully transparent" })
        .toBe(false);
    },
    { box: true },
  );
}

/**
 * A tap on the centre of `at` reaches `target`: nothing painted above it takes the tap. Covers
 * overlap, which neither Playwright's visibility nor checkVisibility() detects.
 */
export async function expectTapLandsOn(at: Locator, target: Locator) {
  await test.step(
    `a tap on ${at} reaches ${target}`,
    async () => {
      // Centred, so the fixed top bar and bottom navigation are not the topmost element there.
      await at.evaluate((element) =>
        element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }),
      );
      const box = (await at.boundingBox())!;
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await expect
        .poll(
          () =>
            target.evaluate(
              (element, { x, y }) => element.contains(document.elementFromPoint(x, y)),
              point,
            ),
          { message: "the topmost element at that point is the target or inside it" },
        )
        .toBe(true);
    },
    { box: true },
  );
}

/** The single native media element owned by the persistent player. Strict: it must be unique. */
export function audioElement(page: Page): Locator {
  return page.locator(player.audio);
}

/** Waits for the player to play, optionally past a position in seconds. */
export async function expectPlaying(page: Page, options: { beyond?: number } = {}) {
  await test.step(
    options.beyond === undefined ? "audio plays" : `audio plays beyond ${options.beyond}s`,
    async () => {
      await expect
        .poll(() =>
          audioElement(page).evaluate(
            (audio: HTMLAudioElement, beyond) =>
              !audio.paused && (beyond === null || audio.currentTime > beyond),
            options.beyond ?? null,
          ),
        )
        .toBe(true);
    },
    { box: true },
  );
}

/**
 * Marks the player's media element. A full page load replaces the document, and this element
 * with it, so `expectSameListeningSession` proves a navigation stayed on the client.
 */
export async function markListeningSession(page: Page, mark: string) {
  await audioElement(page).evaluate(
    (audio: HTMLAudioElement, mark) => (audio.dataset.session = mark),
    mark,
  );
}

/** The marked media element still exists and keeps playing. */
export async function expectSameListeningSession(page: Page, mark: string) {
  await test.step(
    `listening session "${mark}" continues`,
    async () => {
      const session = page.locator(player.markedAudio(mark));
      await expect(session).toHaveCount(1);
      await expect
        .poll(() => session.evaluate((audio: HTMLAudioElement) => !audio.paused))
        .toBe(true);
    },
    { box: true },
  );
}

/**
 * Counts the page's own personal-data reads (GET /api/me) from its first script, so no request
 * can be missed or counted late. Call before navigating; read the count with `personalReads`.
 */
export async function countPersonalReads(page: Page) {
  await page.addInitScript((path) => {
    const original = window.fetch.bind(window);
    const counted = window as Window & { __personalReads?: number };
    counted.__personalReads = 0;
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (new URL(url, location.href).pathname === path && (init?.method ?? "GET") === "GET")
        counted.__personalReads!++;
      return original(input, init);
    };
  }, personalDataPath);
}

/** Personal-data reads started so far, after letting already scheduled account work begin. */
export function personalReads(page: Page): Promise<number> {
  return page.evaluate(async () => {
    // Account work is scheduled in microtasks; a task boundary lets every pending read start.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return (window as Window & { __personalReads?: number }).__personalReads ?? 0;
  });
}

/**
 * Collects the playback grant requests the page starts from now on, failed ones included.
 * Streamed playback needs a grant; a downloaded recording plays from its stored copy.
 */
export function playbackGrantRequests(page: Page): string[] {
  const requested: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith(playbackGrantPath))
      requested.push(request.url());
  });
  return requested;
}

/** A request held by `holdRequests` until the test releases it. */
export type HeldRequests = {
  /** Resolves when the first held request arrives. */
  reached: Promise<void>;
  /** Lets every held request continue. */
  release: () => void;
};

/**
 * Holds requests matching `url` (after letting the first `pass` through) until `release` runs.
 * A request the page cancelled meanwhile is dropped quietly.
 */
export async function holdRequests(
  page: Page,
  url: string,
  { pass = 0 }: { pass?: number } = {},
): Promise<HeldRequests> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let arrive!: () => void;
  const reached = new Promise<void>((resolve) => (arrive = resolve));
  let seen = 0;
  await page.route(url, async (route) => {
    if (seen++ < pass) return route.continue();
    arrive();
    await released;
    await route.continue().catch(() => {});
  });
  return { reached, release };
}

/**
 * Holds the script chunk whose source contains `marker` (see src/lib/garden/budget-markers.ts)
 * until `release` runs; every other chunk passes untouched.
 */
export async function holdChunk(page: Page, marker: string): Promise<HeldRequests> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let arrive!: () => void;
  const reached = new Promise<void>((resolve) => (arrive = resolve));
  await page.route(chunkRoute, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes(marker)) {
      arrive();
      await released;
    }
    await route.fulfill({ response, body }).catch(() => {});
  });
  return { reached, release };
}

/**
 * Counts the script chunks whose source contains `marker` (see src/lib/garden/budget-markers.ts)
 * that the page requests from now on; every chunk passes untouched.
 */
export async function watchChunk(page: Page, marker: string): Promise<{ requests(): number }> {
  let requests = 0;
  await page.route(chunkRoute, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes(marker)) requests++;
    await route.fulfill({ response, body }).catch(() => {});
  });
  return { requests: () => requests };
}

/** How many responses for `path` the page has received so far (resource timing entries). */
export function responsesReceived(page: Page, path: string): Promise<number> {
  return page.evaluate(
    (path) =>
      performance
        .getEntriesByType("resource")
        .filter((entry) => new URL(entry.name).pathname === path).length,
    path,
  );
}

/**
 * Waits until the page has received more than `before` responses for `path`, then lets the work
 * those responses trigger run to completion (a few task turns, not wall-clock time), so a test
 * can assert that a late response changed nothing.
 */
export async function expectResponseHandled(page: Page, path: string, before: number) {
  await test.step(
    `response for ${path} handled`,
    async () => {
      await expect.poll(() => responsesReceived(page, path)).toBeGreaterThan(before);
      await page.evaluate(async () => {
        for (let turn = 0; turn < 3; turn++) await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
    { box: true },
  );
}

export async function expectPaused(page: Page) {
  await test.step(
    "audio is paused",
    async () => {
      await expect
        .poll(() => audioElement(page).evaluate((audio: HTMLAudioElement) => audio.paused))
        .toBe(true);
    },
    { box: true },
  );
}

export function currentTime(page: Page): Promise<number> {
  return audioElement(page).evaluate((audio: HTMLAudioElement) => audio.currentTime);
}

export function isPaused(page: Page): Promise<boolean> {
  return audioElement(page).evaluate((audio: HTMLAudioElement) => audio.paused);
}

export function audioSource(page: Page): Promise<string | null> {
  return audioElement(page).getAttribute("src");
}

/**
 * Resolves once a reference audio clock, separate from any session context, has advanced by
 * `seconds`. The clock is an inaudible scheduled source, so the wait follows audio time, not
 * timers. Pages that replace AudioContext for instrumentation can expose the native constructor
 * as `window.nativeAudioContext` so the reference clock is not counted as a session context.
 */
export async function waitForAudioClock(page: Page, seconds: number) {
  await page.evaluate(async (seconds) => {
    const Native =
      (window as typeof window & { nativeAudioContext?: typeof AudioContext }).nativeAudioContext ??
      AudioContext;
    const clock = new Native();
    try {
      await clock.resume();
      const silence = clock.createGain();
      silence.gain.value = 0;
      silence.connect(clock.destination);
      const source = clock.createConstantSource();
      source.connect(silence);
      const ended = new Promise((resolve) => (source.onended = resolve));
      source.start();
      source.stop(clock.currentTime + seconds);
      await ended;
    } finally {
      await clock.close();
    }
  }, seconds);
}

/**
 * Waits until no finite CSS animation or transition is running and no motion target carries an
 * inline transform or opacity left by the GSAP garden motion. Infinite decorative loops are
 * ignored because they never settle by design.
 */
export async function expectMotionSettled(page: Page, targets?: Locator) {
  const moving = targets ?? page.getByRole("main").locator(motionTargets);
  await test.step(
    "motion settles",
    async () => {
      await expect
        .poll(async () => ({
          running: await page.evaluate(() =>
            document
              .getAnimations()
              .filter(
                (animation) =>
                  animation.playState === "running" &&
                  animation.effect?.getComputedTiming().endTime !== Infinity,
              )
              .map((animation) =>
                animation instanceof CSSAnimation
                  ? animation.animationName
                  : animation instanceof CSSTransition
                    ? animation.transitionProperty
                    : animation.id || "animation",
              ),
          ),
          styled: await moving.evaluateAll(
            (elements) =>
              elements.filter(
                (element) =>
                  element instanceof HTMLElement &&
                  (element.style.transform !== "" || element.style.opacity !== ""),
              ).length,
          ),
        }))
        .toEqual({ running: [], styled: 0 });
    },
    { box: true },
  );
}

export async function serviceWorkerReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

export async function registerServiceWorker(page: Page, script: string) {
  await page.evaluate(async (script) => {
    await navigator.serviceWorker.register(script);
    await navigator.serviceWorker.ready;
  }, script);
}

/** Counts recordings in the downloads database. */
export function countDownloads(page: Page): Promise<number> {
  return page.evaluate(async ({ name, version, store }) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open(name, version);
      request.onsuccess = () => resolve(request.result);
    });
    const n = await new Promise<number>((resolve) => {
      const request = db.transaction(store).objectStore(store).count();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return n;
  }, storage.downloads);
}

/** Stores a recording in the downloads database as a completed download of `audioUrl`. */
export async function seedDownload(page: Page, track: Track, audioUrl: string) {
  await page.evaluate(
    async ({ track, audioUrl, database }) => {
      const blob = await (await fetch(audioUrl)).blob();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(database.name, database.version);
        request.onupgradeneeded = () =>
          request.result.createObjectStore(database.store, { keyPath: "id" });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(database.store, "readwrite");
        tx.objectStore(database.store).put({
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
    },
    { track, audioUrl, database: storage.downloads },
  );
}

/** Waits until the page has recorded the performance mark `name`. */
async function expectMark(page: Page, name: string, description: string) {
  await test.step(
    description,
    async () => {
      await expect
        .poll(() =>
          page.evaluate((name) => performance.getEntriesByName(name, "mark").length > 0, name),
        )
        .toBe(true);
    },
    { box: true },
  );
}

/** Waits until the route's primary control has hydrated, so keyboard input reaches React. */
export async function expectPrimaryReady(page: Page) {
  await expectMark(page, marks.primaryReady, "primary control is hydrated");
}

/** Waits until the Shell has preloaded the on-demand dialog code (it does so while idle). */
export async function expectOnDemandReady(page: Page) {
  await expectMark(page, marks.onDemandReady, "on-demand dialog code is preloaded");
}

/**
 * Makes every script chunk whose source contains `marker` fail to download, as it would offline,
 * until `unblock` runs. Other scripts load normally.
 */
export async function blockScriptsContaining(page: Page, marker: string) {
  let blocked = true;
  await page.route(chunkRoute, async (route) => {
    if (!blocked) return route.fallback();
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes(marker)) return route.abort("internetdisconnected");
    return route.fulfill({ response, body });
  });
  return {
    unblock() {
      blocked = false;
    },
  };
}
