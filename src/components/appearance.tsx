"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import type { Appearance, GardenPreference } from "@/lib/preferences";
import {
  createPreferencesStore,
  type PreferencesSnapshot,
  type PreferencesStore,
} from "@/lib/preferences-store";
import { useStore } from "@/lib/state/create-store";
import { Dialog } from "./dialog";
import { primaryControl } from "@/lib/perf/readiness";

export { appearanceBootstrap } from "@/lib/preferences";

const Context = createContext<PreferencesStore | null>(null);

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  // One store per provider instance; its first client snapshot comes from the bootstrap.
  const [store] = useState(createPreferencesStore);
  useEffect(() => store.start(), [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function usePreferencesStore() {
  const store = useContext(Context);
  if (!store) throw new Error("AppearanceProvider is required");
  return store;
}
/** Subscribes to one preference; the selector must return a primitive. */
export function usePreference<S>(selector: (preferences: PreferencesSnapshot) => S): S {
  return useStore(usePreferencesStore(), selector);
}
export function useAppearance() {
  const store = usePreferencesStore();
  const appearance = usePreference((preferences) => preferences.appearance);
  const garden = usePreference((preferences) => preferences.garden);
  const theme = usePreference((preferences) => preferences.theme);
  return useMemo(
    () => ({
      appearance,
      garden,
      theme,
      setAppearance: store.setAppearance,
      setGarden: store.setGarden,
    }),
    [appearance, garden, theme, store],
  );
}
export function AppearanceControls({ primary = false }: { primary?: boolean }) {
  const t = useTranslations("appearance");
  const preferences = useAppearance();
  const store = usePreferencesStore();
  const calm = usePreference((value) => value.calm);
  return (
    <div className="appearance-controls">
      <label>
        {t("theme")}
        <select
          aria-label={t("theme")}
          {...primaryControl(primary)}
          value={preferences.appearance}
          onChange={(event) => preferences.setAppearance(event.target.value as Appearance)}
        >
          {(["system", "day", "night"] as const).map((value) => (
            <option key={value} value={value}>
              {t(value)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("garden")}
        <select
          aria-label={t("garden")}
          value={preferences.garden}
          onChange={(event) => preferences.setGarden(event.target.value as GardenPreference)}
        >
          <option value="auto">{t("auto")}</option>
          <option value="still">{t("still")}</option>
        </select>
      </label>
      <label className="setting-row">
        <span data-part="setting-text">
          <strong>{t("calm")}</strong>
          <span className="muted" data-part="setting-help">
            {t("calmHelp")}
          </span>
        </span>
        <input
          type="checkbox"
          className="switch"
          checked={calm}
          onChange={(event) => void store.setCalm(event.target.checked)}
        />
      </label>
      <p className="muted">{t("help")}</p>
    </div>
  );
}
export function AppearanceButton() {
  const t = useTranslations("appearance");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="icon-button appearance-button"
        aria-label={t("title")}
        onClick={() => setOpen(true)}
      >
        <Sparkles size={20} aria-hidden="true" />
      </button>
      <Dialog open={open} onOpenChange={setOpen} title={t("title")}>
        <AppearanceControls />
      </Dialog>
    </>
  );
}
