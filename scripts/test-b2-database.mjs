import assert from "node:assert/strict";
import { databaseFixture } from "./database-fixture.mjs";
import { FIXTURE_SHA256, databaseKit, databaseSuite } from "./db-kit.mjs";

const db = await databaseFixture();
const { asOwner, asRole, count, seedTracks, seedRelease, seedReleaseItems, publishRelease } =
  databaseKit(db);
const scenario = databaseSuite(
  db,
  "1,000 B2 receipts, private RLS/ACL, service-only verified delivery, immutable version snapshots, fail-closed playback locator, changed manifests, atomic named approval and idempotent publication.",
);
const admin = "20000000-0000-4000-8000-000000000001",
  patient = "20000000-0000-4000-8000-000000000002";
const release = { id: "30000000-0000-4000-8000-000000000001", manifest: "b".repeat(64) };
const publish = () => publishRelease({ ...release, reviewer: "Named human" });
const deliver = () =>
  db.query(`select public.record_b2_audio_delivery(id,'https://s3.us-west-004.backblazeb2.com',
   'healingmuse-audio-ntdgalaxy','healingmuse/audio/'||id||'/'||sha256||'.mp3','version-'||position,sha256,bytes,'etag-'||position) from tracks`);

await db.query("insert into auth.users(id) values($1),($2)", [admin, patient]);
await db.query("insert into content_admins values($1)", [admin]);
await seedTracks({ count: 1000 });
const first = (await db.query("select id from tracks where position=1")).rows[0].id;

scenario("only the service role records verified B2 receipts", async () => {
  await asRole(null, "service_role");
  await deliver();
  await assert.rejects(db.query("delete from b2_audio_deliveries"), /permission denied/);
  await assert.rejects(
    db.query("insert into b2_audio_deliveries select * from b2_audio_deliveries"),
    /permission denied/,
  );
  await assert.rejects(
    db.query(
      "select record_b2_audio_delivery($1,'https://s3.us-west-004.backblazeb2.com','healingmuse-audio-ntdgalaxy','wrong','v',$2,100,'e')",
      [first, FIXTURE_SHA256],
    ),
    /check constraint/,
  );
  await assert.rejects(
    db.query(
      "select record_b2_audio_delivery($1,'https://s3.us-west-004.backblazeb2.com','healingmuse-audio-ntdgalaxy','wrong','v',$2,101,'e')",
      [first, FIXTURE_SHA256],
    ),
    /delivery_mismatch/,
  );
  await seedRelease({ ...release, title: "Synthetic B2 release", provider: "b2" });
});

scenario("guests, patients and the service role cannot approve releases", async () => {
  for (const [id, role] of [
    [null, "anon"],
    [patient, "authenticated"],
    [null, "service_role"],
  ]) {
    await asRole(id, role);
    await assert.rejects(publish(), /permission denied|forbidden/);
    if (role === "authenticated") {
      assert.equal(await count("b2_audio_deliveries"), 0);
      await assert.rejects(deliver(), /permission denied/);
      await assert.rejects(
        db.query("select audio_storage_locator($1)", [first]),
        /permission denied/,
      );
    }
  }
});

scenario("administrators read receipts but cannot forge them", async () => {
  await asRole(admin);
  assert.equal(await count("b2_audio_deliveries"), 1000);
  await assert.rejects(deliver(), /permission denied/);
  await assert.rejects(
    publishRelease({ ...release, manifest: "c".repeat(64), reviewer: "Name" }),
    /manifest_changed/,
  );
});

scenario("a changed or missing receipt fails closed", async () => {
  await asOwner();
  await db.query("update b2_audio_deliveries set version_id='changed' where track_id=$1", [first]);
  await asRole(admin);
  assert.equal(
    (await db.query("select catalogue_release_summary() as r")).rows[0].r[0].deliveredCount,
    999,
  );
  await assert.rejects(publish(), /release_changed_or_incomplete/);
  await asRole(null, "service_role");
  assert.equal(
    (await db.query("select audio_storage_locator($1) as r", [first])).rows[0].r.unavailable,
    true,
  );
  await assert.rejects(
    db.query(
      "select record_b2_audio_delivery($1,'https://s3.us-west-004.backblazeb2.com','healingmuse-audio-ntdgalaxy',$2,'changed',$3,100,'etag-1')",
      [first, `healingmuse/audio/${first}/${FIXTURE_SHA256}.mp3`, FIXTURE_SHA256],
    ),
    /registered_delivery_changed/,
  );
  await deliver(); // Restore exactly the approved snapshot, never replace it with a different version.
  await asOwner();
  await db.query("delete from b2_audio_deliveries where track_id=$1", [first]);
  await asRole(admin);
  await assert.rejects(publish(), /release_changed_or_incomplete/);
  await asRole(null, "service_role");
  assert.equal(
    (await db.query("select audio_storage_locator($1) as r", [first])).rows[0].r.unavailable,
    true,
  );
  await deliver();
});

scenario("retired, edited or missing recordings block approval", async () => {
  await asOwner();
  await db.exec("update tracks set status='retired' where position=1");
  await asRole(admin);
  await assert.rejects(publish(), /release_changed_or_incomplete/);
  await asOwner();
  await db.exec(
    "update tracks set status='draft' where position=1;update tracks set license='Changed' where position=1000",
  );
  await asRole(admin);
  await assert.rejects(publish(), /release_changed_or_incomplete/);
  await asOwner();
  assert.equal(await count("tracks", "status='published'"), 0);
  assert.equal(await count("catalogue_publications"), 0);
  await db.exec("update tracks set license='Fixture' where position=1000");
  await db.query("delete from catalogue_release_items where release_id=$1 and track_id=$2", [
    release.id,
    first,
  ]);
  await asRole(admin);
  await assert.rejects(publish(), /incomplete_manifest/);
  await seedReleaseItems(release.id, { provider: "b2", trackIds: [first] });
});

scenario("named approval publishes the B2 release once with version snapshots", async () => {
  await asRole(admin);
  const summary = (await db.query("select catalogue_release_summary() as r")).rows[0].r[0];
  assert.equal(summary.storageProvider, "b2");
  assert.equal(summary.deliveredCount, 1000);
  assert.equal((await publish()).repeated, false);
  assert.equal((await publish()).repeated, true);
  await asOwner();
  const audit = (await db.query("select * from catalogue_publications")).rows[0];
  assert.equal(audit.reviewer_id, admin);
  assert.equal(audit.storage_provider, "b2");
  assert.equal(audit.delivery_snapshots.length, 1000);
  assert.equal(audit.previous_states.length, 1000);
  assert.equal(audit.delivery_snapshots.find((d) => d.track_id === first).version_id, "version-1");
  await asRole(null, "anon");
  assert.equal(
    (await db.query("select catalog_page('{\"limit\":48}',false) as r")).rows[0].r.total,
    1000,
  );
});

scenario("the playback locator finds release items by recording through the index", async () => {
  await asOwner();
  await db.exec("analyze catalogue_release_items");
  await db.exec("set enable_seqscan = off");
  try {
    const plan = (
      await db.query(
        "explain (format json) select 1 from catalogue_release_items where track_id=$1",
        [first],
      )
    ).rows[0]["QUERY PLAN"];
    assert.match(JSON.stringify(plan), /catalogue_release_items_track/);
  } finally {
    await db.exec("reset enable_seqscan");
  }
  await asRole(null, "service_role");
  assert.equal(
    (await db.query("select audio_storage_locator($1) as r", [first])).rows[0].r.provider,
    "b2",
  );
});
