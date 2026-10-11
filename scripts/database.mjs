import pg from "pg";
import { existsSync, readFileSync } from "node:fs";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
export function databaseClient() {
  if (!process.env.SUPABASE_DB_URL)
    throw new Error("Database connection is not configured locally.");
  let url;
  try {
    url = new URL(process.env.SUPABASE_DB_URL);
  } catch {
    throw new Error("Invalid database connection URL format.");
  }
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (apiUrl) {
    const expected = new URL(apiUrl).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
    const target = url.hostname.endsWith(".pooler.supabase.com")
      ? decodeURIComponent(url.username).split(".").at(-1)
      : url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1];
    if (expected && target && expected !== target)
      throw new Error("Database and application credentials target different projects.");
  }
  const caFile =
    process.env.SUPABASE_DB_CA_FILE ||
    url.searchParams.get("sslrootcert") ||
    (existsSync(".local/supabase-ca.crt") ? ".local/supabase-ca.crt" : undefined);
  let ca;
  if (caFile) {
    try {
      ca = readFileSync(caFile, "utf8");
    } catch {
      throw new Error("Database CA certificate file could not be read.");
    }
  }
  // Always verify the cloud database certificate; do not accept sslmode=require's permissive fallback.
  for (const name of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(name);
  return new pg.Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
  });
}
