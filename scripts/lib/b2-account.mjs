import { GetBucketCorsCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { toolFetch } from "../tool-fetch.mjs";
import { readFile } from "node:fs/promises";

const canonical = "https://healingmuse.vercel.app";
const featureOrigin =
  "https://healingmuse-git-feat-sanctuary-catalogue-release-ntdgalaxy.vercel.app";
export function validationOrigins(env = process.env) {
  const origins = [
    ...new Set([
      canonical,
      featureOrigin,
      ...(env.B2_VALIDATION_ORIGINS || "").split(",").filter(Boolean),
    ]),
  ];
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin)
      throw new Error("invalid_validation_origin");
  }
  return origins;
}
export function accountEvidenceIssues(evidence, now = Date.now()) {
  const issues = [];
  const at = (name) => Date.parse(evidence?.[name]);
  if (evidence?.version !== 2 || evidence?.freeOnly !== true)
    issues.push("account_evidence_version");
  if (!Number.isSafeInteger(evidence?.accountStorageBytes) || evidence.accountStorageBytes < 0)
    issues.push("storage_usage_unverified");
  else if (evidence.accountStorageBytes >= 10_000_000_000)
    issues.push("storage_allowance_exhausted");
  if (
    !Number.isSafeInteger(evidence?.downloadRemainingBytes) ||
    evidence.downloadRemainingBytes < 0
  )
    issues.push("download_allowance_unverified");
  else if (evidence.downloadRemainingBytes === 0) issues.push("download_allowance_exhausted");
  if (
    !Number.isFinite(at("checkedAt")) ||
    at("checkedAt") > now ||
    now - at("checkedAt") > 86400000
  )
    issues.push("account_evidence_stale");
  if (
    !Number.isFinite(at("downloadPeriodStartsAt")) ||
    !Number.isFinite(at("downloadPeriodEndsAt")) ||
    at("downloadPeriodStartsAt") > at("checkedAt") ||
    at("downloadPeriodEndsAt") <= at("downloadPeriodStartsAt") ||
    at("downloadPeriodEndsAt") <= now
  )
    issues.push("download_period_unverified_or_expired");
  if (
    ["storage", "download", "classA", "classB", "classC"].some(
      (name) => evidence?.zeroSpendCaps?.[name] !== true,
    )
  )
    issues.push("zero_spend_caps_unverified");
  // The operator must actually recheck the settings after the propagation interval.
  if (
    !Number.isFinite(at("capsObservedAt")) ||
    !Number.isFinite(at("capsEffectiveAt")) ||
    at("capsEffectiveAt") - at("capsObservedAt") < 600000 ||
    at("capsEffectiveAt") > at("checkedAt")
  )
    issues.push("caps_effectiveness_unverified");
  if (
    evidence?.eventNotificationsDisabled !== true ||
    evidence?.otherClassDFeaturesDisabled !== true
  )
    issues.push("class_d_features_not_confirmed_disabled");
  return issues;
}
export function validateAccountEvidence(evidence, now = Date.now()) {
  const issues = accountEvidenceIssues(evidence, now);
  if (issues.length) throw Object.assign(new Error("account_limits_unconfirmed"), { issues });
  return {
    storageRemaining: Math.max(0, 10_000_000_000 - evidence.accountStorageBytes),
    downloadRemaining: evidence.downloadRemainingBytes,
    validUntil: Math.min(
      Date.parse(evidence.checkedAt) + 86400000,
      Date.parse(evidence.downloadPeriodEndsAt),
    ),
  };
}
export function keyScopeChecks(config, kind, result) {
  const api = result.apiInfo?.storageApi,
    allowed = api?.allowed;
  const buckets = allowed?.buckets,
    capabilities = allowed?.capabilities || [];
  const needed = kind === "UPLOAD" ? ["listBuckets", "readBuckets", "writeFiles"] : ["readFiles"];
  const permitted =
    kind === "UPLOAD"
      ? ["listBuckets", "readBuckets", "writeFiles"]
      : [
          "readFiles",
          "listFiles",
          "listBuckets",
          "readBuckets",
          "listAllBucketNames",
          "shareFiles",
          "readBucketEncryption",
          "readBucketReplications",
          "readBucketNotifications",
          "readBucketLogging",
          "readBucketLifecycleRules",
          "readBucketRetentions",
          "readFileRetentions",
          "readFileLegalHolds",
        ];
  return {
    endpointMatches: api?.s3ApiUrl?.replace(/\/$/, "") === config.endpoint,
    bucketScoped:
      Array.isArray(buckets) &&
      buckets.length === 1 &&
      !!buckets[0].id &&
      (!buckets[0].name || buckets[0].name.toLowerCase() === config.bucket),
    prefixMatches: !allowed?.namePrefix || "healingmuse/audio/".startsWith(allowed.namePrefix),
    requiredCapabilities: needed.every((cap) => capabilities.includes(cap)),
    leastPrivilege: capabilities.every((cap) => permitted.includes(cap)),
    readContentsDenied: !capabilities.includes("readFiles"),
    writeDenied: !capabilities.some((cap) => /^(write|bypass)/.test(cap)),
    capabilities,
    deleteDenied: !capabilities.some((cap) => cap.startsWith("delete")),
  };
}
async function nativeAuthorization(config) {
  const response = await toolFetch("https://api.backblazeb2.com/b2api/v4/b2_authorize_account", {
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.keyId}:${config.applicationKey}`).toString("base64")}`,
    },
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!response.ok)
    throw Object.assign(new Error("b2_authorization_unavailable"), { status: response.status });
  const result = await response.json(),
    api = result.apiInfo?.storageApi;
  if (!/^https:\/\/api[a-z0-9-]*\.backblazeb2\.com$/.test(api?.apiUrl || ""))
    throw new Error("b2_authorization_unavailable");
  return { ...result, api, bucketId: api.allowed?.buckets?.[0]?.id };
}
export function corsMatches(rules, origins) {
  const allowedOrigins = [...new Set(rules.flatMap((r) => r.AllowedOrigins || []))];
  return (
    !allowedOrigins.some((origin) => !origins.includes(origin)) &&
    origins.every((origin) =>
      rules.some(
        (r) =>
          r.AllowedOrigins?.includes(origin) &&
          ["GET", "HEAD"].every((m) => r.AllowedMethods?.includes(m)) &&
          r.AllowedHeaders?.some((h) => h === "*" || h.toLowerCase() === "range") &&
          ["content-length", "content-range", "accept-ranges", "etag"].every((header) =>
            r.ExposeHeaders?.some((h) => h.toLowerCase() === header),
          ),
      ),
    )
  );
}
export async function connectionChecks(uploadConfig, readConfig, client, env = process.env) {
  const [upload, read] = await Promise.allSettled([
    nativeAuthorization(uploadConfig),
    nativeAuthorization(readConfig),
  ]);
  const report = {
    uploadAuthenticated: upload.status === "fulfilled",
    readAuthenticated: read.status === "fulfilled",
  };
  if (!report.uploadAuthenticated || !report.readAuthenticated) {
    const category = (error) =>
      error.status
        ? { category: "provider_response", status: error.status }
        : {
            category: /certificate|tls/i.test(error.cause?.message || "")
              ? "tls"
              : /ENOTFOUND|EAI_AGAIN/.test(error.cause?.code || "")
                ? "dns"
                : "network_or_timeout",
          };
    if (upload.status === "rejected") report.uploadFailure = category(upload.reason);
    if (read.status === "rejected") report.readFailure = category(read.reason);
    return report;
  }
  const u = upload.value,
    r = read.value;
  report.upload = keyScopeChecks(uploadConfig, "UPLOAD", u);
  report.read = keyScopeChecks(readConfig, "READ", r);
  report.sameAccountAndBucket =
    u.accountId === r.accountId &&
    u.bucketId === r.bucketId &&
    !!u.bucketId &&
    uploadConfig.keyId !== readConfig.keyId;
  // Inspect only this bucket; do not query unrelated account resources.
  if (!report.sameAccountAndBucket || !report.upload.bucketScoped || !report.read.bucketScoped)
    return report;
  const auth = [u, r].find((a) => a.api.allowed.capabilities.includes("listBuckets"));
  if (auth) {
    const response = await toolFetch(`${auth.api.apiUrl}/b2api/v4/b2_list_buckets`, {
      method: "POST",
      headers: { Authorization: auth.authorizationToken, "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: auth.accountId, bucketId: auth.bucketId }),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (response.ok) {
      const bucket = (await response.json()).buckets?.[0];
      report.bucketNameMatches = bucket?.bucketName?.toLowerCase() === uploadConfig.bucket;
      report.bucketPrivate = bucket?.bucketType === "allPrivate";
      report.allVersionsRetained =
        Array.isArray(bucket?.lifecycleRules) && bucket.lifecycleRules.length === 0;
      report.corsRulesConfigured = Array.isArray(bucket?.corsRules) && bucket.corsRules.length > 0;
    }
  }
  try {
    const rules =
      (await client.send(new GetBucketCorsCommand({ Bucket: readConfig.bucket }))).CORSRules || [];
    report.corsVerified = corsMatches(rules, validationOrigins(env));
    report.s3ReadAuthenticationVerified = true;
  } catch (error) {
    report.corsVerified = false;
    report.corsInspection = error?.$metadata?.httpStatusCode
      ? `http_${error.$metadata.httpStatusCode}`
      : "network_unavailable";
  }
  try {
    // A nonexistent probe uses HEAD only: no file contents, uploads or deletions.
    await client.send(
      new HeadObjectCommand({
        Bucket: readConfig.bucket,
        Key: `healingmuse/audio/connection-probe-${crypto.randomUUID()}.mp3`,
      }),
    );
    report.s3ReadAuthenticationVerified = true;
  } catch (error) {
    report.s3ReadAuthenticationVerified = error?.$metadata?.httpStatusCode === 404;
  }
  return report;
}
export async function accountPreflight(uploadConfig, readConfig, client, env = process.env) {
  let evidence;
  try {
    evidence = JSON.parse(await readFile("media/evidence/b2-account.json", "utf8"));
  } catch {
    throw new Error("account_limits_unconfirmed");
  }
  const budget = validateAccountEvidence(evidence);
  const checks = await connectionChecks(uploadConfig, readConfig, client, env);
  if (!checks.uploadAuthenticated || !checks.readAuthenticated)
    throw new Error("b2_authorization_unavailable");
  if (
    !checks.sameAccountAndBucket ||
    [checks.upload, checks.read].some(
      (c) =>
        !c.endpointMatches ||
        !c.bucketScoped ||
        !c.prefixMatches ||
        !c.requiredCapabilities ||
        !c.leastPrivilege,
    )
  )
    throw new Error("b2_key_scope_mismatch");
  if (!checks.bucketNameMatches || !checks.bucketPrivate || !checks.allVersionsRetained)
    throw new Error("b2_bucket_settings_mismatch");
  if (!checks.corsVerified) throw new Error("b2_cors_mismatch");
  if (!checks.s3ReadAuthenticationVerified) throw new Error("b2_authorization_unavailable");
  return {
    ...budget,
    evidenceCheckedAt: evidence.checkedAt,
    bucketPrivate: true,
    allVersionsRetained: true,
    keyScopesVerified: true,
    corsVerified: true,
    capEvidence: "owner_console_confirmation",
    accountCapacityEvidence: "owner_console_confirmation",
  };
}
export function b2ErrorCode(error) {
  const message = error?.message;
  const known = [
    "b2_not_configured",
    "b2_invalid_configuration",
    "account_limits_unconfirmed",
    "b2_authorization_unavailable",
    "b2_key_scope_mismatch",
    "b2_bucket_settings_unavailable",
    "b2_bucket_settings_mismatch",
    "b2_cors_mismatch",
    "invalid_validation_origin",
    "delivery_mismatch",
    "remote_version_mismatch",
    "remote_integrity_mismatch",
    "local_integrity_mismatch",
    "delivery_busy",
    "storage_budget_exhausted",
    "download_budget_exhausted",
    "uncertain_write",
    "checkpoint_mismatch",
    "incomplete_inventory",
  ];
  if (known.includes(message)) return message;
  const status = error?.$metadata?.httpStatusCode;
  if (status === 403 || status === 429 || /cap_exceeded/i.test(error?.name || ""))
    return "quota_or_authorization_unavailable";
  return "b2_unavailable";
}
