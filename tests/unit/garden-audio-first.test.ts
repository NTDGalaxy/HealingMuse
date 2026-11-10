import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGardenController,
  type RendererFactory,
  type RendererKind,
} from "../../src/lib/garden/controller";
import {
  beginPlaybackStart,
  decorationBounds,
  decorationMayStart,
  playbackStarting,
} from "../../src/lib/perf/audio-first";
import { readinessMarks } from "../../src/lib/perf/readiness";

// The timing half of the audio-first start: the controller with the real decoration wait under
// fake timers. The end-to-end specs only assert ordering, which no machine speed can change.

const flush = async () => {
  for (let turn = 0; turn < 5; turn++) await Promise.resolve();
};

function garden() {
  const created: RendererKind[] = [];
  const factory =
    (kind: RendererKind): RendererFactory =>
    () => {
      created.push(kind);
      return { scene() {}, resize() {}, visible() {}, dispose() {} };
    };
  const controller = createGardenController({
    renderers: { worker: factory("worker"), main: factory("main") },
    decoration: (signal) => decorationMayStart({ signal }),
    mark() {},
    scene: { garden: "lotus", theme: "day" },
    viewport: { width: 390, height: 844 },
    visible: true,
  });
  return { controller, created };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  performance.clearMarks();
  // The route is usable: the shell and its primary control have hydrated.
  vi.stubGlobal("document", { querySelector: () => ({}) });
  performance.mark(readinessMarks.shell);
  performance.mark(readinessMarks.primary);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  performance.clearMarks();
  expect(playbackStarting()).toBe(false);
});

describe("garden scene start under audio-first", () => {
  it("starts at once when no recording or tone is starting", async () => {
    const { controller, created } = garden();
    controller.setPolicy(true);
    await flush();
    expect(created).toEqual(["worker"]);
    controller.stop();
  });

  it("creates no renderer while a start is pending, then starts once it plays", async () => {
    const settle = beginPlaybackStart();
    const { controller, created } = garden();
    controller.setPolicy(true);
    await vi.advanceTimersByTimeAsync(decorationBounds.audioWithin - 1);
    expect(created).toEqual([]);
    expect(controller.getSnapshot()).toMatchObject({ phase: "waiting" });
    settle();
    await flush();
    expect(created).toEqual(["worker"]);
    controller.stop();
  });

  it("waits for every pending start, recordings and binaural tones alike", async () => {
    const recording = beginPlaybackStart();
    const tones = beginPlaybackStart();
    const { controller, created } = garden();
    controller.setPolicy(true);
    recording();
    await flush();
    expect(created).toEqual([]);
    tones();
    await flush();
    expect(created).toEqual(["worker"]);
    controller.stop();
  });

  it("starts after the full audio wait when a start never settles", async () => {
    const settle = beginPlaybackStart();
    const { controller, created } = garden();
    controller.setPolicy(true);
    await vi.advanceTimersByTimeAsync(decorationBounds.audioWithin - 1);
    expect(created).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(created).toEqual(["worker"]);
    controller.stop();
    settle();
  });

  it("counts the poster timer from scene start, after the audio wait", async () => {
    const settle = beginPlaybackStart();
    const { controller } = garden();
    controller.setPolicy(true);
    await vi.advanceTimersByTimeAsync(decorationBounds.audioWithin - 1000);
    settle();
    await flush();
    await vi.advanceTimersByTimeAsync(7999);
    expect(controller.getSnapshot()).toMatchObject({ phase: "starting" });
    await vi.advanceTimersByTimeAsync(1);
    expect(controller.getSnapshot()).toMatchObject({ phase: "poster", cause: "timeout" });
  });
});
