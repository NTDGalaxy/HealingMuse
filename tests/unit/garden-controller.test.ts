import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGardenController,
  initialGardenState,
  posterAfterMs,
  transition,
  type GardenInput,
  type GardenState,
  type RendererFactory,
  type RendererKind,
} from "../../src/lib/garden/controller";
import type { RendererEvent, SceneSpec, Viewport } from "../../src/lib/garden/protocol";

const visible = true;
const state = (phase: GardenState): GardenState => phase;
const waiting = state({ phase: "waiting", visible });
const startingWorker = state({ phase: "starting", renderer: "worker", visible });
const startingMain = state({ phase: "starting", renderer: "main", visible });
const readyWorker = state({ phase: "ready", renderer: "worker", visible });
const degraded = state({ phase: "degraded", renderer: "worker", tier: 1, visible });
const event = (renderer: RendererKind, value: RendererEvent): GardenInput => ({
  type: "renderer",
  renderer,
  event: value,
});

describe("garden lifecycle transitions", () => {
  it("starts waiting when the policy allows the scene, or shows the poster", () => {
    expect(transition(initialGardenState(true), { type: "policy", scene: true })).toEqual({
      state: waiting,
      effects: [{ type: "wait" }],
    });
    expect(transition(initialGardenState(false), { type: "policy", scene: false })).toEqual({
      state: { phase: "poster", cause: "preference", tier: null, visible: false },
      effects: [],
    });
  });

  it("starts the worker renderer, and records the start, only once decoration may start", () => {
    for (const input of [
      { type: "timeout" },
      event("worker", { type: "ready" }),
      { type: "policy", scene: true },
    ] as GardenInput[])
      expect(transition(waiting, input)).toEqual({ state: waiting, effects: [] });
    expect(transition(waiting, { type: "decoration" })).toEqual({
      state: startingWorker,
      effects: [{ type: "mark" }, { type: "create", renderer: "worker" }],
    });
  });

  it("settles the poster timer and forwards visibility on the first frame", () => {
    expect(transition(startingWorker, event("worker", { type: "ready" }))).toEqual({
      state: readyWorker,
      effects: [{ type: "settle" }, { type: "visibility", visible: true }],
    });
    const hidden = { ...startingMain, visible: false };
    expect(transition(hidden, event("main", { type: "ready" }))).toEqual({
      state: { phase: "ready", renderer: "main", visible: false },
      effects: [{ type: "settle" }, { type: "visibility", visible: false }],
    });
  });

  it("falls back from a failing worker to the main thread, then to the poster", () => {
    for (const failure of [{ type: "failed" }, { type: "lost" }] as RendererEvent[])
      expect(transition(startingWorker, event("worker", failure))).toEqual({
        state: startingMain,
        effects: [{ type: "create", renderer: "main" }],
      });
    expect(transition(startingMain, event("main", { type: "failed" }))).toEqual({
      state: { phase: "poster", cause: "failure", tier: null, visible },
      effects: [{ type: "release" }],
    });
    expect(transition(startingMain, event("main", { type: "lost" })).state).toMatchObject({
      phase: "poster",
      cause: "context-lost",
    });
  });

  it("ignores events from a renderer that is not the active one", () => {
    expect(transition(startingMain, event("worker", { type: "ready" }))).toEqual({
      state: startingMain,
      effects: [],
    });
    expect(transition(readyWorker, event("main", { type: "failed" }))).toEqual({
      state: readyWorker,
      effects: [],
    });
  });

  it("shows the poster when the first frame takes too long", () => {
    for (const starting of [startingWorker, startingMain])
      expect(transition(starting, { type: "timeout" })).toEqual({
        state: { phase: "poster", cause: "timeout", tier: null, visible },
        effects: [{ type: "release" }],
      });
    expect(transition(readyWorker, { type: "timeout" })).toEqual({
      state: readyWorker,
      effects: [],
    });
  });

  it("steps quality down on slow frames and keeps the tier on the poster", () => {
    const first = transition(readyWorker, event("worker", { type: "quality", tier: 1 }));
    expect(first).toEqual({ state: degraded, effects: [] });
    const second = transition(first.state, event("worker", { type: "quality", tier: 0 }));
    expect(second.state).toEqual({ ...degraded, tier: 0 });
    expect(transition(second.state, event("worker", { type: "exhausted" }))).toEqual({
      state: { phase: "poster", cause: "exhausted", tier: 0, visible },
      effects: [{ type: "release" }],
    });
    expect(transition(readyWorker, event("worker", { type: "exhausted" })).state).toEqual({
      phase: "poster",
      cause: "exhausted",
      tier: null,
      visible,
    });
  });

  it("replaces a running scene with the poster on context loss or failure", () => {
    expect(transition(readyWorker, event("worker", { type: "lost" }))).toEqual({
      state: { phase: "poster", cause: "context-lost", tier: null, visible },
      effects: [{ type: "release" }],
    });
    expect(transition(degraded, event("worker", { type: "failed" })).state).toEqual({
      phase: "poster",
      cause: "failure",
      tier: 1,
      visible,
    });
    expect(transition(degraded, event("worker", { type: "ready" }))).toEqual({
      state: degraded,
      effects: [],
    });
  });

  it("pauses and resumes only a running scene when the tab is hidden or shown", () => {
    for (const running of [readyWorker, degraded]) {
      const hidden = transition(running, { type: "visibility", visible: false });
      expect(hidden).toEqual({
        state: { ...running, visible: false },
        effects: [{ type: "visibility", visible: false }],
      });
      expect(transition(hidden.state, { type: "visibility", visible: true })).toEqual({
        state: running,
        effects: [{ type: "visibility", visible: true }],
      });
      expect(transition(running, { type: "visibility", visible: true })).toEqual({
        state: running,
        effects: [],
      });
    }
    for (const quiet of [initialGardenState(true), waiting, startingWorker])
      expect(transition(quiet, { type: "visibility", visible: false })).toEqual({
        state: { ...quiet, visible: false },
        effects: [],
      });
  });

  it("moves every state to the poster when a preference rules the scene out", () => {
    for (const active of [waiting, startingWorker, startingMain, readyWorker, degraded])
      expect(transition(active, { type: "policy", scene: false })).toEqual({
        state: { phase: "poster", cause: "preference", tier: null, visible },
        effects: [{ type: "release" }],
      });
    for (const active of [startingWorker, readyWorker, degraded])
      expect(transition(active, { type: "policy", scene: true })).toEqual({
        state: active,
        effects: [],
      });
  });

  it("restarts from the poster when the scene is allowed again", () => {
    for (const cause of ["preference", "failure", "context-lost", "timeout", "exhausted"] as const)
      expect(
        transition({ phase: "poster", cause, tier: 0, visible }, { type: "policy", scene: true }),
      ).toEqual({ state: waiting, effects: [{ type: "wait" }] });
    expect(
      transition(
        { phase: "poster", cause: "exhausted", tier: 0, visible },
        { type: "policy", scene: false },
      ),
    ).toEqual({
      state: { phase: "poster", cause: "preference", tier: null, visible },
      effects: [],
    });
    const preferred = state({ phase: "poster", cause: "preference", tier: null, visible });
    expect(transition(preferred, { type: "policy", scene: false })).toEqual({
      state: preferred,
      effects: [],
    });
    expect(transition(preferred, event("worker", { type: "ready" }))).toEqual({
      state: preferred,
      effects: [],
    });
  });

  it("releases everything on stop and stays idle", () => {
    for (const active of [waiting, startingWorker, readyWorker, degraded])
      expect(transition(active, { type: "stop" })).toEqual({
        state: initialGardenState(true),
        effects: [{ type: "release" }],
      });
    const idle = initialGardenState(true);
    expect(transition(idle, { type: "stop" })).toEqual({ state: idle, effects: [] });
    expect(transition(idle, { type: "decoration" })).toEqual({ state: idle, effects: [] });
  });
});

