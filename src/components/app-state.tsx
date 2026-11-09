"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { User } from "@supabase/supabase-js";
import { useLocale, useTranslations } from "next-intl";
import type { CuratedCollection, DownloadedTrack, Locale, PersonalData, Track } from "@/lib/types";
import type { PreferencesStore } from "@/lib/preferences-store";
import { createStore, useStore, type Store } from "@/lib/state/create-store";
import { createAnnouncer } from "@/lib/state/announcer";
import { createTrackCache } from "@/lib/state/track-cache";
import { createSession } from "@/lib/state/session";
import { createPersonal } from "@/lib/state/personal";
import { createDownloads, type DownloadsSnapshot } from "@/lib/state/downloads";
import { usePreference, usePreferencesStore } from "./appearance";

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

type Translate = ReturnType<typeof useTranslations>;
type I18n = { t: Translate; locale: Locale };

function createAppStores(tracks: Track[], preferences: PreferencesStore) {
  const session = createSession();
  return {
    announcer: createAnnouncer(),
    tracks: createTrackCache(tracks),
    session,
    personal: createPersonal({
      session,
      // The signed-in profile decides Calm while it is loaded, as before.
      onData: (data) => preferences.adoptCalm(data.profile.calm_mode),
    }),
    downloads: createDownloads(),
  };
}
export type AppStores = ReturnType<typeof createAppStores>;

// Stable for the provider's lifetime. Messages are read when an action finishes, so a language
// switch neither recreates the actions nor restarts the work they started.
function createActions(stores: AppStores, preferences: PreferencesStore, i18n: Store<I18n>) {
  const { announcer, tracks, session, personal, downloads } = stores;
  return {
    registerTracks: tracks.register,
    ensureTracks: tracks.ensure,
    refresh: personal.refresh,
    perform: async (url: string, data: unknown, method?: string) =>
      (await personal.perform(url, data, method)).ok,
    openAuth: session.openAuth,
    closeAuth: session.closeAuth,
    async signOut() {
      if (!(await session.signOut())) {
        personal.setError("unavailable");
        return;
      }
      personal.clearError();
      announcer.announce(i18n.getSnapshot().t("settings.signOutNote"));
    },
    announce: announcer.announce,
    clearError: personal.clearError,
    async download(track: Track) {
      const result = await downloads.download(track);
      if (result.status !== "saved") return;
      const { t, locale } = i18n.getSnapshot();
      announcer.announce(t("downloads.saved", { title: track.title[locale] }));
    },
    remove: downloads.remove,
    cancelDownload: downloads.cancel,
    setCalm: preferences.setCalm,
  };
}
export type AppActions = ReturnType<typeof createActions>;

const StoresContext = createContext<{ stores: AppStores; actions: AppActions } | null>(null);
const CollectionsContext = createContext<CuratedCollection[]>([]);

