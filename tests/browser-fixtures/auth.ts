import type { User } from "@supabase/supabase-js";
const user = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "synthetic@example.invalid",
} as User;
type Listener = (event: string, session: { user: User } | null) => void;
const listeners = new Set<Listener>();
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
      return { error: null };
    },
    async verifyOtp({ token }: { token: string }) {
      if (token !== "123456") return { error: { status: 400 } };
      for (const listener of listeners) listener("SIGNED_IN", { user });
      return { error: null };
    },
  },
  channel: () => channel,
  removeChannel: async () => {},
};
export const browserClient = () => client;
