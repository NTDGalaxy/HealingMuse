// Audio-first startup. Decorative work (the garden scene and GSAP reveals) starts only after the
// route is usable and no requested playback is still starting, so it never competes with the
// first tap or the first sound. Playback owners report each start with beginPlaybackStart();
// decoration awaits decorationMayStart(). Both run only in the browser (effects and handlers),
// never during server rendering, so this module state never crosses requests.

import { readinessMarks } from "./readiness";

/**
 * Performance marks recorded when decoration starts, so the local timed harness and the
 * end-to-end suite can check that it followed the first sound.
 */
export const decorationMarks = {
  scene: "hm:scene-start",
  motion: "hm:motion-start",
} as const;

let starting = 0;
const settledListeners = new Set<() => void>();

/**
 * Reports that a playback request has begun. Call the returned function once that playback
 * plays, fails or is superseded; extra calls are ignored.
 */
export function beginPlaybackStart(): () => void {
  starting++;
  let settled = false;
  return () => {
    if (settled) return;
    settled = true;
    starting--;
    if (starting > 0) return;
    for (const listener of [...settledListeners]) listener();
  };
}

/** Whether a playback request is still starting. */
export function playbackStarting() {
  return starting > 0;
}

export type DecorationWait = {
  signal?: AbortSignal;
  /** Longest wait for each readiness mark (the shell's, then the primary control's). */
  readyWithin?: number;
  /** Longest wait for a starting playback, so a hanging grant only delays decoration. */
  audioWithin?: number;
};

/**
 * Resolves true when decoration may start: the route's primary control has hydrated (or the
 * shell has, on routes without one), then every playback that is starting has settled. Each wait
 * is bounded. Resolves false if the signal aborts first.
 */
export function decorationMayStart({
  signal,
  readyWithin = 2000,
  audioWithin = 6000,
}: DecorationWait = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const cleanups: (() => void)[] = [];
    let done = false;
    const finish = (value: boolean) => {
      if (done) return;
      done = true;
      for (const cleanup of cleanups) cleanup();
      resolve(value);
    };
    if (signal) {
      const abort = () => finish(false);
      signal.addEventListener("abort", abort, { once: true });
      cleanups.push(() => signal.removeEventListener("abort", abort));
    }
    /** Runs `next` once, when the mark exists or after `readyWithin`, whichever is first. */
    const afterMark = (name: string, next: () => void) => {
      if (done) return;
      if (marked(name)) return next();
      let waiting = true;
      const go = () => {
        if (!waiting || done) return;
        waiting = false;
        next();
      };
      cleanups.push(whenMarked(name, go));
      const timer = setTimeout(go, readyWithin);
      cleanups.push(() => clearTimeout(timer));
    };
    const afterAudio = () => {
      if (done) return;
      if (!playbackStarting()) return finish(true);
      const settled = () => {
        if (!playbackStarting()) finish(true);
      };
      settledListeners.add(settled);
      cleanups.push(() => settledListeners.delete(settled));
      const timer = setTimeout(() => finish(true), audioWithin);
      cleanups.push(() => clearTimeout(timer));
    };
    afterMark(readinessMarks.shell, () => {
      // Routes without a primary control (the read pages) are ready with the shell.
      if (!document.querySelector("[data-primary]")) return afterAudio();
      afterMark(readinessMarks.primary, afterAudio);
    });
  });
}

function marked(name: string) {
  return performance.getEntriesByName(name, "mark").length > 0;
}

/** Calls `then` once the mark is recorded and returns a cleanup. */
function whenMarked(name: string, then: () => void): () => void {
  // Without mark observation the caller's time bound decides.
  if (typeof PerformanceObserver === "undefined") return () => {};
  const observer = new PerformanceObserver((list) => {
    if (!list.getEntriesByName(name).length) return;
    observer.disconnect();
    then();
  });
  observer.observe({ type: "mark", buffered: true });
  return () => observer.disconnect();
}
