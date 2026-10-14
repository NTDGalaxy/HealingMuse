import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { databaseClient } from "./database.mjs";
import { toolFetch } from "./tool-fetch.mjs";

const sql = databaseClient();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: toolFetch },
};
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, options);
const guest = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, options);
let phase = "schema";
try {
  await sql.connect();
  const migrations = (await readdir("supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const applied = await sql.query(
    "select version,sha256 from public.healingmuse_migrations order by version",
  );
  assert.deepEqual(
    applied.rows.map((row) => row.version),
    migrations,
  );
  for (const row of applied.rows)
    assert.equal(
      row.sha256,
      createHash("sha256")
        .update(await readFile(`supabase/migrations/${row.version}`))
        .digest("hex"),
    );
  const tables = await sql.query(
    "select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname=any($1)",
    [
      [
        "content_admins",
        "profiles",
        "tracks",
        "curated_collections",
        "curated_collection_items",
        "favorites",
        "playlists",
        "playlist_items",
        "listening_sessions",
        "mood_checkins",
        "rate_limits",
        "deleted_accounts",
        "healingmuse_migrations",
      ],
    ],
  );
  assert.equal(tables.rows.length, 13);
  assert.ok(tables.rows.every((row) => row.relrowsecurity));
  phase = "storage_configuration";
  const bucket = await sql.query(
    "select public,file_size_limit from storage.buckets where id='audio'",
  );
  assert.equal(bucket.rows[0]?.public, false);
  assert.equal(Number(bucket.rows[0].file_size_limit), 52428800);
  phase = "retention_jobs";
  const jobs = await sql.query(
    "select jobname,active from cron.job where jobname like 'healingmuse-%'",
  );
  assert.equal(jobs.rows.length, 2);
  assert.ok(jobs.rows.every((row) => row.active));
  phase = "privileged_rpc";
  const privileges = await sql.query(
    "select has_function_privilege('anon','public.consume_rate_limit(text,text,integer,integer)','execute') as guest,has_function_privilege('authenticated','public.consume_rate_limit(text,text,integer,integer)','execute') as patient,has_function_privilege('service_role','public.consume_rate_limit(text,text,integer,integer)','execute') as server",
  );
  assert.deepEqual(privileges.rows[0], { guest: false, patient: false, server: true });
  const rpc = await guest.rpc("consume_rate_limit", {
    p_key: "synthetic-privilege-probe",
    p_bucket: "probe",
    p_limit: 1,
    p_seconds: 60,
  });
  assert.equal(rpc.error?.code, "42501");
  phase = "catalog";
  const prepared = JSON.parse(await readFile("media/prepared/catalog.json", "utf8"));
  const eligible = prepared.filter((track) => track.status !== "retired");
  assert.ok(eligible.length >= 20 && eligible.length <= 10000);
  const localById = new Map(prepared.map((track) => [track.id, track]));
  const stored = await sql.query(
    "select id,source,sha256,bytes,status,rights_verified,listening_reviewed from public.tracks order by position,id",
  );
  let audioBytesVerified = 0;
  for (const row of stored.rows) {
    const track = localById.get(row.id);
    assert.ok(track, "Uploaded recording must have retained preparation evidence");
    assert.equal(row?.source?.path, track.source.path);
    assert.equal(row.sha256, track.sha256);
    assert.equal(Number(row.bytes), track.bytes);
    if (row.status === "published") assert.equal(row.rights_verified, true);
    phase = "guest_audio_denial";
    const inaccessible = await guest.storage.from("audio").download(track.source.path);
    assert.ok(inaccessible.error && !inaccessible.data);
    if (process.argv.includes("--audio-bytes")) {
      phase = "uploaded_audio_integrity";
      const audio = await admin.storage.from("audio").download(track.source.path);
      assert.ok(!audio.error && audio.data);
      const bytes = Buffer.from(await audio.data.arrayBuffer());
      assert.equal(bytes.length, track.bytes);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), track.sha256);
      audioBytesVerified += bytes.length;
    }
    phase = "catalog";
  }
  console.log(
    JSON.stringify({
      passed: true,
      migrations: migrations.length,
      privateTables: tables.rows.length,
      retentionJobs: jobs.rows.length,
      preparedRecordings: eligible.length,
      retainedRecordings: prepared.length,
      uploadedRecordings: stored.rows.length,
      listeningApprovedRecordings: stored.rows.filter(
        (row) => row.rights_verified && row.listening_reviewed,
      ).length,
      publishedRecordings: stored.rows.filter((row) => row.status === "published").length,
      audioBytesVerified,
      checks: [
        "tracked migration hashes",
        "owner RLS enabled",
        "private bucket",
        "active retention jobs",
        "server-only RPC grants",
        "guest audio denial",
        "uploaded recordings match retained preparation evidence",
      ],
    }),
  );
} catch {
  console.error(JSON.stringify({ event: "cloud_verification_failed", phase }));
  process.exitCode = 1;
} finally {
  await sql.end();
  await Promise.allSettled([admin.auth.dispose(), guest.auth.dispose()]);
}
