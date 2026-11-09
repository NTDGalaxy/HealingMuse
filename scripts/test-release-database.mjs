import assert from "node:assert/strict";
import { databaseFixture } from "./database-fixture.mjs";
import { databaseKit, databaseSuite, rejectsWith } from "./db-kit.mjs";

const db = await databaseFixture();
const { asOwner, asRole, count, seedTracks, seedRelease, publishRelease } = databaseKit(db);
const scenario = databaseSuite(
  db,
  "atomic 1,000-track publication, administrator authorization, immutable manifest checks, storage version checks, named audit, recovery states, idempotent retries and the API-role publish lock.",
);
const admin = "20000000-0000-4000-8000-000000000001";
const patient = "20000000-0000-4000-8000-000000000002";
const release = { id: "30000000-0000-4000-8000-000000000001", manifest: "b".repeat(64) };
const outsider = "40000000-0000-4000-8000-000000000001";
const publish = () => publishRelease(release);
// The shape PostgREST sends for supabase-js upsert(), as /api/admin/tracks uses it.
const upsert = (id, status) =>
  db.query(
    `insert into tracks(id,title,artist,category,goals,duration,source,attribution,license,license_url,provenance_url,status,rights_verified,human_created,listening_reviewed,position)
     values($1,'{"vi":"Bản sửa","en":"Edited fixture"}','Synthetic','instrumental',array['relax'],60,
     '{"kind":"hosted","path":"fixture-edit.mp3"}','Synthetic fixture only','Fixture','https://example.invalid','https://example.invalid',$2,true,true,true,0)
     on conflict(id) do update set title=excluded.title,source=excluded.source,status=excluded.status,
     rights_verified=excluded.rights_verified,listening_reviewed=excluded.listening_reviewed`,
    [id, status],
  );

await db.query("insert into auth.users(id) values($1),($2)", [admin, patient]);
await db.query("insert into content_admins values($1)", [admin]);
await seedTracks({ count: 1000 });
await db.exec(
  `insert into storage.objects(bucket_id,name,metadata) select 'audio',source->>'path','{"size":100}' from tracks`,
);
await asRole(null, "service_role");
await db.query("select record_audio_delivery(id,sha256,bytes) from tracks");
await seedRelease({ ...release, title: "Fixture release" });

scenario("guests and patients cannot publish or read releases", async () => {
  for (const [id, role] of [
    [null, "anon"],
    [patient, "authenticated"],
  ]) {
    await asRole(id, role);
    await assert.rejects(publish(), /permission denied|forbidden/);
    if (role === "authenticated") {
      assert.equal(await count("catalogue_releases"), 0);
      await assert.rejects(db.query("select catalogue_release_summary()"), /forbidden/);
    }
  }
});

