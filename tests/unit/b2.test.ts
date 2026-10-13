import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { b2Config, b2Client, b2SignedGet, type B2Receipt } from "@/lib/storage/b2";
import { deliverB2Track, deliveryBudget, readRetry } from "../../scripts/lib/b2-delivery.mjs";
import {
  validateAccountEvidence,
  accountEvidenceIssues,
  keyScopeChecks,
  corsMatches,
} from "../../scripts/lib/b2-account.mjs";
const config = {
  endpoint: "https://s3.us-west-004.backblazeb2.com",
  region: "us-west-004",
  bucket: "healingmuse-audio-ntdgalaxy",
  keyId: "synthetic",
  applicationKey: "synthetic-only",
};
const audio = Buffer.from("human-made synthetic fixture bytes");
const track = {
  id: "10000000-0000-4000-8000-000000000001",
  sha256: createHash("sha256").update(audio).digest("hex"),
  bytes: audio.length,
};
const receipt: B2Receipt = {
  track_id: track.id,
  endpoint: config.endpoint,
  bucket: config.bucket,
  object_key: `healingmuse/audio/${track.id}/${track.sha256}.mp3`,
  version_id: "version-one",
  etag: '"etag"',
  sha256: track.sha256,
  bytes: audio.length,
};
function fixture(
  options: {
    uncertain?: boolean;
    absentAfterWrite?: boolean;
    corrupt?: boolean;
    quota?: boolean;
    disconnect?: boolean;
  } = {},
) {
  let uploaded = false,
    checkpoint: Record<string, unknown> | undefined;
  const missing = () =>
    Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
  const send = vi.fn(async (command) => {
    if (command.constructor.name === "HeadObjectCommand") {
      if (!uploaded || options.absentAfterWrite) throw missing();
      return { VersionId: receipt.version_id, ETag: receipt.etag, ContentLength: audio.length };
    }
    if (command.constructor.name === "PutObjectCommand") {
      uploaded = true;
      if (options.uncertain) throw new Error("connection_lost");
      return { VersionId: receipt.version_id, ETag: receipt.etag };
    }
    if (options.quota)
      throw Object.assign(new Error("do not log"), { $metadata: { httpStatusCode: 403 } });
    const body = options.disconnect
      ? Readable.from(
          (async function* () {
            yield audio.subarray(0, 2);
            throw new Error("interrupted");
          })(),
        )
      : Readable.from([options.corrupt ? Buffer.alloc(audio.length) : audio]);
    return {
      VersionId: receipt.version_id,
      ETag: receipt.etag,
      ContentLength: audio.length,
      Body: body,
    };
  });
  const record = vi.fn(async () => {});
  const save = vi.fn(async (entry) => {
    checkpoint = entry;
  });
  const args = {
    client: { send },
    config,
    track,
    audio,
    budget: deliveryBudget(1000, 1000),
    record,
    save,
    read: (operation: () => Promise<unknown>) => readRetry(operation, async () => {}),
  };
  return {
    args,
    send,
    record,
    save,
    checkpoint: () => checkpoint,
    setUploaded: () => {
      uploaded = true;
    },
  };
}
describe("B2 delivery recovery and private version grants", () => {
  it("signs only a pinned version for ten minutes without performing a storage request", async () => {
    const client = b2Client(config);
    const url = new URL(await b2SignedGet(client, config, receipt));
    expect(url.searchParams.get("versionId")).toBe(receipt.version_id);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("response-cache-control")).toBe("private, no-store");
    client.destroy();
  });
  it("rejects arbitrary endpoints and missing credentials", () => {
    expect(() => b2Config("READ", {})).toThrow("b2_not_configured");
    expect(() =>
      b2Config("READ", {
        B2_S3_ENDPOINT: "https://attacker.invalid",
        B2_REGION: config.region,
        B2_BUCKET_NAME: config.bucket,
        B2_READ_KEY_ID: "s",
        B2_READ_APPLICATION_KEY: "s",
      }),
    ).toThrow("b2_invalid_configuration");
  });
  it("reconciles an uncertain committed PUT and resumes without a duplicate version", async () => {
    const f = fixture({ uncertain: true });
    await deliverB2Track(f.args);
    expect(f.record).toHaveBeenCalledOnce();
    const count = () =>
      f.send.mock.calls.filter(([command]) => command.constructor.name === "PutObjectCommand")
        .length;
    expect(count()).toBe(1);
    await deliverB2Track({ ...f.args, checkpoint: f.checkpoint() });
    expect(count()).toBe(1);
    expect(
      f.send.mock.calls.filter(([command]) => command.constructor.name === "GetObjectCommand"),
    ).toHaveLength(1);
  });
  it("retains uncertainty and refuses another PUT when reconciliation cannot find a version", async () => {
    const f = fixture({ uncertain: true, absentAfterWrite: true });
    await expect(deliverB2Track(f.args)).rejects.toThrow();
    expect(f.checkpoint()?.state).toBe("writing");
    await expect(deliverB2Track({ ...f.args, checkpoint: f.checkpoint() })).rejects.toThrow(
      "uncertain_write",
    );
    expect(
      f.send.mock.calls.filter(([c]) => c.constructor.name === "PutObjectCommand"),
    ).toHaveLength(1);
    expect(f.record).not.toHaveBeenCalled();
  });
  for (const [name, options] of [
    ["checksum mismatch", { corrupt: true }],
    ["quota limit", { quota: true }],
    ["interrupted read", { disconnect: true }],
  ] as const)
    it(`pauses on ${name} and preserves the uploaded version for recovery`, async () => {
      const f = fixture(options);
      await expect(deliverB2Track(f.args)).rejects.toThrow();
      expect(f.checkpoint()?.state).toBe("uploaded");
      expect(f.record).not.toHaveBeenCalled();
      expect(
        f.send.mock.calls.filter(([c]) => c.constructor.name === "GetObjectCommand"),
      ).toHaveLength(1);
    });
  it("refuses a missing verified version rather than silently replacing it", async () => {
    const f = fixture();
    await expect(
      deliverB2Track({ ...f.args, checkpoint: { ...receipt, state: "verified" } }),
    ).rejects.toThrow();
    expect(f.send.mock.calls.every(([c]) => c.constructor.name === "HeadObjectCommand")).toBe(true);
  });
  it("rejects local corruption before any cloud write", async () => {
    const f = fixture();
    await expect(deliverB2Track({ ...f.args, audio: Buffer.alloc(audio.length) })).rejects.toThrow(
      "local_integrity_mismatch",
    );
    expect(f.send).not.toHaveBeenCalled();
  });
  it("persists budget reservations before work and stops at confirmed free limits", async () => {
    const reservations: [string, number][] = [];
    const budget = deliveryBudget(10, 20, async (kind, bytes) => {
      reservations.push([kind, bytes]);
    });
    await budget.reserveStorage(10);
    await budget.reserveDownload(15);
    await expect(budget.reserveStorage(1)).rejects.toThrow("storage_budget_exhausted");
    await expect(budget.reserveDownload(6)).rejects.toThrow("download_budget_exhausted");
    expect(reservations).toEqual([
      ["storage", 10],
      ["download", 15],
    ]);
  });
  it("requires recent console evidence of effective caps and account-wide capacity", () => {
    const now = Date.now(),
      at = new Date(now - 1000).toISOString();
    const evidence = {
      version: 2,
      freeOnly: true,
      accountStorageBytes: 100,
      downloadRemainingBytes: 200,
      downloadPeriodStartsAt: new Date(now - 3600000).toISOString(),
      downloadPeriodEndsAt: new Date(now + 3600000).toISOString(),
      zeroSpendCaps: { storage: true, download: true, classA: true, classB: true, classC: true },
      eventNotificationsDisabled: true,
      otherClassDFeaturesDisabled: true,
      checkedAt: at,
      capsObservedAt: new Date(now - 1200000).toISOString(),
      capsEffectiveAt: at,
    };
    expect(validateAccountEvidence(evidence, now).storageRemaining).toBe(9_999_999_900);
    expect(() =>
      validateAccountEvidence(
        { ...evidence, capsEffectiveAt: new Date(now + 1).toISOString() },
        now,
      ),
    ).toThrow("account_limits_unconfirmed");
    expect(() => validateAccountEvidence(evidence, now + 86400000)).toThrow(
      "account_limits_unconfirmed",
    );
  });
});

