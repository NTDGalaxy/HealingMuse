import type { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type B2Config = {
  endpoint: string;
  region: string;
  bucket: string;
  keyId: string;
  applicationKey: string;
};
export type B2Receipt = {
  track_id: string;
  endpoint: string;
  bucket: string;
  object_key: string;
  version_id: string;
  sha256: string;
  bytes: number;
  etag: string;
};
export function b2Config(
  kind: "READ" | "UPLOAD",
  env: Record<string, string | undefined> = process.env,
): B2Config {
  const endpoint = env.B2_S3_ENDPOINT?.replace(/\/$/, "");
  const region = env.B2_REGION;
  const bucket = env.B2_BUCKET_NAME?.toLowerCase();
  const keyId = env[`B2_${kind}_KEY_ID`];
  const applicationKey = env[`B2_${kind}_APPLICATION_KEY`];
  if (!endpoint || !region || !bucket || !keyId || !applicationKey)
    throw new Error("b2_not_configured");
  if (
    endpoint !== `https://s3.${region}.backblazeb2.com` ||
    !/^[a-z0-9-]+$/.test(region) ||
    !/^[a-z0-9][a-z0-9.-]{4,61}[a-z0-9]$/.test(bucket) ||
    bucket.includes("..") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(bucket) ||
    /^(b2-|xn--|sthree-|amzn-s3-demo-)|(-s3alias|--ol-s3|\.mrap|--x-s3|--table-s3)$/.test(bucket)
  )
    throw new Error("b2_invalid_configuration");
  return { endpoint, region, bucket, keyId, applicationKey };
}
export function b2Client(config: B2Config) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.keyId, secretAccessKey: config.applicationKey },
    // Never let SDK retries create extra B2 versions after an uncertain PUT.
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    requestHandler: { connectionTimeout: 5000, requestTimeout: 60000 },
  });
}
export function b2ObjectKey(id: string, sha256: string) {
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{64}$/.test(sha256))
    throw new Error("delivery_mismatch");
  return `healingmuse/audio/${id}/${sha256}.mp3`;
}
export function assertB2Receipt(
  config: B2Config,
  receipt: B2Receipt,
  id: string,
  sha256: string,
  bytes: number,
) {
  if (
    receipt.track_id !== id ||
    receipt.endpoint !== config.endpoint ||
    receipt.bucket !== config.bucket ||
    receipt.object_key !== b2ObjectKey(id, sha256) ||
    receipt.sha256 !== sha256 ||
    Number(receipt.bytes) !== bytes ||
    !receipt.version_id ||
    receipt.version_id === "null" ||
    !receipt.etag
  )
    throw new Error("delivery_mismatch");
}
export async function b2SignedGet(client: S3Client, config: B2Config, receipt: B2Receipt) {
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: receipt.object_key,
      VersionId: receipt.version_id,
      ResponseCacheControl: "private, no-store",
      ResponseContentType: "audio/mpeg",
    }),
    { expiresIn: 600 },
  );
}
export async function verifyB2Head(client: S3Client, config: B2Config, receipt: B2Receipt) {
  const head = await client.send(
    new HeadObjectCommand({
      Bucket: config.bucket,
      Key: receipt.object_key,
      VersionId: receipt.version_id,
    }),
  );
  if (
    head.VersionId !== receipt.version_id ||
    head.ContentLength !== Number(receipt.bytes) ||
    head.ETag !== receipt.etag
  )
    throw new Error("remote_version_mismatch");
  return head;
}
export async function verifyB2Bytes(client: S3Client, config: B2Config, receipt: B2Receipt) {
  const object = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: receipt.object_key,
      VersionId: receipt.version_id,
    }),
  );
  const body = object.Body as Readable | undefined;
  if (
    !body ||
    object.VersionId !== receipt.version_id ||
    object.ContentLength !== Number(receipt.bytes) ||
    object.ETag !== receipt.etag
  ) {
    body?.destroy();
    throw new Error("remote_version_mismatch");
  }
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    for await (const chunk of body) {
      bytes += chunk.length;
      if (bytes > Number(receipt.bytes)) throw new Error("remote_integrity_mismatch");
      hash.update(chunk);
    }
    if (bytes !== Number(receipt.bytes) || hash.digest("hex") !== receipt.sha256)
      throw new Error("remote_integrity_mismatch");
  } finally {
    body.destroy();
  }
}
