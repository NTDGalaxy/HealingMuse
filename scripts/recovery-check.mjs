import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { databaseFixture } from "./database-fixture.mjs";
// This exercises a portable database restoration independently of production credentials.
const original = await databaseFixture();
const A = "10000000-0000-4000-8000-000000000001",
  B = "10000000-0000-4000-8000-000000000002",
  track = "00000000-0000-4000-8000-000000000001";
await original.query("insert into auth.users values($1),($2)", [A, B]);
await original.query(
  `insert into tracks(id,title,artist,category,goals,duration,source,attribution,license,license_url,provenance_url,status,rights_verified,human_created,listening_reviewed) values($1,'{"vi":"Thử nghiệm","en":"Synthetic fixture"}','Synthetic fixture','nature',array['relax'],30,'{"kind":"hosted","path":"synthetic.mp3"}','Synthetic recovery fixture','Fixture','https://example.invalid','https://example.invalid','published',true,true,true)`,
  [track],
);
for (const id of [A, B]) {
  await original.exec("set role authenticated");
  await original.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await original.exec("select set_mood_consent(true)");
  const session = (await original.query("select start_listening($1,3) as id", [track])).rows[0].id;
  await original.query("select end_listening($1,4)", [session]);
  await original.exec("reset role");
}
const archive = await original.dumpDataDir();
// The backup predates this erasure, so restoration must reapply the current separate ledger.
await original.query("delete from auth.users where id=$1", [A]);
const ledger = (await original.query("select user_id from deleted_accounts")).rows;
await original.close();
const restored = new PGlite({ loadDataDir: archive });
for (const record of ledger)
  await restored.query("delete from auth.users where id=$1", [record.user_id]);
await restored.exec(
  (await restored.query("select command from cron.jobs where name='healingmuse-private-retention'"))
    .rows[0].command,
);
assert.equal(
  Number((await restored.query("select count(*) as n from auth.users where id=$1", [A])).rows[0].n),
  0,
);
await restored.exec("set role authenticated");
await restored.query("select set_config('request.jwt.claim.sub',$1,false)", [B]);
assert.equal(
  Number((await restored.query("select count(*) as n from mood_checkins")).rows[0].n),
  2,
);
await restored.query("select set_config('request.jwt.claim.sub',$1,false)", [A]);
assert.equal(
  Number((await restored.query("select count(*) as n from mood_checkins")).rows[0].n),
  0,
);
await restored.exec("reset role;set role anon");
await assert.rejects(restored.exec("select * from mood_checkins"), /permission denied/);
await restored.close();
const report = JSON.parse(await readFile("media/evidence/import-report.json", "utf8"));
for (const item of report) {
  const originalBytes = await readFile(`media/originals/${item.id}`);
  assert.equal(createHash("sha256").update(originalBytes).digest("hex"), item.originalSha256);
}
console.log(
  `PASS: migrated synthetic database restored with erasure reapplication and owner RLS; ${report.length} separate audio originals match their recovery checksums. Live Supabase restore remains a staging release gate.`,
);
