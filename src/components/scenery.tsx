"use client";
import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { gardenForPath } from "@/lib/garden/config";
import {
  gardenProtocol,
  readWorkerMessage,
  type HostCommand,
  type RendererEvent,
} from "@/lib/garden/protocol";
import type { Garden } from "@/lib/garden/scene";
import { usePreference } from "./appearance";
import { useMotionPolicy } from "./motion-policy";
const GardenMotion = dynamic(() => import("./garden-motion"), { ssr: false });
export function Scenery({ pathname }: { pathname: string }) {
  const policy = useMotionPolicy();
  const theme = usePreference((value) => value.theme);
  const garden = gardenForPath(pathname);
  const host = useRef<HTMLDivElement>(null),
    worker = useRef<Worker | null>(null);
  const renderer = useRef<Garden | null>(null);
  const latest = useRef({ garden, theme });
  useEffect(() => {
    latest.current = { garden, theme };
    worker.current?.postMessage({ type: "scene", scene: latest.current } satisfies HostCommand);
    renderer.current?.change(latest.current);
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
    const event = (message: RendererEvent) => {
      if (stopped) return;
      if (message.type === "ready") {
        clearTimeout(timeout);
        element.dataset.state = "ready";
        element.dataset.readyMs = String(Math.round(performance.now()));
        worker.current?.postMessage({
          type: "visible",
          value: document.visibilityState === "visible",
        } satisfies HostCommand);
      } else if (message.type === "quality") element.dataset.quality = String(message.tier);
      else poster();
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
            renderer.current = createGarden(target, {
              viewport: { width: innerWidth, height: innerHeight },
              scene: latest.current,
              onEvent: event,
              lowPower: true,
            });
            event({ type: "ready" });
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
      if (!policy.scene) {
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
          instance.onmessage = (message: MessageEvent<unknown>) => {
            if (stopped || worker.current !== instance) return;
            const data = readWorkerMessage(message.data);
            const failure = data.type === "failed" || data.type === "lost";
            if (failure && element.dataset.state === "starting") startMain();
            else event(data);
          };
          instance.onerror = () => {
            if (stopped || worker.current !== instance) return;
            if (element.dataset.state === "starting") startMain();
            else poster();
          };
          instance.postMessage(
            {
              type: "init",
              protocol: gardenProtocol,
              canvas: offscreen,
              viewport: { width: innerWidth, height: innerHeight },
              scene: latest.current,
            } satisfies HostCommand,
            [offscreen],
          );
          timeout = setTimeout(poster, 8000);
        } catch {
          startMain();
        }
      } else startMain();
    };
    const resize = () => {
      const viewport = { width: innerWidth, height: innerHeight };
      worker.current?.postMessage({ type: "resize", viewport } satisfies HostCommand);
      renderer.current?.resize(viewport);
    };
    const visibility = () => {
      const value = document.visibilityState === "visible";
      worker.current?.postMessage({ type: "visible", value } satisfies HostCommand);
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
    // A policy change restarts or stills the scene.
  }, [policy.scene]);
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
      <GardenMotion pathname={pathname} />
    </>
  );
}
