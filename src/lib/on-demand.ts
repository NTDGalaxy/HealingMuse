import { useEffect, useEffectEvent } from "react";
import { createStore, useStore, type ReadableStore } from "./state/create-store";

// Interface code that downloads on first use (dialogs, the sign-in dialog, the content studio).
// Like the garden runtime and GSAP layer (src/components/scenery.tsx), it is a plain dynamic
// import whose failure never reaches React, where it would replace the whole application. Unlike
// decoration, which just keeps its poster, these surfaces were asked for, so the status is shared
// for an inline state and the next attempt imports again: React.lazy and next/dynamic would keep
// the rejected import forever.
// One instance per module, at module level: it tracks a JavaScript module the page has or has
// not downloaded, which is the same for every component and never runs on the server.

export type OnDemandStatus<T> =
  Readonly<{ state: "idle" | "loading" | "failed" }> | Readonly<{ state: "loaded"; value: T }>;

export type OnDemand<T> = ReadableStore<OnDemandStatus<T>> & {
  /**
   * Imports the module once it is needed, or resolves at once when it already arrived. A call
   * after a failure imports again; concurrent calls share one attempt.
   */
  load(): Promise<T>;
};

export function onDemand<T>(load: () => Promise<T>): OnDemand<T> {
  const store = createStore<OnDemandStatus<T>>({ state: "idle" });
  let pending: Promise<T> | null = null;
  return {
    getSnapshot: store.getSnapshot,
    getServerSnapshot: store.getServerSnapshot,
    subscribe: store.subscribe,
    load() {
      const current = store.getSnapshot();
      if (current.state === "loaded") return Promise.resolve(current.value);
      if (!pending) {
        store.set({ state: "loading" });
        pending = load().then(
          (value) => {
            pending = null;
            store.set({ state: "loaded", value });
            return value;
          },
          (error: unknown) => {
            pending = null;
            store.set({ state: "failed" });
            throw error;
          },
        );
      }
      return pending;
    },
  };
}

/**
 * The status of an on-demand module, loading it whenever `wanted` turns true. Every such turn
 * is a fresh attempt, so opening a surface again after a failed download retries it.
 * `onFailure` runs when an attempt started here fails while the component is mounted.
 */
export function useOnDemand<T>(
  module: OnDemand<T>,
  wanted: boolean,
  onFailure?: () => void,
): OnDemandStatus<T> {
  const status = useStore(module);
  const failed = useEffectEvent(() => onFailure?.());
  useEffect(() => {
    if (!wanted) return;
    let active = true;
    module.load().catch(() => {
      if (active) failed();
    });
    return () => {
      active = false;
    };
  }, [module, wanted]);
  return status;
}
