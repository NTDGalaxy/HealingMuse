// The live garden's runtime: the controller, both renderers, viewport and visibility tracking and
// the host's data attributes. Scenery imports it on demand once decoration may start, so none of
// it ships in a route's startup JS, and Calm, reduced motion, Still and Save-Data never load it.
import { createGardenController, type GardenState } from "./controller";
import type { SceneSpec } from "./protocol";
import { mainThreadRenderer, workerRenderer } from "./renderers";
import { readViewport, watchViewport } from "./viewport";
import { decorationMarks, decorationMayStart } from "../perf/audio-first";

export type GardenRuntime = {
  setPolicy(scene: boolean): void;
  setScene(spec: SceneSpec): void;
  stop(): void;
};

const hostStates: Record<GardenState["phase"], string> = {
  idle: "waiting",
  waiting: "waiting",
  starting: "starting",
  ready: "ready",
  degraded: "ready",
  poster: "still",
};
const running = (state: GardenState) => state.phase === "ready" || state.phase === "degraded";

/** Mirrors the controller state onto the host for its styles, the tests and the perf harness. */
function reflect(element: HTMLElement, state: GardenState, previous: GardenState) {
  const data = element.dataset;
  data.state = hostStates[state.phase];
  if ("renderer" in state) data.renderer = state.renderer;
  else delete data.renderer;
  if (!running(state)) delete data.readyMs;
  else if (!running(previous)) data.readyMs = String(Math.round(performance.now()));
  const tier = "tier" in state ? state.tier : null;
  if (tier === null) delete data.quality;
  else data.quality = String(tier);
}

/** Drives the garden inside `host`; the policy decides whether the scene or the poster shows. */
export function startGardenRuntime(host: HTMLElement, scene: SceneSpec): GardenRuntime {
  const controller = createGardenController({
    renderers: { worker: workerRenderer(host), main: mainThreadRenderer(host) },
    decoration: (signal) => decorationMayStart({ signal }),
    mark: () => performance.mark(decorationMarks.scene),
    scene,
    viewport: readViewport(),
    visible: document.visibilityState === "visible",
  });
  let previous = controller.getSnapshot();
  const unsubscribe = controller.subscribe(() => {
    const next = controller.getSnapshot();
    reflect(host, next, previous);
    previous = next;
  });
  const unwatch = watchViewport((viewport) => controller.resize(viewport));
  const visibility = () => controller.setVisible(document.visibilityState === "visible");
  document.addEventListener("visibilitychange", visibility);
  return {
    setPolicy: (allowed) => controller.setPolicy(allowed),
    setScene: (spec) => controller.setScene(spec),
    stop() {
      unwatch();
      document.removeEventListener("visibilitychange", visibility);
      unsubscribe();
      controller.stop();
    },
  };
}
