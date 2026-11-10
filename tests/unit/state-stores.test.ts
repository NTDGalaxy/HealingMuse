import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DownloadedTrack, PersonalData, Track } from "@/lib/types";

const fake = vi.hoisted(() => {
  type AuthListener = (event: string, session: { user: { id: string } } | null) => void;
  type Channel = {
    name: string;
    invalidate?: () => void;
    status?: (status: string) => void;
    on(type: string, filter: { event: string }, handler: () => void): Channel;
    subscribe(listener: (status: string) => void): Channel;
  };
  const state = {
    auth: new Set<AuthListener>(),
    channels: [] as Channel[],
    removed: [] as Channel[],
    signOutError: null as null | { message: string },
    /** How exchanging an auth redirect's code behaves: resolve, reject, or throw synchronously. */
    exchange: "resolve" as "resolve" | "reject" | "throw",
    /** Browser clients handed out, that is, how often the client module was loaded and used. */
    loads: 0,
  };
  const client = {
    auth: {
      onAuthStateChange(listener: AuthListener) {
        state.auth.add(listener);
        return { data: { subscription: { unsubscribe: () => state.auth.delete(listener) } } };
      },
      async signOut() {
        return { error: state.signOutError };
      },
      exchangeCodeForSession() {
        if (state.exchange === "throw") throw new TypeError("exchange unavailable");
        if (state.exchange === "reject") return Promise.reject(new Error("network"));
        return Promise.resolve({ data: { session: null }, error: null });
      },
    },
    channel(name: string) {
      const channel: Channel = {
        name,
        on(_type, _filter, handler) {
          channel.invalidate = handler;
          return channel;
        },
        subscribe(listener) {
          channel.status = listener;
          return channel;
        },
      };
      state.channels.push(channel);
      return channel;
    },
    async removeChannel(channel: Channel) {
      state.removed.push(channel);
    },
  };
  const emit = (user: { id: string } | null) => {
    for (const listener of state.auth) listener("SIGNED_IN", user && { user });
  };
  return { state, client, emit };
});
vi.mock("@/lib/supabase/client", () => ({
  browserClient: () => {
    fake.state.loads++;
    return fake.client;
  },
}));
vi.mock("@/lib/supabase/config", async (original) => ({
  ...(await original<typeof import("@/lib/supabase/config")>()),
  isConfigured: true,
  authStorageKey: () => "sb-synthetic-auth-token",
}));
vi.mock("@/lib/browser/monitor", () => ({ monitor: vi.fn() }));
vi.mock("@/lib/browser/api", async (original) => ({
  ...(await original<typeof import("@/lib/browser/api")>()),
  api: vi.fn(),
  mutation: vi.fn(),
}));
vi.mock("@/lib/browser/downloads", () => ({
  listDownloads: vi.fn(),
  downloadRecording: vi.fn(),
  removeDownload: vi.fn(),
  clearDownloads: vi.fn(),
}));

import { api, ApiError, mutation } from "@/lib/browser/api";
import { monitor } from "@/lib/browser/monitor";
import {
  clearDownloads,
  downloadRecording,
  listDownloads,
  removeDownload,
} from "@/lib/browser/downloads";
import { createStore } from "@/lib/state/create-store";
import { createAnnouncer } from "@/lib/state/announcer";
import { createTrackCache, trackCacheLimit } from "@/lib/state/track-cache";
import { createSession, needsClientAtStart, type PageSignals } from "@/lib/state/session";
import { createPersonal, echoWindow } from "@/lib/state/personal";
import { createDownloads } from "@/lib/state/downloads";

const apiMock = vi.mocked(api);
const mutationMock = vi.mocked(mutation);
const track = (n: number) =>
  ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    title: { vi: `Bản ${n}`, en: `Recording ${n}` },
  }) as Track;
