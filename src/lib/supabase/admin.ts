import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";
import { serverFetch } from "@/lib/server/transport";

// Callers must verify ownership, publication status, or content-admin rights first.
export function privilegedClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !key) throw new Error("Privileged storage operations are not configured");
  return createClient(supabaseUrl, key, {
    global: { fetch: serverFetch },
    db: { retry: false, timeout: 5000 },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
