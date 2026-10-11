import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isConfigured, supabaseKey, supabaseUrl } from "./config";
import { serverFetch } from "@/lib/server/transport";

export async function serverClient() {
  if (!isConfigured) return null;
  const store = await cookies();
  return createServerClient(supabaseUrl!, supabaseKey!, {
    global: { fetch: serverFetch },
    db: { retry: false, timeout: 5000 },
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* Server Components cannot write cookies; proxy refreshes them. */
        }
      },
    },
  });
}
