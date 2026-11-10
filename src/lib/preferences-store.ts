import {
  appearanceKey,
  calmKey,
  darkSchemeQuery,
  isGardenPreference,
  isGardenTheme,
  parseAppearance,
  parseCalm,
  reducedMotionQuery,
  resolveTheme,
  serializeAppearance,
  serializeCalm,
  type Appearance,
  type GardenPreference,
  type GardenTheme,
} from "./preferences";
import type { ReadableStore } from "./state/create-store";

/** Every reader of Calm, Still, theme, reduced motion and Save-Data goes through this snapshot. */
export type PreferencesSnapshot = Readonly<{
  appearance: Appearance;
  garden: GardenPreference;
  theme: GardenTheme;
  calm: boolean;
  reducedMotion: boolean;
  saveData: boolean;
}>;

/** What the server renders: it cannot see device storage or media queries. */
export const defaultPreferences: PreferencesSnapshot = Object.freeze({
  appearance: "system",
  garden: "auto",
  theme: "day",
  calm: false,
  reducedMotion: false,
  saveData: false,
});

/** Mirrors a Calm change into the signed-in account; called after the device copy is saved. */
export type CalmSync = (value: boolean) => Promise<unknown> | void;

export type PreferencesStore = ReadableStore<PreferencesSnapshot> & {
  getServerSnapshot(): PreferencesSnapshot;
  setAppearance(appearance: Appearance): void;
  setGarden(garden: GardenPreference): void;
  /** Saves Calm on this device, then hands it to the registered account sync. */
  setCalm(value: boolean): Promise<void>;
  /** Shows Calm from the signed-in profile without overwriting this device's own choice. */
  adoptCalm(value: boolean): void;
  setCalmSync(sync: CalmSync): () => void;
  /** Follows other tabs, the device colour scheme, reduced motion and Save-Data. */
  start(): () => void;
};

type Connection = EventTarget & { saveData?: boolean };
const connection = () =>
  typeof navigator === "undefined"
    ? undefined
    : (navigator as Navigator & { connection?: Connection }).connection;
function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Session-only preference: it still applies for this visit. */
  }
}
function query(media: string): MediaQueryList | null {
  try {
    return matchMedia(media);
  } catch {
    return null;
  }
}

export function createPreferencesStore(): PreferencesStore {
  let snapshot: PreferencesSnapshot | null = null;
  let calmSync: CalmSync | null = null;
  const listeners = new Set<() => void>();

  // The first client snapshot is what the pre-paint bootstrap applied to <html>, so the page
  // that is already on screen and the store agree from the first client render.
  const initial = (): PreferencesSnapshot => {
    const root = document.documentElement.dataset;
    const stored = parseAppearance(read(appearanceKey));
    return {
      appearance: stored.appearance,
      garden: isGardenPreference(root.garden) ? root.garden : stored.garden,
      theme: isGardenTheme(root.theme)
        ? root.theme
        : resolveTheme(stored.appearance, query(darkSchemeQuery)?.matches ?? false),
      calm:
        root.calm === "true" || root.calm === "false"
          ? root.calm === "true"
          : parseCalm(read(calmKey)),
      reducedMotion: query(reducedMotionQuery)?.matches ?? false,
      saveData: connection()?.saveData === true,
    };
  };
  const getSnapshot = () =>
    typeof document === "undefined" ? defaultPreferences : (snapshot ??= initial());

  // Only attributes that differ are written, so unchanged values cause no style work.
  const apply = (next: PreferencesSnapshot) => {
    const root = document.documentElement.dataset;
    if (root.theme !== next.theme) root.theme = next.theme;
    if (root.garden !== next.garden) root.garden = next.garden;
    if (root.calm !== String(next.calm)) root.calm = String(next.calm);
  };
  const update = (patch: Partial<PreferencesSnapshot>) => {
    const current = getSnapshot();
    const keys = Object.keys(patch) as (keyof PreferencesSnapshot)[];
    if (keys.every((key) => current[key] === patch[key])) return;
    const next = { ...current, ...patch };
    apply(next);
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };
  const prefersDark = () => query(darkSchemeQuery)?.matches ?? false;

  return {
    getSnapshot,
    getServerSnapshot: () => defaultPreferences,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setAppearance(appearance) {
      update({ appearance, theme: resolveTheme(appearance, prefersDark()) });
      write(appearanceKey, serializeAppearance({ appearance, garden: getSnapshot().garden }));
    },
    setGarden(garden) {
      update({ garden });
      write(appearanceKey, serializeAppearance({ appearance: getSnapshot().appearance, garden }));
    },
    async setCalm(value) {
      update({ calm: value });
      write(calmKey, serializeCalm(value));
      await calmSync?.(value);
    },
    adoptCalm(value) {
      update({ calm: value });
    },
    setCalmSync(sync) {
      calmSync = sync;
      return () => {
        if (calmSync === sync) calmSync = null;
      };
    },
    start() {
      const system = query(darkSchemeQuery);
      const reduced = query(reducedMotionQuery);
      const network = connection();
      // Without the bootstrap (an embedding harness), this is where <html> learns the values.
      apply(getSnapshot());
      const followSystem = () => {
        const { appearance } = getSnapshot();
        update({ theme: resolveTheme(appearance, system?.matches ?? false) });
      };
      const followReduced = () => update({ reducedMotion: reduced?.matches ?? false });
      const followNetwork = () => update({ saveData: network?.saveData === true });
      const followStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === appearanceKey) {
          const stored = parseAppearance(read(appearanceKey));
          update({ ...stored, theme: resolveTheme(stored.appearance, prefersDark()) });
        }
        if (event.key === null || event.key === calmKey) update({ calm: parseCalm(read(calmKey)) });
      };
      followReduced();
      followNetwork();
      system?.addEventListener("change", followSystem);
      reduced?.addEventListener("change", followReduced);
      network?.addEventListener("change", followNetwork);
      window.addEventListener("storage", followStorage);
      return () => {
        system?.removeEventListener("change", followSystem);
        reduced?.removeEventListener("change", followReduced);
        network?.removeEventListener("change", followNetwork);
        window.removeEventListener("storage", followStorage);
      };
    },
  };
}
