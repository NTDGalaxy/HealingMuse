import assert from "node:assert/strict";
import { databaseFixture } from "./database-fixture.mjs";
import { databaseKit, databaseSuite } from "./db-kit.mjs";

const db = await databaseFixture();
const { asOwner, asRole, count, seedTracks } = databaseKit(db);
const scenario = databaseSuite(
  db,
  "explicit API privileges under Supabase default ACLs, consent, paired check-ins, ownership, content-admin isolation, private Broadcast authorization, statement-level invalidation, playlist conflicts, retention, and account deletion.",
);
const A = "10000000-0000-4000-8000-000000000001",
  B = "10000000-0000-4000-8000-000000000002",
  ADMIN = "10000000-0000-4000-8000-000000000003",
  C = "10000000-0000-4000-8000-000000000004";
const track = "00000000-0000-4000-8000-000000000001";
// The schema before 202611090003_statement_invalidation broadcast once per changed row.
const ROW_TRIGGER_SCHEMA = "202611090002_catalog_page_rewrite.sql";

await db.query("insert into auth.users(id) values($1),($2),($3),($4)", [A, B, ADMIN, C]);
await db.query("insert into content_admins values($1)", [ADMIN]);
await seedTracks({
  published: true,
  columns: {
    id: `'${track}'::uuid`,
    title: `'{"vi":"Thử nghiệm","en":"Synthetic test"}'`,
    category: "'nature'",
    source: `'{"kind":"hosted","path":"synthetic.mp3"}'`,
    license: "'CC0'",
    license_url: "'https://creativecommons.org/publicdomain/zero/1.0/'",
    provenance_url: "'https://example.org/synthetic'",
    download_allowed: "true",
  },
});

/** Every invalidation message, read as the owner so RLS does not hide any topic. */
async function broadcasts(database = db) {
  await database.exec("reset role");
  return (
    await database.query(
      "select topic,event,payload,private,extension from realtime.messages order by id",
    )
  ).rows;
}
async function clearBroadcasts(database = db) {
  await database.exec("reset role");
  await database.exec("truncate realtime.messages");
}
const invalidation = (owner, scope) => ({
  topic: `user:${owner}`,
  event: "invalidate",
  payload: { scope },
  private: true,
  extension: "broadcast",
});

let session, playlist;

scenario("consent, paired check-ins and playlist revisions", async () => {
  await asRole(A);
  await assert.rejects(
    db.exec("select consume_rate_limit('synthetic','probe',1,60)"),
    /permission denied/,
  );
  await assert.rejects(db.query("select start_listening($1,3)", [track]), /consent_required/);
  await assert.rejects(db.exec("update profiles set mood_consent_at=now()"), /permission denied/);
  await db.exec("select set_mood_consent(true)");
  await assert.rejects(db.query("select start_listening($1,6)", [track]), /invalid/);
  session = (await db.query("select start_listening($1,2) as id", [track])).rows[0].id;
  await db.query("select end_listening($1,4)", [session]);
  await db.query("select end_listening($1,5)", [session]);
  assert.equal(await count("mood_checkins"), 2);
  assert.equal(
    (await db.query("select score from mood_checkins where phase='after'")).rows[0].score,
    4,
  );
  playlist = (
    await db.query(
      "insert into playlists(owner_id,title) values($1,'Synthetic playlist') returning id",
      [A],
    )
  ).rows[0].id;
  await assert.rejects(
    db.query("select save_playlist($1,null,'Missing revision',array[]::uuid[])", [playlist]),
    /invalid/,
  );
  await assert.rejects(db.exec("select set_mood_consent(null)"), /invalid/);
  await db.query("select save_playlist($1,0,'Updated',array[$2]::uuid[])", [playlist, track]);
  await assert.rejects(
    db.query("select save_playlist($1,0,'Stale',array[]::uuid[])", [playlist]),
    /conflict/,
  );
  await assert.rejects(
    db.query("select save_playlist($1,1,'Duplicates',array[$2,$2]::uuid[])", [playlist, track]),
    /invalid/,
  );
});

scenario("another patient cannot read or change personal data", async () => {
  await asRole(B);
  await db.exec("select set_mood_consent(true)");
  assert.equal(await count("mood_checkins"), 0);
  assert.equal(await count("listening_sessions"), 0);
  assert.equal(await count("playlists"), 0);
  await assert.rejects(db.query("select end_listening($1,3)", [session]), /not_found/);
  await assert.rejects(
    db.query("select save_playlist($1,1,'Intrusion',array[]::uuid[])", [playlist]),
    /not_found/,
  );
  await db.query("select set_config('realtime.topic',$1,false)", [`user:${A}`]);
  assert.equal(await count("realtime.messages"), 0);
  await assert.rejects(
    db.query("insert into favorites(owner_id,track_id) values($1,$2)", [A, track]),
    /row-level security/,
  );
});

