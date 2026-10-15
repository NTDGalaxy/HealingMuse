export const modes = {
  beta: { min: 14, max: 30, presets: [16, 20, 25] },
  alpha: { min: 8, max: 13, presets: [8, 10, 12] },
  theta: { min: 4, max: 7, presets: [4, 6, 7] },
  delta: { min: 0.5, max: 3, presets: [1, 2, 3] },
} as const;
export type BinauralMode = keyof typeof modes;
export interface BinauralConfig {
  mode: BinauralMode;
  beatHz: number;
  carrierHz: number;
  durationSeconds: number;
  masterVolume: number;
  toneVolume: number;
  backgroundVolume: number;
}
export const defaultConfig: BinauralConfig = {
  mode: "alpha",
  beatHz: 10,
  carrierHz: 200,
  durationSeconds: 900,
  masterVolume: 0.6,
  toneVolume: 0.2,
  backgroundVolume: 0.2,
};
export function validateConfig(config: BinauralConfig): BinauralConfig {
  const mode = modes[config.mode];
  const inRange = (value: number, min: number, max: number) =>
    Number.isFinite(value) && value >= min && value <= max;
  if (
    !mode ||
    !inRange(config.beatHz, mode.min, mode.max) ||
    !inRange(config.carrierHz, 100, 500) ||
    !Number.isInteger(config.durationSeconds) ||
    !inRange(config.durationSeconds, 60, 7200) ||
    ![config.masterVolume, config.toneVolume, config.backgroundVolume].every((value) =>
      inRange(value, 0, 1),
    )
  )
    throw new Error("invalid_binaural_configuration");
  return {
    mode: config.mode,
    beatHz: config.beatHz,
    carrierHz: config.carrierHz,
    durationSeconds: config.durationSeconds,
    masterVolume: config.masterVolume,
    toneVolume: config.toneVolume,
    backgroundVolume: config.backgroundVolume,
  };
}
export function frequencies(config: BinauralConfig) {
  validateConfig(config);
  return {
    left: config.carrierHz,
    right: config.carrierHz + config.beatHz,
    difference: config.beatHz,
  };
}
export const presetId = (mode: BinauralMode, frequency: number) => `${mode}:${frequency}`;
export interface BinauralPreferences {
  version: 1;
  config: BinauralConfig;
  favorites: string[];
  backgroundId: string | null;
}
export const preferenceKey = "healingmuse-binaural-preferences-v1";
export function parsePreferences(raw: string | null): BinauralPreferences | null {
  try {
    if (!raw || raw.length > 4096) return null;
    const value = JSON.parse(raw);
    if (
      value.version !== 1 ||
      !Array.isArray(value.favorites) ||
      value.favorites.length > 12 ||
      (value.backgroundId !== null &&
        !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value.backgroundId))
    )
      return null;
    const validIds = new Set(
      Object.entries(modes).flatMap(([mode, data]) => data.presets.map((hz) => `${mode}:${hz}`)),
    );
    if (value.favorites.some((id: unknown) => typeof id !== "string" || !validIds.has(id)))
      return null;
    return {
      version: 1,
      config: validateConfig(value.config),
      favorites: [...new Set<string>(value.favorites)],
      backgroundId: value.backgroundId,
    };
  } catch {
    return null;
  }
}
