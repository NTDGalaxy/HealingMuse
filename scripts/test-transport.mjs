import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";
config({ path: ".env.local", quiet: true });
const { serverFetch } = await import("../src/lib/server/transport.ts");
const make = (key) =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { retry: false, timeout: 5000 },
    global: { fetch: serverFetch },
  });
const guest = make(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  admin = make(process.env.SUPABASE_SECRET_KEY);
const checks = [];
const probe = async (name, action) => {
  const start = performance.now();
  try {
    await action();
    checks.push({ name, passed: true, ms: Math.round(performance.now() - start) });
  } catch (error) {
    checks.push({
      name,
      passed: false,
      ms: Math.round(performance.now() - start),
      category: error.name,
    });
  }
};
await probe("auth-settings", async () => {
  const result = await serverFetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1/settings", {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
  });
  if (!result.ok) throw Error("Auth unavailable");
  await result.json();
});
await probe("published-query", async () => {
  const { error } = await guest.rpc("catalog_page", { p_query: { limit: 24 }, p_admin: false });
  if (error) throw Error("Database unavailable");
});
await probe("storage-signing", async () => {
  const { data, error } = await admin.from("tracks").select("source").limit(1).single();
  if (error) throw Error("Draft lookup unavailable");
  const result = await admin.storage.from("audio").createSignedUrl(data.source.path, 60);
  if (result.error || !result.data?.signedUrl) throw Error("Storage signing unavailable");
});
await probe("cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  try {
    await serverFetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1/settings", {
      signal: controller.signal,
    });
    throw Error("Cancellation was ignored");
  } catch (error) {
    if (error.name !== "AbortError") throw error;
  }
});
await writeFile("artifacts/cloud-transport.json", JSON.stringify(checks, null, 2));
console.log(JSON.stringify(checks));
if (checks.some((check) => !check.passed)) process.exitCode = 1;