const personal = (id: string, favorites: string[] = []): PersonalData => ({
  profile: { id, locale: "en", calm_mode: false, mood_consent_at: null },
  favorites,
  playlists: [],
  checkins: [],
  isAdmin: false,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const storageKey = "sb-synthetic-auth-token";
const page = (overrides: Partial<PageSignals> = {}): PageSignals => ({
  pathname: "/vi/library",
  search: "",
  hash: "",
  cookie: "",
  ...overrides,
});
/** A page load carrying a session cookie, so the client loads as the session starts. */
const returning = () => page({ cookie: `${storageKey}=base64-session` });
const guest = () => page();

beforeEach(() => {
  vi.resetAllMocks();
  fake.state.auth.clear();
  fake.state.channels.length = 0;
  fake.state.removed.length = 0;
  fake.state.signOutError = null;
  fake.state.exchange = "resolve";
  fake.state.loads = 0;
});

describe("createStore", () => {
  it("notifies only for a different value and keeps the initial server snapshot", () => {
    const store = createStore({ count: 0 });
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    const first = store.getSnapshot();
    store.set(first);
    expect(listener).not.toHaveBeenCalled();
    store.set((current) => ({ count: current.count + 1 }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getServerSnapshot()).toBe(first);
    stop();
    store.set({ count: 5 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("announcer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("shows one notice and clears it after six seconds", () => {
    const announcer = createAnnouncer();
    announcer.announce("Saved");
    expect(announcer.getSnapshot()).toBe("Saved");
    vi.advanceTimersByTime(5000);
    announcer.announce("Saved");
    vi.advanceTimersByTime(1000);
    expect(announcer.getSnapshot()).toBe("");
    announcer.announce("First");
    vi.advanceTimersByTime(4000);
    announcer.announce("Second");
    vi.advanceTimersByTime(4000);
    expect(announcer.getSnapshot()).toBe("Second");
    announcer.dispose();
    vi.advanceTimersByTime(10000);
    expect(announcer.getSnapshot()).toBe("Second");
  });
});

describe("track cache", () => {
  it("keeps the most recently registered recordings within the limit", () => {
    const cache = createTrackCache([track(1), track(2)]);
    const initial = cache.getSnapshot();
    cache.register([track(1)]);
    expect(cache.getSnapshot().list.map((item) => item.id)).toEqual([track(2).id, track(1).id]);
    expect(cache.getServerSnapshot()).toBe(initial);
    cache.register(Array.from({ length: trackCacheLimit + 10 }, (_, index) => track(index + 10)));
    const { list, byId } = cache.getSnapshot();
    expect(list).toHaveLength(trackCacheLimit);
    expect(byId.has(track(1).id)).toBe(false);
    expect(list.at(-1)!.id).toBe(track(trackCacheLimit + 19).id);
  });
  it("does not notify when the registered recordings are already the most recent", () => {
    const tracks = [track(1), track(2), track(3)];
    const cache = createTrackCache(tracks);
    const listener = vi.fn();
    cache.subscribe(listener);
    cache.register(tracks.slice(1));
    cache.register([]);
    expect(listener).not.toHaveBeenCalled();
    cache.register([{ ...track(3) }]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("fetches only unknown recordings, one hundred per request", async () => {
    const cache = createTrackCache([track(1)]);
    apiMock.mockImplementation(async (url: string) =>
      new URL(url, "http://local").searchParams
        .get("ids")!
        .split(",")
        .map((id) => ({ ...track(0), id })),
    );
    const ids = Array.from({ length: 250 }, (_, index) => track(index + 1).id);
    await cache.ensure([...ids, ids[5]]);
    expect(apiMock).toHaveBeenCalledTimes(3);
    expect(apiMock.mock.calls.map(([url]) => url.split(",").length)).toEqual([100, 100, 49]);
    expect(apiMock.mock.calls[0][0]).not.toContain(track(1).id);
    expect(cache.get(ids[249])?.id).toBe(ids[249]);
    await cache.ensure(ids);
    expect(apiMock).toHaveBeenCalledTimes(3);
  });
});

describe("session start signals", () => {
  it("loads at start for a session cookie, an auth redirect or the password page", () => {
    for (const signals of [
      page({ cookie: `theme=night; ${storageKey}=base64-session` }),
      page({ cookie: `${storageKey}.0=chunk; ${storageKey}.1=chunk` }),
      page({ search: "?code=one-time" }),
      page({ search: "?token_hash=abc&type=recovery" }),
      page({ hash: "#access_token=a&refresh_token=b&type=recovery" }),
      page({ hash: "#error=access_denied&error_code=otp_expired&error_description=Expired" }),
      page({ pathname: "/en/reset-password" }),
      page({ pathname: "/vi/reset-password" }),
    ])
      expect(needsClientAtStart(signals, storageKey), JSON.stringify(signals)).toBe(true);
  });
  it("treats every other page as a guest's", () => {
    for (const signals of [
      page(),
      page({ pathname: "/vi/explore", search: "?q=piano&category=instrumental&cursor=abc" }),
      page({ cookie: `${storageKey}-code-verifier=pending; ${storageKey}.x=other` }),
      page({ cookie: "sb-another-project-auth-token=session" }),
    ])
      expect(needsClientAtStart(signals, storageKey), JSON.stringify(signals)).toBe(false);
    expect(needsClientAtStart(page({ search: "?code=x" }), null)).toBe(false);
  });
});

describe("session", () => {
  // Node has BroadcastChannel; only the cross-tab test opens one, and it closes it again.
  beforeEach(() => vi.stubGlobal("BroadcastChannel", undefined));
  afterEach(() => vi.unstubAllGlobals());
  it("restores a returning account and only settles loading once", async () => {
    const session = createSession({ page: returning });
    expect(session.getSnapshot()).toMatchObject({ user: null, authLoading: true });
    const stop = session.start();
    await settle();
    expect(session.getSnapshot().authLoading).toBe(true);
    fake.emit(null);
    expect(session.getSnapshot()).toMatchObject({ userId: null, authLoading: false });
    fake.emit({ id: "a" });
    expect(session.getSnapshot().userId).toBe("a");
    stop();
    expect(fake.state.auth.size).toBe(0);
  });
  it("renders a guest's controls at once when the server saw no session cookie", async () => {
    const loadClient = async () => fake.client as never;
    const guestPage = createSession({ page: guest, restoring: false, loadClient });
    expect(guestPage.getServerSnapshot?.().authLoading).toBe(false);
    guestPage.start();
    expect(guestPage.getSnapshot().authLoading).toBe(false);
    // A redirect the server could not see still restores before anything else renders.
    const callback = createSession({
      page: () => page({ search: "?code=x" }),
      restoring: false,
      loadClient,
    });
    callback.start();
    expect(callback.getSnapshot().authLoading).toBe(true);
    // The password page loads the client quietly, without waiting on it.
    const password = createSession({
      page: () => page({ pathname: "/vi/reset-password" }),
      restoring: false,
      loadClient,
    });
    password.start();
    expect(password.getSnapshot().authLoading).toBe(false);
    await settle();
    expect(password.client()).toBe(fake.client);
    expect(guestPage.client()).toBeNull();
  });
  it("still follows the account when completing an auth redirect fails", async () => {
    for (const exchange of ["reject", "throw"] as const) {
      fake.state.auth.clear();
      fake.state.exchange = exchange;
      const session = createSession({
        page: () => page({ search: "?code=x" }),
        loadClient: async () => fake.client as never,
      });
      session.start();
      await expect(session.load()).resolves.toBe(fake.client);
      // Subscribed, so INITIAL_SESSION settles the page instead of leaving it restoring.
      expect(fake.state.auth.size).toBe(1);
      fake.emit(null);
      expect(session.getSnapshot()).toMatchObject({ user: null, authLoading: false });
    }
  });
  it("settles a guest at once and loads the client only when sign-in opens", async () => {
    const session = createSession({ page: guest });
    session.start();
    expect(session.getSnapshot()).toMatchObject({ user: null, authLoading: false });
    await settle();
    expect(fake.state.loads).toBe(0);
    expect(session.client()).toBeNull();
    session.openAuth();
    expect(session.getSnapshot().authOpen).toBe(true);
    await settle();
    expect(fake.state.loads).toBe(1);
    fake.emit({ id: "a" });
    expect(session.getSnapshot().userId).toBe("a");
    expect(await session.load()).toBe(fake.client);
    expect(fake.state.loads).toBe(1);
  });
  it("opens the sign-in dialog and signs out only when Supabase confirms", async () => {
    const session = createSession({ page: returning });
    session.start();
    await settle();
    fake.emit({ id: "a" });
    session.openAuth();
    expect(session.getSnapshot().authOpen).toBe(true);
    session.closeAuth();
    expect(session.getSnapshot().authOpen).toBe(false);
    fake.state.signOutError = { message: "down" };
    expect(await session.signOut()).toBe(false);
    expect(session.getSnapshot().userId).toBe("a");
    fake.state.signOutError = null;
    expect(await session.signOut()).toBe(true);
    expect(session.getSnapshot().user).toBeNull();
  });
  it("follows another tab's sign-in before its own client has loaded", async () => {
    vi.unstubAllGlobals();
    const session = createSession({ page: guest });
    const stop = session.start();
    const otherTab = new BroadcastChannel(storageKey);
    otherTab.postMessage({ event: "SIGNED_IN" });
    await vi.waitFor(() => expect(fake.state.loads).toBe(1));
    fake.emit({ id: "b" });
    expect(session.getSnapshot().userId).toBe("b");
    otherTab.close();
    stop();
  });
  it("retries a returning account's failed download when the connection returns", async () => {
    const tab = Object.assign(new EventTarget(), { visibilityState: "visible" });
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("document", tab);
    let attempts = 0;
    const session = createSession({
      page: returning,
      loadClient: async () => {
        if (++attempts === 1) throw new Error("offline");
        return fake.client as never;
      },
    });
    const stop = session.start();
    await settle();
    expect(session.getSnapshot()).toMatchObject({ userId: null, authLoading: false });
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(attempts).toBe(2);
    fake.emit({ id: "returning" });
    expect(session.getSnapshot().userId).toBe("returning");
    stop();
    window.dispatchEvent(new Event("online"));
    expect(attempts).toBe(2);
  });
  it("closes the sign-in dialog when an account arrives while it is open", async () => {
    const session = createSession({ page: returning });
    session.start();
    session.openAuth();
    await settle();
    expect(session.getSnapshot()).toMatchObject({ authOpen: true, authLoading: true });
    fake.emit({ id: "a" });
    expect(session.getSnapshot()).toMatchObject({ userId: "a", authOpen: false });
    fake.emit(null);
    session.openAuth();
    expect(session.getSnapshot().authOpen).toBe(true);
    fake.emit(null);
    expect(session.getSnapshot().authOpen).toBe(true);
  });
  it("stays a guest when the client cannot be downloaded, and can retry", async () => {
    let attempts = 0;
    const session = createSession({
      page: returning,
      loadClient: async () => {
        if (++attempts === 1) throw new Error("chunk failed");
        return fake.client as never;
      },
    });
    session.start();
    await settle();
    expect(session.getSnapshot()).toMatchObject({ user: null, authLoading: false });
    expect(monitor).toHaveBeenCalledWith("authentication_failed");
    expect(await session.load()).toBe(fake.client);
    expect(attempts).toBe(2);
  });
});

describe("personal data", () => {
  let clock: number;
  let page: EventTarget & { visibilityState: string };
  beforeEach(() => {
    clock = 1000;
    page = Object.assign(new EventTarget(), { visibilityState: "visible" });
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("document", page);
    vi.stubGlobal("BroadcastChannel", undefined);
  });
  afterEach(() => vi.unstubAllGlobals());
  const setup = async () => {
    const session = createSession({ page: returning });
    const onData = vi.fn();
    const store = createPersonal({ session, onData, now: () => clock, online: () => true });
    session.start();
    // The returning account's client loads before its auth events can arrive.
    await settle();
    const stop = store.start();
    return { session, store, onData, stop };
  };
  const signIn = async (id = "a") => {
    fake.emit({ id });
    await settle();
  };

  it("coalesces overlapping refreshes into one trailing request", async () => {
    const { store } = await setup();
    const requests: ReturnType<typeof deferred<PersonalData>>[] = [];
    apiMock.mockImplementation(() => {
      const request = deferred<PersonalData>();
      requests.push(request);
      return request.promise as Promise<never>;
    });
    await signIn();
    // Sign-in starts one request; the subscription confirmation and two more callers wait.
    fake.state.channels[0].status!("SUBSCRIBED");
    const calls = [store.refresh(), store.refresh()];
    expect(requests).toHaveLength(1);
    requests[0].resolve(personal("a"));
    await settle();
    expect(requests).toHaveLength(2);
    requests[1].resolve(personal("a", ["x"]));
    expect((await Promise.all(calls)).map((data) => data?.favorites)).toEqual([["x"], ["x"]]);
    expect(store.getSnapshot().data?.favorites).toEqual(["x"]);
  });
  it("drops a response that belongs to the previous account", async () => {
    const { store, onData } = await setup();
    const first = deferred<PersonalData>();
    apiMock.mockReturnValueOnce(first.promise as Promise<never>);
    await signIn("a");
    apiMock.mockResolvedValue(personal("b") as never);
    await signIn("b");
    first.resolve(personal("a"));
    await settle();
    expect(store.getSnapshot().data?.profile.id).toBe("b");
    expect(onData).toHaveBeenCalledTimes(1);
    expect(fake.state.removed.map((channel) => channel.name)).toEqual(["user:a"]);
    fake.emit(null);
    expect(store.getSnapshot().data).toBeNull();
  });
  it("re-subscribes Realtime only when the account changes", async () => {
    const { session } = await setup();
    apiMock.mockResolvedValue(personal("a") as never);
    await signIn("a");
    fake.emit({ id: "a" });
    session.openAuth();
    await settle();
    expect(fake.state.channels.map((channel) => channel.name)).toEqual(["user:a"]);
    fake.state.channels[0].status!("CHANNEL_ERROR");
    expect(monitor).toHaveBeenCalledWith("synchronization_failed");
  });
  it("asks a guest to sign in instead of sending a change", async () => {
    const { session, store } = await setup();
    fake.emit(null);
    expect(await store.perform("/api/favorites", { trackId: "x", saved: true })).toEqual({
      ok: false,
      code: "unauthorized",
    });
    expect(session.getSnapshot().authOpen).toBe(true);
    expect(mutationMock).not.toHaveBeenCalled();
  });
  it("sends a change for the signed-in owner and reports failures by code", async () => {
    const { store } = await setup();
    apiMock.mockResolvedValue(personal("a") as never);
    await signIn("a");
    apiMock.mockClear();
    mutationMock.mockResolvedValueOnce(undefined as never);
    expect(await store.perform("/api/me", { calmMode: true }, "PATCH")).toEqual({ ok: true });
    expect(mutationMock).toHaveBeenCalledWith("/api/me", { calmMode: true }, "PATCH", "a");
    expect(apiMock).toHaveBeenCalledTimes(1);
    mutationMock.mockRejectedValueOnce(new ApiError("conflict", 409));
    expect(await store.perform("/api/playlists/p", {}, "PATCH")).toEqual({
      ok: false,
      code: "conflict",
    });
    expect(store.getSnapshot().error).toBe("conflict");
    expect(apiMock).toHaveBeenCalledTimes(2);
    mutationMock.mockRejectedValueOnce(new Error("network"));
    expect(await store.perform("/api/favorites", {})).toEqual({ ok: false, code: "unavailable" });
    expect(apiMock).toHaveBeenCalledTimes(2);
  });
  it("ignores the Realtime echo of its own change but not other devices' changes", async () => {
    const { store } = await setup();
    apiMock.mockResolvedValue(personal("a") as never);
    await signIn("a");
    await settle();
    apiMock.mockClear();
    store.invalidate();
    expect(apiMock).toHaveBeenCalledTimes(1);
    await settle();
    const committed = deferred<void>();
    mutationMock.mockReturnValueOnce(committed.promise as Promise<never>);
    const saving = store.perform("/api/favorites", { trackId: "x", saved: true });
    store.invalidate();
    committed.resolve();
    await saving;
    store.invalidate();
    clock += echoWindow - 1;
    store.invalidate();
    expect(apiMock).toHaveBeenCalledTimes(2);
    clock += 1;
    store.invalidate();
    expect(apiMock).toHaveBeenCalledTimes(3);
  });
  it("refreshes after a failed change when another device changed data meanwhile", async () => {
    const { store } = await setup();
    apiMock.mockResolvedValue(personal("a") as never);
    await signIn("a");
    await settle();
    apiMock.mockClear();
    const failing = deferred<void>();
    mutationMock.mockReturnValueOnce(failing.promise as Promise<never>);
    const saving = store.perform("/api/favorites", {});
    store.invalidate();
    failing.reject(new ApiError("invalid", 400));
    await saving;
    await settle();
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().error).toBe("invalid");
    store.invalidate();
    expect(apiMock).toHaveBeenCalledTimes(2);
  });
  it("settles once /api/me answers, and a later change never unsettles it", async () => {
    const { store } = await setup();
    apiMock.mockRejectedValue(new ApiError("unavailable", 503) as never);
    expect(store.getSnapshot().settled).toBe(false);
    await signIn();
    expect(store.getSnapshot()).toMatchObject({ data: null, error: "unavailable", settled: true });
    const committed = deferred<void>();
    mutationMock.mockReturnValueOnce(committed.promise as Promise<never>);
    const saving = store.perform("/api/me", { moodConsent: true }, "PATCH");
    // The change clears the error while it runs; the account's data is still known to be missing.
    expect(store.getSnapshot()).toMatchObject({ error: "", settled: true });
    committed.resolve();
    await saving;
    expect(store.getSnapshot().settled).toBe(true);
    fake.emit(null);
    expect(store.getSnapshot()).toMatchObject({ data: null, error: "", settled: false });
  });
  it("refreshes when the tab becomes visible or the device comes back online", async () => {
    const { store, stop } = await setup();
    apiMock.mockResolvedValue(personal("a") as never);
    await signIn("a");
    await settle();
    apiMock.mockClear();
    page.dispatchEvent(new Event("visibilitychange"));
    await settle();
    window.dispatchEvent(new Event("online"));
    await settle();
    page.visibilityState = "hidden";
    page.dispatchEvent(new Event("visibilitychange"));
    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().error).toBe("");
    stop();
    page.visibilityState = "visible";
    page.dispatchEvent(new Event("visibilitychange"));
    expect(apiMock).toHaveBeenCalledTimes(2);
  });
});

describe("downloads", () => {
  const saved = (id: string) => ({ id, bytes: 10 }) as DownloadedTrack;
  it("publishes progress separately and relists after saving", async () => {
    const downloads = createDownloads();
    const progressListener = vi.fn();
    const recordsListener = vi.fn();
    downloads.progress.subscribe(progressListener);
    downloads.records.subscribe(recordsListener);
    vi.mocked(listDownloads).mockResolvedValue([saved(track(1).id)]);
    vi.mocked(downloadRecording).mockImplementation(async (_track, progress) => {
      progress(10);
      progress(10);
      progress(55);
      expect(await downloads.download(track(2))).toEqual({ status: "busy" });
    });
    expect(await downloads.download(track(1))).toEqual({ status: "saved" });
    // Start (0), 10 and 55 percent, then cleared; the repeated 10 percent is skipped.
    expect(progressListener).toHaveBeenCalledTimes(4);
    expect(downloads.progress.getSnapshot()).toBeNull();
    expect(downloads.records.getSnapshot().items).toEqual([saved(track(1).id)]);
    expect(recordsListener).toHaveBeenCalledTimes(1);
  });
  it("cancels silently and maps failures to message keys", async () => {
    const downloads = createDownloads();
    vi.mocked(downloadRecording).mockImplementationOnce(
      (_track, _progress, signal) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
        ),
    );
    const pending = downloads.download(track(1));
    downloads.cancel();
    expect(await pending).toEqual({ status: "cancelled" });
    expect(downloads.records.getSnapshot().error).toBe("");
    for (const [error, code] of [
      [new ApiError("rate_limited", 429), "rate_limited"],
      [new DOMException("Full", "QuotaExceededError"), "storageFull"],
      [new Error("integrity"), "integrity"],
      [new Error("unsupported"), "unsupported"],
      [new Error("storage_full"), "interrupted"],
    ] as const) {
      vi.mocked(downloadRecording).mockRejectedValueOnce(error);
      expect(await downloads.download(track(1))).toEqual({ status: "failed", code });
      expect(downloads.records.getSnapshot().error).toBe(code);
    }
  });
  it("loads, removes and reports unavailable storage", async () => {
    const downloads = createDownloads();
    vi.mocked(listDownloads).mockRejectedValueOnce(new Error("unsupported"));
    await downloads.load();
    expect(downloads.records.getSnapshot().error).toBe("unsupported");
    vi.mocked(listDownloads).mockResolvedValue([]);
    await downloads.remove("x");
    expect(removeDownload).toHaveBeenCalledWith("x");
    await downloads.remove();
    expect(clearDownloads).toHaveBeenCalled();
  });
  it("never applies a stale listing over a newer one", async () => {
    const downloads = createDownloads();
    const slow = deferred<DownloadedTrack[]>();
    vi.mocked(listDownloads).mockReturnValueOnce(slow.promise);
    vi.mocked(listDownloads).mockResolvedValueOnce([saved("new")]);
    vi.mocked(downloadRecording).mockResolvedValueOnce(undefined);
    const loading = downloads.load();
    await downloads.download(track(1));
    slow.resolve([]);
    await loading;
    expect(downloads.records.getSnapshot().items).toEqual([saved("new")]);
  });
});
