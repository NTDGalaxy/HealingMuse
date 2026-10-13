import assert from "node:assert/strict";
import { databaseFixture } from "./database-fixture.mjs";
const db = await databaseFixture();
const admin = "20000000-0000-4000-8000-000000000001";
const patient = "20000000-0000-4000-8000-000000000002";
const release = "30000000-0000-4000-8000-000000000001";
const sha = "a".repeat(64);
const manifest = "b".repeat(64);
const publish = () =>
  db.query("select publish_catalogue_release($1,$2,$3,$4) as result", [
    release,
    manifest,
    "Named human reviewer",
    "human-review-v1",
  ]);
const as = async (id, role = "authenticated") => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? ""]);
  await db.exec(`set role ${role}`);
};
try {
  await db.query("insert into auth.users(id) values($1),($2)", [admin, patient]);
  await db.query("insert into content_admins values($1)", [admin]);
  await db.query(
    `insert into tracks(id,title,artist,category,goals,duration,source,attribution,license,license_url,provenance_url,human_created,position,bytes,sha256)
    select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
    '{"vi":"Bản thu thử","en":"Synthetic fixture"}','Synthetic','instrumental',array['relax'],60,
    jsonb_build_object('kind','hosted','path','fixture-'||n||'.mp3'),'Synthetic fixture only','Fixture',
    'https://example.invalid','https://example.invalid',true,n,100,$1 from generate_series(1,1000)n`,
    [sha],
  );
  await db.exec(
    `insert into storage.objects(bucket_id,name,metadata) select 'audio',source->>'path','{"size":100}' from tracks`,
  );
  await as(null, "service_role");
  await db.query("select record_audio_delivery(id,sha256,bytes) from tracks");
  await db.exec("reset role");
  await db.query(
    "insert into catalogue_releases(id,manifest_hash,title,expected_count) values($1,$2,'Fixture release',1000)",
    [release, manifest],
  );
  await db.query(
    "insert into catalogue_release_items(release_id,track_id,expected_metadata) select $1,id,release_track_metadata(tracks) from tracks",
    [release],
  );
  for (const [id, role] of [
    [null, "anon"],
    [patient, "authenticated"],
  ]) {
    await as(id, role);
    await assert.rejects(publish(), /permission denied|forbidden/);
    if (role === "authenticated") {
      assert.equal(
        (await db.query("select count(*)::integer as n from catalogue_releases")).rows[0].n,
        0,
      );
      await assert.rejects(db.query("select catalogue_release_summary()"), /forbidden/);
    }
  }
  await as(admin);
  await assert.rejects(
    db.query("update catalogue_releases set title='Forged'"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select record_audio_delivery(id,sha256,bytes) from tracks"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select publish_catalogue_release($1,$2,'Name','human-review-v1')", [
      release,
      "c".repeat(64),
    ]),
    /manifest_changed/,
  );
  await assert.rejects(
    db.query("select publish_catalogue_release($1,$2,'','human-review-v1')", [release, manifest]),
    /invalid_attestation/,
  );
  await db.exec("reset role;update tracks set license='Changed' where position=1");
  await as(admin);
  await assert.rejects(publish(), /release_changed_or_incomplete/);
  await db.exec(
    "reset role;update tracks set license='Fixture' where position=1;update storage.objects set updated_at=now()+interval '1 second' where name='fixture-1.mp3'",
  );
  await as(admin);
  await assert.rejects(publish(), /release_changed_or_incomplete/);
  await db.exec("reset role");
  await db.query("select record_audio_delivery(id,sha256,bytes) from tracks where position=1");
  await db.exec("delete from storage.objects where name='fixture-1000.mp3'");
  await as(admin);
  await assert.rejects(publish(), /release_changed_or_incomplete/);
  await db.exec("reset role");
  assert.equal(
    (await db.query("select count(*)::integer as n from tracks where status='published'")).rows[0]
      .n,
    0,
  );
  assert.equal(
    (await db.query("select count(*)::integer as n from catalogue_publications")).rows[0].n,
    0,
  );
  await db.exec(
    "insert into storage.objects(bucket_id,name,metadata) values('audio','fixture-1000.mp3','{\"size\":100}')",
  );
  await db.query("select record_audio_delivery(id,sha256,bytes) from tracks where position=1000");
  await db.exec("update tracks set status='retired' where position=1000");
  await as(admin);
  await assert.rejects(publish(), /release_changed_or_incomplete/);
  await db.exec("reset role;update tracks set status='draft' where position=1000");
  await as(admin);
  const summary = (await db.query("select catalogue_release_summary() as result")).rows[0]
    .result[0];
  assert.equal(summary.matchingCount, 1000);
  assert.equal(summary.deliveredCount, 1000);
  assert.equal((await publish()).rows[0].result.repeated, false);
  assert.equal((await publish()).rows[0].result.repeated, true);
  await db.exec("reset role");
  const audit = (await db.query("select * from catalogue_publications")).rows[0];
  assert.equal(audit.reviewer_id, admin);
  assert.equal(audit.previous_states.length, 1000);
  assert.ok(
    audit.previous_states.every(
      (s) => s.status === "draft" && !s.listeningReviewed && !s.rightsVerified,
    ),
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::integer as n from tracks where status='published' and listening_reviewed and rights_verified",
      )
    ).rows[0].n,
    1000,
  );
  await as(null, "anon");
  assert.equal(
    (await db.query("select catalog_page('{\"limit\":48}',false) as page")).rows[0].page.total,
    1000,
  );
  console.log(
    "PASS: atomic 1,000-track publication, administrator authorization, immutable manifest checks, storage version checks, named audit, recovery states and idempotent retries.",
  );
} finally {
  await db.close();
}