scenario("content administrators curate without reading personal data", async () => {
  await asRole(ADMIN);
  assert.equal(await count("mood_checkins"), 0);
  assert.equal((await db.query("select is_content_admin() as allowed")).rows[0].allowed, true);
  const collection = (
    await db.query(
      'select save_collection(null,0,\'{"vi":"Tuyển chọn","en":"Curated"}\',\'relax\',true,array[$1]::uuid[]) as id',
      [track],
    )
  ).rows[0].id;
  await db.query(
    'select save_collection($1,0,\'{"vi":"Tuyển chọn","en":"Curated"}\',\'rest\',true,array[$2]::uuid[])',
    [collection, track],
  );
  await assert.rejects(
    db.query(
      'select save_collection($1,0,\'{"vi":"Cũ","en":"Stale"}\',\'rest\',true,array[$2]::uuid[])',
      [collection, track],
    ),
    /conflict/,
  );
  await db.query("select set_config('realtime.topic',$1,false)", [`user:${A}`]);
  assert.equal(await count("realtime.messages"), 0);
});

scenario("guests only read the published catalogue", async () => {
  await asRole(null, "anon");
  await assert.rejects(
    db.exec("select consume_rate_limit('synthetic','probe',1,60)"),
    /permission denied/,
  );
  await assert.rejects(db.exec("select set_mood_consent(true)"), /permission denied/);
  await assert.rejects(db.exec("select * from mood_checkins"), /permission denied/);
  assert.equal(await count("tracks"), 1);
});

scenario("private Broadcast and consent revocation", async () => {
  await asRole(A);
  await db.query("select set_config('realtime.topic',$1,false)", [`user:${A}`]);
  assert.ok((await count("realtime.messages")) > 0);
  const payloads = (await db.query("select payload from realtime.messages")).rows;
  assert.ok(payloads.every((row) => Object.keys(row.payload).join() === "scope"));
  await db.exec("select set_mood_consent(false)");
  assert.equal(await count("mood_checkins"), 0);
  assert.equal(await count("listening_sessions"), 0);
  assert.equal(await count("playlists"), 1);
});

scenario("90-day retention hides and deletes listening history", async () => {
  await asOwner();
  await db.query(
    "insert into listening_sessions(id,owner_id,track_id,started_at) values(gen_random_uuid(),$1,$2,now()-interval '91 days')",
    [A, track],
  );
  await asRole(A);
  assert.equal(await count("listening_sessions"), 0);
  await asOwner();
  const retention = (
    await db.query("select command from cron.jobs where name='healingmuse-private-retention'")
  ).rows[0].command;
  await db.exec(retention);
  assert.equal(await count("listening_sessions"), 0);
});

scenario("account deletion erases personal data and records the erasure", async () => {
  await asOwner();
  await db.query("delete from auth.users where id=$1", [A]);
  assert.equal(await count("playlists"), 0);
  assert.equal(await count("profiles", "id=$1", [A]), 0);
  assert.equal(await count("deleted_accounts"), 1);
});

scenario("existing permissive policies cannot widen private boundaries", async () => {
  // Existing projects can contain permissive policies belonging to other applications.
  await asOwner();
  await db.exec(
    "create policy existing_storage_read on storage.objects for select to authenticated using(true);create policy existing_broadcast_read on realtime.messages for select to authenticated using(true);insert into storage.objects(bucket_id,name) values('audio','private-draft.mp3'),('unrelated','other-app.txt');",
  );
  await asRole(B);
  assert.equal(
    await count("storage.objects", "bucket_id='audio'"),
    0,
    "Existing policies must not expose private HealingMuse audio",
  );
  assert.equal(await count("storage.objects", "bucket_id='unrelated'"), 1);
  await db.query("select set_config('realtime.topic',$1,false)", [`user:${A}`]);
  assert.equal(
    await count("realtime.messages"),
    0,
    "Existing policies must not authorize another patient's topic",
  );
  await asRole(ADMIN);
  assert.equal(await count("storage.objects", "bucket_id='audio'"), 1);
});

let hundred;

