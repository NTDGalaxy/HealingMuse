import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
if (process.env.STAGING_TESTS_ALLOWED !== "true")
  throw new Error("Set STAGING_TESTS_ALLOWED=true only for a dedicated synthetic staging project.");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !key || !secret) throw new Error("Configure staging credentials locally.");
const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ids = [];
const clients = [];
try {
  const { data: tracks, error } = await admin
    .from("tracks")
    .select("id")
    .eq("status", "published")
    .limit(1);
  if (error || !tracks?.length) throw new Error("Publish a reviewed staging recording first.");
  const setup = await Promise.allSettled(
    Array.from({ length: 25 }, async () => {
      const email = `healingmuse-load-${randomUUID()}@example.invalid`;
      const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      if (error) throw new Error("Synthetic authentication setup failed");
      ids.push(data.user.id);
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      clients.push(client);
      const auth = await client.auth.verifyOtp({
        token_hash: data.properties.hashed_token,
        type: "magiclink",
      });
      if (auth.error) throw new Error("Synthetic OTP verification failed");
      await client.realtime.setAuth(auth.data.session.access_token);
      let receive;
      const invalidation = new Promise((resolve) => {
        receive = resolve;
      });
      const channel = client
        .channel(`user:${data.user.id}`, { config: { private: true } })
        .on("broadcast", { event: "invalidate" }, () => receive(performance.now()));
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Private channel timeout")), 15000);
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            clearTimeout(timeout);
            resolve();
          } else if (status === "CHANNEL_ERROR") {
            clearTimeout(timeout);
            reject(new Error("Private channel denied"));
          }
        });
      });
      return { client, id: data.user.id, invalidation };
    }),
  );
  if (setup.some((result) => result.status === "rejected"))
    throw new Error("Synthetic authentication setup failed");
  const fixtures = setup.map((result) => result.value);
  const measurements = await Promise.allSettled(
    fixtures.map(async (fixture) => {
      const start = performance.now();
      const result = await fixture.client
        .from("favorites")
        .insert({ owner_id: fixture.id, track_id: tracks[0].id });
      if (result.error) throw new Error("Synthetic mutation failed");
      let timer;
      let at;
      try {
        at = await Promise.race([
          fixture.invalidation,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("Broadcast timeout")), 15000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      const refetch = await fixture.client.from("favorites").select("track_id");
      if (refetch.error || !refetch.data.length) throw new Error("Personal refetch failed");
      return performance.now() - start + (at < start ? 15000 : 0);
    }),
  );
  if (measurements.some((result) => result.status === "rejected"))
    throw new Error("Synthetic synchronization measurement failed");
  const samples = measurements.map((result) => result.value);
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
  console.log(
    JSON.stringify({
      concurrentUsers: 25,
      personalSyncP95Ms: Math.round(p95),
      targetMs: 2000,
      passed: p95 <= 2000,
    }),
  );
  if (p95 > 2000) process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ event: "synchronization_load_failed" }));
  process.exitCode = 1;
} finally {
  await Promise.allSettled(
    clients
      .filter((client) => client.getChannels().length)
      .map((client) => client.removeAllChannels()),
  );
  const cleanup = await Promise.allSettled(ids.map((id) => admin.auth.admin.deleteUser(id)));
  if (cleanup.some((result) => result.status === "rejected" || result.value.error)) {
    console.error(JSON.stringify({ event: "synthetic_cleanup_failed" }));
    process.exitCode = 1;
  }
  await Promise.allSettled([...clients, admin].map((client) => client.auth.dispose()));
}
