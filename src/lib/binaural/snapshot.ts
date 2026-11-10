import type { ReadableStore } from "@/lib/state/create-store";
import { defaultConfig } from "./config";
import type { BinauralEngine, BinauralSnapshot } from "./engine";

// The binaural engine loads on demand, but components subscribe from their first render. The
// relay is a stable store that reports the idle snapshot until the engine attaches, then
// forwards the engine's snapshots. Components select the slice they show (useStore with a
// selector), so the 500 ms progress ticks re-render only the progress, not the whole page.
// Type-only engine imports keep this module, and startup, free of the engine itself.

export const idleSnapshot: BinauralSnapshot = {
  status: "idle",
  config: defaultConfig,
  elapsedSeconds: 0,
  remainingSeconds: defaultConfig.durationSeconds,
  backgroundError: false,
};

type SnapshotSource = Pick<BinauralEngine, "subscribe" | "getSnapshot">;

export type SnapshotRelay = ReadableStore<BinauralSnapshot> & {
  getServerSnapshot(): BinauralSnapshot;
  /** Starts forwarding `source`, or the idle snapshot again with null. */
  attach(source: SnapshotSource | null): void;
};

export function createSnapshotRelay(): SnapshotRelay {
  let source: SnapshotSource | null = null;
  let stop = () => {};
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    getSnapshot: () => source?.getSnapshot() ?? idleSnapshot,
    getServerSnapshot: () => idleSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    attach(next) {
      if (next === source) return;
      stop();
      source = next;
      stop = next ? next.subscribe(notify) : () => {};
      notify();
    },
  };
}
