"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { User } from "@supabase/supabase-js";
import { useLocale, useTranslations } from "next-intl";
import { browserClient } from "@/lib/supabase/client";
import { isConfigured } from "@/lib/supabase/config";
import { api, ApiError, mutation } from "@/lib/browser/api";
import {
  clearDownloads,
  downloadRecording,
  listDownloads,
  removeDownload,
} from "@/lib/browser/downloads";
import type { CuratedCollection, DownloadedTrack, PersonalData, Track } from "@/lib/types";
import { monitor } from "@/lib/browser/monitor";

const subscribeOnline = (listener: () => void) => {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
};
export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
const AppContext = createContext<{
  tracks: Track[];
  registerTracks: (tracks: Track[]) => void;
  ensureTracks: (ids: string[]) => Promise<void>;
  collections: CuratedCollection[];
  user: User | null;
  personal: PersonalData | null;
  authLoading: boolean;
  refresh: () => Promise<PersonalData | null>;
  perform: (url: string, data: unknown, method?: string) => Promise<boolean>;
  authOpen: boolean;
  openAuth: () => void;
  closeAuth: () => void;
  signOut: () => Promise<void>;
  notice: string;
  announce: (message: string) => void;
  error: string;
  clearError: () => void;
  downloaded: DownloadedTrack[];
  download: (track: Track) => Promise<void>;
  remove: (id?: string) => Promise<void>;
  progress: { id: string; percent: number } | null;
  cancelDownload: () => void;
  downloadError: string;
  calm: boolean;
  setCalm: (value: boolean) => Promise<void>;
} | null>(null);

