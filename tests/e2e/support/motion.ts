import { expect, type Page } from "@playwright/test";
import { decorationBounds } from "../../../src/lib/perf/audio-first";
import { card, garden, player, shell } from "./contracts";

// In-page probes for the garden motion. Selectors are passed in as arguments so the probes
// follow contracts.ts like every other lookup.

type Probes = typeof window & {
  originalAudio?: HTMLAudioElement;
  arrivals?: number;
  cardMoves?: string[];
  firstSound?: number;
  motionPasses?: number[];
};

/**
 * Remembers the current media element and records every card in the main region that is
 * restyled while still partly transparent, i.e. while it is arriving.
 */
export async function watchCardArrivals(page: Page) {
  await page.evaluate(
    ({ audio, main, trackCard }) => {
      const state = window as Probes;
      state.originalAudio = document.querySelector<HTMLAudioElement>(audio)!;
      state.arrivals = 0;
      new MutationObserver((records) => {
        for (const record of records) {
          const target = record.target as HTMLElement;
          if (
            target.matches(trackCard) &&
            target.style.opacity &&
            Number(target.style.opacity) < 0.99
          )
            state.arrivals!++;
        }
      }).observe(document.querySelector(main)!, {
        subtree: true,
        attributes: true,
        attributeFilter: ["style"],
      });
    },
    { audio: player.audio, main: shell.main, trackCard: card.root },
  );
}

/** Whether the media element remembered by `watchCardArrivals` is still the one playing. */
export function sameAudioStillPlaying(page: Page) {
  return page.evaluate((audio) => {
    const element = document.querySelector<HTMLAudioElement>(audio)!;
    return element === (window as Probes).originalAudio && !element.paused;
  }, player.audio);
}

export async function resetCardArrivals(page: Page) {
  await page.evaluate(() => ((window as Probes).arrivals = 0));
}

/** Whether a recording card arrived since the last reset. */
export function cardArrived(page: Page) {
  return page.evaluate(() => (window as Probes).arrivals! > 0);
}

/**
 * Records, from the first document onwards, every card moved vertically by more than a pixel,
 * labelled "first" for the featured listening target and "later" for every other card.
 */
export async function watchCardMoves(page: Page) {
  await page.addInitScript(
    ({ trackCard, featured }) => {
      const moves: string[] = [];
      (window as Probes).cardMoves = moves;
      new MutationObserver((records) => {
        for (const record of records) {
          const target = record.target as HTMLElement;
          if (!target.matches(trackCard) || !target.style.transform) continue;
          if (Math.abs(new DOMMatrixReadOnly(getComputedStyle(target).transform).m42) > 1)
            moves.push(target.closest(featured) ? "first" : "later");
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ["style"] });
    },
    { trackCard: card.root, featured: card.featured },
  );
}

export function cardMoved(page: Page, which: "first" | "later") {
  return page.evaluate((which) => (window as Probes).cardMoves!.includes(which), which);
}

/**
 * Waits until the GSAP garden layer has run a first pass (at or after the page-clock time `since`,
 * when given), so later reveals can be observed.
 */
export async function expectMotionStarted(page: Page, since = 0) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ mark, since }) =>
          performance.getEntriesByName(mark, "mark").some((entry) => entry.startTime >= since),
        { mark: garden.motionStartMark, since },
      ),
    )
    .toBe(true);
}

/** Waits until the GSAP layer's code has arrived and the layer has mounted. */
export async function expectMotionLoaded(page: Page) {
  await expectMark(page, garden.motionLoadedMark);
}

/**
 * Waits until the GSAP layer's code has failed to load for good: the chunk loader retries a
 * failed chunk once on its own, so a refused request alone does not mean the page gave up.
 */
export async function expectMotionUnavailable(page: Page) {
  await expectMark(page, garden.motionUnavailableMark);
}

async function expectMark(page: Page, mark: string) {
  await expect
    .poll(() =>
      page.evaluate((name) => performance.getEntriesByName(name, "mark").length > 0, mark),
    )
    .toBe(true);
}

/** Records, from the first document onwards, when the first media element starts playing. */
export async function watchFirstSound(page: Page) {
  await page.addInitScript(() =>
    document.addEventListener(
      "playing",
      () => ((window as Probes).firstSound ??= performance.now()),
      true,
    ),
  );
}

/**
 * Records, from the first document onwards, the page-clock time of every GSAP layer pass: each
 * pass starts by fading the scenery in, which writes an inline opacity onto it.
 */
export async function watchMotionPasses(page: Page) {
  await page.addInitScript((scenery) => {
    const passes: number[] = [];
    (window as Probes).motionPasses = passes;
    let fading = false;
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target as HTMLElement;
        if (!target.matches(scenery)) continue;
        const now = target.style.opacity !== "";
        if (now && !fading) passes.push(performance.now());
        fading = now;
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["style"] });
  }, shell.scenery);
}

/** Page-clock times of the GSAP layer passes recorded by `watchMotionPasses`. */
export function motionPassTimes(page: Page) {
  return page.evaluate(() => (window as Probes).motionPasses ?? []);
}

/**
 * Whether decoration that started at `start` waited for the first sound: it started after
 * `sound`, or only once decorationMayStart's whole audio wait had passed since `allowed` (when
 * decoration was allowed while a start was pending). All are page-clock times; a slow machine
 * only moves the start later, so the outcome never depends on machine speed.
 */
export function waitedForSound(
  start: number,
  { allowed, sound }: { allowed: number; sound: number },
) {
  return start >= sound || start - allowed >= decorationBounds.audioWithin;
}

/** The page's clock, the one performance marks use. */
export function pageTime(page: Page) {
  return page.evaluate(() => performance.now());
}

/**
 * Waits until the first media element has started playing, as recorded by `watchFirstSound`,
 * and returns that page-clock time. (A media element stops being paused as soon as play() is
 * called, before it has data, so expectPlaying alone does not mean it has sounded yet.)
 */
export async function firstSound(page: Page): Promise<number> {
  const read = () => page.evaluate(() => (window as Probes).firstSound ?? null);
  await expect.poll(read).not.toBeNull();
  return (await read())!;
}

/**
 * Whether the last decoration start recorded under `mark` (the scene's or the GSAP layer's) came
 * after `sound`, or only once decorationMayStart's whole audio wait had passed since `allowed`
 * (when decoration was allowed while a start was pending). Both are page-clock times. A slow
 * machine only moves the start later, so the outcome never depends on machine speed; starting
 * before the sound and before that wait is the bug.
 */
export function decorationWaitedForSound(
  page: Page,
  mark: string,
  times: { allowed: number; sound: number },
) {
  return page.evaluate(
    ({ mark, allowed, sound, wait }) => {
      const start = performance.getEntriesByName(mark, "mark").at(-1)?.startTime;
      return start !== undefined && (start >= sound || start - allowed >= wait);
    },
    { mark, ...times, wait: decorationBounds.audioWithin },
  );
}
