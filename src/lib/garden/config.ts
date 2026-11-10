import type { SceneId } from "../routes";

export type { Appearance, GardenPreference, GardenTheme } from "../preferences";
/** The light forms one shared interpreter draws (src/lib/garden/scene.ts). */
export type SceneForm = "rings" | "meter" | "waves" | "orbits" | "grid" | "ripples" | "prisms";
type GardenDefinition = { readonly form: SceneForm; readonly seed: number };
// Scene ids stay the route keys the posters, service worker and routes already use; each names
// a light form and the seed that makes it its own.
export const gardens = {
  lotus: { form: "rings", seed: 1 },
  fern: { form: "meter", seed: 2 },
  moonflower: { form: "waves", seed: 3 },
  wisteria: { form: "orbits", seed: 4 },
  seed: { form: "grid", seed: 5 },
  lily: { form: "ripples", seed: 6 },
  bonsai: { form: "prisms", seed: 7 },
  propagation: { form: "grid", seed: 8 },
  orchid: { form: "rings", seed: 9 },
  cloister: { form: "ripples", seed: 10 },
  cypress: { form: "meter", seed: 11 },
  sculpture: { form: "orbits", seed: 12 },
} as const satisfies Record<SceneId, GardenDefinition>;
export type GardenId = keyof typeof gardens;
/** Detail tiers: 2 is full detail; quality only ever steps down during a visit. */
export type QualityTier = 0 | 1 | 2;
export type GardenQuality = { tier: QualityTier; fps: number; pixelRatio: number };
export function initialQuality(mobile: boolean): GardenQuality {
  return { tier: 2, fps: mobile ? 30 : 60, pixelRatio: mobile ? 1 : 1.5 };
}
// Downgrade only, with a six-second observation window. Never oscillate during a visit.
export function lowerQuality(current: GardenQuality): GardenQuality | null {
  if (current.tier === 0) return null;
  return current.tier === 2
    ? { tier: 1, fps: 24, pixelRatio: 0.8 }
    : { tier: 0, fps: 24, pixelRatio: 0.6 };
}