type FakePort = {
  kind: RendererKind;
  init: { scene: SceneSpec; viewport: Viewport };
  emit: (event: RendererEvent) => void;
  calls: unknown[][];
  disposed: boolean;
};

function harness({ workerThrows = false } = {}) {
  const ports: FakePort[] = [];
  const factory =
    (kind: RendererKind): RendererFactory =>
    (init, emit) => {
      if (kind === "worker" && workerThrows) throw new Error("Synthetic worker failure");
      const port: FakePort = { kind, init, emit, calls: [], disposed: false };
      ports.push(port);
      return {
        scene: (spec) => port.calls.push(["scene", spec]),
        resize: (viewport) => port.calls.push(["resize", viewport]),
        visible: (value) => port.calls.push(["visible", value]),
        dispose: () => {
          port.disposed = true;
        },
      };
    };
  let allow: ((value: boolean) => void) | null = null;
  const signals: AbortSignal[] = [];
  const marks: number[] = [];
  const controller = createGardenController({
    renderers: { worker: factory("worker"), main: factory("main") },
    decoration: (signal) => {
      signals.push(signal);
      return new Promise((resolve) => {
        allow = resolve;
        signal.addEventListener("abort", () => resolve(false), { once: true });
      });
    },
    mark: () => marks.push(Date.now()),
    scene: { garden: "lotus", theme: "day" },
    viewport: { width: 390, height: 844 },
    visible: true,
  });
  const decorate = async () => {
    allow?.(true);
    await Promise.resolve();
    await Promise.resolve();
  };
  return { controller, ports, signals, marks, decorate, phase: () => controller.getSnapshot() };
}

