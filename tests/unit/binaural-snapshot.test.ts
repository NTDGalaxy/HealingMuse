import { describe, expect, it, vi } from "vitest";
import { createSnapshotRelay, idleSnapshot } from "@/lib/binaural/snapshot";
import type { BinauralSnapshot } from "@/lib/binaural/engine";

function fakeEngine(initial: BinauralSnapshot) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(patch: Partial<BinauralSnapshot>) {
      snapshot = { ...snapshot, ...patch };
      for (const listener of listeners) listener();
    },
    listeners,
  };
}

describe("binaural snapshot relay", () => {
  it("reports the idle snapshot until the engine attaches, then forwards the engine", () => {
    const relay = createSnapshotRelay();
    const changed = vi.fn();
    relay.subscribe(changed);
    expect(relay.getSnapshot()).toBe(idleSnapshot);
    expect(relay.getServerSnapshot()).toBe(idleSnapshot);
    const engine = fakeEngine({ ...idleSnapshot, remainingSeconds: 60 });
    relay.attach(engine);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(relay.getSnapshot().remainingSeconds).toBe(60);
    engine.publish({ status: "playing", elapsedSeconds: 0.5 });
    expect(changed).toHaveBeenCalledTimes(2);
    expect(relay.getSnapshot()).toMatchObject({ status: "playing", elapsedSeconds: 0.5 });
    // Attaching the same engine again changes nothing.
    relay.attach(engine);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("stops following a detached engine", () => {
    const relay = createSnapshotRelay();
    const engine = fakeEngine(idleSnapshot);
    relay.attach(engine);
    relay.attach(null);
    expect(engine.listeners.size).toBe(0);
    const changed = vi.fn();
    relay.subscribe(changed);
    engine.publish({ status: "playing" });
    expect(changed).not.toHaveBeenCalled();
    expect(relay.getSnapshot()).toBe(idleSnapshot);
  });

  it("lets a selector skip ticks that do not change its slice", () => {
    const relay = createSnapshotRelay();
    const engine = fakeEngine(idleSnapshot);
    relay.attach(engine);
    const statuses: string[] = [];
    let last = relay.getSnapshot().status;
    relay.subscribe(() => {
      const status = relay.getSnapshot().status;
      if (status !== last) statuses.push((last = status));
    });
    engine.publish({ status: "playing" });
    for (let tick = 1; tick <= 5; tick++) engine.publish({ elapsedSeconds: tick / 2 });
    engine.publish({ status: "paused" });
    expect(statuses).toEqual(["playing", "paused"]);
  });
});
