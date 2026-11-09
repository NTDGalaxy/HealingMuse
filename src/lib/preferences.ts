// Device preferences for appearance, garden detail and Calm mode.
// Keep this module free of imports and non-erasable syntax: the storage formats are shared with
// the pre-paint bootstrap below and the offline shell, and Node scripts may load it natively.
// Storage formats are a compatibility contract with every browser that already saved them.

export const appearanceKey = "healingmuse-appearance-v1";
export const calmKey = "healingmuse-calm";

export const gardenThemes = ["day", "night"] as const;
export type GardenTheme = (typeof gardenThemes)[number];
export const appearances = ["system", ...gardenThemes] as const;
export type Appearance = (typeof appearances)[number];
export const gardenPreferences = ["auto", "still"] as const;
export type GardenPreference = (typeof gardenPreferences)[number];

export const darkSchemeQuery = "(prefers-color-scheme: dark)";
export const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

/** The value stored under appearanceKey. */
export type StoredAppearance = { appearance: Appearance; garden: GardenPreference };
export const defaultAppearance: StoredAppearance = { appearance: "system", garden: "auto" };

export function isGardenTheme(value: unknown): value is GardenTheme {
  return gardenThemes.includes(value as GardenTheme);
}
export function isGardenPreference(value: unknown): value is GardenPreference {
  return gardenPreferences.includes(value as GardenPreference);
}

/** Reads a stored appearance; anything unreadable falls back to following the device. */
export function parseAppearance(raw: string | null): StoredAppearance {
  let stored: unknown;
  try {
    stored = JSON.parse(raw || "{}");
  } catch {
    return { ...defaultAppearance };
  }
  const value = typeof stored === "object" && stored !== null ? stored : {};
  const { appearance, garden } = value as { appearance?: unknown; garden?: unknown };
  return {
    appearance: isGardenTheme(appearance) ? appearance : "system",
    garden: garden === "still" ? "still" : "auto",
  };
}
export function serializeAppearance({ appearance, garden }: StoredAppearance): string {
  return JSON.stringify({ appearance, garden });
}
export function parseCalm(raw: string | null): boolean {
  return raw === "true";
}
export function serializeCalm(value: boolean): string {
  return String(value);
}
export function resolveTheme(appearance: Appearance, prefersDark: boolean): GardenTheme {
  return appearance === "system" ? (prefersDark ? "night" : "day") : appearance;
}

const literal = (value: unknown) => JSON.stringify(value);
/**
 * Inline <head> script that applies the stored preferences to <html> before first paint, so the
 * server markup never flashes the wrong theme. It mirrors parseAppearance, parseCalm and
 * resolveTheme (tests/unit/preferences.test.ts proves they agree) and sets data-theme,
 * data-garden and data-calm, which the preferences store reads as its first client snapshot.
 */
export const appearanceBootstrap =
  "(function(){var d=document.documentElement.dataset,p={},c=false,n=false,a;" +
  `try{c=localStorage.getItem(${literal(calmKey)})===${literal(serializeCalm(true))}}catch(e){}` +
  `try{p=JSON.parse(localStorage.getItem(${literal(appearanceKey)})||"{}")||{}}catch(e){}` +
  `try{n=matchMedia(${literal(darkSchemeQuery)}).matches}catch(e){}` +
  `a=${literal(gardenThemes)}.indexOf(p.appearance)<0?"system":p.appearance;` +
  `d.calm=String(c);d.theme=a==="system"?(n?"night":"day"):a;` +
  `d.garden=p.garden==="still"?"still":"auto"})();`;
