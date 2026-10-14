import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import ffmpeg from "ffmpeg-static";
import { atomicJson, readJson } from "./audio-common.mjs";
const catalogue = await readJson("media/prepared/catalog.json", []);
if (await readJson("media/evidence/import.lock", null))
  throw new Error("Finish preparation before auditing retained originals.");
const evidenceRows = await readJson("media/evidence/import-report.json", []);
const evidence = new Map(evidenceRows.map((row) => [row.id, row]));
const excluded = new Set(
  catalogue.filter((track) => track.status === "retired").map((track) => track.id),
);
await mkdir("media/evidence/fingerprints", { recursive: true });
const fingerprints = [];
let cursor = 0;
const decode = (path, whole = false) =>
  new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, [
      "-v",
      "error",
      "-threads",
      "1",
      "-filter_threads",
      "1",
      "-i",
      path,
      "-map",
      "0:a:0",
      "-ac",
      "1",
      "-ar",
      "16000",
      ...(whole ? [] : ["-af", "asetnsamples=n=80000:p=0"]),
      "-c:a",
      "pcm_s16le",
      "-f",
      whole ? "hash" : "framehash",
      "-hash",
      "sha256",
      "-",
    ]);
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    const timer = setTimeout(() => child.kill("SIGKILL"), 120000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code) reject(Error("Original decode failed"));
      else if (whole) {
        const hash = output.match(/SHA256=([a-f0-9]{64})/)?.[1];
        hash ? resolve(hash) : reject(Error("Missing decoded audio checksum"));
      } else
        resolve(
          output
            .split("\n")
            .filter((line) => /^0,/.test(line))
            .map((line) => line.split(",").at(-1).trim()),
        );
    });
  });
async function worker() {
  while (cursor < catalogue.length) {
    const track = catalogue[cursor++];
    const original = `media/originals/${track.id}`;
    const sourceEvidence = evidence.get(track.id);
    if (!sourceEvidence?.originalSha256)
      throw new Error(`Missing retained original checksum: ${track.id}`);
    const originalSha256 = createHash("sha256")
      .update(await readFile(original))
      .digest("hex");
    if (originalSha256 !== sourceEvidence.originalSha256)
      throw new Error(`Retained original integrity failed: ${track.id}`);
    if (!sourceEvidence.decodedSha256) sourceEvidence.decodedSha256 = await decode(original, true);
    const receiptPath = `media/evidence/recordings/${track.id}.json`;
    if (!(await readJson(receiptPath, null)))
      await atomicJson(receiptPath, {
        track,
        evidence: sourceEvidence,
        note: "Retained initial preparation evidence; no additional approval granted.",
      });
    const prior = await readJson(`media/evidence/fingerprints/${track.id}.json`, null);
    if (prior?.preparedSha256 === track.sha256 && prior.originalSha256 === originalSha256) {
      fingerprints.push(prior);
      continue;
    }
    const chunks = await decode(original);
    const fingerprint = {
      id: track.id,
      preparedSha256: track.sha256,
      originalSha256,
      blockSeconds: 5,
      decodedBlockHash: createHash("sha256").update(chunks.join(":")).digest("hex"),
      chunks,
    };
    await atomicJson(`media/evidence/fingerprints/${track.id}.json`, fingerprint);
    fingerprints.push(fingerprint);
    if (fingerprints.length % 100 === 0)
      console.log(
        JSON.stringify({
          event: "identity_audit",
          checked: fingerprints.length,
          total: catalogue.length,
        }),
      );
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
await atomicJson("media/evidence/import-report.json", evidenceRows);
const seen = new Map(),
  overlaps = [];
for (const fingerprint of fingerprints.sort((a, b) => a.id.localeCompare(b.id))) {
  if (excluded.has(fingerprint.id)) continue;
  const matches = new Map();
  for (const chunk of new Set(fingerprint.chunks))
    for (const id of seen.get(chunk) || []) matches.set(id, (matches.get(id) || 0) + 1);
  for (const [id, count] of matches)
    if (count >= 6 && count >= new Set(fingerprint.chunks).size * 0.7)
      overlaps.push({
        id: fingerprint.id,
        overlapsWith: id,
        sharedBlocks: count,
        review:
          "Possible renamed, looped or shortened original; excluded from distinct counts until resolved.",
      });
  for (const chunk of new Set(fingerprint.chunks)) {
    const ids = seen.get(chunk) || [];
    ids.push(fingerprint.id);
    seen.set(chunk, ids);
  }
}
await atomicJson("media/evidence/identity-audit.json", {
  checked: fingerprints.length,
  eligible: catalogue.length - excluded.size,
  excludedOrRetired: excluded.size,
  identityExclusions: await readJson("media/evidence/identity-exclusions.json", []),
  originalChecksumsVerified: catalogue.length,
  distinctOriginalChecksums: new Set(
    evidenceRows.filter((row) => !excluded.has(row.id)).map((row) => row.originalSha256),
  ).size,
  distinctDecodedChecksums: new Set(
    evidenceRows.filter((row) => !excluded.has(row.id)).map((row) => row.decodedSha256),
  ).size,
  overlaps,
  comparison:
    "Exact decoded five-second PCM block overlap; source identifiers and original checksums are checked separately.",
  limits:
    "Different lossy encodings or fractional-second edits can change PCM blocks; provenance and human review remain required.",
});
console.log(
  JSON.stringify({
    event: "identity_audit_complete",
    checked: fingerprints.length,
    overlaps: overlaps.length,
  }),
);
if (overlaps.length) process.exitCode = 1;
