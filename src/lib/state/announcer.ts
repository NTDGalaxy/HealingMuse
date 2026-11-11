import { createStore, type ReadableStore } from "./create-store";

export const noticeDuration = 6000;

/**
 * One polite notice at a time for the live region, which clears itself. `toast` carries the
 * same notice while it is also shown on screen; a spoken-only notice leaves it empty.
 */
export type Announcer = ReadableStore<string> & {
  toast: ReadableStore<string>;
  announce(message: string, options?: { visual?: boolean }): void;
  dispose(): void;
};

export function createAnnouncer(duration = noticeDuration): Announcer {
  const store = createStore("");
  const toast = createStore("");
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    getSnapshot: store.getSnapshot,
    getServerSnapshot: store.getServerSnapshot,
    subscribe: store.subscribe,
    toast: {
      getSnapshot: toast.getSnapshot,
      getServerSnapshot: toast.getServerSnapshot,
      subscribe: toast.subscribe,
    },
    announce(message, { visual = true } = {}) {
      // Repeating the current notice neither re-announces it nor extends it.
      if (message === store.getSnapshot()) return;
      clearTimeout(timer);
      store.set(message);
      toast.set(visual ? message : "");
      if (message)
        timer = setTimeout(() => {
          store.set("");
          toast.set("");
        }, duration);
    },
    dispose() {
      clearTimeout(timer);
    },
  };
}
