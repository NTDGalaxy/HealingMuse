import { useSyncExternalStore } from "react";

// The subscribe/getSnapshot pattern of src/lib/binaural/engine.ts, shared by the app stores.
// Stores are plain objects created once per provider instance, never module singletons: client
// modules also run during server rendering, where a singleton would leak between requests.

export interface ReadableStore<T> {
  getSnapshot(): T;
  /** The snapshot used for server rendering and hydration. Defaults to getSnapshot. */
  getServerSnapshot?(): T;
  subscribe(listener: () => void): () => void;
}

export interface Store<T> extends ReadableStore<T> {
  getServerSnapshot(): T;
  /** Replaces the state and notifies subscribers, unless the next state is the same value. */
  set(next: T | ((current: T) => T)): void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    // The initial state is what the server rendered, so hydration always matches it.
    getServerSnapshot: () => initial,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next) {
      const value = typeof next === "function" ? (next as (current: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      for (const listener of [...listeners]) listener();
    },
  };
}

const identity = <T>(value: T) => value;

/**
 * Subscribes a component to a store. A selector must return a primitive or a reference that is
 * already part of the state (never a new object or array), so unrelated changes skip the render.
 */
export function useStore<T>(store: ReadableStore<T>): T;
export function useStore<T, S>(store: ReadableStore<T>, selector: (state: T) => S): S;
export function useStore<T, S>(
  store: ReadableStore<T>,
  selector: (state: T) => S = identity as (state: T) => S,
): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getSnapshot()),
    () => selector(store.getServerSnapshot ? store.getServerSnapshot() : store.getSnapshot()),
  );
}