describe("garden controller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("creates nothing until decoration may start, then starts the worker", async () => {
    const { controller, ports, marks, decorate, phase } = harness();
    controller.setPolicy(true);
    expect(phase()).toMatchObject({ phase: "waiting" });
    controller.setScene({ garden: "fern", theme: "night" });
    controller.resize({ width: 1440, height: 900 });
    expect(ports).toEqual([]);
    expect(marks).toEqual([]);
    await decorate();
    expect(marks).toHaveLength(1);
    expect(phase()).toMatchObject({ phase: "starting", renderer: "worker" });
    expect(ports.map((port) => [port.kind, port.init])).toEqual([
      [
        "worker",
        { scene: { garden: "fern", theme: "night" }, viewport: { width: 1440, height: 900 } },
      ],
    ]);
    ports[0].emit({ type: "ready" });
    expect(phase()).toMatchObject({ phase: "ready", renderer: "worker" });
    expect(ports[0].calls).toEqual([["visible", true]]);
    controller.setScene({ garden: "seed", theme: "day" });
    controller.resize({ width: 800, height: 600 });
    expect(ports[0].calls.slice(1)).toEqual([
      ["scene", { garden: "seed", theme: "day" }],
      ["resize", { width: 800, height: 600 }],
    ]);
  });

  it("counts the poster timer from scene start, not from mount", async () => {
    const { controller, ports, decorate, phase } = harness();
    controller.setPolicy(true);
    await vi.advanceTimersByTimeAsync(posterAfterMs * 2);
    expect(phase()).toMatchObject({ phase: "waiting" });
    await decorate();
    await vi.advanceTimersByTimeAsync(posterAfterMs - 1);
    expect(phase()).toMatchObject({ phase: "starting" });
    await vi.advanceTimersByTimeAsync(1);
    expect(phase()).toEqual({ phase: "poster", cause: "timeout", tier: null, visible: true });
    expect(ports[0].disposed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back to the main thread when the worker cannot be built, with a fresh timer", async () => {
    const { controller, ports, decorate, phase } = harness({ workerThrows: true });
    controller.setPolicy(true);
    await decorate();
    expect(phase()).toMatchObject({ phase: "starting", renderer: "main" });
    expect(ports.map((port) => port.kind)).toEqual(["main"]);
    expect(vi.getTimerCount()).toBe(1);
    ports[0].emit({ type: "ready" });
    expect(phase()).toMatchObject({ phase: "ready", renderer: "main" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("restarts the poster timer for the main-thread attempt after a worker failure", async () => {
    const { controller, ports, decorate, phase } = harness();
    controller.setPolicy(true);
    await decorate();
    await vi.advanceTimersByTimeAsync(posterAfterMs - 100);
    ports[0].emit({ type: "failed" });
    expect(ports[0].disposed).toBe(true);
    expect(phase()).toMatchObject({ phase: "starting", renderer: "main" });
    await vi.advanceTimersByTimeAsync(posterAfterMs - 1);
    expect(phase()).toMatchObject({ phase: "starting", renderer: "main" });
    await vi.advanceTimersByTimeAsync(1);
    expect(phase()).toMatchObject({ phase: "poster", cause: "timeout" });
    expect(ports[1].disposed).toBe(true);
  });

  it("ignores late events from a renderer it has disposed", async () => {
    const { controller, ports, decorate, phase } = harness();
    controller.setPolicy(true);
    await decorate();
    const worker = ports[0];
    worker.emit({ type: "failed" });
    worker.emit({ type: "ready" });
    expect(phase()).toMatchObject({ phase: "starting", renderer: "main" });
    ports[1].emit({ type: "ready" });
    worker.emit({ type: "lost" });
    expect(phase()).toMatchObject({ phase: "ready", renderer: "main" });
  });

  it("replaces the scene with the poster on context loss and disposes the renderer", async () => {
    const { controller, ports, decorate, phase } = harness();
    controller.setPolicy(true);
    await decorate();
    ports[0].emit({ type: "ready" });
    ports[0].emit({ type: "lost" });
    expect(phase()).toEqual({ phase: "poster", cause: "context-lost", tier: null, visible: true });
    expect(ports[0].disposed).toBe(true);
  });

  it("degrades on slow frames and ends on the poster with the last tier", async () => {
    const { controller, ports, decorate, phase } = harness();
    controller.setPolicy(true);
    await decorate();
    ports[0].emit({ type: "ready" });
    ports[0].emit({ type: "quality", tier: 1 });
    ports[0].emit({ type: "quality", tier: 0 });
    expect(phase()).toMatchObject({ phase: "degraded", tier: 0 });
    ports[0].emit({ type: "exhausted" });
    expect(phase()).toEqual({ phase: "poster", cause: "exhausted", tier: 0, visible: true });
    expect(ports[0].disposed).toBe(true);
  });

  it("pauses rendering on a hidden tab and tells a late first frame the tab is hidden", async () => {
    const { controller, ports, decorate } = harness();
    controller.setPolicy(true);
    await decorate();
    controller.setVisible(false);
    expect(ports[0].calls).toEqual([]);
    ports[0].emit({ type: "ready" });
    expect(ports[0].calls).toEqual([["visible", false]]);
    controller.setVisible(true);
    controller.setVisible(true);
    expect(ports[0].calls).toEqual([
      ["visible", false],
      ["visible", true],
    ]);
  });

  it("follows preference changes: aborts the wait, disposes the scene and restarts", async () => {
    const { controller, ports, signals, decorate, phase } = harness();
    controller.setPolicy(true);
    controller.setPolicy(false);
    expect(signals[0].aborted).toBe(true);
    expect(phase()).toMatchObject({ phase: "poster", cause: "preference" });
    await decorate();
    expect(ports).toEqual([]);
    controller.setPolicy(true);
    expect(signals).toHaveLength(2);
    await decorate();
    ports[0].emit({ type: "ready" });
    controller.setPolicy(false);
    expect(ports[0].disposed).toBe(true);
    expect(phase()).toMatchObject({ phase: "poster", cause: "preference" });
  });

  it("notifies subscribers once per settled change", async () => {
    const { controller, decorate } = harness({ workerThrows: true });
    const seen: string[] = [];
    controller.subscribe(() => {
      const current = controller.getSnapshot();
      seen.push(current.phase === "starting" ? `starting:${current.renderer}` : current.phase);
    });
    controller.setPolicy(true);
    await decorate();
    controller.setVisible(true);
    expect(seen).toEqual(["waiting", "starting:main"]);
  });

  it("cleans up on stop: no wait, renderer or timer survives", async () => {
    const { controller, ports, signals, decorate, phase } = harness();
    controller.setPolicy(true);
    await decorate();
    controller.stop();
    expect(phase()).toEqual(initialGardenState(true));
    expect(ports[0].disposed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    ports[0].emit({ type: "ready" });
    expect(phase()).toEqual(initialGardenState(true));
    controller.setPolicy(true);
    controller.stop();
    expect(signals[1].aborted).toBe(true);
    await decorate();
    expect(ports).toHaveLength(1);
  });
});
