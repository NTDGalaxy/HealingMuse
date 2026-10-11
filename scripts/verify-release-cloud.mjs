import assert from "node:assert/strict";
import { databaseClient } from "./database.mjs";
const db = databaseClient();
try {
  await db.connect();
  await db.query("begin read only");
  for (const table of [
    "audio_deliveries",
    "catalogue_releases",
    "catalogue_release_items",
    "catalogue_publications",
  ]) {
    const { rows } = await db.query(
      `select c.relrowsecurity as rls,
      has_table_privilege('anon',c.oid,'SELECT') as anonymous_read,
      has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_read,
      has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') as authenticated_write,
      has_table_privilege('service_role',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') as service_write
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=$1`,
      [table],
    );
    assert.deepEqual(rows[0], {
      rls: true,
      anonymous_read: false,
      authenticated_read: true,
      authenticated_write: false,
      service_write: false,
    });
  }
  const publish = "public.publish_catalogue_release(uuid,text,text,text)";
  const delivery = "public.record_audio_delivery(uuid,text,bigint)";
  for (const [role, canPublish, canDeliver] of [
    ["anon", false, false],
    ["authenticated", true, false],
    ["service_role", false, true],
  ]) {
    const { rows } = await db.query(
      "select has_function_privilege($1,$2,'EXECUTE') as publish,has_function_privilege($1,$3,'EXECUTE') as deliver",
      [role, publish, delivery],
    );
    assert.deepEqual(rows[0], { publish: canPublish, deliver: canDeliver });
  }
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub','',true)");
  for (const table of [
    "audio_deliveries",
    "catalogue_releases",
    "catalogue_release_items",
    "catalogue_publications",
  ])
    assert.equal(
      (await db.query(`select count(*)::integer as n from public.${table}`)).rows[0].n,
      0,
    );
  await db.query("rollback");
  console.log(
    "PASS: deployed release tables enforce administrator RLS, explicit API privileges, service-only delivery receipts and authenticated-only publication.",
  );
} catch {
  console.error(
    JSON.stringify({ event: "release_cloud_verification_failed", code: "unavailable" }),
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