it("checks live scopes without conflating download-token sharing with object writes", () => {
  const result = (capabilities: string[]) => ({
    apiInfo: {
      storageApi: {
        s3ApiUrl: config.endpoint,
        allowed: {
          buckets: [{ id: "synthetic", name: config.bucket }],
          capabilities,
          namePrefix: "healingmuse/audio/",
        },
      },
    },
  });
  expect(
    keyScopeChecks(config, "UPLOAD", result(["listBuckets", "readBuckets", "writeFiles"])),
  ).toMatchObject({ leastPrivilege: true, readContentsDenied: true, deleteDenied: true });
  expect(
    keyScopeChecks(
      config,
      "UPLOAD",
      result(["listBuckets", "writeFiles", "deleteFiles", "writeBucketLifecycleRules"]),
    ),
  ).toMatchObject({ leastPrivilege: false, deleteDenied: false });
  expect(
    keyScopeChecks(config, "READ", result(["readFiles", "listFiles", "listBuckets", "shareFiles"])),
  ).toMatchObject({ leastPrivilege: true, writeDenied: true, deleteDenied: true });
  expect(keyScopeChecks(config, "READ", result(["readFiles", "writeFiles"]))).toMatchObject({
    leastPrivilege: false,
    writeDenied: false,
  });
});
it("requires exact-origin GET, HEAD and range CORS before delivery", () => {
  const rule = {
    AllowedOrigins: ["https://healingmuse.vercel.app"],
    AllowedMethods: ["GET", "HEAD"],
    AllowedHeaders: ["Range"],
    ExposeHeaders: ["Content-Length", "Content-Range", "Accept-Ranges", "ETag"],
  };
  expect(corsMatches([rule], rule.AllowedOrigins)).toBe(true);
  expect(corsMatches([{ ...rule, AllowedOrigins: ["*"] }], rule.AllowedOrigins)).toBe(false);
  expect(corsMatches([{ ...rule, AllowedMethods: ["GET"] }], rule.AllowedOrigins)).toBe(false);
});
it("uses separate read credentials for verification while the upload client only receives PUT", async () => {
  const f = fixture();
  const reader = { send: f.send };
  const writer = {
    send: vi.fn(async (command) => {
      expect(command.constructor.name).toBe("PutObjectCommand");
      return f.send(command);
    }),
  };
  await deliverB2Track({ ...f.args, client: writer, reader });
  expect(writer.send).toHaveBeenCalledOnce();
  expect(f.record).toHaveBeenCalledOnce();
});

