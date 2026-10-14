import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { databaseClient } from "./database.mjs";
const db = databaseClient();
try {
  await db.connect();
  const found = await db.query(
    "select to_regclass('public.healingmuse_migrations') as tracked, to_regclass('public.profiles') as profiles,to_regclass('public.tracks') as tracks",
  );
  if (!found.rows[0].tracked && (found.rows[0].profiles || found.rows[0].tracks))
    throw new Error(
      "Existing application tables require an explicit migration review before applying this schema.",
    );
  await db.query(
    "create table if not exists public.healingmuse_migrations(version text primary key,sha256 text not null,applied_at timestamptz not null default now());alter table public.healingmuse_migrations enable row level security;revoke all on public.healingmuse_migrations from anon,authenticated;",
  );
  await db.query("select pg_advisory_lock(721494012)");
  for (const name of (await readdir("supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(`supabase/migrations/${name}`, "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    const previous = await db.query(
      "select sha256 from public.healingmuse_migrations where version=$1",
      [name],
    );
    if (previous.rowCount) {
      if (previous.rows[0].sha256 !== hash)
        throw new Error("Applied migration checksum changed; add a new migration instead.");
      console.log(`Already applied: ${name}`);
      continue;
    }
    await db.query("begin");
    try {
      await db.query(sql.replace(/^begin;\s*/i, "").replace(/\s*commit;\s*$/i, ""));
      await db.query("insert into public.healingmuse_migrations(version,sha256) values($1,$2)", [
        name,
        hash,
      ]);
      await db.query("commit");
      console.log(`Applied: ${name}`);
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
  }
  console.log("HealingMuse schema migrations applied and tracked.");
} catch (error) {
  console.error(
    JSON.stringify({ event: "migration_failed", code: error.code ?? "migration_review_required" }),
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
