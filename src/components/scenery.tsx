"use client";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { gardenForPath } from "@/lib/garden/route";
import type { SceneSpec } from "@/lib/garden/protocol";
import type { GardenRuntime } from "@/lib/garden/runtime";
import { decorationMayStart } from "@/lib/perf/audio-first";
import { usePreference } from "./appearance";
import { useMotionPolicy } from "./motion-policy";

// Startup keeps only the markup, the motion policy and the audio-first wait. The scene runtime
// and the GSAP layer are imported once decoration may start, and only when the policy allows
// them. Neither goes through next/dynamic: decoration is optional, so a chunk that fails to load
// (offline, or after a newer deploy) leaves the poster instead of throwing into React, where it
// would replace the whole application.

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

// A failed import resolves to a layer that renders nothing, so it never reaches an error boundary.
const GardenMotion = lazy(() => import("./garden-motion").catch(() => ({ default: () => null })));

export function Scenery({ pathname }: { pathname: string }) {
  const policy = useMotionPolicy();
  const decorated = useDecorationAllowed();
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
    if (!policy.scene || !decorated) return;
    let active = true;
    import("@/lib/garden/runtime")
      .then(({ startGardenRuntime }) => {
        if (!active) return;
        runtime.current = startGardenRuntime(element, scene.current);
        runtime.current.setPolicy(true);
      })
      .catch(() => {
        if (active) element.dataset.state = "still";
      });
    return () => {
      active = false;
    };
  }, [policy.scene, decorated]);
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
      {/* decorated is false through hydration, so the live policy never picks hydrated markup. */}
      {decorated && policy.reveals && (
        <Suspense fallback={null}>
          <GardenMotion pathname={pathname} />
        </Suspense>
      )}
    </>
  );
}
