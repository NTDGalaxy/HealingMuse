// @ts-check
// State matrix and page preparation for the local visual-equivalence oracle. The pixel oracle
// (tests/e2e/visual/*.visual.ts) and the DOM plus computed-style oracle (scripts/visual/snapshot.mjs)
// both use these definitions, so they always look at exactly the same pages.
//
// Determinism: the garden is stored as "still" (poster, no WebGL), motion is reduced, the clock is
// fixed, the time zone and browser locale are pinned, service workers are blocked, every lazy list
// is scrolled into range and every image is decoded before anything is captured.
import { readFileSync } from "node:fs";
import { contracts } from "../perf/contracts.mjs";

/** @typedef {"vi" | "en"} Locale */
/** @typedef {"day" | "night"} Theme */
/** @typedef {"more" | "appearance" | "details" | "player" | "focus"} Action */
/**
 * @typedef {{
 *   id: string,
 *   kind: "app" | "fixture",
 *   path: string,
 *   locale: Locale,
 *   theme: Theme,
 *   viewport: { width: number, height: number },
 *   calm: boolean,
 *   reducedTransparency: boolean,
 *   action: Action | null,
 *   ready: "primary" | "shell" | null,
 *   view: string | null,
 *   screenshot: boolean,
 * }} VisualState
 */

/** Viewports of the pixel matrix (phone, tablet, desktop). */
export const viewports = {
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
};

/**
 * Extra viewports for the computed-style capture only, so that every media-query range in the
 * stylesheets is exercised: max-width 360, 901-1100 with max-height 850, 1101-1200 and 1600+.
 */
export const coverageViewports = {
  narrow: { width: 360, height: 740 },
  laptop: { width: 1000, height: 800 },
  compact: { width: 1180, height: 820 },
  wide: { width: 1680, height: 1050 },
};

export const fixedTime = "2026-11-09T09:00:00+07:00";
export const appearanceKey = "healingmuse-appearance-v1";
export const calmKey = "healingmuse-calm";

/** @type {Theme[]} */
const themes = ["day", "night"];
const englishRoutes = ["home", "explore", "binaural", "settings", "credits"];
const fixtureViews = ["library", "mood", "settings", "admin"];

/** @type {Record<Locale, any>} */
const messages = {
  vi: JSON.parse(readFileSync(new URL("../../src/messages/vi.json", import.meta.url), "utf8")),
  en: JSON.parse(readFileSync(new URL("../../src/messages/en.json", import.meta.url), "utf8")),
};

/**
 * @param {Partial<VisualState> & Pick<VisualState, "kind" | "path" | "locale" | "theme">} state
 * @param {string} viewportName
 * @param {{ width: number, height: number }} viewport
 * @param {string} name
 * @returns {VisualState}
 */
function define(state, viewportName, viewport, name) {
  const suffix = [
    state.calm && "calm",
    state.reducedTransparency && "opaque",
    state.action,
    state.screenshot === false && "styles",
  ].filter(Boolean);
  return {
    id: [state.kind, name, state.locale, state.theme, viewportName, ...suffix].join("-"),
    calm: false,
    reducedTransparency: false,
    action: null,
    ready: null,
    view: null,
    screenshot: true,
    ...state,
    viewport,
  };
}