export function AppProvider({
  tracks,
  collections,
  children,
}: {
  tracks: Track[];
  collections: CuratedCollection[];
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const preferences = usePreferencesStore();
  // One set of stores per provider instance (never module singletons: this module also runs
  // during server rendering). The initial tracks seed the cache once, as before.
  const [i18n] = useState(() => createStore<I18n>({ t, locale }));
  const [stores] = useState(() => createAppStores(tracks, preferences));
  const value = useMemo(
    () => ({ stores, actions: createActions(stores, preferences, i18n) }),
    [stores, preferences, i18n],
  );
  useEffect(() => i18n.set({ t, locale }), [i18n, t, locale]);
  // Keyed on the stores only: auth, Realtime and downloads live as long as the provider and are
  // never restarted by a language switch or a new User object for the same account.
  useEffect(() => {
    const stopPersonal = stores.personal.start();
    const stopSession = stores.session.start();
    void stores.downloads.load();
    const stopCalm = preferences.setCalmSync(async (calm) => {
      if (stores.session.getSnapshot().userId)
        await stores.personal.perform("/api/me", { calmMode: calm }, "PATCH");
    });
    return () => {
      stopCalm();
      stopSession();
      stopPersonal();
      stores.downloads.cancel();
      stores.announcer.dispose();
    };
  }, [stores, preferences]);
  return (
    <StoresContext.Provider value={value}>
      <CollectionsContext.Provider value={collections}>{children}</CollectionsContext.Provider>
    </StoresContext.Provider>
  );
}

function useAppContext() {
  const context = useContext(StoresContext);
  if (!context) throw new Error("AppProvider missing");
  return context;
}
/** Actions that keep their identity for the provider's lifetime. */
export function useAppActions() {
  return useAppContext().actions;
}
/** The raw stores, for reading current values inside event handlers. */
export function useAppStores() {
  return useAppContext().stores;
}

function personalErrorMessage(t: Translate, code: string) {
  return code ? t(`errors.${code}`) : "";
}
function downloadErrorMessage(t: Translate, code: DownloadsSnapshot["error"]) {
  if (!code) return "";
  return code === "rate_limited" ? t("errors.rate_limited") : t(`downloads.${code}`);
}

// Selector hooks: each re-renders its component only when the selected value changes.
export function useTrack(id: string | null | undefined): Track | undefined {
  return useStore(useAppStores().tracks, (cache) => (id ? cache.byId.get(id) : undefined));
}
export function useTrackLookup(): ReadonlyMap<string, Track> {
  return useStore(useAppStores().tracks, (cache) => cache.byId);
}
export function useUser(): User | null {
  return useStore(useAppStores().session, (session) => session.user);
}
export function useUserId(): string | null {
  return useStore(useAppStores().session, (session) => session.userId);
}
export function useAuthLoading(): boolean {
  return useStore(useAppStores().session, (session) => session.authLoading);
}
export function useAuthOpen(): boolean {
  return useStore(useAppStores().session, (session) => session.authOpen);
}
export function usePersonalData(): PersonalData | null {
  return useStore(useAppStores().personal, (personal) => personal.data);
}
export function useIsFavorite(id: string): boolean {
  return useStore(
    useAppStores().personal,
    (personal) => personal.data?.favorites.includes(id) ?? false,
  );
}
export function useIsAdmin(): boolean {
  return useStore(useAppStores().personal, (personal) => !!personal.data?.isAdmin);
}
export function useMoodConsent(): string | null {
  return useStore(
    useAppStores().personal,
    (personal) => personal.data?.profile.mood_consent_at ?? null,
  );
}
/**
 * True while a signed-in account's personal data is still on its way: online, not loaded yet and
 * not failed. Offline, or after a failure, screens render without it as they always have.
 */
export function usePersonalPending(): boolean {
  const { session, personal } = useAppStores();
  const signedIn = useStore(session, (snapshot) => snapshot.userId !== null);
  const waiting = useStore(personal, (snapshot) => snapshot.data === null && !snapshot.error);
  return useOnline() && signedIn && waiting;
}
/** The last personal request error, translated. */
export function usePersonalError(): string {
  const t = useTranslations();
  return personalErrorMessage(
    t,
    useStore(useAppStores().personal, (personal) => personal.error),
  );
}
export function useNotice(): string {
  return useStore(useAppStores().announcer);
}
export function useDownloadedRecords(): DownloadedTrack[] {
  return useStore(useAppStores().downloads.records, (records) => records.items);
}
/** Whether this recording is saved, and whether any download is running. */
export function useDownloadState(id: string): { downloaded: boolean; busy: boolean } {
  const { downloads } = useAppStores();
  const downloaded = useStore(downloads.records, (records) =>
    records.items.some((item) => item.id === id),
  );
  const busy = useStore(downloads.progress, (progress) => progress !== null);
  return { downloaded, busy };
}
export function useDownloadProgress() {
  return useStore(useAppStores().downloads.progress);
}
/** The last download error, translated. */
export function useDownloadError(): string {
  const t = useTranslations();
  return downloadErrorMessage(
    t,
    useStore(useAppStores().downloads.records, (records) => records.error),
  );
}
export function useCalm(): boolean {
  return usePreference((preferences) => preferences.calm);
}

/**
 * Everything at once, in the shape the app has always used. It re-renders with every change in
 * any store (download progress included), so hot paths use the selector hooks above instead.
 */
export function useApp() {
  const { stores, actions } = useAppContext();
  const collections = useContext(CollectionsContext);
  const t = useTranslations();
  const tracks = useStore(stores.tracks, (cache) => cache.list);
  const session = useStore(stores.session);
  const personal = useStore(stores.personal);
  const notice = useStore(stores.announcer);
  const records = useStore(stores.downloads.records);
  const progress = useStore(stores.downloads.progress);
  const calm = useCalm();
  return useMemo(
    () => ({
      tracks,
      registerTracks: actions.registerTracks,
      ensureTracks: actions.ensureTracks,
      collections,
      user: session.user,
      personal: personal.data,
      authLoading: session.authLoading,
      refresh: actions.refresh,
      perform: actions.perform,
      authOpen: session.authOpen,
      openAuth: actions.openAuth,
      closeAuth: actions.closeAuth,
      signOut: actions.signOut,
      notice,
      announce: actions.announce,
      error: personalErrorMessage(t, personal.error),
      clearError: actions.clearError,
      downloaded: records.items,
      download: actions.download,
      remove: actions.remove,
      progress,
      cancelDownload: actions.cancelDownload,
      downloadError: downloadErrorMessage(t, records.error),
      calm,
      setCalm: actions.setCalm,
    }),
    [tracks, collections, session, personal, notice, records, progress, calm, actions, t],
  );
}
