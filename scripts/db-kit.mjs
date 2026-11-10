import { after, test } from "node:test";

/** Shared helpers for the offline PGlite database suites. Synthetic fixtures only. */
export const FIXTURE_SHA256 = "a".repeat(64);
const ROLES = new Set(["anon", "authenticated", "service_role"]);

// SQL expressions over the generate_series variable n; suites override individual columns.
const TRACK_COLUMNS = {
  id: "('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid",
  title: "jsonb_build_object('vi','Bản thu thử '||n,'en','Synthetic fixture '||n)",
  artist: "'Synthetic fixture'",
  category: "'instrumental'",
  goals: "array['relax']",
  duration: "60",
  source: "jsonb_build_object('kind','hosted','path','fixture-'||n||'.mp3')",
  attribution: "'Synthetic fixture only'",
  license: "'Fixture'",
  license_url: "'https://example.invalid'",
  provenance_url: "'https://example.invalid'",
  human_created: "true",
  position: "n",
  bytes: "100",
  sha256: `'${FIXTURE_SHA256}'`,
};
const PUBLISHED_COLUMNS = {
  status: "'published'",
  rights_verified: "true",
  listening_reviewed: "true",
};

export function databaseKit(db) {
  /** Owner session: no API role and no JWT subject, so auth.uid() is null. */
  async function asOwner() {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
  }
  /** Always reset role, then set the JWT subject, then assume the API role. */
  async function asRole(id, role = "authenticated") {
    if (!ROLES.has(role)) throw new Error(`Unknown API role: ${role}`);
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? ""]);
    await db.exec(`set role ${role}`);
  }
  /** Clears every session setting a scenario may leave behind. */
  async function resetSession() {
    await asOwner();
    await db.query("select set_config('realtime.topic','',false)");
  }
  /** Rows visible to the current role, so RLS applies. `where` is fixture SQL, never input. */
  async function count(table, where = "true", params = []) {
    return (await db.query(`select count(*)::integer as n from ${table} where ${where}`, params))
      .rows[0].n;
  }
  /** Inserts recordings as the database owner and returns their ids in position order. */
  async function seedTracks({ count = 1, from = 1, published = false, columns = {} } = {}) {
    const values = { ...TRACK_COLUMNS, ...(published ? PUBLISHED_COLUMNS : {}), ...columns };
    const names = Object.keys(values);
    await asOwner();
    const result = await db.query(
      `insert into public.tracks(${names.join(",")})
       select ${names.map((name) => values[name]).join(",")} from generate_series($1::integer,$2::integer) n
       returning id`,
      [from, from + count - 1],
    );
    return result.rows.map((row) => row.id);
  }
  /** Registers the expected metadata (and, for B2, the expected receipt) of recordings. */
  async function seedReleaseItems(release, { provider = "supabase", trackIds } = {}) {
    await asOwner();
    const scope = trackIds ? "where t.id = any($2::uuid[])" : "";
    await db.query(
      provider === "b2"
        ? `insert into public.catalogue_release_items(release_id,track_id,expected_metadata,expected_storage)
           select $1,t.id,public.release_track_metadata(t),public.b2_delivery_metadata(d)
           from public.tracks t join public.b2_audio_deliveries d on d.track_id=t.id ${scope}`
        : `insert into public.catalogue_release_items(release_id,track_id,expected_metadata)
           select $1,t.id,public.release_track_metadata(t) from public.tracks t ${scope}`,
      trackIds ? [release, trackIds] : [release],
    );
  }
  /** Creates a release over every recording (or `trackIds`) as the database owner. */
  async function seedRelease({
    id,
    manifest,
    title = "Synthetic release",
    provider = "supabase",
    expectedCount,
    trackIds,
  }) {
    await asOwner();
    const total =
      expectedCount ??
      (trackIds
        ? trackIds.length
        : (await db.query("select count(*)::integer as n from public.tracks")).rows[0].n);
    await db.query(
      "insert into public.catalogue_releases(id,manifest_hash,title,expected_count,required_storage_provider) values($1,$2,$3,$4,$5)",
      [id, manifest, title, total, provider],
    );
    await seedReleaseItems(id, { provider, trackIds });
  }
  /** Calls the release RPC as the current role and returns its JSON result. */
  async function publishRelease({
    id,
    manifest,
    reviewer = "Named human reviewer",
    attestation = "human-review-v1",
  }) {
    return (
      await db.query("select public.publish_catalogue_release($1,$2,$3,$4) as result", [
        id,
        manifest,
        reviewer,
        attestation,
      ])
    ).rows[0].result;
  }
  return {
    asOwner,
    asRole,
    resetSession,
    count,
    seedTracks,
    seedRelease,
    seedReleaseItems,
    publishRelease,
  };
}

/**
 * Registers sequential node:test scenarios sharing one database. Each scenario resets the
 * session afterwards, the database always closes, and the suite's PASS summary is the final
 * line, printed only when every scenario passed.
 */
export function databaseSuite(db, summary) {
  const { resetSession } = databaseKit(db);
  let registered = 0;
  let passed = 0;
  after(() => db.close());
  process.on("exit", (code) => {
    if (code === 0 && registered > 0 && passed === registered) console.log(`PASS: ${summary}`);
  });
  return function scenario(name, fn) {
    registered += 1;
    return test(name, async (t) => {
      t.after(resetSession);
      await fn(t);
      passed += 1;
    });
  };
}

/** Asserts a PostgreSQL error by SQLSTATE and message, as src/lib/server/http.ts maps it. */
export async function rejectsWith(promise, code, message) {
  try {
    await promise;
  } catch (error) {
    if (error.code !== code || (message !== undefined && !message.test(error.message)))
      throw new Error(
        `Expected ${code} ${message ?? ""}, received ${error.code} ${error.message}`,
        {
          cause: error,
        },
      );
    return error;
  }
  throw new Error(`Expected ${code} ${message ?? ""}, but the statement succeeded`);
}
