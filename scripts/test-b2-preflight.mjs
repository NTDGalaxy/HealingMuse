import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
const execute = promisify(execFile),
  directory = await mkdtemp(join(tmpdir(), "healingmuse-b2-guards-"));
const root = resolve("."),
  now = Date.now();
const observed = new Date(now - 1200000).toISOString(),
  effective = new Date(now - 1000).toISOString();
const starts = new Date(now - 3600000).toISOString(),
  ends = new Date(now + 3600000).toISOString();
const common = [
  "--confirmed-in-console",
  "--account-storage-bytes=0",
  "--download-remaining-bytes=1000",
  `--caps-observed-at=${observed}`,
  `--caps-confirmed-effective-at=${effective}`,
  `--download-period-starts-at=${starts}`,
  `--download-period-ends-at=${ends}`,
  "--class-d-disabled",
];
const run = async (script, args) => {
  try {
    const result = await execute(process.execPath, [resolve(root, script), ...args], {
      cwd: directory,
    });
    return { ...result, code: 0 };
  } catch (error) {
    return { stdout: error.stdout ?? "", stderr: error.stderr ?? "", code: error.code };
  }
};
const json = (output) =>
  output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
try {
  const old = await run("scripts/b2-account-confirm.mjs", [
    "--confirmed-in-console",
    "--account-storage-bytes=0",
    "--download-remaining-bytes=0",
    `--caps-updated-at=${observed}`,
  ]);
  assert.equal(old.code, 1);
  assert.ok(json(old.stderr)[0].issues.includes("download_allowance_exhausted"));
  await assert.rejects(readFile(join(directory, "media/evidence/b2-account.json")), {
    code: "ENOENT",
  });
  const good = await run("scripts/b2-account-confirm.mjs", common);
  assert.equal(good.code, 0);
  const before = await readFile(join(directory, "media/evidence/b2-account.json"), "utf8");
  for (const args of [
    common.filter((a) => a !== "--class-d-disabled"),
    common.filter((a) => !a.startsWith("--download-period-ends-at=")),
    common.map((a) =>
      a.startsWith("--caps-confirmed-effective-at=")
        ? `--caps-confirmed-effective-at=${observed}`
        : a,
    ),
  ]) {
    assert.equal((await run("scripts/b2-account-confirm.mjs", args)).code, 1);
    assert.equal(await readFile(join(directory, "media/evidence/b2-account.json"), "utf8"), before);
  }
  const invalid = {
    ...JSON.parse(before),
    downloadRemainingBytes: 0,
    eventNotificationsDisabled: false,
    otherClassDFeaturesDisabled: false,
    downloadPeriodStartsAt: null,
    downloadPeriodEndsAt: null,
    capsObservedAt: null,
    capsEffectiveAt: null,
  };
  await writeFile(join(directory, "media/evidence/b2-account.json"), JSON.stringify(invalid));
  await mkdir(join(directory, "media/prepared"), { recursive: true });
  await writeFile(
    join(directory, "media/prepared/catalog.json"),
    JSON.stringify(
      Array.from({ length: 1000 }, (_, n) => ({
        id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        status: "draft",
        source: { kind: "hosted", path: "synthetic.mp3" },
        bytes: 100,
        sha256: "a".repeat(64),
      })),
    ),
  );
  const preload = join(directory, "deny-network.mjs");
  await writeFile(
    preload,
    `import https from 'node:https';import http from 'node:http';let calls=0;const deny=()=>{calls++;throw new Error('synthetic_network_denied');};https.request=deny;http.request=deny;globalThis.fetch=deny;process.on('exit',()=>console.log(JSON.stringify({event:'network_guard',calls})));`,
  );
  const env = {
    ...process.env,
    SUPABASE_DB_URL: "",
    SUPABASE_SECRET_KEY: "",
    NEXT_PUBLIC_SUPABASE_URL: "",
    B2_S3_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
    B2_REGION: "us-west-004",
    B2_BUCKET_NAME: "synthetic-bucket",
    B2_UPLOAD_KEY_ID: "synthetic-upload",
    B2_UPLOAD_APPLICATION_KEY: "synthetic-only",
    B2_READ_KEY_ID: "synthetic-read",
    B2_READ_APPLICATION_KEY: "synthetic-only",
  };
  let rejected;
  try {
    await execute(
      process.execPath,
      ["--import", preload, resolve(root, "scripts/b2-audio.mjs"), "upload"],
      { cwd: directory, env },
    );
    throw new Error("unexpected_upload");
  } catch (error) {
    rejected = error;
  }
  assert.equal(rejected.code, 1);
  assert.equal(json(rejected.stdout).find((row) => row.event === "network_guard").calls, 0);
  assert.equal(
    json(rejected.stderr).find((row) => row.event === "b2_delivery_paused").code,
    "account_limits_unconfirmed",
  );
  await assert.rejects(readFile(join(directory, "media/evidence/b2-delivery.json")), {
    code: "ENOENT",
  });
  console.log(
    "PASS: operator CLI rejects zero or unverified download budgets, requires explicit Class D/effective-cap evidence, preserves prior proof on failure, and upload CLI makes zero network requests with invalid safeguards.",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
