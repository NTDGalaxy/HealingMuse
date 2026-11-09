import type { User } from "@supabase/supabase-js";
import { monitor } from "@/lib/browser/monitor";
import { isRoutePath } from "@/lib/routes";
import { authStorageKey, isConfigured } from "@/lib/supabase/config";
import {
  loadBrowserClient,
  preloadBrowserClient,
  type BrowserClient,
} from "@/lib/supabase/load-client";
import { createStore, type ReadableStore } from "./create-store";

export type { BrowserClient };

export type SessionSnapshot = Readonly<{
  user: User | null;
  userId: string | null;
  /** True until the account is known: at start for a guest, after the first auth event otherwise. */
  authLoading: boolean;
  /** Whether the sign-in dialog is open. */
  authOpen: boolean;
}>;

export type Session = ReadableStore<SessionSnapshot> & {
  /** The Supabase browser client once it has loaded, else null (always null in the local preview). */
  client(): BrowserClient | null;
  /**
   * Loads the Supabase browser client once and follows its auth events. Resolves null in the
   * local preview or when the client could not be downloaded; it never rejects.
   */
  load(): Promise<BrowserClient | null>;
  /** Opens the sign-in dialog and starts loading the client it needs. */
  openAuth(): void;
  closeAuth(): void;
  /** Ends the session; false when Supabase could not sign out. */
  signOut(): Promise<boolean>;
  /** Follows auth events and other tabs' sign-ins until the returned cleanup runs. */
  start(): () => void;
};

/** What a page load reveals about a session before any Supabase code runs. */
export interface PageSignals {
  pathname: string;
  search: string;
  hash: string;
  cookie: string;
}

/** Query or fragment parameters of an auth redirect: PKCE, implicit grant, OTP link and errors. */
const callbackParameters = new Set([
  "code",
  "token_hash",
  "type",
  "access_token",
  "error",
  "error_code",
  "error_description",
]);

/**
 * Whether the client must load as the page starts: a session cookie (whole or chunked) may hold
 * an account, an auth redirect must be completed, or the password page may be where a recovery
 * link landed. Any other page belongs to a guest until sign-in opens.
 */
export function needsClientAtStart(page: PageSignals, storageKey: string | null): boolean {
  if (!storageKey) return false;
  // Supabase splits a large session into numbered chunks: key.0, key.1 and so on.
  const sessionCookie = (name: string) =>
    name === storageKey ||
    (name.startsWith(`${storageKey}.`) && /^\d+$/.test(name.slice(storageKey.length + 1)));
  if (page.cookie.split(";").some((cookie) => sessionCookie(cookie.trim().split("=")[0])))
    return true;
  for (const parameters of [page.search, page.hash.replace(/^#/, "")])
    for (const name of new URLSearchParams(parameters).keys())
      if (callbackParameters.has(name)) return true;
  return isRoutePath(page.pathname, "resetPassword");
}

function currentPage(): PageSignals {
  const { pathname, search, hash } = window.location;
  return { pathname, search, hash, cookie: document.cookie };
}

// A returning account should be restored about as soon as it was when supabase-js shipped in the
// startup bundle, so the download starts while the page hydrates rather than after it.
if (typeof window !== "undefined" && needsClientAtStart(currentPage(), authStorageKey()))
  void preloadBrowserClient().catch(() => {});

export function createSession({
  page = currentPage,
  loadClient = loadBrowserClient,
}: {
  /** Reads the page the session starts on. */
  page?: () => PageSignals;
  loadClient?: () => Promise<BrowserClient | null>;
} = {}): Session {
  const store = createStore<SessionSnapshot>({
    user: null,
    userId: null,
    authLoading: isConfigured,
    authOpen: false,
  });
  const storageKey = authStorageKey();
  let client: BrowserClient | null = null;
  let loading: Promise<BrowserClient | null> | null = null;
  let active = false;
  let subscription: { unsubscribe(): void } | null = null;
  // An account that arrives while the sign-in dialog is open (restored, or signed in in another
  // tab) closes it: there is nothing left to sign in to.
  const setUser = (user: User | null) =>
    store.set((current) =>
      current.user === user && !current.authLoading && !(user && current.authOpen)
        ? current
        : {
            ...current,
            user,
            userId: user?.id ?? null,
            authLoading: false,
            authOpen: user ? false : current.authOpen,
          },
    );
  const settle = () =>
    store.set((current) => (current.authLoading ? { ...current, authLoading: false } : current));
  // Supabase replays the current session to a new subscriber as INITIAL_SESSION.
  const follow = () => {
    if (!client || !active || subscription) return;
    subscription = client.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user ?? null),
    ).data.subscription;
  };
  const load = (): Promise<BrowserClient | null> => {
    if (!isConfigured) return Promise.resolve(null);
    if (client) return Promise.resolve(client);
    loading ??= loadClient().then(
      (loaded) => {
        client = loaded;
        loading = null;
        follow();
        return loaded;
      },
      () => {
        // The sign-in code could not be downloaded: stay a guest and let a later action retry.
        loading = null;
        settle();
        monitor("authentication_failed");
        return null;
      },
    );
    return loading;
  };
  return {
    getSnapshot: store.getSnapshot,
    getServerSnapshot: store.getServerSnapshot,
    subscribe: store.subscribe,
    client: () => client,
    load,
    openAuth() {
      void load();
      store.set((current) => (current.authOpen ? current : { ...current, authOpen: true }));
    },
    closeAuth: () =>
      store.set((current) => (current.authOpen ? { ...current, authOpen: false } : current)),
    async signOut() {
      const supabase = await load();
      if (supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) return false;
      } else if (isConfigured) return false;
      // Clear the account at once instead of waiting for the SIGNED_OUT event.
      setUser(null);
      return true;
    },
    start() {
      active = true;
      if (!isConfigured)
        return () => {
          active = false;
        };
      if (client) follow();
      else if (needsClientAtStart(page(), storageKey)) void load();
      else settle();
      // Until the client loads, another tab's sign-in arrives on the channel Supabase broadcasts
      // auth events on (named after its storage key), or as a session cookie when this tab
      // becomes visible again or the connection returns (a download that failed offline).
      const tabs =
        storageKey && typeof BroadcastChannel !== "undefined"
          ? new BroadcastChannel(storageKey)
          : null;
      if (tabs) tabs.onmessage = () => void load();
      const resume = () => {
        if (
          !client &&
          document.visibilityState === "visible" &&
          needsClientAtStart(page(), storageKey)
        )
          void load();
      };
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", resume);
      if (typeof window !== "undefined") window.addEventListener("online", resume);
      return () => {
        active = false;
        subscription?.unsubscribe();
        subscription = null;
        tabs?.close();
        if (typeof document !== "undefined")
          document.removeEventListener("visibilitychange", resume);
        if (typeof window !== "undefined") window.removeEventListener("online", resume);
      };
    },
  };
}
