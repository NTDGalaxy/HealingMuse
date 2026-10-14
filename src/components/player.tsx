"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ListMusic,
  Timer,
  Repeat2,
  Square,
  ExternalLink,
  CloudRain,
  Cloud,
  CloudSun,
  SunMedium,
  Sun,
} from "lucide-react";
import type { CatalogPage, CatalogQuery, Locale, PlaybackGrant, Track } from "@/lib/types";
import { api, mutation } from "@/lib/browser/api";
import { clock } from "@/lib/audio";
import { monitor } from "@/lib/browser/monitor";
import { useApp, useOnline } from "./app-state";
import { Dialog } from "./dialog";
import { NatureArt } from "./art";
import { YouTubeEmbed } from "./youtube";

const Context = createContext<{
  current: Track | null;
  play: (track: Track, queue?: Track[], continuation?: CatalogQuery) => void;
} | null>(null);
export function usePlayer() {
  const value = useContext(Context);
  if (!value) throw new Error("Player missing");
  return value;
}
export function MoodScores({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number) => void;
}) {
  const t = useTranslations("mood");
  return (
    <fieldset className="mood-scores">
      <legend>{t("selectScore")}</legend>
      {[CloudRain, Cloud, CloudSun, SunMedium, Sun].map((Icon, index) => {
        const score = index + 1;
        return (
          <label key={score} className={score === value ? "selected" : ""}>
            <input
              type="radio"
              name="mood-score"
              value={score}
              checked={score === value}
              onChange={() => onChange(score)}
            />
            <span className="mood-symbol" aria-hidden="true">
              <Icon size={28} />
            </span>
            <span>{t(`score${score}`)}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const app = useApp();
  const online = useOnline();
  const audio = useRef<HTMLAudioElement>(null);
  const epoch = useRef(0);
  const blobUrl = useRef<string | null>(null);
  const queueRef = useRef<Track[]>([]);
  const currentRef = useRef<Track | null>(null);
  const repeatRef = useRef(false);
  const continuationRef = useRef<CatalogQuery | null>(null);
  const browsingVersion = useRef(0);
  const advancing = useRef(false);
  const browseAbort = useRef<AbortController | null>(null);
  const session = useRef<string | null>(null);
  const deadline = useRef<number | null>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [repeat, setRepeat] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState<number | null>(null);
  const [dialog, setDialog] = useState<"queue" | "timer" | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ track: Track; queue: Track[] } | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [external, setExternal] = useState<Track | null>(null);
  const [youtubeLoaded, setYoutubeLoaded] = useState(false);
  const privacy = useRef({
    owner: app.user?.id ?? null,
    consent: !!app.personal?.profile.mood_consent_at,
  });
  useLayoutEffect(() => {
    const next = { owner: app.user?.id ?? null, consent: !!app.personal?.profile.mood_consent_at };
    if (privacy.current.owner !== next.owner || (privacy.current.consent && !next.consent)) {
      epoch.current++;
      browsingVersion.current++;
      browseAbort.current?.abort();
      continuationRef.current = null;
      session.current = null;
      setPending(null);
      setAfter(null);
      setScore(null);
      setLoading(false);
      if (privacy.current.owner && privacy.current.owner !== next.owner) {
        const publicQueue = currentRef.current ? [currentRef.current] : [];
        queueRef.current = publicQueue;
        setQueue(publicQueue);
      }
    }
    privacy.current = next;
  }, [app.user?.id, app.personal?.profile.mood_consent_at]);
  const endSession = useCallback(async () => {
    const id = session.current;
    session.current = null;
    if (id && navigator.onLine) {
      const owner = privacy.current.owner;
      try {
        await mutation("/api/sessions", { sessionId: id }, "PATCH", owner ?? undefined);
        if (privacy.current.owner === owner && privacy.current.consent) {
          setAfter(id);
          setScore(null);
        }
      } catch {
        if (privacy.current.owner === owner) app.announce(t("player.sessionSaveFailed"));
      }
    }
  }, [app, t]);
  const start = useCallback(
    async (track: Track, nextQueue: Track[], beforeScore?: number) => {
      if (track.source.kind !== "hosted") {
        audio.current?.pause();
        setExternal(track);
        setYoutubeLoaded(false);
        return;
      }
      const version = ++epoch.current;
      const element = audio.current;
      if (!element) return;
      await endSession();
      if (version !== epoch.current) return;
      element.pause();
      element.removeAttribute("src");
      element.load();
      setError("");
      setLoading(true);
      setPosition(0);
      setDuration(track.duration);
      currentRef.current = track;
      queueRef.current = nextQueue;
      setCurrent(track);
      setQueue(nextQueue);
      app.announce(t("player.loadingStatus", { title: track.title[locale] }));
      try {
        const downloaded = app.downloaded.find((item) => item.id === track.id);
        const source = downloaded
          ? URL.createObjectURL(downloaded.blob)
          : (await api<PlaybackGrant>(`/api/grants/${track.id}`)).url;
        if (version !== epoch.current) {
          if (downloaded) URL.revokeObjectURL(source);
          return;
        }
        if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
        blobUrl.current = downloaded ? source : null;
        element.src = source;
        element.load();
        try {
          await element.play();
        } catch {
          setError(t("player.cannotAutoplay"));
        }
        if (
          version === epoch.current &&
          app.user &&
          privacy.current.owner === app.user.id &&
          privacy.current.consent &&
          online
        ) {
          try {
            const result = await mutation<{ id: string }>(
              "/api/sessions",
              {
                trackId: track.id,
                ...(beforeScore ? { beforeScore } : {}),
              },
              "POST",
              app.user.id,
            );
            if (version === epoch.current) session.current = result.id;
            else if (privacy.current.owner === app.user.id)
              await mutation("/api/sessions", { sessionId: result.id }, "PATCH", app.user.id);
          } catch {
            if (version === epoch.current) app.announce(t("player.sessionSaveFailed"));
          }
        }
      } catch {
        if (version === epoch.current) {
          setError(t("player.playbackError"));
          monitor("playback_failed");
        }
      } finally {
        if (version === epoch.current) setLoading(false);
      }
    },
    [app, endSession, locale, online, t],
  );
  const play = useCallback(
    (track: Track, selection?: Track[], continuation?: CatalogQuery) => {
      browsingVersion.current++;
      browseAbort.current?.abort();
      advancing.current = false;
      continuationRef.current = continuation || null;
      const next = (selection ?? app.tracks).filter((item) => item.source.kind === "hosted");
      if (
        track.source.kind === "hosted" &&
        app.user &&
        app.personal?.profile.mood_consent_at &&
        online
      ) {
        setPending({ track, queue: next });
        setScore(null);
      } else void start(track, next);
    },
    [app.tracks, app.user, app.personal, online, start],
  );
  const playerContext = useMemo(() => ({ current, play }), [current, play]);
  const advance = useRef<(offset: number) => void>(() => {});
  useEffect(() => {
    advance.current = (offset) => {
      if (offset > 0 && advancing.current) return;
      browseAbort.current?.abort();
      advancing.current = false;
      const version = ++browsingVersion.current;
      const list = queueRef.current;
      const index = list.findIndex((track) => track.id === currentRef.current?.id);
      const target = index + offset;
      if (target >= 0 && target < list.length) void start(list[target], list);
      else if (offset > 0 && continuationRef.current && !advancing.current) {
        browseAbort.current?.abort();
        const controller = new AbortController();
        browseAbort.current = controller;
        const parameters = new URLSearchParams();
        for (const [key, value] of Object.entries(continuationRef.current))
          if (value) parameters.set(key, String(value));
        advancing.current = true;
        void api<CatalogPage>(`/api/catalog?${parameters}`, { signal: controller.signal })
          .then((page) => {
            if (version !== browsingVersion.current) return;
            const incoming = page.items.filter(
              (track) =>
                track.source.kind === "hosted" && !list.some((known) => known.id === track.id),
            );
            continuationRef.current = page.nextCursor
              ? { ...continuationRef.current, cursor: page.nextCursor }
              : null;
            app.registerTracks(page.items);
            if (incoming.length) void start(incoming[0], [...list, ...incoming]);
            else {
              audio.current?.pause();
              void endSession();
            }
          })
          .catch(() => {
            if (version === browsingVersion.current) setError(t("player.playbackError"));
          })
          .finally(() => {
            if (version === browsingVersion.current) advancing.current = false;
          });
      } else if (repeatRef.current && list.length)
        void start(list[(target + list.length) % list.length], list);
      else {
        audio.current?.pause();
        void endSession();
      }
    };
  });
  const toggle = async () => {
    if (!audio.current || !current) return;
    if (!audio.current.paused) {
      audio.current.pause();
      return;
    }
    try {
      if (
        (!audio.current.getAttribute("src") || audio.current.error) &&
        online &&
        !blobUrl.current
      ) {
        const at = audio.current.currentTime;
        const grant = await api<PlaybackGrant>(`/api/grants/${current.id}`);
        audio.current.src = grant.url;
        audio.current.currentTime = at;
      }
      await audio.current.play();
      setError("");
    } catch {
      setError(t(online ? "player.playbackError" : "player.refreshFailed"));
    }
  };
  useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title[locale],
      artist: current.artist,
      album: "HealingMuse",
    });
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      [
        "play",
        () => {
          void audio.current?.play().catch(() => setError(t("player.cannotAutoplay")));
        },
      ],
      ["pause", () => audio.current?.pause()],
      ["previoustrack", () => advance.current(-1)],
      ["nexttrack", () => advance.current(1)],
      [
        "seekto",
        (details) => {
          if (audio.current && details.seekTime !== undefined)
            audio.current.currentTime = details.seekTime;
        },
      ],
      [
        "seekbackward",
        (details) => {
          if (audio.current)
            audio.current.currentTime = Math.max(
              0,
              audio.current.currentTime - (details.seekOffset ?? 10),
            );
        },
      ],
      [
        "seekforward",
        (details) => {
          if (audio.current)
            audio.current.currentTime = Math.min(
              audio.current.duration || 0,
              audio.current.currentTime + (details.seekOffset ?? 10),
            );
        },
      ],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* Device does not support this action. */
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          /* Unsupported action. */
        }
      }
    };
  }, [current, locale, t]);
  useEffect(() => {
    if ("mediaSession" in navigator)
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing]);
  useEffect(() => {
    const tick = () => {
      if (deadline.current === null) return;
      const remaining = deadline.current - Date.now();
      setTimerMinutes(Math.max(0, Math.ceil(remaining / 60000)));
      if (remaining <= 0) {
        deadline.current = null;
        audio.current?.pause();
        app.announce(t("player.timerEnded"));
        void endSession();
        setTimerMinutes(null);
      }
    };
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [app, t, endSession]);
  useEffect(
    () => () => {
      epoch.current++;
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    },
    [],
  );
  return (
    <Context.Provider value={playerContext}>
      {children}
      <audio
        ref={audio}
        preload="metadata"
        onPlay={() => {
          setPlaying(true);
          if (currentRef.current)
            app.announce(t("player.playingStatus", { title: currentRef.current.title[locale] }));
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onDurationChange={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
        }}
        onEnded={() => advance.current(1)}
        onError={() => setError(t("player.playbackError"))}
      />
      <section
        className={`player-bar ${current ? "active" : "idle"} ${expanded ? "expanded" : ""}`}
        aria-label={t("player.nowPlaying")}
      >
        <div className="player-track">
          {current && <NatureArt kind={current.artwork} color={current.color} />}
          <div>
            <strong>{current?.title[locale] ?? t("player.idle")}</strong>
            <span className="muted small">{current?.artist ?? t("player.idleNote")}</span>
          </div>
        </div>
        <div className="playback-controls">
          <div className="player-buttons">
            <button
              className="icon-button"
              disabled={!current}
              aria-label={t("player.previous")}
              onClick={() => advance.current(-1)}
            >
              <SkipBack size={19} />
            </button>
            <button
              className="play-button"
              aria-label={t(playing ? "player.pause" : "player.play")}
              disabled={!current || loading}
              onClick={() => void toggle()}
            >
              {playing ? (
                <Pause size={21} fill="currentColor" />
              ) : (
                <Play size={21} fill="currentColor" />
              )}
            </button>
            <button
              className="icon-button"
              disabled={!current}
              aria-label={t("player.next")}
              onClick={() => advance.current(1)}
            >
              <SkipForward size={19} />
            </button>
          </div>
          <div className="seek-row">
            <span>{clock(position)}</span>
            <input
              aria-label={t("player.seek")}
              type="range"
              min={0}
              max={duration || 1}
              step={1}
              value={Math.min(position, duration || 1)}
              aria-valuetext={`${clock(position)} / ${clock(duration)}`}
              disabled={!current}
              onChange={(e) => {
                if (audio.current) audio.current.currentTime = Number(e.target.value);
                setPosition(Number(e.target.value));
              }}
            />
            <span>{clock(duration)}</span>
          </div>
        </div>
        <button
          className="player-expand button secondary"
          aria-expanded={expanded}
          aria-controls="player-tools"
          onClick={() => setExpanded(!expanded)}
        >
          {t(expanded ? "player.collapse" : "player.expand")}
        </button>
        <div className="player-tools" id="player-tools">
          <button
            className="icon-button"
            aria-label={t("player.repeat")}
            aria-pressed={repeat}
            onClick={() => {
              repeatRef.current = !repeat;
              setRepeat(!repeat);
            }}
          >
            <Repeat2 size={20} />
          </button>
          <button
            className="icon-button"
            aria-label={
              timerMinutes ? t("player.timerActive", { minutes: timerMinutes }) : t("player.timer")
            }
            onClick={() => setDialog("timer")}
          >
            <Timer size={20} />
            {timerMinutes !== null && <small>{timerMinutes}</small>}
          </button>
          <button
            className="icon-button"
            aria-label={t("player.queue")}
            onClick={() => setDialog("queue")}
          >
            <ListMusic size={20} />
          </button>
          <button
            className="icon-button"
            disabled={!current}
            aria-label={t("player.finish")}
            onClick={() => {
              browsingVersion.current++;
              browseAbort.current?.abort();
              audio.current?.pause();
              void endSession();
            }}
          >
            <Square size={17} />
          </button>
        </div>
        {error && (
          <div className="player-error" role="alert">
            {error}
            <button className="text-button" onClick={() => void toggle()}>
              {t("common.retry")}
            </button>
          </div>
        )}
      </section>
      <Dialog
        open={dialog === "queue"}
        onOpenChange={() => setDialog(null)}
        title={t("player.queueTitle")}
      >
        <ol className="queue-list">
          {queue.map((track) => (
            <li key={track.id}>
              <button
                aria-current={track.id === current?.id ? "true" : undefined}
                onClick={() => {
                  void start(track, queue);
                  setDialog(null);
                }}
              >
                {track.title[locale]}
                <span>{clock(track.duration)}</span>
              </button>
            </li>
          ))}
        </ol>
        {!queue.length && <p>{t("player.queueEmpty")}</p>}
      </Dialog>
      <Dialog
        open={dialog === "timer"}
        onOpenChange={() => setDialog(null)}
        title={t("player.timerTitle")}
        description={t("player.timerNote")}
      >
        <div className="timer-options">
          {[0, 5, 15, 30, 45, 60].map((minutes) => (
            <button
              key={minutes}
              className="button secondary"
              onClick={() => {
                deadline.current = minutes ? Date.now() + minutes * 60000 : null;
                setTimerMinutes(minutes || null);
                setDialog(null);
              }}
            >
              {minutes ? t("common.minutes", { count: minutes }) : t("player.timerOff")}
            </button>
          ))}
        </div>
      </Dialog>
      <Dialog
        open={!!pending}
        onOpenChange={() => setPending(null)}
        title={t("mood.before")}
        description={t("mood.note")}
      >
        <MoodScores value={score} onChange={setScore} />
        <div className="dialog-actions">
          <button
            className="button"
            disabled={!score}
            onClick={() => {
              if (pending && score) void start(pending.track, pending.queue, score);
              setPending(null);
            }}
          >
            {t("mood.saveListen")}
          </button>
          <button
            className="button secondary"
            onClick={() => {
              if (pending) void start(pending.track, pending.queue);
              setPending(null);
            }}
          >
            {t("mood.skipListen")}
          </button>
        </div>
      </Dialog>
      <Dialog
        open={!!after}
        onOpenChange={() => setAfter(null)}
        title={t("mood.after")}
        description={t("mood.note")}
      >
        <MoodScores value={score} onChange={setScore} />
        <div className="dialog-actions">
          <button
            className="button"
            disabled={!score}
            onClick={async () => {
              if (
                after &&
                score &&
                (await app.perform(
                  "/api/sessions",
                  { sessionId: after, afterScore: score },
                  "PATCH",
                ))
              ) {
                setAfter(null);
                app.announce(t("mood.saved"));
              }
            }}
          >
            {t("mood.saveAfter")}
          </button>
          <button className="button secondary" onClick={() => setAfter(null)}>
            {t("mood.skip")}
          </button>
        </div>
        {app.error && (
          <p role="alert" className="error">
            {app.error}
          </p>
        )}
      </Dialog>
      <Dialog
        open={!!external}
        onOpenChange={() => {
          setExternal(null);
          setYoutubeLoaded(false);
        }}
        title={external?.title[locale] ?? t("catalog.details")}
        description={t("catalog.youtubeVisible")}
        wide
      >
        {external?.source.kind === "youtube" && (
          <>
            {!youtubeLoaded ? (
              <>
                <p>{t("catalog.youtubeNotice")}</p>
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("catalog.googlePrivacy")}
                </a>
                <button className="button" onClick={() => setYoutubeLoaded(true)}>
                  {t("catalog.youtubeStart")}
                </button>
              </>
            ) : (
              <YouTubeEmbed
                videoId={external.source.videoId}
                title={external.title[locale]}
                chooseAnother={() => {
                  setExternal(null);
                  setYoutubeLoaded(false);
                }}
              />
            )}
            <a
              className="button secondary"
              target="_blank"
              rel="noopener noreferrer"
              href={`https://www.youtube.com/watch?v=${external.source.videoId}`}
            >
              {t("catalog.openYoutube")}
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          </>
        )}
        {external?.source.kind === "spotify_link" && (
          <a
            className="button"
            href={external.source.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("catalog.spotify")}
            <ExternalLink size={16} aria-hidden="true" />
          </a>
        )}
      </Dialog>
    </Context.Provider>
  );
}
