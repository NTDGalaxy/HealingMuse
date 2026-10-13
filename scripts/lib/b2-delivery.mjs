import { createHash } from "node:crypto";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  b2ObjectKey,
  assertB2Receipt,
  verifyB2Head,
  verifyB2Bytes,
} from "../../src/lib/storage/b2.ts";

export async function readRetry(
  operation,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const status = error?.$metadata?.httpStatusCode;
      if (attempt === 2 || (status && status < 500 && status !== 408)) throw error;
      await sleep(250 * 2 ** attempt);
    }
  }
}
const missing = (error) =>
  error?.$metadata?.httpStatusCode === 404 || ["NotFound", "NoSuchKey"].includes(error?.name);
export async function deliverB2Track({
  client,
  reader = client,
  config,
  track,
  audio,
  checkpoint = /** @type {Record<string, unknown> | undefined} */ (undefined),
  save,
  record,
  budget,
  read = readRetry,
}) {
  budget.assertValid();
  if (
    audio.length !== track.bytes ||
    createHash("sha256").update(audio).digest("hex") !== track.sha256
  )
    throw new Error("local_integrity_mismatch");
  const key = b2ObjectKey(track.id, track.sha256);
  const base = {
    track_id: track.id,
    endpoint: config.endpoint,
    bucket: config.bucket,
    object_key: key,
    sha256: track.sha256,
    bytes: track.bytes,
  };
  const existing = checkpoint;
  if (
    existing &&
    (existing.endpoint !== config.endpoint ||
      existing.bucket !== config.bucket ||
      existing.object_key !== key ||
      existing.sha256 !== track.sha256 ||
      existing.bytes !== track.bytes)
  )
    throw new Error("checkpoint_mismatch");
  if (existing?.state === "verified") {
    assertB2Receipt(config, existing, track.id, track.sha256, track.bytes);
    await read(() => verifyB2Head(reader, config, existing));
    await record(existing);
    return existing;
  }
  // Reserve verification allowance before any new write, including concurrent workers.
  await budget.reserveDownload(track.bytes);
  let receipt = existing?.version_id ? existing : null;
  if (receipt) {
    assertB2Receipt(config, receipt, track.id, track.sha256, track.bytes);
    await read(() => verifyB2Head(reader, config, receipt));
  } else {
    // Reconcile every uncertain write before considering another PUT.
    let head;
    try {
      head = await read(() =>
        reader.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key })),
      );
    } catch (error) {
      if (!missing(error)) throw error;
    }
    if (!head) {
      // After an uncertain PUT, absence is not permission to create another version.
      if (existing?.state === "writing") throw new Error("uncertain_write");
      await budget.reserveStorage(track.bytes);
      await save({ ...base, state: "writing" });
      let result;
      try {
        result = await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: audio,
            ContentLength: audio.length,
            ContentType: "audio/mpeg",
            CacheControl: "private, no-store",
            Metadata: { sha256: track.sha256, "recording-id": track.id },
          }),
        );
      } catch (error) {
        // This HEAD either finds the committed version or leaves a durable writing checkpoint.
        try {
          head = await read(() =>
            reader.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key })),
          );
        } catch {
          throw error;
        }
      }
      if (result)
        head = { VersionId: result.VersionId, ETag: result.ETag, ContentLength: track.bytes };
    }
    if (
      !head?.VersionId ||
      head.VersionId === "null" ||
      !head.ETag ||
      head.ContentLength !== track.bytes
    )
      throw new Error("remote_version_mismatch");
    receipt = { ...base, version_id: head.VersionId, etag: head.ETag, state: "uploaded" };
    await save(receipt);
  }
  // Never retry a full GET automatically: partial reads also spend the download allowance.
  budget.assertValid();
  await verifyB2Bytes(reader, config, receipt);
  const verified = { ...receipt, state: "verified", verifiedAt: new Date().toISOString() };
  await save(verified);
  await record(verified);
  return verified;
}
/** @param {number} storage @param {number} download @param {(kind: "storage" | "download", bytes: number) => Promise<void>} [persist] @param {number} [validUntil] @param {() => number} [now] */
export function deliveryBudget(
  storage,
  download,
  persist = async () => {},
  validUntil = Infinity,
  now = Date.now,
) {
  const assertValid = () => {
    if (now() >= validUntil) throw new Error("account_limits_unconfirmed");
  };
  return {
    assertValid,
    async reserveStorage(bytes) {
      assertValid();
      if (bytes > storage) throw new Error("storage_budget_exhausted");
      storage -= bytes;
      await persist("storage", bytes);
    },
    async reserveDownload(bytes) {
      assertValid();
      if (bytes > download) throw new Error("download_budget_exhausted");
      download -= bytes;
      await persist("download", bytes);
    },
  };
}
