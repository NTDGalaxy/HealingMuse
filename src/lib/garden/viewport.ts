// The full-screen scene's viewport, in CSS pixels.
import type { Viewport } from "./protocol";

export function readViewport(): Viewport {
  return { width: innerWidth, height: innerHeight };
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

/** Reports the viewport after resizes, at most once per frame. Returns the cleanup. */
export function watchViewport(
  onChange: (viewport: Viewport) => void,
  frames: FrameScheduler = animationFrames,
): () => void {
  const update = perFrame(() => onChange(readViewport()), frames);
  const schedule = () => update.schedule();
  addEventListener("resize", schedule);
  return () => {
    removeEventListener("resize", schedule);
    update.cancel();
  };
}
