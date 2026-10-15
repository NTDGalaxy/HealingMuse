"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/lib/browser/api";
import {
  defaultConfig,
  parsePreferences,
  preferenceKey,
  validateConfig,
  type BinauralConfig,
} from "@/lib/binaural/config";
import type { BinauralEngine, BinauralSnapshot } from "@/lib/binaural/engine";
import type { PlaybackGrant } from "@/lib/types";
import { usePlayer } from "./player";
import { useApp } from "./app-state";

const idleSnapshot: BinauralSnapshot = {
  status: "idle",
  config: defaultConfig,
  elapsedSeconds: 0,
  remainingSeconds: defaultConfig.durationSeconds,
  backgroundError: false,
};
const emptySubscribe = () => () => {};
const initialSnapshot = () => idleSnapshot;
function useController() {
  const app = useApp();
  const player = usePlayer();
  const { announce, downloaded } = app;
  const { playing, controlsHidden, setControlsHidden, registerOtherAudio, pauseForOtherAudio } =
    player;
  const t = useTranslations("binaural");
  const locale = useLocale();
  const pathname = usePathname();
  const onPage = /\/(?:en|vi)\/brainwave-entrainment$/.test(pathname);
  const [engine, setEngine] = useState<BinauralEngine | null>(null);
  const [engineUnavailable, setEngineUnavailable] = useState(false);
  const engineRef = useRef<BinauralEngine | null>(null);
  const initializing = useRef<Promise<void> | null>(null);
  const mounted = useRef(false);
  const [config, setConfig] = useState<BinauralConfig>({ ...defaultConfig });
  const [favorites, setFavorites] = useState<string[]>([]);
  const [remember, setRemember] = useState(false);
  const [backgroundId, setBackgroundId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const backgroundRequest = useMemo(
    () => ({ backgroundId, downloaded, refresh }),
    [backgroundId, downloaded, refresh],
  );
  const localBackground = downloaded.find(
    (item) => item.id === backgroundId && item.track.category === "instrumental",
  );
  const [delivery, setDelivery] = useState<{
    request: typeof backgroundRequest;
    unavailable: boolean;
  } | null>(null);
  const backgroundLoading =
    !!backgroundId && !localBackground && delivery?.request !== backgroundRequest;
  const backgroundUnavailable = delivery?.request === backgroundRequest && delivery.unavailable;
  const backgroundExpiry = useRef(Infinity);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const state = useSyncExternalStore(
    engine?.subscribe ?? emptySubscribe,
    engine?.getSnapshot ?? initialSnapshot,
    initialSnapshot,
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      engineRef.current?.dispose();
    };
  }, []);
  const initialize = useCallback(() => {
    if (!initializing.current)
      initializing.current = import("@/lib/binaural/engine")
        .then(({ BinauralEngine }) => {
          if (!mounted.current) return;
          setEngineUnavailable(false);
          const instance = new BinauralEngine();
          engineRef.current = instance;
          setEngine(instance);
          try {
            const saved = parsePreferences(localStorage.getItem(preferenceKey));
            if (saved) {
              setConfig(saved.config);
              setFavorites(saved.favorites);
              setBackgroundId(saved.backgroundId);
              setRemember(true);
            }
          } catch {
            setStorageUnavailable(true);
          }
        })
        .catch(() => {
          initializing.current = null;
          if (mounted.current) setEngineUnavailable(true);
        });
    return initializing.current;
  }, []);
  useEffect(() => {
    engine?.configure(config);
  }, [engine, config]);
  useEffect(() => {
    if (!engine) return;
    let cancelled = false;
    // Persist outside the render cycle and cancel superseded preference writes.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        if (remember)
          localStorage.setItem(
            preferenceKey,
            JSON.stringify({ version: 1, config, favorites, backgroundId }),
          );
        else localStorage.removeItem(preferenceKey);
      } catch {
        setStorageUnavailable(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [engine, remember, config, favorites, backgroundId]);
  useEffect(() => {
    if (!engine) return;
    const controller = new AbortController();
    let blob: string | null = null;
    engine.prepareBackground(null);
    backgroundExpiry.current = Infinity;
    if (!backgroundId) return;
    if (localBackground) {
      blob = URL.createObjectURL(localBackground.blob);
      engine.prepareBackground(blob);
    } else {
      void api<PlaybackGrant>(`/api/grants/${backgroundId}`, { signal: controller.signal })
        .then((grant) => {
          if (controller.signal.aborted) return;
          const expires = Date.parse(grant.expiresAt);
          if (!Number.isFinite(expires)) throw new Error("invalid_grant");
          backgroundExpiry.current = expires;
          engine.prepareBackground(grant.url);
          setDelivery({ request: backgroundRequest, unavailable: false });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setDelivery({ request: backgroundRequest, unavailable: true });
        });
    }
    return () => {
      controller.abort();
      if (blob) URL.revokeObjectURL(blob);
    };
  }, [engine, backgroundId, localBackground, backgroundRequest]);
  useLayoutEffect(() => {
    if (!onPage) engine?.pause();
    setControlsHidden(onPage && !playing);
    return () => setControlsHidden(false);
  }, [onPage, engine, state.status, playing, setControlsHidden]);
  useEffect(() => registerOtherAudio(() => engine?.pause()), [engine, registerOtherAudio]);
  useEffect(() => {
    const pause = () => engine?.pause("interrupted");
    window.addEventListener("pagehide", pause);
    return () => window.removeEventListener("pagehide", pause);
  }, [engine]);
  const start = useCallback(() => {
    if (!engine || backgroundLoading) return;
    if (backgroundId && !backgroundUnavailable && backgroundExpiry.current <= Date.now() + 5000) {
      setRefresh((value) => value + 1);
      return;
    }
    pauseForOtherAudio();
    void engine.start();
  }, [engine, backgroundLoading, backgroundId, backgroundUnavailable, pauseForOtherAudio]);
  const previousStatus = useRef(state.status);
  useEffect(() => {
    if (previousStatus.current === state.status) return;
    previousStatus.current = state.status;
    if (state.status === "completed") announce(t("completed"));
    else if (state.status === "interrupted") announce(t("interrupted"));
  }, [state.status, announce, t]);
  useEffect(() => {
    if (
      !onPage ||
      !controlsHidden ||
      !engine ||
      playing ||
      !["playing", "paused", "interrupted"].includes(state.status) ||
      !("mediaSession" in navigator)
    )
      return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t(`modes.${config.mode}.title`),
      artist: "HealingMuse",
      album: t("title"),
    });
    navigator.mediaSession.playbackState = state.status === "playing" ? "playing" : "paused";
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", start],
      ["pause", () => engine.pause()],
      ["stop", () => engine.stop()],
    ];
    for (const [name, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(name, handler);
      } catch {
        /* Optional browser control. */
      }
    }
    return () => {
      navigator.mediaSession.playbackState = "none";
      navigator.mediaSession.metadata = null;
      for (const [name] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(name, null);
        } catch {
          /* Optional browser control. */
        }
      }
    };
  }, [onPage, controlsHidden, engine, state.status, playing, config.mode, locale, start, t]);
  const update = useCallback(
    (patch: Partial<BinauralConfig>) =>
      setConfig((previous) => validateConfig({ ...previous, ...patch })),
    [],
  );
  const chooseBackground = useCallback((id: string | null) => {
    engineRef.current?.pause();
    setBackgroundId(id);
  }, []);
  const toggleFavorite = useCallback(
    (id: string) =>
      setFavorites((items) =>
        items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
      ),
    [],
  );
  const retryBackground = useCallback(() => {
    engineRef.current?.pause();
    setRefresh((value) => value + 1);
  }, []);
  const reset = useCallback(() => {
    engineRef.current?.stop();
    setConfig({ ...defaultConfig });
    setFavorites([]);
    setBackgroundId(null);
    setRemember(false);
  }, []);
  return useMemo(
    () => ({
      state,
      config,
      favorites,
      remember,
      setRemember,
      update,
      backgroundId,
      chooseBackground,
      backgroundLoading,
      backgroundUnavailable: backgroundUnavailable || state.backgroundError,
      retryBackground,
      storageUnavailable,
      initialize,
      engineUnavailable,
      ready: !!engine,
      start,
      pause: () => engine?.pause(),
      stop: () => engine?.stop(),
      toggleFavorite,
      reset,
    }),
    [
      state,
      config,
      favorites,
      remember,
      update,
      backgroundId,
      chooseBackground,
      backgroundLoading,
      backgroundUnavailable,
      retryBackground,
      storageUnavailable,
      initialize,
      engineUnavailable,
      engine,
      start,
      toggleFavorite,
      reset,
    ],
  );
}
const Context = createContext<ReturnType<typeof useController> | null>(null);
export function BinauralProvider({ children }: { children: React.ReactNode }) {
  const value = useController();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useBinaural() {
  const value = useContext(Context);
  if (!value) throw new Error("Binaural session provider missing");
  return value;
}
