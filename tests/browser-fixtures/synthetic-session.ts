// The synthetic browser environment Supabase would leave behind, set up before any application
// module runs (main.tsx imports this first). The stubbed client (auth.ts) loads only on demand,
// exactly like the real one, so everything a guest page needs lives here.
import type { User } from "@supabase/supabase-js";
import { authStorageKey } from "@/lib/supabase/config";

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

export const user = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "synthetic@example.invalid",
} as User;

/** Supabase's cookie and cross-tab channel name for the fixture's project URL. */
export const storageKey = authStorageKey()!;

export function hasSessionCookie() {
  return document.cookie.split("; ").some((cookie) => cookie.startsWith(`${storageKey}=`));
}
export function setSessionCookie(present: boolean) {
  document.cookie = present
    ? `${storageKey}=synthetic-session; path=/; SameSite=Lax`
    : `${storageKey}=; path=/; max-age=0`;
}

window.__syntheticAuthCalls = [];
window.__syntheticSubscriptions = { auth: 0, channels: 0 };
window.__syntheticBroadcast = () => {};

// The cookie flag: a page opened with ?guest starts signed out, any other page signed in, so a
// signed-in page restores its session at start and a guest page never loads the client.
setSessionCookie(!new URLSearchParams(location.search).has("guest"));
