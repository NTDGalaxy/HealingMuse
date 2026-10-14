import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
try {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secret = process.env.SUPABASE_SECRET_KEY;
  const options = {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
  };
  const client = createClient(url, key, options);
  const admin = createClient(url, secret, options);
  const [catalog, roles] = await Promise.all([
    client.from("tracks").select("id").limit(1),
    admin.from("content_admins").select("user_id").limit(1),
  ]);
  const summary = (result) => ({
    status: result.status,
    failed: !!result.error,
    code: result.error?.code || (!result.error ? "ok" : "network_or_gateway"),
    sampleCount: result.data?.length ?? null,
  });
  console.log(JSON.stringify({ catalog: summary(catalog), administratorTable: summary(roles) }));
  if (catalog.error || roles.error) process.exitCode = 1;
} catch {
  console.error(
    JSON.stringify({ event: "supabase_probe_failed", code: "configuration_or_network" }),
  );
  process.exitCode = 1;
}
