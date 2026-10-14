import { config } from "dotenv";
import { b2Config, b2Client } from "../src/lib/storage/b2.ts";
import { connectionChecks, b2ErrorCode } from "./lib/b2-account.mjs";
import { atomicJson } from "./audio-common.mjs";
config({ path: ".env.local", quiet: true });
const names = [
  "B2_S3_ENDPOINT",
  "B2_REGION",
  "B2_BUCKET_NAME",
  "B2_UPLOAD_KEY_ID",
  "B2_UPLOAD_APPLICATION_KEY",
  "B2_READ_KEY_ID",
  "B2_READ_APPLICATION_KEY",
];
let client;
try {
  const upload = b2Config("UPLOAD"),
    read = b2Config("READ");
  client = b2Client(read);
  const checks = await connectionChecks(upload, read, client);
  const report = {
    event: "b2_connection_checks",
    checkedAt: new Date().toISOString(),
    configured: Object.fromEntries(names.map((name) => [name, !!process.env[name]])),
    ...checks,
    permissionEvidence:
      checks.uploadAuthenticated && checks.readAuthenticated
        ? "live_native_capabilities"
        : "unavailable",
    destructiveProbes: false,
    uploadsStarted: false,
    connectionReady:
      checks.uploadAuthenticated &&
      checks.readAuthenticated &&
      checks.sameAccountAndBucket &&
      [checks.upload, checks.read].every(
        (c) =>
          c?.endpointMatches &&
          c.bucketScoped &&
          c.prefixMatches &&
          c.requiredCapabilities &&
          c.leastPrivilege,
      ) &&
      checks.bucketPrivate &&
      checks.allVersionsRetained &&
      checks.corsVerified &&
      checks.s3ReadAuthenticationVerified,
    deliveryReady: false,
    capacityAndSpendingProtections: "awaiting_owner_confirmation",
  };
  await atomicJson("media/evidence/b2-connection.json", report);
  console.log(JSON.stringify(report));
  if (!report.connectionReady) process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify({
      event: "b2_connection_checks",
      code: b2ErrorCode(error),
      configured: Object.fromEntries(names.map((name) => [name, !!process.env[name]])),
      uploadsStarted: false,
    }),
  );
  process.exitCode = 1;
} finally {
  client?.destroy();
}
