"use client";
import { createBrowserClient } from "@supabase/ssr";
import { isConfigured, supabaseKey, supabaseUrl } from "./config";

/**
 * The client is created on demand, possibly after the listener has navigated away from the page
 * an auth redirect landed on, so it must not read the redirect from the address it finds then.
 * src/lib/state/session.ts captures the redirect when the page starts and completes it instead.
 */
export const browserAuthOptions = { detectSessionInUrl: false } as const;

export function browserClient() {
  return isConfigured
    ? createBrowserClient(supabaseUrl!, supabaseKey!, { auth: browserAuthOptions })
    : null;
}
