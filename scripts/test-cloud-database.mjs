import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { databaseClient } from "./database.mjs";

// Synthetic rows remain inside a transaction that is always rolled back.
const db = databaseClient();
const A = randomUUID(),
  B = randomUUID(),
  ADMIN = randomUUID(),
  track = randomUUID();
async function as(id, role = "authenticated") {
  await db.query(`set local role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id || ""]);
}
async function denied(sql, params, code = "42501") {
  await db.query("savepoint expected_denial");
  let problem;
  try {
    await db.query(sql, params);
  } catch (error) {
    problem = error;
  }
  await db.query("rollback to savepoint expected_denial");
  await db.query("release savepoint expected_denial");
  assert.equal(problem?.code, code);
}
async function count(table, id) {
  return Number(
    (await db.query(`select count(*) as n from public.${table} where owner_id=$1`, [id])).rows[0].n,
  );
}
try {
  await db.connect();
  await db.query("begin");
  await db.query(
    "insert into auth.users(id,aud,role,email,created_at,updated_at) select id,'authenticated','authenticated',id::text||'@example.invalid',now(),now() from unnest($1::uuid[]) id",
    [[A, B, ADMIN]],
  );
  await db.query("insert into public.content_admins(user_id) values($1)", [ADMIN]);
  await db.query(
    `insert into public.tracks(id,title,artist,category,goals,duration,source,attribution,license,license_url,provenance_url,status,rights_verified,human_created,listening_reviewed)
    values($1,'{"vi":"Dữ liệu kiểm thử","en":"Synthetic transaction fixture"}','Synthetic fixture','nature',array['relax'],60,'{"kind":"hosted","path":"synthetic-transaction.mp3"}','Synthetic fixture only','CC0','https://creativecommons.org/publicdomain/zero/1.0/','https://example.invalid/synthetic','published',true,true,true)`,
    [track],
  );
  await as(A);
  await denied("select public.start_listening($1,2)", [track]);
  await denied("update public.profiles set mood_consent_at=now() where id=$1", [A]);
  await denied("select public.consume_rate_limit('synthetic','probe',1,60)");
  await db.query("select public.set_mood_consent(true)");
  const session = (await db.query("select public.start_listening($1,2) as id", [track])).rows[0].id;
  await db.query("select public.end_listening($1,4)", [session]);
  assert.equal(await count("mood_checkins", A), 2);
  const playlist = (
    await db.query(
      "insert into public.playlists(owner_id,title) values($1,'Synthetic fixture') returning id",
      [A],
    )
  ).rows[0].id;
  await db.query("select public.save_playlist($1,0,'Synthetic revision',array[$2]::uuid[])", [
    playlist,
    track,
  ]);
  await denied(
    "select public.save_playlist($1,0,'Stale revision',array[]::uuid[])",
    [playlist],
    "40001",
  );
  await as(B);
  await db.query("select public.set_mood_consent(true)");
  assert.equal(await count("mood_checkins", A), 0);
  await as(ADMIN);
  const reviewPage = (await db.query("select public.catalog_page('{}',true) as page")).rows[0].page;
  assert.ok(reviewPage.total >= 1 && reviewPage.items.length <= 24);
  await as(null, "anon");
  await denied("select public.catalog_page('{}',true)");
  await denied("select public.catalog_page('{\"limit\":49}',false)", undefined, "22023");
  const publishedPage = (await db.query("select public.catalog_page('{}',false) as page")).rows[0]
    .page;
  assert.ok(publishedPage.items.every((row) => row.status === "published"));
  await db.query("reset role");
  await denied("update public.tracks set listening_reviewed=false where id=$1", [track], "23514");
  await as(B);
  assert.equal(await count("listening_sessions", A), 0);
  assert.equal(await count("playlists", A), 0);
  await denied("select public.end_listening($1,5)", [session]);
  await denied("select public.save_playlist($1,1,'Foreign edit',array[]::uuid[])", [playlist]);
  await as(ADMIN);
  assert.equal(
    (await db.query("select public.is_content_admin() as permitted")).rows[0].permitted,
    true,
  );
  assert.equal(await count("mood_checkins", A), 0);
  await as(null, "anon");
  await denied("select * from public.mood_checkins");
  await denied("select public.consume_rate_limit('synthetic','probe',1,60)");
  await as(A);
  await db.query("select public.set_mood_consent(false)");
  assert.equal(await count("mood_checkins", A), 0);
  assert.equal(await count("listening_sessions", A), 0);
  await db.query("reset role");
  await db.query("delete from auth.users where id=$1", [A]);
  assert.equal(
    Number(
      (await db.query("select count(*) as n from public.playlists where owner_id=$1", [A])).rows[0]
        .n,
    ),
    0,
  );
  assert.equal(
    Number(
      (await db.query("select count(*) as n from public.deleted_accounts where user_id=$1", [A]))
        .rows[0].n,
    ),
    1,
  );
  console.log(
    JSON.stringify({
      passed: true,
      syntheticData: "Rolled back; no synthetic accounts or recordings are published.",
      checks: [
        "explicit consent",
        "paired check-ins",
        "patient ownership",
        "content-admin isolation",
        "guest denial",
        "server-only RPC",
        "bounded catalogue and review isolation",
        "human-listening publication gate",
        "playlist conflict",
        "consent revocation",
        "account erasure",
      ],
    }),
  );
} catch {
  console.error(JSON.stringify({ event: "cloud_database_test_failed" }));
  process.exitCode = 1;
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
