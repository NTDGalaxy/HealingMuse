import { atomicJson } from "./audio-common.mjs";
import { validateAccountEvidence } from "./lib/b2-account.mjs";
const argument = (name) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
try {
  const capsObservedAt = argument("caps-observed-at") ?? argument("caps-updated-at");
  const capsEffectiveAt = argument("caps-confirmed-effective-at");
  const evidence = {
    version: 2,
    freeOnly: true,
    accountStorageBytes: Number(argument("account-storage-bytes")),
    downloadRemainingBytes: Number(argument("download-remaining-bytes")),
    downloadPeriodStartsAt: argument("download-period-starts-at"),
    downloadPeriodEndsAt: argument("download-period-ends-at"),
    zeroSpendCaps: Object.fromEntries(
      ["storage", "download", "classA", "classB", "classC"].map((name) => [
        name,
        process.argv.includes("--confirmed-in-console"),
      ]),
    ),
    eventNotificationsDisabled: process.argv.includes("--class-d-disabled"),
    otherClassDFeaturesDisabled: process.argv.includes("--class-d-disabled"),
    checkedAt: new Date().toISOString(),
    capsObservedAt,
    capsEffectiveAt,
  };
  const budget = validateAccountEvidence(evidence);
  await atomicJson("media/evidence/b2-account.json", evidence);
  console.log(
    JSON.stringify({
      event: "b2_account_confirmed",
      ...budget,
      evidence: "owner_console_confirmation",
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      event: "b2_account_confirmation_failed",
      code: "account_limits_unconfirmed",
      issues: error.issues ?? ["account_evidence_invalid"],
    }),
  );
  process.exitCode = 1;
}
