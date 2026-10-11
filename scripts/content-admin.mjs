import { databaseClient } from "./database.mjs";
const userId = process.argv.find((arg) => arg.startsWith("--user="))?.slice(7);
if (
  !userId ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
) {
  console.error("Supply the explicitly designated existing Supabase user UUID with --user=.");
  process.exit(1);
}
const db = databaseClient();
try {
  await db.connect();
  await db.query("begin");
  if (!(await db.query("select id from auth.users where id=$1 for share", [userId])).rowCount)
    throw new Error("account_missing");
  await db.query("insert into public.content_admins(user_id) values($1) on conflict do nothing", [
    userId,
  ]);
  await db.query("commit");
  console.log(
    JSON.stringify({
      event: "content_administrator_designated",
      access: "catalogue only; private patient records remain owner-only",
    }),
  );
} catch (error) {
  await db.query("rollback").catch(() => {});
  console.error(
    JSON.stringify({
      event: "administrator_setup_failed",
      code: error.message === "account_missing" ? "account_missing" : "unavailable",
    }),
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
