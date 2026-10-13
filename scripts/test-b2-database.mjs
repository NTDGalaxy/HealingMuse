import assert from "node:assert/strict";
import { databaseFixture } from "./database-fixture.mjs";
const db = await databaseFixture();
const admin = "20000000-0000-4000-8000-000000000001",
  patient = "20000000-0000-4000-8000-000000000002";
const release = "30000000-0000-4000-8000-000000000001",
  sha = "a".repeat(64),
  manifest = "b".repeat(64);
const as = async (id, role = "authenticated") => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? ""]);
  await db.exec(`set role ${role}`);
};
const publish = () =>
  db.query("select publish_catalogue_release($1,$2,'Named human','human-review-v1') as result", [
    release,
    manifest,
  ]);
try {
  await db.query("insert into auth.users(id) values($1),($2)", [admin, patient]);
  await db.query("insert into content_admins values($1)", [admin]);
  await db.query(
    `insert into tracks(id,title,artist,category,goals,duration,source,attribution,license,license_url,provenance_url,human_created,position,bytes,sha256)
   select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'{"vi":"Bản thu thử","en":"Synthetic fixture"}',
   'Synthetic','instrumental',array['relax'],60,jsonb_build_object('kind','hosted','path','fixture-'||n||'.mp3'),
   'Synthetic fixture only','Fixture','https://example.invalid','https://example.invalid',true,n,100,$1 from generate_series(1,1000)n`,
    [sha],
  );
  const first = (await db.query("select id from tracks where position=1")).rows[0].id;
  const deliver = () =>
    db.query(`select public.record_b2_audio_delivery(id,'https://s3.us-west-004.backblazeb2.com',
   'healingmuse-audio-ntdgalaxy','healingmuse/audio/'||id||'/'||sha256||'.mp3','version-'||position,sha256,bytes,'etag-'||position) from tracks`);
  await as(null, "service_role");
  await deliver();
  await assert.rejects(db.query("delete from b2_audio_deliveries"), /permission denied/);
  await assert.rejects(
    db.query("insert into b2_audio_deliveries select * from b2_audio_deliveries"),
    /permission denied/,
  );
  await assert.rejects(
    db.query(
      "select record_b2_audio_delivery($1,'https://s3.us-west-004.backblazeb2.com','healingmuse-audio-ntdgalaxy','wrong','v',$2,100,'e')",
      [first, sha],
    ),
    /check constraint/,
  );
  await assert.rejects(
    db.query(
      "select record_b2_audio_delivery($1,'https://s3.us-west-004.backblazeb2.com','healingmuse-audio-ntdgalaxy','wrong','v',$2,101,'e')",
      [first, sha],
    ),
    /delivery_mismatch/,
  );
  await db.exec("reset role");
  await db.query(
    "insert into catalogue_releases(id,manifest_hash,title,expected_count,required_storage_provider) values($1,$2,'Synthetic B2 release',1000,'b2')",
    [release, manifest],
  );
  await db.query(
    "insert into catalogue_release_items(release_id,track_id,expected_metadata,expected_storage) select $1,t.id,release_track_metadata(t),b2_delivery_metadata(d) from tracks t join b2_audio_deliveries d on d.track_id=t.id",
    [release],
  );
  for (const [id, role] of [
    [null, "anon"],
    [patient, "authenticated"],
    [null, "service_role"],
  ]) {
    await as(id, role);
    await assert.rejects(publish(), /permission denied|forbidden/);
    if (role === "authenticated") {
      assert.equal(
        (await db.query("select count(*)::int as n from b2_audio_deliveries")).rows[0].n,
        0,
      );
      await assert.rejects(deliver(), /permission denied/);
      await assert.rejects(
        db.query("select audio_storage_locator($1)", [first]),
        /permission denied/,
      );
    }
  }
  await as(admin);
  assert.equal(
    (await db.query("select count(*)::int as n from b2_audio_deliveries")).rows[0].n,
    1000,
  );
  await assert.rejects(deliver(), /permission denied/);
  await assert.rejects(
    db.query("select publish_catalogue_release($1,$2,'Name','human-review-v1')", [
      release,
      "c".repeat(64),
    ]),
    /manifest_changed/,
  );
  await db.exec(
    "reset role;update b2_audio_deliveries set version_id='changed' where track_id='" + first + "'",
  );
  await as(admin);
  assert.equal(
    (await db.query("select catalogue_release_summary() as r")).rows[0].r[0].deliveredCount,
    999,
  );
  await assert.rejects(publish(), /release_changed_or_incomplete/);
  await as(null, "service_role");
  assert.equal(
    (await db.query("select audio_storage_locator($1) as r", [first])).rows[0].r.unavailable,
    true,
  );
  await assert.rejects(
    db.query(
      "select record_b2_audio_delivery($1,'https://s3.us-west-004.backblazeb2.com','healingmuse-audio-ntdgalaxy',$2,'changed',$3,100,'etag-1')",
      [first, `healingmuse/audio/${first}/${sha}.mp3`, sha],
    ),
    /registered_delivery_changed/,
  );
  await deliver(); // Restore exactly the approved snapshot, never replace it with a different version.
  await db.exec("reset role;delete from b2_audio_deliveries where track_id='" + first + "'");
  await as(admin);
  await assert.rejects(publish(), /release_changed_or_incomplete/);
  await as(null, "service_role");
  assert.equal(
    (await db.query("select audio_storage_locator($1) as r", [first])).rows[0].r.unavailable,
    true,
  );
  await deliver();
  await db.exec("reset role;update tracks set status='retired' where position=1");
  await as(admin);
  await assert.rejects(publish(), /release_changed_or_incomplete/);
  await db.exec(
    "reset role;update tracks set status='draft' where position=1;update tracks set license='Changed' where position=1000",
  );
  await as(admin);
  await assert.rejects(publish(), /release_changed_or_incomplete/);
  await db.exec("reset role");
  assert.equal(
    (await db.query("select count(*)::int as n from tracks where status='published'")).rows[0].n,
    0,
  );
  assert.equal(
    (await db.query("select count(*)::int as n from catalogue_publications")).rows[0].n,
    0,
  );
  await db.exec("update tracks set license='Fixture' where position=1000");
  await db.query("delete from catalogue_release_items where release_id=$1 and track_id=$2", [
    release,
    first,
  ]);
  await as(admin);
  await assert.rejects(publish(), /incomplete_manifest/);
  await db.exec("reset role");
  await db.query(
    "insert into catalogue_release_items(release_id,track_id,expected_metadata,expected_storage) select $1,t.id,release_track_metadata(t),b2_delivery_metadata(d) from tracks t join b2_audio_deliveries d on d.track_id=t.id where t.id=$2",
    [release, first],
  );
  await as(admin);
  const summary = (await db.query("select catalogue_release_summary() as r")).rows[0].r[0];
  assert.equal(summary.storageProvider, "b2");
  assert.equal(summary.deliveredCount, 1000);
  assert.equal((await publish()).rows[0].result.repeated, false);
  assert.equal((await publish()).rows[0].result.repeated, true);
  await db.exec("reset role");
  const audit = (await db.query("select * from catalogue_publications")).rows[0];
  assert.equal(audit.reviewer_id, admin);
  assert.equal(audit.storage_provider, "b2");
  assert.equal(audit.delivery_snapshots.length, 1000);
  assert.equal(audit.previous_states.length, 1000);
  assert.equal(audit.delivery_snapshots.find((d) => d.track_id === first).version_id, "version-1");
  await as(null, "anon");
  assert.equal(
    (await db.query("select catalog_page('{\"limit\":48}',false) as r")).rows[0].r.total,
    1000,
  );
  console.log(
    "PASS: 1,000 B2 receipts, private RLS/ACL, service-only verified delivery, immutable version snapshots, fail-closed playback locator, changed manifests, atomic named approval and idempotent publication.",
  );
} finally {
  await db.close();
}
