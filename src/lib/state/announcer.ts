import { createStore, type ReadableStore } from "./create-store";

export const noticeDuration = 6000;

/** One polite notice at a time for the live region and toast; it clears itself. */
export type Announcer = ReadableStore<string> & {
  announce(message: string): void;
  dispose(): void;
};

export function createAnnouncer(duration = noticeDuration): Announcer {
  const store = createStore("");
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    getSnapshot: store.getSnapshot,
    getServerSnapshot: store.getServerSnapshot,
    subscribe: store.subscribe,
    announce(message) {
      // Repeating the visible notice neither re-announces it nor extends it.
      if (message === store.getSnapshot()) return;
      clearTimeout(timer);
      store.set(message);
      if (message) timer = setTimeout(() => store.set(""), duration);
    },
    dispose() {
      clearTimeout(timer);
    },
  };
}
