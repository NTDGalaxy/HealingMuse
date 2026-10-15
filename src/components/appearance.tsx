"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import type { Appearance, GardenPreference, GardenTheme } from "@/lib/garden/config";
import { useApp } from "./app-state";
import { Dialog } from "./dialog";

type Preferences = { appearance: Appearance; garden: GardenPreference; theme: GardenTheme };
const Context = createContext<
  | (Preferences & {
      setAppearance: (value: Appearance) => void;
      setGarden: (value: GardenPreference) => void;
    })
  | null
>(null);
const key = "healingmuse-appearance-v1";
export const appearanceBootstrap = `(function(){try{var p=JSON.parse(localStorage.getItem('${key}')||'{}');var a=['day','night'].includes(p.appearance)?p.appearance:'system';document.documentElement.dataset.theme=a==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'night':'day'):a;document.documentElement.dataset.garden=p.garden==='still'?'still':'auto';}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'night':'day';}})();`;

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>({
    appearance: "system",
    garden: "auto",
    theme: "day",
  });
  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)");
    const load = () => {
      let appearance: Appearance = "system";
      let garden: GardenPreference = "auto";
      try {
        const stored = JSON.parse(localStorage.getItem(key) || "{}");
        if (["day", "night"].includes(stored.appearance)) appearance = stored.appearance;
        if (stored.garden === "still") garden = "still";
      } catch {
        /* Preferences remain usable for this visit. */
      }
      setPreferences({
        appearance,
        garden,
        theme: appearance === "system" ? (system.matches ? "night" : "day") : appearance,
      });
    };
    let active = true;
    queueMicrotask(() => {
      if (active) {
        load();
        setLoaded(true);
      }
    });
    const systemChanged = () =>
      setPreferences((current) => ({
        ...current,
        theme:
          current.appearance === "system" ? (system.matches ? "night" : "day") : current.appearance,
      }));
    system.addEventListener("change", systemChanged);
    window.addEventListener("storage", load);
    return () => {
      active = false;
      system.removeEventListener("change", systemChanged);
      window.removeEventListener("storage", load);
    };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.dataset.garden = preferences.garden;
  }, [preferences, loaded]);
  const update = (patch: Partial<Pick<Preferences, "appearance" | "garden">>) => {
    const next = { ...preferences, ...patch };
    next.theme =
      next.appearance === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "night"
          : "day"
        : next.appearance;
    setPreferences(next);
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ appearance: next.appearance, garden: next.garden }),
      );
    } catch {
      /* Session-only fallback. */
    }
  };
  return (
    <Context.Provider
      value={{
        ...preferences,
        setAppearance: (appearance) => update({ appearance }),
        setGarden: (garden) => update({ garden }),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAppearance() {
  const value = useContext(Context);
  if (!value) throw new Error("AppearanceProvider is required");
  return value;
}
export function AppearanceControls() {
  const t = useTranslations("appearance");
  const preferences = useAppearance();
  const app = useApp();
  return (
    <div className="appearance-controls">
      <label>
        {t("theme")}
        <select
          aria-label={t("theme")}
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
        <span>
          <strong>{t("calm")}</strong>
          <span className="muted">{t("calmHelp")}</span>
        </span>
        <input
          type="checkbox"
          className="switch"
          checked={app.calm}
          onChange={(event) => void app.setCalm(event.target.checked)}
        />
      </label>
      <p className="small muted">{t("help")}</p>
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
