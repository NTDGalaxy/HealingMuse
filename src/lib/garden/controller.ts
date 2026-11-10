// Lifecycle of the decorative garden scene, free of the DOM and of three.js.
//
// transition() is a pure state machine: it maps a state and an input to the next state plus the
// effects to perform. createGardenController() owns the resources those effects describe (the
// decoration wait, the active renderer port and the poster timer) and is driven by the host
// component. Renderers sit behind one port interface, so the worker and the main-thread renderer
// are interchangeable here.
//
//   idle ──policy──▶ waiting ──decoration──▶ starting(worker) ──ready──▶ ready ──quality──▶ degraded
//     │                 │                        │ failed/lost             │                  │
//     │                 │                        ▼                         │ exhausted        │
//     │                 │                  starting(main) ──ready──▶ ready │ failed, lost     │
//     ▼                 ▼                        │ failed, lost, timeout   ▼                  ▼
//   poster ◀────────────┴────────────────────────┴──────────────────── poster ◀───────────────┘
//
// A preference that rules the scene out moves any state to the poster; allowing it again from the
// poster restarts at waiting. Hidden tabs pause a running scene without changing its phase.
import type { QualityTier } from "./config";
import type { RendererEvent, SceneSpec, Viewport } from "./protocol";
import type { ReadableStore } from "../state/create-store";

export type RendererKind = "worker" | "main";
/** Why the still poster shows instead of the live scene. */
export type PosterCause = "preference" | "failure" | "context-lost" | "timeout" | "exhausted";

export type GardenPhase =
  /** Not started, or stopped. */
  | { phase: "idle" }
  /** Allowed, but decoration waits until the route is usable and any starting playback settles. */
  | { phase: "waiting" }
  /** A renderer is drawing its first frame. */
  | { phase: "starting"; renderer: RendererKind }
  | { phase: "ready"; renderer: RendererKind }
  /** Running after sustained slow frames stepped quality down to this tier. */
  | { phase: "degraded"; renderer: RendererKind; tier: QualityTier }
  /** The last reported tier is kept so the host can still show it. */
  | { phase: "poster"; cause: PosterCause; tier: QualityTier | null };

/** visible: the document is visible; a running scene pauses while it is not. */
export type GardenState = Readonly<GardenPhase & { visible: boolean }>;

export type GardenInput =
  /** The motion policy allows (true) or rules out (false) the live scene. Starts from idle. */
  | { type: "policy"; scene: boolean }
  /** The decoration wait resolved. */
  | { type: "decoration" }
  | { type: "renderer"; renderer: RendererKind; event: RendererEvent }
  /** The poster timer fired before the first frame. */
  | { type: "timeout" }
  | { type: "visibility"; visible: boolean }
  | { type: "stop" };

export type GardenEffect =
  /** Start waiting for decoration, replacing any earlier wait. */
  | { type: "wait" }
  /** Record that the scene starts. */
  | { type: "mark" }
  /** Replace the renderer with a new one of this kind and restart the poster timer. */
  | { type: "create"; renderer: RendererKind }
  /** The first frame is drawn: stop the poster timer. */
  | { type: "settle" }
  /** Pause or resume the running renderer. */
  | { type: "visibility"; visible: boolean }
  /** Cancel the wait, dispose of the renderer and stop the poster timer. */
  | { type: "release" };

export type Transition = { state: GardenState; effects: GardenEffect[] };

export const initialGardenState = (visible: boolean): GardenState => ({ phase: "idle", visible });

const stay = (state: GardenState): Transition => ({ state, effects: [] });
const poster = (
  state: GardenState,
  cause: PosterCause,
  tier: QualityTier | null = null,
): Transition => ({
  state: { phase: "poster", cause, tier, visible: state.visible },
  effects: [{ type: "release" }],
});

export function transition(state: GardenState, input: GardenInput): Transition {
  const { visible } = state;
  if (input.type === "visibility") {
    if (input.visible === visible) return stay(state);
    const running = state.phase === "ready" || state.phase === "degraded";
    return {
      state: { ...state, visible: input.visible },
      // A starting renderer learns the visibility once its first frame is drawn.
      effects: running ? [{ type: "visibility", visible: input.visible }] : [],
    };
  }
  if (input.type === "stop")
    return state.phase === "idle"
      ? stay(state)
      : { state: { phase: "idle", visible }, effects: [{ type: "release" }] };

  switch (state.phase) {
    case "idle":
      if (input.type !== "policy") return stay(state);
      return input.scene
        ? { state: { phase: "waiting", visible }, effects: [{ type: "wait" }] }
        : { state: { phase: "poster", cause: "preference", tier: null, visible }, effects: [] };

    case "waiting":
      if (input.type === "policy") return input.scene ? stay(state) : poster(state, "preference");
      if (input.type !== "decoration") return stay(state);
      return {
        state: { phase: "starting", renderer: "worker", visible },
        effects: [{ type: "mark" }, { type: "create", renderer: "worker" }],
      };

    case "starting": {
      if (input.type === "policy") return input.scene ? stay(state) : poster(state, "preference");
      if (input.type === "timeout") return poster(state, "timeout");
      if (input.type !== "renderer" || input.renderer !== state.renderer) return stay(state);
      const { event } = input;
      if (event.type === "ready")
        return {
          state: { phase: "ready", renderer: state.renderer, visible },
          effects: [{ type: "settle" }, { type: "visibility", visible }],
        };
      if (event.type === "quality") return stay(state);
      if (event.type === "exhausted") return poster(state, "exhausted");
      // The worker could not start: the main-thread renderer gets its own attempt and timer.
      if (state.renderer === "worker")
        return {
          state: { phase: "starting", renderer: "main", visible },
          effects: [{ type: "create", renderer: "main" }],
        };
      return poster(state, event.type === "lost" ? "context-lost" : "failure");
    }

    case "ready":
    case "degraded": {
      if (input.type === "policy") return input.scene ? stay(state) : poster(state, "preference");
      if (input.type !== "renderer" || input.renderer !== state.renderer) return stay(state);
      const { event } = input;
      const tier = state.phase === "degraded" ? state.tier : null;
      switch (event.type) {
        case "ready":
          return stay(state);
        case "quality":
          return stay({ phase: "degraded", renderer: state.renderer, tier: event.tier, visible });
        case "exhausted":
          return poster(state, "exhausted", tier);
        case "lost":
          return poster(state, "context-lost", tier);
        case "failed":
          return poster(state, "failure", tier);
      }
      return stay(state);
    }

    case "poster":
      if (input.type !== "policy") return stay(state);
      if (input.scene) return { state: { phase: "waiting", visible }, effects: [{ type: "wait" }] };
      // A preference now explains the poster; an earlier failure's tier no longer applies.
      return state.cause === "preference"
        ? stay(state)
        : stay({ phase: "poster", cause: "preference", tier: null, visible });
  }
}

