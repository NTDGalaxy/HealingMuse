import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginPlaybackStart, decorationMayStart, playbackStarting } from "@/lib/perf/audio-first";
import { readinessMarks } from "@/lib/perf/readiness";

// Node's PerformanceObserver delivers marks on a later task.
const nextTask = () => new Promise((resolve) => setImmediate(resolve));
async function flush() {
  await nextTask();
  await nextTask();
}

let primaryControl = false;
let outcome: boolean | undefined;
function track(promise: Promise<boolean>) {
  outcome = undefined;
  void promise.then((value) => (outcome = value));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  performance.clearMarks();
  primaryControl = false;
  vi.stubGlobal("document", {
    querySelector: (selector: string) =>
      selector === "[data-primary]" && primaryControl ? {} : null,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  expect(playbackStarting()).toBe(false);
});

describe("decorationMayStart", () => {
  it("starts with the shell on routes without a primary control", async () => {
    track(decorationMayStart());
    await flush();
    expect(outcome).toBeUndefined();
    performance.mark(readinessMarks.shell);
    await flush();
    expect(outcome).toBe(true);
  });

  it("waits for the primary control to hydrate", async () => {
    primaryControl = true;
    performance.mark(readinessMarks.shell);
    track(decorationMayStart());
    await flush();
    expect(outcome).toBeUndefined();
    performance.mark(readinessMarks.primary);
    await flush();
    expect(outcome).toBe(true);
  });

  it("waits until every starting playback plays or fails", async () => {
    performance.mark(readinessMarks.shell);
    const first = beginPlaybackStart();
    const second = beginPlaybackStart();
    track(decorationMayStart());
    await flush();
    first();
    first();
    await flush();
    expect(outcome).toBeUndefined();
    second();
    await flush();
    expect(outcome).toBe(true);
  });

  it("bounds each wait so decoration is only ever delayed", async () => {
    primaryControl = true;
    performance.mark(readinessMarks.shell);
    const settle = beginPlaybackStart();
    track(decorationMayStart({ readyWithin: 2000, audioWithin: 6000 }));
    await vi.advanceTimersByTimeAsync(1999);
    expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(5999);
    expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toBe(true);
    settle();
  });

  it("resolves false on abort and stops listening", async () => {
    const controller = new AbortController();
    const settle = beginPlaybackStart();
    track(decorationMayStart({ signal: controller.signal }));
    controller.abort();
    await flush();
    expect(outcome).toBe(false);
    performance.mark(readinessMarks.shell);
    settle();
    await flush();
    expect(outcome).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resolves false at once for an aborted signal", async () => {
    track(decorationMayStart({ signal: AbortSignal.abort() }));
    await flush();
    expect(outcome).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