/** Saves a 100-item playlist twice for C and returns the messages of the second save. */
async function savePlaylistTwice(database) {
  const kit = databaseKit(database);
  await kit.asRole(C);
  const id = (
    await database.query(
      "insert into playlists(owner_id,title) values($1,'Hundred') returning id",
      [C],
    )
  ).rows[0].id;
  await clearBroadcasts(database);
  await kit.asRole(C);
  await database.query("select save_playlist($1,0,'Hundred',$2::uuid[])", [id, hundred]);
  const first = await broadcasts(database);
  await clearBroadcasts(database);
  await kit.asRole(C);
  await database.query("select save_playlist($1,1,'Reversed',$2::uuid[])", [
    id,
    hundred.toReversed(),
  ]);
  const second = await broadcasts(database);
  await kit.asOwner();
  return { first, second };
}

scenario("a 100-item playlist save broadcasts once per owner, table and statement", async () => {
  hundred = await seedTracks({ count: 100, from: 101, published: true });
  const { first, second } = await savePlaylistTwice(db);
  // The first save deletes nothing, inserts 100 items and bumps the revision.
  assert.deepEqual(first, [invalidation(C, "playlist_items"), invalidation(C, "playlists")]);
  // The second save deletes 100 items, inserts 100 items and bumps the revision.
  assert.deepEqual(second, [
    invalidation(C, "playlist_items"),
    invalidation(C, "playlist_items"),
    invalidation(C, "playlists"),
  ]);
  const legacy = await databaseFixture({ through: ROW_TRIGGER_SCHEMA });
  try {
    const legacyKit = databaseKit(legacy);
    await legacy.query("insert into auth.users(id) values($1)", [C]);
    await legacyKit.seedTracks({ count: 100, from: 101, published: true });
    const before = await savePlaylistTwice(legacy);
    assert.equal(before.second.length, 2 * hundred.length + 1);
    // Payload, event, topic and private flag are unchanged; only duplicates disappear.
    assert.deepEqual(
      [...new Map(before.second.map((row) => [JSON.stringify(row), row])).values()],
      [invalidation(C, "playlist_items"), invalidation(C, "playlists")],
    );
    console.log(
      JSON.stringify({
        event: "personal_invalidation",
        playlistItems: hundred.length,
        rowTriggerMessages: before.second.length,
        statementTriggerMessages: second.length,
      }),
    );
  } finally {
    await legacy.close();
  }
});

scenario("consent revocation broadcasts its cascading deletion once", async () => {
  await asRole(C);
  await db.exec("select set_mood_consent(true)");
  for (const id of hundred.slice(0, 3)) {
    const listening = (await db.query("select start_listening($1,2) as id", [id])).rows[0].id;
    await db.query("select end_listening($1,4)", [listening]);
  }
  assert.equal(await count("mood_checkins"), 6);
  await clearBroadcasts();
  await asRole(C);
  await db.exec("select set_mood_consent(false)");
  assert.equal(await count("mood_checkins"), 0);
  // One profile update statement and one cascaded check-in deletion, not one per check-in.
  assert.deepEqual(await broadcasts(), [
    invalidation(C, "profiles"),
    invalidation(C, "mood_checkins"),
  ]);
});

scenario("one statement changing several owners notifies each owner once", async () => {
  await clearBroadcasts();
  // The service role bypasses RLS; a JWT subject makes it an authenticated mutation.
  await asRole(C, "service_role");
  await db.query(
    "insert into favorites(owner_id,track_id) select owner,id from unnest($1::uuid[]) owner, unnest($2::uuid[]) id",
    [[B, C], hundred.slice(0, 3)],
  );
  await db.query("delete from favorites where owner_id = any($1::uuid[])", [[B, C]]);
  assert.deepEqual(await broadcasts(), [
    invalidation(B, "favorites"),
    invalidation(C, "favorites"),
    invalidation(B, "favorites"),
    invalidation(C, "favorites"),
  ]);
});

scenario("nothing is broadcast without an authenticated subject", async () => {
  await clearBroadcasts();
  for (const enter of [() => asOwner(), () => asRole(null, "service_role")]) {
    await enter();
    await db.query("insert into favorites(owner_id,track_id) values($1,$2),($3,$2)", [B, track, C]);
    await db.query("update profiles set calm_mode = not calm_mode where id = any($1::uuid[])", [
      [B, C],
    ]);
    await db.query("delete from favorites where owner_id = any($1::uuid[])", [[B, C]]);
  }
  assert.deepEqual(await broadcasts(), []);
});
