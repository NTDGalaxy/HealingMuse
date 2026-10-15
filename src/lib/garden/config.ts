export type GardenTheme = "day" | "night";
export type Appearance = "system" | GardenTheme;
export type GardenPreference = "auto" | "still";
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
} as const;
export type GardenId = keyof typeof gardens;
const routes: Record<string, GardenId> = {
  "": "lotus",
  explore: "fern",
  "brainwave-entrainment": "moonflower",
  library: "wisteria",
  downloads: "seed",
  mood: "lily",
  settings: "bonsai",
  admin: "propagation",
  "reset-password": "orchid",
  privacy: "cloister",
  terms: "cypress",
  credits: "sculpture",
};
export const gardenForPath = (pathname: string): GardenId =>
  routes[pathname.split("/")[2] ?? ""] ?? "cloister";
export type GardenQuality = { tier: number; fps: number; pixelRatio: number };
export function initialQuality(mobile: boolean): GardenQuality {
  return { tier: 2, fps: mobile ? 30 : 60, pixelRatio: mobile ? 1 : 1.5 };
}
// Downgrade only, with a six-second observation window. Never oscillate during a visit.
export function lowerQuality(current: GardenQuality): GardenQuality | null {
  if (current.tier === 0) return null;
  return { tier: current.tier - 1, fps: 24, pixelRatio: current.tier === 2 ? 0.8 : 0.6 };
}
export type GardenCommand =
  | {
      type: "init";
      canvas: OffscreenCanvas;
      width: number;
      height: number;
      theme: GardenTheme;
      garden: GardenId;
    }
  | { type: "resize"; width: number; height: number }
  | { type: "scene"; garden: GardenId; theme: GardenTheme }
  | { type: "visible"; value: boolean }
  | { type: "dispose" };
export type GardenEvent =
  { type: "ready" | "failed" | "still" } | { type: "quality"; tier: number };
