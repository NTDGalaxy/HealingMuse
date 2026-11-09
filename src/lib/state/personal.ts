import type { RealtimeChannel } from "@supabase/supabase-js";
import { api, ApiError, mutation } from "@/lib/browser/api";
import { monitor } from "@/lib/browser/monitor";
import type { PersonalData } from "@/lib/types";
import { createStore, type ReadableStore } from "./create-store";
import type { Session } from "./session";

/**
 * An own mutation's Realtime "invalidate" broadcast (sent by the database trigger on commit)
 * arrives around the HTTP response. The refresh that follows every successful mutation already
 * reads that commit, so broadcasts within this window after it are its echo, not news.
 */
export const echoWindow = 3000;

export type PersonalSnapshot = Readonly<{
  data: PersonalData | null;
  /** API error code of the last failed personal request, or "" (translated when rendered). */
  error: string;
}>;

export type PerformResult = { ok: true } | { ok: false; code: string };

export type Personal = ReadableStore<PersonalSnapshot> & {
  /**
   * Loads /api/me for the signed-in account. One request at a time: calls made while one is in
   * flight share a single trailing request, so every caller sees data read after its call.
   */
  refresh(): Promise<PersonalData | null>;
  /** Sends a personal change for the signed-in account, then refreshes. */
  perform(url: string, data: unknown, method?: string): Promise<PerformResult>;
  /** Realtime said personal data changed somewhere. */
  invalidate(): void;
  setError(code: string): void;
  clearError(): void;
  /** Follows the session, Realtime and tab visibility until the returned cleanup runs. */
  start(): () => void;
};

export function createPersonal({
  session,
  onData,
  now = () => Date.now(),
  online = () => typeof navigator === "undefined" || navigator.onLine,
}: {
  session: Session;
  /** Called with every applied /api/me response (the profile carries Calm). */
  onData?: (data: PersonalData) => void;
  now?: () => number;
  online?: () => boolean;
}): Personal {
  const store = createStore<PersonalSnapshot>({ data: null, error: "" });
  const owner = () => session.getSnapshot().userId;
  const setError = (error: string) =>
    store.set((current) => (current.error === error ? current : { ...current, error }));
  // Bumped whenever the account changes, so responses for the previous account are dropped.
  let epoch = 0;
  let inflight: Promise<PersonalData | null> | null = null;
  let trailing: Promise<PersonalData | null> | null = null;
  let pendingMutations = 0;
  let missedInvalidation = false;
  let lastCommit = -Infinity;

  const load = (): Promise<PersonalData | null> => {
    const account = owner();
    if (!account || !online()) return Promise.resolve(null);
    const started = epoch;
    const request = (async () => {
      try {
        const data = await api<PersonalData>("/api/me");
        if (started === epoch && data.profile.id === owner()) {
          store.set((current) => ({ ...current, data }));
          onData?.(data);
          return data;
        }
      } catch (error) {
        if (started === epoch) setError(error instanceof ApiError ? error.code : "unavailable");
      }
      return null;
    })();
    inflight = request;
    void request.finally(() => {
      if (inflight === request) inflight = null;
    });
    return request;
  };
  const refresh = (): Promise<PersonalData | null> => {
    if (!owner() || !online()) return Promise.resolve(null);
    if (trailing) return trailing;
    if (!inflight) return load();
    const started = epoch;
    const next: Promise<PersonalData | null> = inflight.then(() => {
      if (trailing === next) trailing = null;
      return started === epoch ? load() : null;
    });
    trailing = next;
    return next;
  };
  const invalidate = () => {
    if (pendingMutations > 0) {
      // Possibly this mutation's echo; perform decides once it knows whether it committed.
      missedInvalidation = true;
      return;
    }
    if (now() - lastCommit < echoWindow) return;
    void refresh();
  };
  const changeAccount = () => {
    epoch++;
    inflight = null;
    trailing = null;
    missedInvalidation = false;
    lastCommit = -Infinity;
    store.set((current) =>
      current.data === null && current.error === "" ? current : { data: null, error: "" },
    );
  };

  return {
    getSnapshot: store.getSnapshot,
    getServerSnapshot: store.getServerSnapshot,
    subscribe: store.subscribe,
    refresh,
    invalidate,
    setError,
    clearError: () => setError(""),
    async perform(url, data, method = "POST") {
      setError("");
      const account = owner();
      if (!account) {
        session.openAuth();
        return { ok: false, code: "unauthorized" };
      }
      let result: PerformResult;
      pendingMutations++;
      try {
        await mutation(url, data, method, account);
        result = { ok: true };
        lastCommit = now();
      } catch (error) {
        result = { ok: false, code: error instanceof ApiError ? error.code : "unavailable" };
      } finally {
        pendingMutations--;
      }
      const missed = missedInvalidation && pendingMutations === 0;
      if (pendingMutations === 0) missedInvalidation = false;
      if (owner() !== account) return { ok: false, code: "unauthorized" };
      if (result.ok) {
        await refresh();
        return result;
      }
      setError(result.code);
      if (result.code === "conflict") await refresh();
      // A broadcast that arrived during a failed mutation was another device's change.
      else if (missed) void refresh();
      return result;
    },
    start() {
      let stopped = false;
      // The account the Realtime channel and data belong to; changes are applied in sync().
      let account: string | null = null;
      let channel: RealtimeChannel | null = null;
      const close = () => {
        if (channel) void session.client()?.removeChannel(channel);
        channel = null;
      };
      const open = (id: string) => {
        const client = session.client();
        if (!client) return;
        const current: RealtimeChannel = client
          .channel(`user:${id}`, { config: { private: true } })
          .on("broadcast", { event: "invalidate" }, () => {
            if (channel === current) invalidate();
          })
          .subscribe((status) => {
            if (channel !== current) return;
            // Changes made before the subscription was confirmed are not broadcast to us.
            if (status === "SUBSCRIBED") void refresh();
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
              monitor("synchronization_failed");
          });
        channel = current;
      };
      // Channel and request work runs after the auth callback that changed the account returns,
      // as Supabase advises; only the stale data is dropped synchronously.
      const sync = () => {
        const next = owner();
        if (stopped || next === account) return;
        account = next;
        close();
        if (!next) return;
        open(next);
        void refresh();
      };
      let seen = owner();
      const follow = () => {
        const next = owner();
        if (next === seen) return;
        seen = next;
        changeAccount();
        queueMicrotask(sync);
      };
      sync();
      const stopSession = session.subscribe(follow);
      const resume = () => {
        if (document.visibilityState === "visible") void refresh();
      };
      window.addEventListener("online", resume);
      document.addEventListener("visibilitychange", resume);
      return () => {
        stopped = true;
        stopSession();
        account = null;
        close();
        window.removeEventListener("online", resume);
        document.removeEventListener("visibilitychange", resume);
      };
    },
  };
}
