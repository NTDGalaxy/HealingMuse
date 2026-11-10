// Synthetic Supabase browser client, substituted for @/lib/supabase/client by the fixture server.
// Like the real client it keeps the session in a cookie and tells other tabs about sign-in and
// sign-out on the storage-key channel. Like the real one (created with detectSessionInUrl: false)
// it never reads an auth redirect from the address: the app exchanges the code it captured.
import type { User } from "@supabase/supabase-js";
import { hasSessionCookie, setSessionCookie, storageKey, user } from "./synthetic-session";

type Listener = (event: string, session: { user: User } | null) => void;
const listeners = new Set<Listener>();
function record(method: string) {
  window.__syntheticAuthCalls.push(method);
}
const session = () => (hasSessionCookie() ? { user } : null);
function notify(event: string) {
  for (const listener of listeners) listener(event, session());
}
const tabs = new BroadcastChannel(storageKey);
tabs.onmessage = (message: MessageEvent<{ event: string }>) => notify(message.data.event);
function change(event: "SIGNED_IN" | "SIGNED_OUT") {
  setSessionCookie(event === "SIGNED_IN");
  notify(event);
  tabs.postMessage({ event });
}
function signedIn() {
  change("SIGNED_IN");
  return { data: { session: { user } }, error: null };
}

type Channel = {
  handlers: { event: string; handler: () => void }[];
  on(type: string, filter: { event: string }, handler: () => void): Channel;
  subscribe(listener: (status: string) => void): Channel;
};
const channels = new Set<Channel>();
window.__syntheticBroadcast = (event) => {
  for (const channel of channels)
    for (const entry of channel.handlers) if (entry.event === event) entry.handler();
};
function createChannel(): Channel {
  window.__syntheticSubscriptions.channels++;
  const channel: Channel = {
    handlers: [],
    on(_type, filter, handler) {
      channel.handlers.push({ event: filter.event, handler });
      return channel;
    },
    subscribe(listener) {
      channels.add(channel);
      queueMicrotask(() => listener("SUBSCRIBED"));
      return channel;
    },
  };
  return channel;
}
const client = {
  auth: {
    onAuthStateChange(listener: Listener) {
      window.__syntheticSubscriptions.auth++;
      listeners.add(listener);
      queueMicrotask(() => {
        if (listeners.has(listener)) listener("INITIAL_SESSION", session());
      });
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
    async signOut() {
      change("SIGNED_OUT");
      return { error: null };
    },
    async signInWithOtp() {
      record("signInWithOtp");
      if (location.search.includes("email-limit"))
        return { error: { status: 429, code: "over_email_send_rate_limit" } };
      return { error: null };
    },
    async signInWithPassword({ password }: { email: string; password: string }) {
      record("signInWithPassword");
      if (location.search.includes("request-limit"))
        return { data: { session: null }, error: { status: 429, code: "over_request_rate_limit" } };
      if (password !== "synthetic password only")
        return { data: { session: null }, error: { status: 400, code: "invalid_credentials" } };
      return signedIn();
    },
    async resetPasswordForEmail(_email: string, options: { redirectTo: string }) {
      record("resetPasswordForEmail");
      window.__syntheticRecoveryPath = new URL(options.redirectTo).pathname;
      if (new URL(options.redirectTo).origin !== location.origin)
        throw new Error("Unexpected recovery origin");
      if (location.search.includes("email-limit"))
        return { error: { status: 429, code: "over_email_send_rate_limit" } };
      return { error: null };
    },
    async updateUser() {
      record("updateUser");
      if (location.search.includes("password-update-error"))
        return { data: { user: null }, error: { status: 422, code: "weak_password" } };
      return { data: { user }, error: null };
    },
    async exchangeCodeForSession(code: string) {
      record("exchangeCodeForSession");
      if (code.startsWith("used"))
        return { data: { session: null }, error: { status: 404, code: "flow_state_not_found" } };
      return signedIn();
    },
    async verifyOtp({ token }: { token: string }) {
      record("verifyOtp");
      if (token !== "123456") return { data: { session: null }, error: { status: 400 } };
      return signedIn();
    },
  },
  channel: () => createChannel(),
  removeChannel: async (channel: Channel) => {
    channels.delete(channel);
  },
};
export const browserClient = () => client;
