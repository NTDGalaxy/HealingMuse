import { atomicJson } from "./audio-common.mjs";
import { validateAccountEvidence } from "./lib/b2-account.mjs";
const argument = (name) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
try {
  const updated = Date.parse(argument("caps-updated-at"));
  // Console caps can take ten minutes to apply; require a later console check.
  if (
    !process.argv.includes("--confirmed-in-console") ||
    !Number.isFinite(updated) ||
    Date.now() - updated < 600000
  )
    throw new Error("account_limits_unconfirmed");
  const evidence = {
    version: 1,
    freeOnly: true,
    accountStorageBytes: Number(argument("account-storage-bytes")),
    downloadRemainingBytes: Number(argument("download-remaining-bytes")),
    zeroSpendCaps: { storage: true, download: true, transactions: true },
    noClassDFeatures: true,
    checkedAt: new Date().toISOString(),
    capsEffectiveAt: new Date(updated + 600000).toISOString(),
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
} catch {
  console.error(
    JSON.stringify({ event: "b2_account_confirmation_failed", code: "account_limits_unconfirmed" }),
  );
  process.exitCode = 1;
}