scenario("administrators cannot forge releases or deliveries", async () => {
  await asRole(admin);
  await assert.rejects(
    db.query("update catalogue_releases set title='Forged'"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select record_audio_delivery(id,sha256,bytes) from tracks"),
    /permission denied/,
  );
  await assert.rejects(
    publishRelease({ ...release, manifest: "c".repeat(64), reviewer: "Name" }),
    /manifest_changed/,
  );
  await assert.rejects(publishRelease({ ...release, reviewer: "" }), /invalid_attestation/);
});

scenario("changed metadata, storage versions and retirement block publication", async () => {
  await asOwner();
  await db.exec("update tracks set license='Changed' where position=1");
  await asRole(admin);
  await assert.rejects(publish(), /release_changed_or_incomplete/);
  await asOwner();
  await db.exec(
    "update tracks set license='Fixture' where position=1;update storage.objects set updated_at=now()+interval '1 second' where name='fixture-1.mp3'",
  );
  await asRole(admin);
  await assert.rejects(publish(), /release_changed_or_incomplete/);
  await asOwner();
  await db.query("select record_audio_delivery(id,sha256,bytes) from tracks where position=1");
  await db.exec("delete from storage.objects where name='fixture-1000.mp3'");
  await asRole(admin);
  await assert.rejects(publish(), /release_changed_or_incomplete/);
  await asOwner();
  assert.equal(await count("tracks", "status='published'"), 0);
  assert.equal(await count("catalogue_publications"), 0);
  await db.exec(
    "insert into storage.objects(bucket_id,name,metadata) values('audio','fixture-1000.mp3','{\"size\":100}')",
  );
  await db.query("select record_audio_delivery(id,sha256,bytes) from tracks where position=1000");
  await db.exec("update tracks set status='retired' where position=1000");
  await asRole(admin);
  await assert.rejects(publish(), /release_changed_or_incomplete/);
  await asOwner();
  await db.exec("update tracks set status='draft' where position=1000");
});

scenario("an administrator cannot publish a recording directly", async () => {
  await asRole(admin);
  for (const statement of [
    "update tracks set status='published',rights_verified=true,listening_reviewed=true where position=1",
    "update tracks set status='published',rights_verified=true,listening_reviewed=true",
  ])
    await rejectsWith(db.query(statement), "42501", /^forbidden$/);
  const draft = (await db.query("select id from tracks where position=2")).rows[0].id;
  // An upsert onto a draft row and an insert of a new row are both direct publications.
  await rejectsWith(upsert(draft, "published"), "42501", /^forbidden$/);
  await rejectsWith(upsert(outsider, "published"), "42501", /^forbidden$/);
  // Drafts remain editable, and the publish lock does not touch other statuses.
  await upsert(outsider, "draft");
  await db.exec("update tracks set license='Fixture' where position=3");
  await asOwner();
  assert.equal(await count("tracks", "status='published'"), 0);
  assert.equal(await count("tracks", "id=$1 and status='draft'", [outsider]), 1);
});

scenario("guests and patients cannot publish a recording either", async () => {
  await asRole(null, "anon");
  await assert.rejects(
    db.query("update tracks set status='published' where id=$1", [outsider]),
    /permission denied/,
  );
  await assert.rejects(upsert(outsider, "published"), /permission denied/);
  await asRole(patient);
  // RLS limits patient updates to no rows; inserts reach the publish lock first.
  const update = await db.query("update tracks set status='published' where id=$1", [outsider]);
  assert.equal(update.affectedRows, 0);
  await rejectsWith(upsert(outsider, "published"), "42501", /^forbidden$/);
  // Even a mistaken future grant of write access to guests cannot publish.
  for (const statement of [
    () => upsert(outsider, "published"),
    () => db.query("update tracks set status='published' where id=$1", [outsider]),
  ]) {
    await asOwner();
    await db.exec(
      "begin; grant insert, update on tracks to anon; create policy anon_write_probe on tracks for all to anon using (true) with check (true);",
    );
    try {
      await asRole(null, "anon");
      await rejectsWith(statement(), "42501", /^forbidden$/);
    } finally {
      await db.exec("rollback");
    }
  }
  await asOwner();
  assert.equal(await count("tracks", "status='published'"), 0);
  assert.equal(
    (await db.query("select has_table_privilege('anon','tracks','update') as granted")).rows[0]
      .granted,
    false,
  );
});

scenario("the reviewed release publishes 1,000 recordings atomically", async () => {
  await asRole(admin);
  const summary = (await db.query("select catalogue_release_summary() as result")).rows[0]
    .result[0];
  assert.equal(summary.matchingCount, 1000);
  assert.equal(summary.deliveredCount, 1000);
  assert.equal((await publish()).repeated, false);
  assert.equal((await publish()).repeated, true);
  await asOwner();
  const audit = (await db.query("select * from catalogue_publications")).rows[0];
  assert.equal(audit.reviewer_id, admin);
  assert.equal(audit.previous_states.length, 1000);
  assert.ok(
    audit.previous_states.every(
      (s) => s.status === "draft" && !s.listeningReviewed && !s.rightsVerified,
    ),
  );
  assert.equal(
    await count("tracks", "status='published' and listening_reviewed and rights_verified"),
    1000,
  );
  // The outsider recording is not part of the manifest and stays a draft.
  assert.equal(await count("tracks", "id=$1 and status='draft'", [outsider]), 1);
  await asRole(null, "anon");
  assert.equal(
    (await db.query("select catalog_page('{\"limit\":48}',false) as page")).rows[0].page.total,
    1000,
  );
});

scenario("administrators still edit published recordings and may retire them", async () => {
  await asRole(admin);
  const [first, second] = (
    await db.query("select id from tracks where position in (1,2) order by position")
  ).rows.map((row) => row.id);
  await db.query("update tracks set license='Edited after publication' where id=$1", [first]);
  // The admin editor saves through upsert, which PostgreSQL first fires as an INSERT.
  await upsert(second, "published");
  await db.query("update tracks set status='retired' where id=$1", [first]);
  // Bringing a retired recording back is a new publication, so it needs a release too.
  await rejectsWith(
    db.query("update tracks set status='published' where id=$1", [first]),
    "42501",
    /^forbidden$/,
  );
  await asOwner();
  assert.equal(
    await count("tracks", "id=$1 and status='published' and title->>'en'='Edited fixture'", [
      second,
    ]),
    1,
  );
  assert.equal(await count("tracks", "id=$1 and status='retired'", [first]), 1);
});

scenario("the service role and the database owner can still publish", async () => {
  await asRole(null, "service_role");
  await db.query("update tracks set status='published' where id=$1", [outsider]);
  await asOwner();
  await db.query("update tracks set status='draft' where id=$1", [outsider]);
  await db.query("update tracks set status='published' where id=$1", [outsider]);
  assert.equal(await count("tracks", "id=$1 and status='published'", [outsider]), 1);
});
