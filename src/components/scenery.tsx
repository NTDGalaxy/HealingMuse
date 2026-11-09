"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { gardenForPath } from "@/lib/garden/config";
import {
  createGardenController,
  type GardenController,
  type GardenState,
} from "@/lib/garden/controller";
import type { SceneSpec } from "@/lib/garden/protocol";
import { mainThreadRenderer, workerRenderer } from "@/lib/garden/renderers";
import { readViewport, watchViewport } from "@/lib/garden/viewport";
import { decorationMarks, decorationMayStart } from "@/lib/perf/audio-first";
import { usePreference } from "./appearance";
import { useMotionPolicy } from "./motion-policy";
const GardenMotion = dynamic(() => import("./garden-motion"), { ssr: false });

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

/** Turns true once decoration may start (audio-first), then stays true for this mount. */
function useDecorationAllowed() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const wait = new AbortController();
    void decorationMayStart({ signal: wait.signal }).then((value) => value && setAllowed(true));
    return () => wait.abort();
  }, []);
  return allowed;
}

export function Scenery({ pathname }: { pathname: string }) {
  const policy = useMotionPolicy();
  const decorated = useDecorationAllowed();
  const theme = usePreference((value) => value.theme);
  const garden = gardenForPath(pathname);
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<GardenController | null>(null);
  const scene = useRef<SceneSpec>({ garden, theme });
  useEffect(() => {
    scene.current = { garden, theme };
    controller.current?.setScene(scene.current);
  }, [garden, theme]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const instance = createGardenController({
      renderers: { worker: workerRenderer(element), main: mainThreadRenderer(element) },
      decoration: (signal) => decorationMayStart({ signal }),
      mark: () => performance.mark(decorationMarks.scene),
      scene: scene.current,
      viewport: readViewport(),
      visible: document.visibilityState === "visible",
    });
    controller.current = instance;
    let previous = instance.getSnapshot();
    const unsubscribe = instance.subscribe(() => {
      const next = instance.getSnapshot();
      reflect(element, next, previous);
      previous = next;
    });
    const unwatch = watchViewport((viewport) => instance.resize(viewport));
    const visibility = () => instance.setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", visibility);
    return () => {
      unwatch();
      document.removeEventListener("visibilitychange", visibility);
      unsubscribe();
      instance.stop();
      controller.current = null;
    };
  }, []);
  // After the controller exists: the policy starts it, stills it or restarts it.
  useEffect(() => controller.current?.setPolicy(policy.scene), [policy.scene]);
  return (
    <>
      <div
        id="sanctuary-scenery"
        className={`sanctuary-scenery garden-${garden}`}
        aria-hidden="true"
        data-garden={garden}
        data-engine="healingmuse-garden-host"
      >
        {(["day", "night"] as const).map((variant) => (
          <picture className={`garden-poster poster-${variant}`} key={`${garden}-${variant}`}>
            <source
              media="(max-width: 700px)"
              srcSet={`/gardens/${garden}-${variant}-480.avif`}
              type="image/avif"
            />
            <source srcSet={`/gardens/${garden}-${variant}-1440.avif`} type="image/avif" />
            <img
              src={`/gardens/${garden}-${variant}-1440.webp`}
              alt=""
              width={1440}
              height={1000}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
            />
          </picture>
        ))}
        <div className="garden-canvas" ref={host} data-state="waiting" />
      </div>
      {/* decorated is false through hydration, so the live policy never picks hydrated markup. */}
      {decorated && policy.reveals && <GardenMotion pathname={pathname} />}
    </>
  );
}