/** One renderer instance. Commands arrive only while it is the controller's active renderer. */
export interface RendererPort {
  scene(spec: SceneSpec): void;
  resize(viewport: Viewport): void;
  visible(value: boolean): void;
  dispose(): void;
}
/**
 * Builds a renderer that draws `scene` at `viewport` and reports through `emit`, beginning with
 * "ready" once its first frame is drawn. It may throw when the renderer cannot exist at all.
 */
export type RendererFactory = (
  init: { scene: SceneSpec; viewport: Viewport },
  emit: (event: RendererEvent) => void,
) => RendererPort;

type Timer = ReturnType<typeof setTimeout>;
export type ControllerOptions = {
  renderers: Readonly<Record<RendererKind, RendererFactory>>;
  /** Resolves true once decoration may start, false if the signal aborts first. */
  decoration(signal: AbortSignal): Promise<boolean>;
  /** Records that the scene starts (a performance mark in the browser). */
  mark(): void;
  scene: SceneSpec;
  viewport: Viewport;
  visible: boolean;
  /** How long a renderer may take to draw its first frame before the poster replaces it. */
  posterAfterMs?: number;
  timers?: {
    setTimeout(callback: () => void, ms: number): Timer;
    clearTimeout(timer: Timer): void;
  };
};

export type GardenController = ReadableStore<GardenState> & {
  setPolicy(scene: boolean): void;
  setScene(spec: SceneSpec): void;
  resize(viewport: Viewport): void;
  setVisible(visible: boolean): void;
  /** Releases everything; the controller can be started again with setPolicy. */
  stop(): void;
};

export const posterAfterMs = 8000;

export function createGardenController(options: ControllerOptions): GardenController {
  const timers = options.timers ?? globalThis;
  const timeoutMs = options.posterAfterMs ?? posterAfterMs;
  let state = initialGardenState(options.visible);
  let scene = options.scene;
  let viewport = options.viewport;
  let wait: AbortController | null = null;
  let port: RendererPort | null = null;
  // Increments whenever the active renderer changes, so a disposed renderer's late events are
  // ignored instead of being read as news about its successor.
  let generation = 0;
  let timer: Timer | null = null;
  const listeners = new Set<() => void>();
  const queue: GardenInput[] = [];
  let draining = false;

  const clearTimer = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  };
  const disposePort = () => {
    generation++;
    const current = port;
    port = null;
    current?.dispose();
  };
  const abandonWait = () => {
    wait?.abort();
    wait = null;
  };

  const run = (effect: GardenEffect) => {
    switch (effect.type) {
      case "wait": {
        abandonWait();
        const controller = new AbortController();
        wait = controller;
        const resolve = (allowed: boolean) => {
          if (!allowed || wait !== controller) return;
          wait = null;
          dispatch({ type: "decoration" });
        };
        // The wait only ever delays decoration: if it breaks, decoration may start.
        options.decoration(controller.signal).then(resolve, () => resolve(true));
        return;
      }
      case "mark":
        return options.mark();
      case "create": {
        disposePort();
        clearTimer();
        const kind = effect.renderer;
        const current = generation;
        timer = timers.setTimeout(() => dispatch({ type: "timeout" }), timeoutMs);
        const emit = (event: RendererEvent) => {
          if (current === generation) dispatch({ type: "renderer", renderer: kind, event });
        };
        try {
          port = options.renderers[kind]({ scene, viewport }, emit);
        } catch {
          emit({ type: "failed" });
        }
        return;
      }
      case "settle":
        return clearTimer();
      case "visibility":
        return port?.visible(effect.visible);
      case "release":
        abandonWait();
        disposePort();
        return clearTimer();
    }
  };

  // Inputs raised while effects run (a renderer failing synchronously, say) queue behind the
  // current one, so every transition sees the state its predecessor produced.
  function dispatch(input: GardenInput) {
    queue.push(input);
    if (draining) return;
    draining = true;
    const before = state;
    try {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const result = transition(state, next);
        state = result.state;
        result.effects.forEach(run);
      }
    } finally {
      draining = false;
    }
    if (state !== before) for (const listener of [...listeners]) listener();
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setPolicy: (allowed) => dispatch({ type: "policy", scene: allowed }),
    setScene(spec) {
      scene = spec;
      port?.scene(spec);
    },
    resize(next) {
      viewport = next;
      port?.resize(next);
    },
    setVisible: (value) => dispatch({ type: "visibility", visible: value }),
    stop: () => dispatch({ type: "stop" }),
  };
}