it("zero verification allowance prevents every storage request and checkpoint write", async () => {
  const f = fixture();
  await expect(deliverB2Track({ ...f.args, budget: deliveryBudget(1000, 0) })).rejects.toThrow(
    "download_budget_exhausted",
  );
  expect(f.send).not.toHaveBeenCalled();
  expect(f.save).not.toHaveBeenCalled();
});
it("two workers reserve scarce verification allowance before either upload", async () => {
  const first = fixture(),
    second = fixture(),
    budget = deliveryBudget(1000, audio.length);
  const results = await Promise.allSettled([
    deliverB2Track({ ...first.args, budget }),
    deliverB2Track({ ...second.args, budget }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    first.send.mock.calls.filter(([c]) => c.constructor.name === "PutObjectCommand").length +
      second.send.mock.calls.filter(([c]) => c.constructor.name === "PutObjectCommand").length,
  ).toBe(1);
  expect(first.record.mock.calls.length + second.record.mock.calls.length).toBe(1);
});
it("expired budget evidence stops a worker before contacting storage", async () => {
  const f = fixture();
  await expect(
    deliverB2Track({
      ...f.args,
      budget: deliveryBudget(
        1000,
        1000,
        async () => {},
        100,
        () => 100,
      ),
    }),
  ).rejects.toThrow("account_limits_unconfirmed");
  expect(f.send).not.toHaveBeenCalled();
});
it("reports all missing safeguards in the supplied zero-allowance, Class-D-enabled account state", () => {
  const at = new Date().toISOString();
  const issues = accountEvidenceIssues({
    version: 2,
    freeOnly: true,
    accountStorageBytes: 0,
    downloadRemainingBytes: 0,
    zeroSpendCaps: { storage: true, download: true, classA: true, classB: true, classC: true },
    checkedAt: at,
    eventNotificationsDisabled: false,
    otherClassDFeaturesDisabled: false,
  });
  expect(issues).toEqual([
    "download_allowance_exhausted",
    "download_period_unverified_or_expired",
    "caps_effectiveness_unverified",
    "class_d_features_not_confirmed_disabled",
  ]);
});
it("requires exactly the designated three upload capabilities", () => {
  const result = (capabilities: string[]) => ({
    apiInfo: {
      storageApi: {
        s3ApiUrl: config.endpoint,
        allowed: { buckets: [{ id: "synthetic", name: config.bucket }], capabilities },
      },
    },
  });
  expect(
    keyScopeChecks(config, "UPLOAD", result(["listBuckets", "writeFiles"])).requiredCapabilities,
  ).toBe(false);
  expect(
    keyScopeChecks(
      config,
      "UPLOAD",
      result(["listBuckets", "readBuckets", "writeFiles", "listFiles"]),
    ).leastPrivilege,
  ).toBe(false);
});
