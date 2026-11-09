import { createStore, type ReadableStore } from "@/lib/state/create-store";

/** The sleep timer lengths offered, in minutes; 0 turns the timer off. */
export const sleepTimerChoices = [0, 5, 15, 30, 45, 60] as const;

export type SleepTimer = {
  /** Whole minutes left, rounded up, or null while no timer runs. */
  minutes: ReadableStore<number | null>;
  /** Starts a timer for `minutes` from now, or turns it off with 0. */
  set(minutes: number): void;
  clear(): void;
  /**
   * Re-evaluates the deadline against the wall clock. Run every second and whenever the page
   * becomes visible again, because background tabs throttle timers.
   */
  tick(): void;
};

export function createSleepTimer({
  onExpire,
  // Read the clock on every call, never a reference captured at creation, so a clock replaced
  // later (tests, polyfills) is honoured.
  now = () => Date.now(),
}: {
  onExpire: () => void;
  now?: () => number;
}): SleepTimer {
  const minutes = createStore<number | null>(null);
  let deadline: number | null = null;
  return {
    minutes,
    set(value) {
      deadline = value ? now() + value * 60000 : null;
      minutes.set(value || null);
    },
    clear() {
      deadline = null;
      minutes.set(null);
    },
    tick() {
      if (deadline === null) return;
      const remaining = deadline - now();
      if (remaining > 0) {
        minutes.set(Math.ceil(remaining / 60000));
        return;
      }
      deadline = null;
      onExpire();
      minutes.set(null);
    },
  };
}
