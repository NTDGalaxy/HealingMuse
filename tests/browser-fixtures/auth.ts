import type { User } from "@supabase/supabase-js";
const user = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "synthetic@example.invalid",
} as User;
type Listener = (event: string, session: { user: User } | null) => void;
const listeners = new Set<Listener>();
declare global {
  interface Window {
    __syntheticAuthCalls: string[];
    __syntheticRecoveryPath?: string;
    /** Totals of auth listeners and Realtime channels the app has ever opened. */
    __syntheticSubscriptions: { auth: number; channels: number };
    /** Delivers a Realtime broadcast to every open channel, like the database trigger does. */
    __syntheticBroadcast: (event: string) => void;
  }
}
window.__syntheticAuthCalls = [];
window.__syntheticSubscriptions = { auth: 0, channels: 0 };
function record(method: string) {
  window.__syntheticAuthCalls.push(method);
}
function signedIn() {
  for (const listener of listeners) listener("SIGNED_IN", { user });
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
        if (listeners.has(listener))
          listener("INITIAL_SESSION", location.search.includes("guest") ? null : { user });
      });
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
    async signOut() {
      for (const listener of listeners) listener("SIGNED_OUT", null);
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
