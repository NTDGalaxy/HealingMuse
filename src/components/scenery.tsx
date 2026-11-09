"use client";
import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { gardenForPath, type GardenCommand, type GardenEvent } from "@/lib/garden/config";
import type { createGarden } from "@/lib/garden/scene";
import { usePreference, usePreferencesStore } from "./appearance";
const GardenMotion = dynamic(() => import("./garden-motion"), { ssr: false });
export function Scenery({ pathname }: { pathname: string }) {
  const preferences = usePreferencesStore();
  const theme = usePreference((value) => value.theme);
  const calm = usePreference((value) => value.calm);
  const still = usePreference((value) => value.garden === "still");
  const reducedMotion = usePreference((value) => value.reducedMotion);
  const saveData = usePreference((value) => value.saveData);
  const garden = gardenForPath(pathname);
  const host = useRef<HTMLDivElement>(null),
    worker = useRef<Worker | null>(null);
  const renderer = useRef<ReturnType<typeof createGarden> | null>(null);
  const latest = useRef({ garden, theme });
  useEffect(() => {
    latest.current = { garden, theme };
    worker.current?.postMessage({ type: "scene", garden, theme } satisfies GardenCommand);
    renderer.current?.change(garden, theme);
  }, [garden, theme]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let stopped = false,
      activeCanvas: HTMLCanvasElement | null = null,
      timeout: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      clearTimeout(timeout);
      worker.current?.terminate();
      worker.current = null;
      renderer.current?.dispose();
      renderer.current = null;
      activeCanvas?.remove();
      activeCanvas = null;
    };
    const poster = () => {
      if (stopped) return;
      clear();
      element.dataset.state = "still";
      delete element.dataset.readyMs;
      delete element.dataset.renderer;
    };
    const canvas = () => {
      activeCanvas = document.createElement("canvas");
      activeCanvas.setAttribute("aria-hidden", "true");
      element.append(activeCanvas);
      return activeCanvas;
    };
    const event = (message: GardenEvent) => {
      if (stopped) return;
      if (message.type === "ready") {
        clearTimeout(timeout);
        element.dataset.state = "ready";
        element.dataset.readyMs = String(Math.round(performance.now()));
        worker.current?.postMessage({
          type: "visible",
          value: document.visibilityState === "visible",
        } satisfies GardenCommand);
      } else if (message.type === "still" || message.type === "failed") poster();
      else if (message.type === "quality") element.dataset.quality = String(message.tier);
    };
    const startMain = () => {
      if (stopped) return;
      clear();
      element.dataset.renderer = "main";
      const target = canvas();
      void import("@/lib/garden/scene")
        .then(({ createGarden }) => {
          if (stopped || target !== activeCanvas) return;
          try {
            renderer.current = createGarden(
              target,
              innerWidth,
              innerHeight,
              latest.current.theme,
              latest.current.garden,
              event,
              false,
              true,
            );
            renderer.current.visible(document.visibilityState === "visible");
          } catch {
            poster();
          }
        })
        .catch(poster);
      timeout = setTimeout(poster, 8000);
    };
    const configure = () => {
      if (stopped) return;
      clear();
      delete element.dataset.readyMs;
      delete element.dataset.quality;
      // Read the live snapshot: right after hydration the rendered values are still the
      // server defaults, and a stored Calm or Still must never start the 3D scene.
      const current = preferences.getSnapshot();
      if (current.calm || current.reducedMotion || current.garden === "still" || current.saveData) {
        poster();
        return;
      }
      element.dataset.state = "starting";
      const target = canvas();
      if (typeof Worker !== "undefined" && "transferControlToOffscreen" in target) {
        try {
          const offscreen = target.transferControlToOffscreen();
          const instance = new Worker(new URL("../lib/garden/worker.ts", import.meta.url), {
            type: "module",
          });
          worker.current = instance;
          element.dataset.renderer = "worker";
          instance.onmessage = (message: MessageEvent<GardenEvent>) => {
            if (stopped || worker.current !== instance) return;
            if (message.data.type === "failed" && element.dataset.state === "starting") startMain();
            else event(message.data);
          };
          instance.onerror = () => {
            if (stopped || worker.current !== instance) return;
            if (element.dataset.state === "starting") startMain();
            else poster();
          };
          instance.postMessage(
            {
              type: "init",
              canvas: offscreen,
              width: innerWidth,
              height: innerHeight,
              ...latest.current,
            } satisfies GardenCommand,
            [offscreen],
          );
          timeout = setTimeout(poster, 8000);
        } catch {
          startMain();
        }
      } else startMain();
    };
    const resize = () => {
      worker.current?.postMessage({
        type: "resize",
        width: innerWidth,
        height: innerHeight,
      } satisfies GardenCommand);
      renderer.current?.resize(innerWidth, innerHeight);
    };
    const visibility = () => {
      const value = document.visibilityState === "visible";
      worker.current?.postMessage({ type: "visible", value } satisfies GardenCommand);
      renderer.current?.visible(value);
    };
    configure();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stopped = true;
      clear();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibility);
    };
    // Each preference is a dependency so a change restarts or stills the scene.
  }, [preferences, calm, still, reducedMotion, saveData]);
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
        <div className="garden-canvas" ref={host} data-state="starting" />
      </div>
      <GardenMotion pathname={pathname} calm={calm} still={still} />
    </>
  );
}