export function AppProvider({
  tracks: initialTracks,
  collections,
  children,
}: {
  tracks: Track[];
  collections: CuratedCollection[];
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const locale = useLocale() as "vi" | "en";
  const [tracks, setTracks] = useState(initialTracks);
  const knownTracks = useRef(new Map(initialTracks.map((track) => [track.id, track])));
  const registerTracks = useCallback((incoming: Track[]) => {
    if (!incoming.length) return;
    for (const track of incoming) {
      knownTracks.current.delete(track.id);
      knownTracks.current.set(track.id, track);
    }
    while (knownTracks.current.size > 512)
      knownTracks.current.delete(knownTracks.current.keys().next().value!);
    setTracks([...knownTracks.current.values()]);
  }, []);
  const ensureTracks = useCallback(
    async (ids: string[]) => {
      const missing = [...new Set(ids)].filter((id) => !knownTracks.current.has(id));
      for (let offset = 0; offset < missing.length; offset += 100) {
        const found = await api<Track[]>(
          `/api/tracks?ids=${missing.slice(offset, offset + 100).join(",")}`,
        );
        registerTracks(found);
      }
    },
    [registerTracks],
  );
  const [user, setUser] = useState<User | null>(null);
  const [personal, setPersonal] = useState<PersonalData | null>(null);
  const [authLoading, setAuthLoading] = useState(isConfigured);
  const [authOpen, setAuthOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloaded, setDownloaded] = useState<DownloadedTrack[]>([]);
  const [progress, setProgress] = useState<{ id: string; percent: number } | null>(null);
  const [calm, setCalmState] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const userId = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!userId.current || !navigator.onLine) return null;
    try {
      const data = await api<PersonalData>("/api/me");
      if (version === requestVersion.current && data.profile.id === userId.current) {
        setPersonal(data);
        setCalmState(data.profile.calm_mode);
        document.documentElement.dataset.calm = String(data.profile.calm_mode);
        return data;
      }
    } catch (e) {
      if (version === requestVersion.current)
        setError(t(`errors.${e instanceof ApiError ? e.code : "unavailable"}`));
    }
    return null;
  }, [t]);
  useEffect(() => {
    const client = browserClient();
    if (!client) return;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      if (userId.current !== (nextUser?.id ?? null)) {
        requestVersion.current++;
        setPersonal(null);
        setError("");
      }
      userId.current = nextUser?.id ?? null;
      setUser(nextUser);
      setAuthLoading(false);
      if (nextUser)
        queueMicrotask(() => {
          void refresh();
        });
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [refresh]);
  useEffect(() => {
    const client = browserClient();
    if (!client || !user) return;
    const channel = client
      .channel(`user:${user.id}`, { config: { private: true } })
      .on("broadcast", { event: "invalidate" }, () => {
        void refresh();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refresh();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") monitor("synchronization_failed");
      });
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      void client.removeChannel(channel);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [user, refresh]);
  useEffect(() => {
    void listDownloads()
      .then(setDownloaded)
      .catch(() => setDownloadError(t("downloads.unsupported")));
    void Promise.resolve().then(() => {
      try {
        const storedCalm = localStorage.getItem("healingmuse-calm") === "true";
        setCalmState(storedCalm);
        document.documentElement.dataset.calm = String(storedCalm);
      } catch {
        /* The setting remains available for this visit. */
      }
    });
    return () => abort.current?.abort();
  }, [t]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 6000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  const perform = async (url: string, data: unknown, method = "POST") => {
    setError("");
    if (!user) {
      setAuthOpen(true);
      return false;
    }
    try {
      await mutation(url, data, method, user.id);
      if (userId.current !== user.id) return false;
      await refresh();
      return true;
    } catch (e) {
      if (userId.current !== user.id) return false;
      setError(t(`errors.${e instanceof ApiError ? e.code : "unavailable"}`));
      if (e instanceof ApiError && e.code === "conflict") await refresh();
      return false;
    }
  };
  const download = async (track: Track) => {
    if (abort.current) return;
    setDownloadError("");
    const controller = new AbortController();
    abort.current = controller;
    setProgress({ id: track.id, percent: 0 });
    try {
      await downloadRecording(
        track,
        (percent) => setProgress({ id: track.id, percent }),
        controller.signal,
      );
      setDownloaded(await listDownloads());
      setNotice(t("downloads.saved", { title: track.title[locale] }));
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        const quota = e instanceof DOMException && e.name === "QuotaExceededError";
        const code = quota
          ? "storageFull"
          : e instanceof Error && e.message === "integrity"
            ? "integrity"
            : e instanceof Error && e.message === "unsupported"
              ? "unsupported"
              : "interrupted";
        setDownloadError(
          e instanceof ApiError && e.code === "rate_limited"
            ? t("errors.rate_limited")
            : t(`downloads.${code}`),
        );
      }
    } finally {
      abort.current = null;
      setProgress(null);
    }
  };
  const remove = async (id?: string) => {
    try {
      if (id) await removeDownload(id);
      else await clearDownloads();
      setDownloaded(await listDownloads());
    } catch {
      setDownloadError(t("downloads.unsupported"));
    }
  };
  const setCalm = async (value: boolean) => {
    setCalmState(value);
    document.documentElement.dataset.calm = String(value);
    try {
      localStorage.setItem("healingmuse-calm", String(value));
    } catch {
      /* Session-only preference. */
    }
    if (user) await perform("/api/me", { calmMode: value }, "PATCH");
  };
  const signOut = async () => {
    const client = browserClient();
    if (client) {
      const { error: authError } = await client.auth.signOut();
      if (authError) {
        setError(t("errors.unavailable"));
        return;
      }
    }
    requestVersion.current++;
    userId.current = null;
    setUser(null);
    setPersonal(null);
    setError("");
    setNotice(t("settings.signOutNote"));
  };
  return (
    <AppContext.Provider
      value={{
        tracks,
        registerTracks,
        ensureTracks,
        collections,
        user,
        personal,
        authLoading,
        refresh,
        perform,
        authOpen,
        openAuth: () => setAuthOpen(true),
        closeAuth: () => setAuthOpen(false),
        signOut,
        notice,
        announce: setNotice,
        error,
        clearError: () => setError(""),
        downloaded,
        download,
        remove,
        progress,
        cancelDownload: () => abort.current?.abort(),
        downloadError,
        calm,
        setCalm,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("AppProvider missing");
  return context;
}