/** @returns {VisualState[]} */
function appStates() {
  /** @type {VisualState[]} */
  const list = [];
  /**
   * @param {string} key
   * @param {Locale} locale
   * @param {Partial<VisualState>} extra
   * @param {Record<string, { width: number, height: number }>} sizes
   */
  const add = (key, locale, extra, sizes) => {
    const contract = contracts.find((entry) => entry.key === key);
    if (!contract) throw new Error(`Unknown route ${key}`);
    const path = contract.segment ? `/${locale}/${contract.segment}` : `/${locale}`;
    for (const theme of themes)
      for (const [name, viewport] of Object.entries(sizes))
        list.push(
          define(
            { kind: "app", path, locale, theme, ready: contract.kind, ...extra },
            name,
            viewport,
            key,
          ),
        );
  };
  const phoneAndTablet = { phone: viewports.phone, tablet: viewports.tablet };
  for (const { key } of contracts) {
    add(key, "vi", {}, viewports);
    if (englishRoutes.includes(key)) add(key, "en", {}, viewports);
    add(key, "vi", { screenshot: false }, coverageViewports);
  }
  add("home", "vi", { action: "more" }, phoneAndTablet);
  add("home", "vi", { action: "appearance" }, viewports);
  add("home", "vi", { action: "details" }, viewports);
  add("home", "vi", { action: "player" }, viewports);
  add("home", "vi", { action: "focus" }, viewports);
  add("home", "vi", { calm: true }, viewports);
  add("binaural", "vi", { calm: true }, viewports);
  add("home", "vi", { reducedTransparency: true }, viewports);
  add("home", "vi", { reducedTransparency: true, action: "more" }, { phone: viewports.phone });
  add("home", "vi", { reducedTransparency: true, action: "player" }, { phone: viewports.phone });
  add(
    "home",
    "vi",
    { reducedTransparency: true, action: "appearance" },
    {
      desktop: viewports.desktop,
    },
  );
  return list;
}

/** @returns {VisualState[]} */
function fixtureStates() {
  /** @type {VisualState[]} */
  const list = [];
  for (const view of fixtureViews)
    for (const locale of /** @type {Locale[]} */ (["vi", "en"]))
      for (const theme of themes) {
        const path = `tests/browser-fixtures/index.html?locale=${locale}`;
        for (const [name, viewport] of Object.entries(viewports))
          list.push(define({ kind: "fixture", path, locale, theme, view }, name, viewport, view));
        if (locale === "vi")
          for (const [name, viewport] of Object.entries(coverageViewports))
            list.push(
              define(
                { kind: "fixture", path, locale, theme, view, screenshot: false },
                name,
                viewport,
                view,
              ),
            );
      }
  return list;
}

/** Every state, pixel and computed-style. */
export const states = [...appStates(), ...fixtureStates()];
if (new Set(states.map((state) => state.id)).size !== states.length)
  throw new Error("Visual state ids must be unique.");

/**
 * Browser context options; identical for the pixel and computed-style oracles.
 * @param {VisualState} state
 * @returns {import("@playwright/test").BrowserContextOptions}
 */
export function contextOptions(state) {
  return {
    viewport: state.viewport,
    screen: state.viewport,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    reducedMotion: "reduce",
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "Asia/Ho_Chi_Minh",
    serviceWorkers: "block",
  };
}

const owner = "10000000-0000-4000-8000-000000000001";
const day = 24 * 60 * 60 * 1000;
const at = (/** @type {number} */ daysAgo, /** @type {number} */ minutes) =>
  new Date(Date.parse(fixedTime) - daysAgo * day + minutes * 60000).toISOString();
/** Signed-in administrator with a playlist and paired private check-ins on fixed dates. */
const personalData = (/** @type {Locale} */ locale) => ({
  profile: { id: owner, locale, calm_mode: false, mood_consent_at: at(6, 0) },
  favorites: ["00000000-0000-4000-8000-000000000001"],
  playlists: [
    {
      id: "20000000-0000-4000-8000-000000000001",
      title: "Evening",
      revision: 1,
      trackIds: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"],
    },
  ],
  checkins: [
    { id: "c1", session_id: "s1", phase: "before", score: 2, created_at: at(3, 0) },
    { id: "c2", session_id: "s1", phase: "after", score: 4, created_at: at(3, 20) },
    { id: "c3", session_id: "s2", phase: "before", score: 3, created_at: at(1, 0) },
    { id: "c4", session_id: "s2", phase: "after", score: 3, created_at: at(1, 25) },
  ],
  isAdmin: true,
});

/**
 * Prepares `page` (fresh, from a context made with contextOptions) in the given state.
 * @param {import("@playwright/test").Page} page
 * @param {VisualState} state
 * @param {{ app?: string, fixture?: string }} origins absolute origins ending without a path
 */
