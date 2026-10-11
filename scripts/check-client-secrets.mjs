import { config } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

config({ path: ".env.local", quiet: true });
const names = ["SUPABASE_SECRET_KEY", "SUPABASE_DB_URL", "RATE_LIMIT_SALT"];
const secrets = names.flatMap((name) => {
  const value = process.env[name];
  return value ? [value, JSON.stringify(value).slice(1, -1), encodeURIComponent(value)] : [];
});
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? files(path) : [path];
      }),
    )
  ).flat();
}
try {
  const paths = await files(".next/static");
  for (const path of paths) {
    const content = await readFile(path);
    if (secrets.some((value) => content.includes(Buffer.from(value))))
      throw new Error("client_secret_detected");
  }
  console.log(
    JSON.stringify({
      passed: true,
      clientFilesChecked: paths.length,
      configuredSecretNamesChecked: names.filter((name) => process.env[name]),
    }),
  );
} catch {
  console.error(JSON.stringify({ event: "client_secret_check_failed" }));
  process.exitCode = 1;
}
