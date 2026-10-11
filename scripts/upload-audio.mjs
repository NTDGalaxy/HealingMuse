import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { config } from "dotenv";
import { toolFetch } from "./tool-fetch.mjs";
import { atomicJson, readJson, targetCount } from "./audio-common.mjs";
import { recordingRow } from "./recording-row.mjs";
config({ path: ".env.local", quiet: true });
const target = targetCount();
const tracks = (await readJson("media/prepared/catalog.json", [])).filter(
  (track) => track.status !== "retired",
);
if (
  !tracks.length ||
  tracks.length > 10000 ||
  new Set(tracks.map((track) => track.id)).size !== tracks.length
)
  throw new Error("Invalid or duplicate prepared recording inventory.");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("Configure the owning project credentials locally.");
let cooldownUntil = (await readJson("media/evidence/upload-cooldown.json", {})).until || 0;
const uploadFetch = async (input, init = {}) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    while (cooldownUntil > Date.now())
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(30000, cooldownUntil - Date.now())),
      );
    const response = await toolFetch(input, init);
    if (
      response.status !== 429 &&
      !(response.status >= 500 && ["GET", "HEAD"].includes(init.method || "GET"))
    )
      return response;
    const retryAfter = response.headers.get("retry-after");
    const seconds =
      retryAfter && /^\d+$/.test(retryAfter)
        ? Number(retryAfter)
        : retryAfter
          ? Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000)
          : 0;
    const delay = Math.max(
      2,
      Number.isFinite(seconds) && seconds > 0 ? seconds : (attempt + 1) * 3,
    );
    cooldownUntil = Math.max(cooldownUntil, Date.now() + delay * 1000);
    await atomicJson("media/evidence/upload-cooldown.json", { until: cooldownUntil });
    if (delay > 300)
      throw new Error("Storage requests a long cooldown; checkpoint retained for a later resume.");
  }
  throw new Error("Draft delivery unavailable after bounded retries; checkpoint retained.");
};
const db = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: uploadFetch },
  db: { retry: false },
});
const { data: bucket, error: bucketError } = await db.storage.getBucket("audio");
if (bucketError || !bucket || bucket.public)
  throw new Error("Cannot preflight the private audio bucket.");
const requiredBytes = tracks.reduce((sum, track) => sum + track.bytes, 0);
const knownRows = new Map();
for (let start = 0; start < tracks.length; start += 100) {
  const { data, error } = await db
    .from("tracks")
    .select("id,source,sha256")
    .in(
      "id",
      tracks.slice(start, start + 100).map((track) => track.id),
    );
  if (error) throw new Error("Cannot verify existing draft inventory for capacity preflight.");
  for (const row of data || []) knownRows.set(row.id, row);
}
const additionalBytesRequired = tracks.reduce((sum, track) => {
  const row = knownRows.get(track.id);
  if (row && (row.sha256 !== track.sha256 || row.source?.path !== track.source.path))
    throw new Error("Existing recording ID collision.");
  return sum + (row ? 0 : track.bytes);
}, 0);
const capacity = Number(process.env.SUPABASE_STORAGE_AVAILABLE_BYTES || 0);
const oversized = tracks
  .filter((track) => bucket.file_size_limit && track.bytes > Number(bucket.file_size_limit))
  .map((track) => track.id);
const preflight = {
  target,
  prepared: tracks.length,
  requiredBytes,
  additionalBytesRequired,
  availableBytes: capacity || null,
  bucketFileLimit: bucket.file_size_limit,
  oversized,
  quotaConfirmed:
    additionalBytesRequired === 0 || (capacity > 0 && capacity >= additionalBytesRequired),
  rightsReview: "pending",
  publication: "drafts only",
};
await atomicJson("media/evidence/storage-preflight.json", preflight);
console.log(JSON.stringify({ event: "storage_preflight", ...preflight }));
if (!process.argv.includes("--upload-drafts")) process.exit(0);
if (tracks.length < target)
  throw new Error("Complete the requested prepared catalogue before bulk upload.");
if (!preflight.quotaConfirmed || oversized.length)
  throw new Error(
    "Set verified SUPABASE_STORAGE_AVAILABLE_BYTES after checking project capacity; resolve oversized recordings before upload.",
  );
const checkpoint = await readJson("media/evidence/upload-checkpoint.json", { completed: [] });
const completed = new Map(checkpoint.completed.map((item) => [item.id, item.sha256]));
let cursor = 0,
  saveChain = Promise.resolve();
const save = () => {
  saveChain = saveChain.then(() =>
    atomicJson("media/evidence/upload-checkpoint.json", {
      completed: [...completed].map(([id, sha256]) => ({ id, sha256 })),
      savedAt: new Date().toISOString(),
    }),
  );
  return saveChain;
};
async function worker() {
  while (cursor < tracks.length) {
    const track = tracks[cursor++];
    const bytes = await readFile(`media/prepared/${track.source.path}`);
    if (
      createHash("sha256").update(bytes).digest("hex") !== track.sha256 ||
      bytes.length !== track.bytes
    )
      throw new Error(`Audio integrity mismatch: ${track.id}`);
    const { data: existing, error } = await db
      .from("tracks")
      .select("id,source,sha256,status")
      .eq("id", track.id)
      .maybeSingle();
    if (error) throw new Error("Cannot verify existing catalogue.");
    if (existing) {
      if (existing.sha256 !== track.sha256 || existing.source?.path !== track.source.path)
        throw new Error("Existing recording ID collision.");
      const remote = await db.storage.from("audio").download(track.source.path);
      if (
        remote.error ||
        !remote.data ||
        createHash("sha256")
          .update(Buffer.from(await remote.data.arrayBuffer()))
          .digest("hex") !== track.sha256
      )
        throw new Error("Existing draft object failed checksum verification.");
      if (
        (
          await db.rpc("record_audio_delivery", {
            p_track_id: track.id,
            p_sha256: track.sha256,
            p_bytes: track.bytes,
          })
        ).error
      )
        throw new Error("Cannot pin verified delivery.");
      completed.set(track.id, track.sha256);
      await save();
      continue;
    }
    const uploaded = await db.storage.from("audio").upload(track.source.path, bytes, {
      contentType: "audio/mpeg",
      cacheControl: "0",
      upsert: false,
    });
    if (uploaded.error && String(uploaded.error.statusCode) !== "409")
      throw new Error(`Draft audio upload failed: ${track.id}`);
    // Verify remote bytes even after a successful upload; a colliding object is never accepted on name alone.
    const stored = await db.storage.from("audio").download(track.source.path);
    if (
      stored.error ||
      !stored.data ||
      createHash("sha256")
        .update(Buffer.from(await stored.data.arrayBuffer()))
        .digest("hex") !== track.sha256
    )
      throw new Error("Storage object collision or verification failure.");
    const row = recordingRow(track);
    if ((await db.from("tracks").insert(row)).error)
      throw new Error(`Draft metadata insert failed: ${track.id}`);
    if (
      (
        await db.rpc("record_audio_delivery", {
          p_track_id: track.id,
          p_sha256: track.sha256,
          p_bytes: track.bytes,
        })
      ).error
    )
      throw new Error("Cannot pin verified delivery.");
    completed.set(track.id, track.sha256);
    await save();
    console.log(
      JSON.stringify({
        event: "draft_uploaded",
        completed: completed.size,
        target,
        approved: 0,
        published: 0,
      }),
    );
  }
}
await Promise.all([worker(), worker()]);
await save();
console.log("Drafts retained for individual rights and human listening review.");
