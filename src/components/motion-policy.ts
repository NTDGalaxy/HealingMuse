"use client";
import { useSyncExternalStore } from "react";
import { motionPolicy, type MotionPolicy } from "@/lib/motion-policy";
import { usePreferencesStore } from "./appearance";

/**
 * The decorative-motion policy (src/lib/motion-policy.ts) for the garden scene and the GSAP layer.
 * Hydration reads the live store rather than the server defaults, so the first effect after
 * hydration already honours a stored Calm, Still, reduced motion or Save-Data and neither the
 * scene nor the reveals start for a frame and then stop. The price: it drives effects only and
 * must never choose markup that is hydrated, or the client tree would differ from the server's.
 */
export function useMotionPolicy(): MotionPolicy {
  const store = usePreferencesStore();
  const read = () => motionPolicy(store.getSnapshot());
  return useSyncExternalStore(store.subscribe, read, read);
}
