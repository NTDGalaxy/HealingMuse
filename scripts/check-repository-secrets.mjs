import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const names = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_DB_URL",
  "RATE_LIMIT_SALT",
  "B2_READ_KEY_ID",
  "B2_READ_APPLICATION_KEY",
  "B2_UPLOAD_KEY_ID",
  "B2_UPLOAD_APPLICATION_KEY",
];
const secrets = names.flatMap((name) =>
  process.env[name] ? [process.env[name], encodeURIComponent(process.env[name])] : [],
);
const prohibited =
  /(^|\/)(?:\.env(?:\..*)?|\.aws|\.vercel|\.local|media\/(?:prepared|originals|evidence))(?:\/|$)|\.(?:pem|key)$/;
try {
  const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const pending = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  const paths = [...new Set([...tracked, ...pending])];
  for (const path of paths) {
    if (prohibited.test(path)) throw new Error("sensitive_path");
    const content = await readFile(path);
    if (
      secrets.some((secret) => content.includes(Buffer.from(secret))) ||
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content.toString())
    )
      throw new Error("credential_detected");
  }
  console.log(
    JSON.stringify({ event: "repository_secret_scan", passed: true, filesChecked: paths.length }),
  );
} catch {
  console.error(JSON.stringify({ event: "repository_secret_scan", passed: false }));
  process.exitCode = 1;
}