export async function prepare(page, state, origins) {
  const text = messages[state.locale];
  await page.addInitScript(
    ({ appearanceKey, calmKey, theme, calm, now }) => {
      // A fixed wall clock that leaves timers and the performance timeline alone (Playwright's
      // page.clock replaces performance.mark, which the readiness contract relies on).
      const RealDate = Date;
      globalThis.Date = new Proxy(RealDate, {
        construct: (target, args, newTarget) =>
          Reflect.construct(target, args.length ? args : [now], newTarget),
        apply: () => new RealDate(now).toString(),
        get: (target, property, receiver) =>
          property === "now" ? () => now : Reflect.get(target, property, receiver),
      });
      localStorage.setItem(appearanceKey, JSON.stringify({ appearance: theme, garden: "still" }));
      if (calm) localStorage.setItem(calmKey, "true");
    },
    {
      appearanceKey,
      calmKey,
      theme: state.theme,
      calm: state.calm,
      now: Date.parse(fixedTime),
    },
  );
  if (state.reducedTransparency) {
    // Playwright has no option for this feature; the CDP call replaces the whole emulated list.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-reduced-motion", value: "reduce" },
        { name: "prefers-reduced-transparency", value: "reduce" },
        { name: "prefers-color-scheme", value: "light" },
      ],
    });
  }
  if (state.kind === "fixture") {
    const data = personalData(state.locale);
    await page.route("**/api/me", (route) => route.fulfill({ json: data }));
    await page.route("**/api/admin/tracks*", (route) =>
      route.fulfill({ json: { items: [], total: 0, nextCursor: null } }),
    );
    await page.route("**/api/admin/collections", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/admin/releases", (route) => route.fulfill({ json: { items: [] } }));
    if (!origins.fixture) throw new Error("The fixture origin is required for fixture states.");
    await page.goto(new URL(state.path, origins.fixture).href);
    await page.locator(`html[data-theme="${state.theme}"]`).waitFor({ state: "attached" });
    await page.getByRole("button", { name: state.view ?? "", exact: true }).click();
  } else {
    if (!origins.app) throw new Error("The app origin is required for app states.");
    await page.goto(new URL(state.path, origins.app).href);
    await page.locator(`html[data-theme="${state.theme}"]`).waitFor({ state: "attached" });
    if (state.ready === "primary")
      await page.waitForFunction(() =>
        [...document.querySelectorAll("[data-primary][data-hydrated]")].some((element) =>
          element.checkVisibility(),
        ),
      );
    else
      await page.waitForFunction(
        () => performance.getEntriesByName("hm:shell-ready", "mark").length > 0,
      );
    await page.locator('.garden-canvas[data-state="still"]').waitFor({ state: "attached" });
  }
  await expectMedia(page, state);
  await settle(page, text.common.loading, true);
  if (state.action) {
    await act(page, state.action, text);
    await settle(page, text.common.loading, false);
  }
}

