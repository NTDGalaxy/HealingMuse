// The full-screen scene's viewport: its CSS size and the device pixel ratio it is shown at.
import type { Viewport } from "./protocol";

export function readViewport(): Viewport {
  return { width: innerWidth, height: innerHeight, devicePixelRatio: devicePixelRatio || 1 };
}

export type FrameScheduler = {
  request(callback: () => void): number;
  cancel(handle: number): void;
};

const animationFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/** Runs `apply` once in the next frame however often `schedule` is called before then. */
export function perFrame(apply: () => void, frames: FrameScheduler = animationFrames) {
  let pending: number | null = null;
  return {
    schedule() {
      if (pending !== null) return;
      pending = frames.request(() => {
        pending = null;
        apply();
      });
    },
    cancel() {
      if (pending !== null) frames.cancel(pending);
      pending = null;
    },
  };
}

/**
 * Reports the viewport after resizes, zoom and moves to a screen of another pixel density, at
 * most once per frame. Returns the cleanup.
 */
export function watchViewport(
  onChange: (viewport: Viewport) => void,
  frames: FrameScheduler = animationFrames,
): () => void {
  const update = perFrame(() => onChange(readViewport()), frames);
  const schedule = () => update.schedule();
  // A resolution query matches only the current ratio, so it changes once whenever that does.
  let density: MediaQueryList | null = null;
  const followDensity = () => {
    density?.removeEventListener("change", densityChanged);
    density = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
    density.addEventListener("change", densityChanged);
  };
  function densityChanged() {
    followDensity();
    schedule();
  }
  followDensity();
  addEventListener("resize", schedule);
  return () => {
    removeEventListener("resize", schedule);
    density?.removeEventListener("change", densityChanged);
    update.cancel();
  };
}
