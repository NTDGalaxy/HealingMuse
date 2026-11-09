"use client";
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { gardenForPath } from "@/lib/garden/route";
import type { SceneSpec } from "@/lib/garden/protocol";
import type { GardenRuntime } from "@/lib/garden/runtime";
import { decorationMayStart } from "@/lib/perf/audio-first";
import { usePreference } from "./appearance";
import { useMotionPolicy } from "./motion-policy";

// Startup keeps only the markup, the motion policy and the audio-first wait. The scene runtime
// and the GSAP layer are imported only when the policy allows them and decorationMayStart()
// resolves, and they wait for it again every time the policy allows them again. Neither goes
// through next/dynamic: decoration is optional, so a chunk that fails to load (offline, or after
// a newer deploy) leaves the poster instead of throwing into React, where it would replace the
// whole application.

/** Renders `children` once decorationMayStart() resolves after it mounts; unmounting aborts. */
function AfterDecoration({ children }: { children: ReactNode }) {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const wait = new AbortController();
    void decorationMayStart({ signal: wait.signal }).then((value) => value && setAllowed(true));
    return () => wait.abort();
  }, []);
  return allowed ? children : null;
}

// A failed import resolves to a layer that renders nothing, so it never reaches an error boundary.
const GardenMotion = lazy(() => import("./garden-motion").catch(() => ({ default: () => null })));

export function Scenery({ pathname }: { pathname: string }) {
  const policy = useMotionPolicy();
  const theme = usePreference((value) => value.theme);
  const garden = gardenForPath(pathname);
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<GardenRuntime | null>(null);
  const scene = useRef<SceneSpec>({ garden, theme });
  useEffect(() => {
    scene.current = { garden, theme };
    runtime.current?.setScene(scene.current);
  }, [garden, theme]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    // Once loaded, the runtime's controller follows the policy and waits for decoration itself.
    if (runtime.current) {
      runtime.current.setPolicy(policy.scene);
      return;
    }
    element.dataset.state = policy.scene ? "waiting" : "still";
    if (!policy.scene) return;
    const wait = new AbortController();
    let active = true;
    decorationMayStart({ signal: wait.signal })
      .then((allowed) => (allowed ? import("@/lib/garden/runtime") : null))
      .then((module) => {
        if (!module || !active) return;
        runtime.current = module.startGardenRuntime(element, scene.current);
        runtime.current.setPolicy(true);
      })
      .catch(() => {
        if (active) element.dataset.state = "still";
      });
    return () => {
      active = false;
      wait.abort();
    };
  }, [policy.scene]);
  useEffect(
    () => () => {
      runtime.current?.stop();
      runtime.current = null;
    },
    [],
  );
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
      {/* A new wait for every policy that allows the layer; nothing renders through hydration. */}
      {policy.reveals && (
        <AfterDecoration key={policy.parallax ? "parallax" : "still"}>
          <Suspense fallback={null}>
            <GardenMotion pathname={pathname} />
          </Suspense>
        </AfterDecoration>
      )}
    </>
  );
}
