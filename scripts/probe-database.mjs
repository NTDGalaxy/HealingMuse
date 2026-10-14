import { databaseClient } from "./database.mjs";
const db = databaseClient();
try {
  await db.connect();
  const result = await db.query(
    "select tablename from pg_tables where schemaname='public' order by tablename",
  );
  const policies = await db.query(
    "select schemaname,tablename,policyname,permissive,roles,cmd from pg_policies where schemaname in ('public','storage','realtime') order by schemaname,tablename,policyname",
  );
  const buckets = await db.query(
    "select id,public,file_size_limit from storage.buckets order by id",
  );
  const defaults = await db.query(
    "select defaclrole::regrole::text as owner,defaclnamespace::regnamespace::text as schema,defaclobjtype as type,defaclacl::text as grants from pg_default_acl where defaclnamespace='public'::regnamespace",
  );
  console.log(
    JSON.stringify({
      connected: true,
      publicTables: result.rows.map((row) => row.tablename),
      policies: policies.rows,
      buckets: buckets.rows,
      defaults: defaults.rows,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      connected: false,
      code: error.code ?? "database_connection_failed",
      category: /timeout/i.test(error.message)
        ? "timeout"
        : /certificate|self.signed/i.test(error.message)
          ? "certificate"
          : /password|authentication/i.test(error.message)
            ? "authentication"
            : "connection",
    }),
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
