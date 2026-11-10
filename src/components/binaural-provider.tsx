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
} from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/lib/browser/api";
import { isRoutePath } from "@/lib/routes";
import {
  defaultConfig,
  parsePreferences,
  preferenceKey,
  validateConfig,
  type BinauralConfig,
} from "@/lib/binaural/config";
import type { BinauralEngine, BinauralSnapshot } from "@/lib/binaural/engine";
import { createSnapshotRelay, type SnapshotRelay } from "@/lib/binaural/snapshot";
import { setMediaActions } from "@/lib/playback/media-session";
import { beginPlaybackStart } from "@/lib/perf/audio-first";
import { useStore } from "@/lib/state/create-store";
import type { PlaybackGrant } from "@/lib/types";
import { usePlayer } from "./player";
import { useAppActions, useDownloadedRecords } from "./app-state";

function useController(relay: SnapshotRelay) {
  const { announce } = useAppActions();
  const downloaded = useDownloadedRecords();
  const player = usePlayer();
  const { playing, controlsHidden, setControlsHidden, registerOtherAudio, pauseForOtherAudio } =
    player;
  const t = useTranslations("binaural");
  const locale = useLocale();
  const pathname = usePathname();
  const onPage = isRoutePath(pathname, "binaural");
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
    (item) => item.id === backgroundId && item.track.source.kind === "hosted",
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
  // Only the slices the controller acts on: progress ticks never render the provider.
  const status = useStore(relay, (snapshot) => snapshot.status);
  const backgroundError = useStore(relay, (snapshot) => snapshot.backgroundError);
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
          relay.attach(instance);
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
  }, [relay]);
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
  }, [onPage, engine, status, playing, setControlsHidden]);
  useEffect(() => registerOtherAudio(() => engine?.pause()), [engine, registerOtherAudio]);
  useEffect(() => {
    const pause = () => engine?.pause("interrupted");
    window.addEventListener("pagehide", pause);
    return () => window.removeEventListener("pagehide", pause);
  }, [engine]);
  // The controls keep one identity for the provider's lifetime and read the latest state here.
  const latest = useRef({ engine, backgroundLoading, backgroundId, backgroundUnavailable });
  useLayoutEffect(() => {
    latest.current = { engine, backgroundLoading, backgroundId, backgroundUnavailable };
  });
  const start = useCallback(() => {
    const { engine, backgroundLoading, backgroundId, backgroundUnavailable } = latest.current;
    if (!engine || backgroundLoading) return;
    if (backgroundId && !backgroundUnavailable && backgroundExpiry.current <= Date.now() + 5000) {
      setRefresh((value) => value + 1);
      return;
    }
    pauseForOtherAudio();
    // Decoration (the moonflower scene) waits until the tones start or fail to start.
    const settle = beginPlaybackStart();
    void engine.start().finally(settle);
  }, [pauseForOtherAudio]);
  const pause = useCallback(() => engineRef.current?.pause(), []);
  const stop = useCallback(() => engineRef.current?.stop(), []);
  const previousStatus = useRef(status);
  useEffect(() => {
    if (previousStatus.current === status) return;
    previousStatus.current = status;
    if (status === "completed") announce(t("completed"));
    else if (status === "interrupted") announce(t("interrupted"));
  }, [status, announce, t]);
  useEffect(() => {
    if (
      !onPage ||
      !controlsHidden ||
      !engine ||
      playing ||
      !["playing", "paused", "interrupted"].includes(status) ||
      !("mediaSession" in navigator)
    )
      return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t(`modes.${config.mode}.title`),
      artist: "HealingMuse",
      album: t("title"),
    });
    navigator.mediaSession.playbackState = status === "playing" ? "playing" : "paused";
    const removeActions = setMediaActions(navigator.mediaSession, {
      play: start,
      pause: () => engine.pause(),
      stop: () => engine.stop(),
    });
    return () => {
      navigator.mediaSession.playbackState = "none";
      navigator.mediaSession.metadata = null;
      removeActions();
    };
  }, [onPage, controlsHidden, engine, status, playing, config.mode, locale, start, t]);
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
      config,
      favorites,
      remember,
      setRemember,
      update,
      backgroundId,
      chooseBackground,
      backgroundLoading,
      backgroundUnavailable: backgroundUnavailable || backgroundError,
      retryBackground,
      storageUnavailable,
      initialize,
      engineUnavailable,
      ready: !!engine,
      start,
      pause,
      stop,
      toggleFavorite,
      reset,
    }),
    [
      config,
      favorites,
      remember,
      update,
      backgroundId,
      chooseBackground,
      backgroundLoading,
      backgroundUnavailable,
      backgroundError,
      retryBackground,
      storageUnavailable,
      initialize,
      engineUnavailable,
      engine,
      start,
      pause,
      stop,
      toggleFavorite,
      reset,
    ],
  );
}
const Context = createContext<ReturnType<typeof useController> | null>(null);
// The relay keeps one identity, so snapshot subscribers never render for settings changes.
const SnapshotContext = createContext<SnapshotRelay | null>(null);
export function BinauralProvider({ children }: { children: React.ReactNode }) {
  const [relay] = useState(createSnapshotRelay);
  const value = useController(relay);
  return (
    <SnapshotContext.Provider value={relay}>
      <Context.Provider value={value}>{children}</Context.Provider>
    </SnapshotContext.Provider>
  );
}
/** Session settings and controls; the controls keep their identity. */
export function useBinaural() {
  const value = useContext(Context);
  if (!value) throw new Error("Binaural session provider missing");
  return value;
}
/**
 * One slice of the engine snapshot. A selector must return a primitive or a reference from the
 * snapshot, so the 500 ms progress ticks only render components whose slice changed.
 */
export function useBinauralSnapshot<S>(selector: (snapshot: BinauralSnapshot) => S): S {
  const relay = useContext(SnapshotContext);
  if (!relay) throw new Error("Binaural session provider missing");
  return useStore(relay, selector);
}
