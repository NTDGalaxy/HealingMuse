import { expect, type Page } from "@playwright/test";
import { card, garden, player, shell } from "./contracts";

// In-page probes for the garden motion. Selectors are passed in as arguments so the probes
// follow contracts.ts like every other lookup.

type Probes = typeof window & {
  originalAudio?: HTMLAudioElement;
  arrivals?: string[];
  cardMoves?: string[];
  firstSound?: number;
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
      state.arrivals = [];
      new MutationObserver((records) => {
        for (const record of records) {
          const target = record.target as HTMLElement;
          if (
            target.matches(trackCard) &&
            target.style.opacity &&
            Number(target.style.opacity) < 0.99
          )
            state.arrivals!.push(target.className);
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
  await page.evaluate(() => ((window as Probes).arrivals = []));
}

/** Whether a recording card arrived since the last reset. */
export function cardArrived(page: Page) {
  return page.evaluate(
    (className) => (window as Probes).arrivals!.some((value) => value.includes(className)),
    card.className,
  );
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

/** Waits until the GSAP garden layer has run its first pass, so later reveals can be observed. */
export async function expectMotionStarted(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        (mark) => performance.getEntriesByName(mark, "mark").length,
        garden.motionStartMark,
      ),
    )
    .toBeGreaterThan(0);
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

/** Whether the garden scene started at or after the sound recorded by `watchFirstSound`. */
export function sceneStartedAfterFirstSound(page: Page) {
  return page.evaluate((mark) => {
    const start = performance.getEntriesByName(mark, "mark")[0]?.startTime;
    const sound = (window as Probes).firstSound;
    return start !== undefined && sound !== undefined && start >= sound;
  }, garden.sceneStartMark);
}
