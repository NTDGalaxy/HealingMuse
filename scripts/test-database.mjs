import { databaseFixture } from "./database-fixture.mjs";
import assert from "node:assert/strict";
const db = await databaseFixture();
const A = "10000000-0000-4000-8000-000000000001",
  B = "10000000-0000-4000-8000-000000000002",
  ADMIN = "10000000-0000-4000-8000-000000000003";
const track = "00000000-0000-4000-8000-000000000001";
await db.query("insert into auth.users(id) values($1),($2),($3)", [A, B, ADMIN]);
await db.query("insert into content_admins values($1)", [ADMIN]);
await db.query(
  `insert into tracks(id,title,artist,category,goals,duration,source,attribution,license,license_url,provenance_url,status,rights_verified,human_created,download_allowed,listening_reviewed)
values($1,'{"vi":"Thử nghiệm","en":"Synthetic test"}','Synthetic fixture','nature',array['relax'],60,'{"kind":"hosted","path":"synthetic.mp3"}','Synthetic fixture only','CC0','https://creativecommons.org/publicdomain/zero/1.0/','https://example.org/synthetic','published',true,true,true,true)`,
  [track],
);
const as = async (id, role = "authenticated") => {
  await db.exec(`reset role; set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? ""]);
};
const count = async (table) =>
  Number((await db.query(`select count(*) as n from ${table}`)).rows[0].n);
await as(A);
await assert.rejects(
  db.exec("select consume_rate_limit('synthetic','probe',1,60)"),
  /permission denied/,
);
await assert.rejects(db.query("select start_listening($1,3)", [track]), /consent_required/);
await assert.rejects(db.exec("update profiles set mood_consent_at=now()"), /permission denied/);
await db.exec("select set_mood_consent(true)");
await assert.rejects(db.query("select start_listening($1,6)", [track]), /invalid/);
const session = (await db.query("select start_listening($1,2) as id", [track])).rows[0].id;
await db.query("select end_listening($1,4)", [session]);
await db.query("select end_listening($1,5)", [session]);
assert.equal(await count("mood_checkins"), 2);
assert.equal(
  (await db.query("select score from mood_checkins where phase='after'")).rows[0].score,
  4,
);
const playlist = (
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
await as(B);
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
await as(ADMIN);
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
await as(null, "anon");
await assert.rejects(
  db.exec("select consume_rate_limit('synthetic','probe',1,60)"),
  /permission denied/,
);
await assert.rejects(db.exec("select set_mood_consent(true)"), /permission denied/);
await assert.rejects(db.exec("select * from mood_checkins"), /permission denied/);
assert.equal(await count("tracks"), 1);
await as(A);
await db.query("select set_config('realtime.topic',$1,false)", [`user:${A}`]);
assert.ok((await count("realtime.messages")) > 0);
const broadcasts = (await db.query("select payload from realtime.messages")).rows;
assert.ok(broadcasts.every((row) => Object.keys(row.payload).join() === "scope"));
await db.exec("select set_mood_consent(false)");
assert.equal(await count("mood_checkins"), 0);
assert.equal(await count("listening_sessions"), 0);
assert.equal(await count("playlists"), 1);
await db.exec("reset role");
await db.query(
  "insert into listening_sessions(id,owner_id,track_id,started_at) values(gen_random_uuid(),$1,$2,now()-interval '91 days')",
  [A, track],
);
await as(A);
assert.equal(await count("listening_sessions"), 0);
await db.exec("reset role");
const retention = (
  await db.query("select command from cron.jobs where name='healingmuse-private-retention'")
).rows[0].command;
await db.exec(retention);
assert.equal(await count("listening_sessions"), 0);
await db.query("delete from auth.users where id=$1", [A]);
assert.equal(await count("playlists"), 0);
assert.equal((await db.query("select count(*) as n from profiles where id=$1", [A])).rows[0].n, 0);
assert.equal(await count("deleted_accounts"), 1);
// Existing projects can contain permissive policies belonging to other applications.
await db.exec(
  "create policy existing_storage_read on storage.objects for select to authenticated using(true);create policy existing_broadcast_read on realtime.messages for select to authenticated using(true);insert into storage.objects(bucket_id,name) values('audio','private-draft.mp3'),('unrelated','other-app.txt');",
);
await as(B);
assert.equal(
  Number(
    (await db.query("select count(*) as n from storage.objects where bucket_id='audio'")).rows[0].n,
  ),
  0,
  "Existing policies must not expose private HealingMuse audio",
);
assert.equal(
  Number(
    (await db.query("select count(*) as n from storage.objects where bucket_id='unrelated'"))
      .rows[0].n,
  ),
  1,
);
await db.query("select set_config('realtime.topic',$1,false)", [`user:${A}`]);
assert.equal(
  await count("realtime.messages"),
  0,
  "Existing policies must not authorize another patient's topic",
);
await as(ADMIN);
assert.equal(
  Number(
    (await db.query("select count(*) as n from storage.objects where bucket_id='audio'")).rows[0].n,
  ),
  1,
);
console.log(
  "PASS: explicit API privileges under Supabase default ACLs, consent, paired check-ins, ownership, content-admin isolation, private Broadcast authorization, playlist conflicts, retention, and account deletion.",
);
await db.close();
