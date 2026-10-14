import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
if (process.env.STAGING_TESTS_ALLOWED !== "true")
  throw new Error("Enable STAGING_TESTS_ALLOWED only for a dedicated synthetic staging project.");
const site = process.env.STAGING_APP_URL,
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  secret = process.env.SUPABASE_SECRET_KEY;
if (!site || !url || !key || !secret)
  throw new Error("Configure STAGING_APP_URL and dedicated staging Supabase credentials locally.");
const origin = new URL(site).origin;
const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const identities = [];
const ensure = (condition) => {
  if (!condition) throw new Error("staging_acceptance_failed");
};
async function identity() {
  const generated = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: `healingmuse-staging-${randomUUID()}@example.invalid`,
  });
  ensure(!generated.error);
  const jar = new Map();
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: (items) => items.forEach((item) => jar.set(item.name, item.value)),
    },
  });
  const fixture = { id: generated.data.user.id, client, jar };
  identities.push(fixture);
  const auth = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: generated.data.properties.hashed_token,
  });
  ensure(!auth.error);
  await client.realtime.setAuth(auth.data.session.access_token);
  return fixture;
}
async function request(fixture, path, method = "GET", input, expectedOwner = fixture?.id) {
  const headers = { Origin: origin, "Content-Type": "application/json" };
  if (expectedOwner) headers["X-HealingMuse-Account"] = expectedOwner;
  if (fixture)
    headers.Cookie = Array.from(fixture.jar, ([name, value]) => `${name}=${value}`).join("; ");
  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    body: input === undefined ? undefined : JSON.stringify(input),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  return {
    status: response.status,
    data: await response.json(),
    private: response.headers.get("cache-control")?.includes("no-store"),
  };
}
async function subscription(fixture, topic, expected) {
  const channel = fixture.client.channel(topic, { config: { private: true } });
  const status = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve("TIMED_OUT"), 10000);
    channel.subscribe((value) => {
      if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"].includes(value)) {
        clearTimeout(timeout);
        resolve(value);
      }
    });
  });
  await fixture.client.removeChannel(channel);
  ensure(expected ? status === "SUBSCRIBED" : status === "CHANNEL_ERROR");
}
try {
  const tracks = await admin.from("tracks").select("id").eq("status", "published").limit(1);
  ensure(!tracks.error && tracks.data.length);
  const created = await Promise.allSettled(Array.from({ length: 3 }, () => identity()));
  ensure(created.every((result) => result.status === "fulfilled"));
  const [A, B, content] = created.map((result) => result.value);
  ensure(!(await admin.from("content_admins").insert({ user_id: content.id })).error);
  ensure((await request(null, "/api/me")).status === 401);
  const guest = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const client of [guest, A.client, B.client, content.client]) {
    const probe = await client.rpc("consume_rate_limit", {
      p_key: "synthetic-privilege-probe",
      p_bucket: "probe",
      p_limit: 1,
      p_seconds: 60,
    });
    ensure(probe.error?.code === "42501");
  }
  await guest.auth.dispose();
  ensure((await request(A, "/api/me", "PATCH", { moodConsent: true }, B.id)).status === 403);
  ensure((await request(A, "/api/me", "PATCH", { moodConsent: true })).status === 200);
  for (const fixture of [B, content])
    ensure((await request(fixture, "/api/me", "PATCH", { moodConsent: true })).status === 200);
  const started = await request(A, "/api/sessions", "POST", {
    trackId: tracks.data[0].id,
    beforeScore: 2,
  });
  ensure(started.status === 201);
  ensure(
    (await request(A, "/api/sessions", "PATCH", { sessionId: started.data.id, afterScore: 4 }))
      .status === 200,
  );
  for (const fixture of [A, B, content]) {
    const personal = await request(fixture, "/api/me");
    ensure(
      personal.status === 200 &&
        personal.private &&
        personal.data.checkins.length === (fixture === A ? 2 : 0),
    );
    if (fixture !== A) {
      const direct = await fixture.client.from("mood_checkins").select("id").eq("owner_id", A.id);
      ensure(!direct.error && direct.data.length === 0);
      ensure(
        (
          await request(fixture, "/api/sessions", "PATCH", {
            sessionId: started.data.id,
            afterScore: 5,
          })
        ).status === 403,
      );
    }
  }
  ensure((await request(content, "/api/admin/tracks")).status === 200);
  ensure((await request(B, "/api/admin/tracks")).status === 403);
  await subscription(A, `user:${A.id}`, true);
  await subscription(B, `user:${B.id}`, true);
  await subscription(B, `user:${A.id}`, false);
  await subscription(content, `user:${A.id}`, false);
  ensure((await request(A, "/api/me", "PATCH", { moodConsent: false })).status === 200);
  ensure((await request(A, "/api/me")).data.checkins.length === 0);
  ensure((await request(A, "/api/me", "DELETE", { confirmation: "DELETE" })).status === 200);
  A.deleted = true;
  console.log(
    JSON.stringify({
      passed: true,
      checks: [
        "verified API identity",
        "initiating account guard",
        "server-only RPC execution",
        "private cache headers",
        "paired consented history",
        "patient and content-admin isolation",
        "direct owner RLS",
        "private channel authorization",
        "consent revocation",
        "account deletion",
      ],
      emailDelivery: "Requires the separate SMTP acceptance journey.",
    }),
  );
} catch {
  console.error(
    JSON.stringify({
      event: "staging_acceptance_failed",
      code: "configuration_network_or_assertion",
    }),
  );
  process.exitCode = 1;
} finally {
  await Promise.allSettled(identities.map((fixture) => fixture.client.removeAllChannels()));
  const results = await Promise.allSettled(
    identities
      .filter((fixture) => !fixture.deleted)
      .map((fixture) => admin.auth.admin.deleteUser(fixture.id)),
  );
  if (
    results.some(
      (result) =>
        result.status === "rejected" || (result.value.error && result.value.error.status !== 404),
    )
  ) {
    console.error(JSON.stringify({ event: "synthetic_cleanup_failed" }));
    process.exitCode = 1;
  }
}
