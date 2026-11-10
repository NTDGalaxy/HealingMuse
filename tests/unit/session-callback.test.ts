import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoTrueClient } from "@supabase/auth-js";

// An auth redirect (a password-recovery link) completed by the real auth client, created only
// when its on-demand chunk arrives, which can be after the listener has navigated elsewhere.

const storageKey = "sb-synthetic-auth-token";
vi.mock("@/lib/supabase/config", async (original) => ({
  ...(await original<typeof import("@/lib/supabase/config")>()),
  isConfigured: true,
  authStorageKey: () => "sb-synthetic-auth-token",
}));
vi.mock("@/lib/browser/monitor", () => ({ monitor: vi.fn() }));

const { createSession } = await import("../../src/lib/state/session");
const { browserAuthOptions } = await import("../../src/lib/supabase/client");

type Location = { href: string; pathname: string; search: string; hash: string };
let location: Location;
const replaced: string[] = [];
function visit(url: string) {
  const parsed = new URL(url);
  location = {
    href: parsed.href,
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
  };
}
const page = () => ({ ...location, cookie: "" });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const tokenEndpoint = () =>
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () =>
    Response.json(tokens),
  );

const tokens = {
  access_token: "access",
  refresh_token: "refresh",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: { id: "user-1", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" },
};

/** The real auth client as the browser creates it, with a stored PKCE verifier. */
function authClient(fetch: typeof globalThis.fetch) {
  const memory = new Map<string, string>([
    [`${storageKey}-code-verifier`, JSON.stringify("synthetic-verifier/PASSWORD_RECOVERY")],
  ]);
  return new GoTrueClient({
    ...browserAuthOptions,
    url: "http://synthetic.invalid/auth/v1",
    storageKey,
    flowType: "pkce",
    autoRefreshToken: false,
    persistSession: true,
    storage: {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
      removeItem: (key) => void memory.delete(key),
    },
    fetch,
  });
}

beforeEach(() => {
  replaced.length = 0;
  vi.stubGlobal("BroadcastChannel", undefined);
  // Object.assign would copy the location getter's current value, so define it as a getter.
  const browserWindow = Object.defineProperty(new EventTarget(), "location", {
    get: () => location,
  });
  vi.stubGlobal(
    "window",
    Object.assign(browserWindow, {
      history: {
        state: null,
        replaceState: (_state: unknown, _title: string, url: string) => {
          replaced.push(url);
          visit(url);
        },
      },
    }),
  );
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), { visibilityState: "visible", cookie: "" }),
  );
});
afterEach(() => vi.unstubAllGlobals());

/** Starts a session whose client arrives when `arrive` resolves. */
function startWithHeldClient(fetch: typeof globalThis.fetch) {
  let arrive!: () => void;
  const chunk = new Promise<void>((resolve) => (arrive = resolve));
  const session = createSession({
    page,
    restoring: false,
    loadClient: async () => {
      await chunk;
      return { auth: authClient(fetch) } as never;
    },
  });
  session.start();
  return { session, arrive };
}

describe("an auth redirect completed by the on-demand client", () => {
  it("still exchanges a recovery code after the listener navigated away first", async () => {
    const fetch = tokenEndpoint();
    visit("http://synthetic.invalid/vi/reset-password?code=one-time");
    const { session, arrive } = startWithHeldClient(fetch);
    expect(session.getSnapshot().authLoading).toBe(true);
    visit("http://synthetic.invalid/vi/explore");
    arrive();
    await vi.waitFor(() => expect(session.getSnapshot().userId).toBe("user-1"));
    expect(String(fetch.mock.calls[0][0])).toContain("grant_type=pkce");
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({
      auth_code: "one-time",
      code_verifier: "synthetic-verifier",
    });
    // The page the listener moved to keeps its address.
    expect(replaced).toEqual([]);
  });
  it("removes the code from the address it landed on once exchanged", async () => {
    const fetch = tokenEndpoint();
    visit("http://synthetic.invalid/vi/reset-password?code=one-time&lang=vi");
    const { session, arrive } = startWithHeldClient(fetch);
    arrive();
    await vi.waitFor(() => expect(session.getSnapshot().userId).toBe("user-1"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(location.href).toBe("http://synthetic.invalid/vi/reset-password?lang=vi");
  });
  it("settles as a guest on an error redirect without exchanging anything", async () => {
    const fetch = tokenEndpoint();
    visit("http://synthetic.invalid/vi/reset-password#error=access_denied&error_code=otp_expired");
    const { session, arrive } = startWithHeldClient(fetch);
    arrive();
    await vi.waitFor(() => expect(session.getSnapshot().authLoading).toBe(false));
    await settle();
    expect(session.getSnapshot().userId).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
