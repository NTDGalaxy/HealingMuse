"use client";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import type { CatalogPage, CatalogQuery, Locale, PlaybackGrant, Track } from "@/lib/types";
import { api, mutation } from "@/lib/browser/api";
import { monitor } from "@/lib/browser/monitor";
import { useStore } from "@/lib/state/create-store";
import { createPlaybackEngine, type PlaybackEngine } from "@/lib/playback/engine";
import { setMediaActions, transportActions } from "@/lib/playback/media-session";
import { markOnce, readinessMarks } from "@/lib/perf/readiness";
import { beginPlaybackStart } from "@/lib/perf/audio-first";
import { useAppActions, useAppStores, useMoodConsent, useUserId } from "./app-state";
import { PlayerSurfaces } from "./player/surfaces";

export { MoodScores } from "./player/mood-scores";

const Context = createContext<{
  current: Track | null;
  playing: boolean;
  controlsHidden: boolean;
  play: (track: Track, queue?: readonly Track[], continuation?: CatalogQuery) => void;
  pauseForOtherAudio: () => void;
  registerOtherAudio: (pause: () => void) => () => void;
  setControlsHidden: (hidden: boolean) => void;
} | null>(null);
export function usePlayer() {
  const value = useContext(Context);
  if (!value) throw new Error("Player missing");
  return value;
}

/**
 * Owns the single <audio> element for catalogue playback. The playback engine
 * (src/lib/playback) holds the logic and the stores; this provider wires it to the app stores,
 * translations and Media Session, and the parts under ./player render what they subscribe to.
 */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  // Narrow subscriptions: the player and its context must not change with download progress,
  // notices or newly registered recordings. Current values are read from the stores on use.
  const stores = useAppStores();
  const actions = useAppActions();
  const userId = useUserId();
  const moodConsent = useMoodConsent();
  const audio = useRef<HTMLAudioElement>(null);
  // Announcements use the language current when they are made.
  const i18n = useRef({ t, locale });
  useLayoutEffect(() => {
    i18n.current = { t, locale };
  }, [t, locale]);
  const [engine] = useState(() =>
    createPlaybackEngine({
      downloaded: (id) =>
        stores.downloads.records.getSnapshot().items.find((item) => item.id === id)?.blob,
      grant: async (id) => (await api<PlaybackGrant>(`/api/grants/${id}`)).url,
      catalogPage: (search, signal) => api<CatalogPage>(`/api/catalog?${search}`, { signal }),
      registerTracks: actions.registerTracks,
      sessionRequests: {
        open: async (trackId, beforeScore, owner) =>
          (
            await mutation<{ id: string }>(
              "/api/sessions",
              { trackId, ...(beforeScore ? { beforeScore } : {}) },
              "POST",
              owner,
            )
          ).id,
        close: async (sessionId, owner) => {
          await mutation("/api/sessions", { sessionId }, "PATCH", owner);
        },
      },
      userId: () => stores.session.getSnapshot().user?.id ?? null,
      moodConsent: () => !!stores.personal.getSnapshot().data?.profile.mood_consent_at,
      online: () => navigator.onLine,
      announce: (key, track) => {
        const { t, locale } = i18n.current;
        actions.announce(track ? t(key, { title: track.title[locale] }) : t(key));
      },
      failed: () => monitor("playback_failed"),
      beginPlaybackStart,
      objectUrl: {
        create: (blob) => URL.createObjectURL(blob),
        revoke: (url) => URL.revokeObjectURL(url),
      },
      privacy: { owner: userId, consent: !!moodConsent },
    }),
  );
  useLayoutEffect(() => {
    // Readiness contract: the single persistent <audio> element is mounted.
    if (!audio.current) return;
    markOnce(readinessMarks.player);
    return engine.attach(audio.current);
  }, [engine]);
  useLayoutEffect(() => {
    engine.setPrivacy({ owner: userId, consent: !!moodConsent });
  }, [engine, userId, moodConsent]);
  const current = useStore(engine.state, (state) => state.current);
  const playing = useStore(engine.state, (state) => state.playing);
  const controlsHidden = useStore(engine.state, (state) => state.controlsHidden);
  useMediaSession(engine, current, playing, controlsHidden, locale);
  const playerContext = useMemo(
    () => ({
      current,
      playing,
      controlsHidden,
      play: engine.play,
      pauseForOtherAudio: engine.pauseForOtherAudio,
      registerOtherAudio: engine.registerOtherAudio,
      setControlsHidden: engine.setControlsHidden,
    }),
    [engine, current, playing, controlsHidden],
  );
  return (
    <Context.Provider value={playerContext}>
      {children}
      <audio ref={audio} preload="metadata" />
      <PlayerSurfaces engine={engine} />
    </Context.Provider>
  );
}

/** Lock screen and headset controls, unless the binaural page owns them. */
function useMediaSession(
  engine: PlaybackEngine,
  current: Track | null,
  playing: boolean,
  controlsHidden: boolean,
  locale: Locale,
) {
  useEffect(() => {
    if (!("mediaSession" in navigator) || !current || controlsHidden) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title[locale],
      artist: current.artist,
      album: "HealingMuse",
    });
    return setMediaActions(navigator.mediaSession, transportActions(engine.transport));
  }, [engine, current, locale, controlsHidden]);
  useEffect(() => {
    if ("mediaSession" in navigator && !controlsHidden)
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing, controlsHidden]);
}
