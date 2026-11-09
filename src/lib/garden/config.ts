import { fallbackScene, routeForPath, type SceneId } from "../routes";

export type { Appearance, GardenPreference, GardenTheme } from "../preferences";
type GardenDefinition = { readonly plant: string; readonly form: string; readonly seed: number };
export const gardens = {
  lotus: { plant: "lotus", form: "court", seed: 1 },
  fern: { plant: "fern", form: "ravine", seed: 2 },
  moonflower: { plant: "flower", form: "bowl", seed: 3 },
  wisteria: { plant: "wisteria", form: "arbor", seed: 4 },
  seed: { plant: "seed", form: "glasshouse", seed: 5 },
  lily: { plant: "lotus", form: "pool", seed: 6 },
  bonsai: { plant: "bonsai", form: "court", seed: 7 },
  propagation: { plant: "fern", form: "glasshouse", seed: 8 },
  orchid: { plant: "flower", form: "arbor", seed: 9 },
  cloister: { plant: "fern", form: "arbor", seed: 10 },
  cypress: { plant: "cypress", form: "court", seed: 11 },
  sculpture: { plant: "flower", form: "gallery", seed: 12 },
} as const satisfies Record<SceneId, GardenDefinition>;
export type GardenId = keyof typeof gardens;
export const gardenForPath = (pathname: string): GardenId =>
  routeForPath(pathname)?.scene ?? fallbackScene;
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