/** @param {import("@playwright/test").Page} page @param {VisualState} state */
async function expectMedia(page, state) {
  const media = await page.evaluate(() => ({
    motion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    transparency: matchMedia("(prefers-reduced-transparency: reduce)").matches,
    dark: matchMedia("(prefers-color-scheme: dark)").matches,
  }));
  if (!media.motion || media.dark || media.transparency !== state.reducedTransparency)
    throw new Error(`Unexpected emulated media for ${state.id}: ${JSON.stringify(media)}`);
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {Action} action
 * @param {any} text messages for the state's locale
 */
async function act(page, action, text) {
  if (action === "more") {
    await page
      .locator(".mobile-nav")
      .getByRole("button", { name: text.common.more, exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
  } else if (action === "appearance") {
    await page
      .getByRole("button", { name: text.appearance.title, exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await page.getByRole("dialog").waitFor();
  } else if (action === "details") {
    await page
      .locator(".track-card")
      .filter({ visible: true })
      .first()
      .getByRole("button", { name: `${text.catalog.details}: `, exact: false })
      .click();
    await page.getByRole("dialog").waitFor();
  } else if (action === "player") {
    await page.locator("[data-primary][data-hydrated]").filter({ visible: true }).first().click();
    const seek = page
      .locator(".player-bar")
      .getByRole("slider", { name: text.player.seek, exact: true });
    // Let the position move off zero so that seeking back to 0 is a real change React sees.
    await page.waitForFunction(() => {
      const audio = document.querySelector("audio");
      const slider = document.querySelector(".player-bar input[type=range]");
      return (
        audio !== null &&
        !audio.paused &&
        slider instanceof HTMLInputElement &&
        Number(slider.value) >= 1
      );
    });
    await page
      .locator(".player-bar")
      .getByRole("button", { name: text.player.pause, exact: true })
      .click();
    await seek.fill("0");
    await page.waitForFunction(() => {
      const audio = document.querySelector("audio");
      const slider = document.querySelector(".player-bar input[type=range]");
      return (
        audio !== null &&
        audio.paused &&
        audio.currentTime === 0 &&
        slider instanceof HTMLInputElement &&
        slider.value === "0"
      );
    });
    // Announcements show a toast for six seconds; capture the resting state after it leaves.
    await page.locator(".toast").waitFor({ state: "detached", timeout: 15000 });
  } else if (action === "focus") {
    for (let presses = 0; presses < 100; presses++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate(() => document.activeElement?.matches("[data-primary]"))) break;
    }
    const focused = await page.evaluate(
      () => document.activeElement?.matches("[data-primary]:focus-visible") ?? false,
    );
    if (!focused) throw new Error("Keyboard focus never reached the first play control.");
  }
}

/**
 * Waits until the page is complete and quiet: fonts loaded, lazy lists loaded, every image decoded,
 * no DOM mutation for 500 ms, then two animation frames.
 * @param {import("@playwright/test").Page} page
 * @param {string} loading the locale's loading text
 * @param {boolean} scroll scroll through the page first so lazy lists load, then return to the top
 */
export async function settle(page, loading, scroll) {
  await page.waitForLoadState("networkidle");
  const error = await page.evaluate(
    async ({ loading, scroll }) => {
      const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const quiet = () =>
        new Promise((resolve) => {
          let timer = setTimeout(done, 500);
          const limit = setTimeout(() => {
            observer.disconnect();
            clearTimeout(timer);
            resolve("The page kept changing for 20 s.");
          }, 20000);
          const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(done, 500);
          });
          observer.observe(document, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
          });
          function done() {
            observer.disconnect();
            clearTimeout(limit);
            resolve(null);
          }
        });
      const pending = () =>
        [...document.querySelectorAll("#main-content [role=status]")].some(
          (element) => element.textContent === loading && element.checkVisibility(),
        );
      await document.fonts.ready;
      if (scroll) {
        // Walk down in half-viewport steps so every IntersectionObserver-triggered list loads,
        // until the document stops growing.
        let height = -1;
        while (height !== document.documentElement.scrollHeight) {
          height = document.documentElement.scrollHeight;
          for (let top = 0; top <= height; top += Math.ceil(innerHeight / 2)) {
            window.scrollTo({ top, behavior: "instant" });
            await frame();
            await frame();
          }
          if (await quiet()) return "The page kept changing while lazy content loaded.";
        }
        for (let tries = 0; pending() && tries < 200; tries++)
          await new Promise((resolve) => setTimeout(resolve, 100));
        if (pending()) return "A loading status never resolved.";
        window.scrollTo({ top: 0, behavior: "instant" });
      }
      const images = [...document.images];
      const loadingValues = images.map((image) => image.getAttribute("loading"));
      for (const image of images) image.loading = "eager";
      await Promise.all(images.map((image) => image.decode().catch(() => null)));
      images.forEach((image, index) => {
        const value = loadingValues[index];
        if (value === null) image.removeAttribute("loading");
        else image.setAttribute("loading", value);
      });
      await document.fonts.ready;
      const unsettled = await quiet();
      await frame();
      await frame();
      return unsettled;
    },
    { loading, scroll },
  );
  if (error) throw new Error(error);
}

/** Pixel matrix and style-only states, filtered by an optional id pattern. */
export function select(/** @type {string | undefined} */ pattern) {
  if (!pattern) return states;
  const matcher = new RegExp(pattern);
  return states.filter((state) => matcher.test(state.id));
}
