import type { User } from "@supabase/supabase-js";
// Imported by this exact path so the browser fixture can substitute a synthetic client.
import { browserClient } from "@/lib/supabase/client";
import { isConfigured } from "@/lib/supabase/config";
import { createStore, type ReadableStore } from "./create-store";

export type SessionSnapshot = Readonly<{
  user: User | null;
  userId: string | null;
  /** True until the first auth event when sign-in is available at all. */
  authLoading: boolean;
  /** Whether the sign-in dialog is open. */
  authOpen: boolean;
}>;

export type BrowserClient = NonNullable<ReturnType<typeof browserClient>>;

export type Session = ReadableStore<SessionSnapshot> & {
  /** The Supabase browser client, or null in the local preview. */
  client(): BrowserClient | null;
  openAuth(): void;
  closeAuth(): void;
  /** Ends the session; false when Supabase could not sign out. */
  signOut(): Promise<boolean>;
  /** Follows Supabase auth events until the returned cleanup runs. */
  start(): () => void;
};

export function createSession(): Session {
  const store = createStore<SessionSnapshot>({
    user: null,
    userId: null,
    authLoading: isConfigured,
    authOpen: false,
  });
  let client: BrowserClient | null | undefined;
  const getClient = () => (client === undefined ? (client = browserClient()) : client);
  const setUser = (user: User | null) =>
    store.set((current) =>
      current.user === user && !current.authLoading
        ? current
        : { ...current, user, userId: user?.id ?? null, authLoading: false },
    );
  return {
    getSnapshot: store.getSnapshot,
    getServerSnapshot: store.getServerSnapshot,
    subscribe: store.subscribe,
    client: getClient,
    openAuth: () =>
      store.set((current) => (current.authOpen ? current : { ...current, authOpen: true })),
    closeAuth: () =>
      store.set((current) => (current.authOpen ? { ...current, authOpen: false } : current)),
    async signOut() {
      const supabase = getClient();
      if (supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) return false;
      }
      // Clear the account at once instead of waiting for the SIGNED_OUT event.
      setUser(null);
      return true;
    },
    start() {
      const supabase = getClient();
      if (!supabase) return () => {};
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
      return () => subscription.unsubscribe();
    },
  };
}
