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
  }
}
window.__syntheticAuthCalls = [];
function record(method: string) {
  window.__syntheticAuthCalls.push(method);
}
function signedIn() {
  for (const listener of listeners) listener("SIGNED_IN", { user });
  return { data: { session: { user } }, error: null };
}
const channel = {
  on() {
    return this;
  },
  subscribe(listener: (status: string) => void) {
    queueMicrotask(() => listener("SUBSCRIBED"));
    return this;
  },
};
const client = {
  auth: {
    onAuthStateChange(listener: Listener) {
      listeners.add(listener);
      queueMicrotask(() =>
        listener("INITIAL_SESSION", location.search.includes("guest") ? null : { user }),
      );
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
  channel: () => channel,
  removeChannel: async () => {},
};
export const browserClient = () => client;
