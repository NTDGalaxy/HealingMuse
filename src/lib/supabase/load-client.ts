import { isConfigured } from "./config";
import type { browserClient } from "./client";

export type BrowserClient = NonNullable<ReturnType<typeof browserClient>>;

// supabase-js stays out of every route's startup JavaScript: it downloads only when a session
// may exist or sign-in opens (src/lib/state/session.ts decides). The module is imported by this
// exact specifier so the browser fixture can substitute its synthetic client.

/** Starts downloading the client module without creating the client. */
export function preloadBrowserClient(): Promise<unknown> {
  return isConfigured ? import("@/lib/supabase/client") : Promise.resolve();
}

/** The Supabase browser client, or null in the local preview. */
export async function loadBrowserClient(): Promise<BrowserClient | null> {
  if (!isConfigured) return null;
  const { browserClient } = await import("@/lib/supabase/client");
  return browserClient();
}
