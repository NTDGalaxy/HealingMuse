import { mkdir, readFile, rename, stat, writeFile, open, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import { availableParallelism, freemem } from "node:os";
import { unlinkSync } from "node:fs";
import {
  atomicJson,
  readJson,
  sourceFetch,
  targetCount,
  normalizedLicenseUrl,
  isDerivativeRecording,
} from "./audio-common.mjs";
import { trackInput } from "../src/lib/validation.ts";
const target = targetCount();
const available = process.argv.includes("--available");
const wikimediaPreflight = await readJson("media/evidence/wikimedia-preflight.json", null);
const providerSettings = await readJson(new URL("../content/providers.json", import.meta.url), {});
const sourceManifest = await readJson("content/audio-sources.json", []);
const sources = process.argv.includes("--publisher-first")
  ? [...sourceManifest]
      .filter(
        (item) =>
          item.evidence?.provider !== "Wikimedia Commons" ||
          (wikimediaPreflight?.passed &&
            wikimediaPreflight.userAgent === providerSettings.wikimedia.userAgent),
      )
      .sort(
        (a, b) =>
          Number(b.evidence?.provider === "Incompetech") -
          Number(a.evidence?.provider === "Incompetech"),
      )
  : sourceManifest.filter(
      (item) =>
        item.evidence?.provider !== "Wikimedia Commons" ||
        (wikimediaPreflight?.passed &&
          wikimediaPreflight.userAgent === providerSettings.wikimedia.userAgent),
    );
for (const dir of ["media/originals", "media/prepared", "media/evidence/recordings"])
  await mkdir(dir, { recursive: true });
const lockPath = "media/evidence/import.lock";
const priorLock = await readJson(lockPath, null);
if (priorLock) {
  let live = false;
  try {
    process.kill(priorLock.pid, 0);
    live = true;
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  if (live) throw new Error("Another importer owns the preparation checkpoint.");
  await unlink(lockPath);
}
const lock = await open(lockPath, "wx");
await lock.writeFile(JSON.stringify({ pid: process.pid }));
await lock.close();
const children = new Set();
process.on("exit", () => {
  try {
    unlinkSync(lockPath);
  } catch {}
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const child of children) child.kill("SIGTERM");
    process.exit(130);
  });
const previous = await readJson("media/prepared/catalog.json", []);
const records = new Map();
for (const track of previous) {
  const normalized = trackInput.parse({
    ...track,
    licenseUrl: normalizedLicenseUrl(track.licenseUrl),
  });
  records.set(track.id, normalized);
  if (normalized.licenseUrl !== track.licenseUrl) {
    const path = `media/evidence/recordings/${track.id}.json`;
    const receipt = await readJson(path, null);
    if (receipt) await atomicJson(path, { ...receipt, track: normalized });
  }
}
const preparedCount = () =>
  [...records.values()].filter((track) => track.status !== "retired").length;
const evidence = new Map(
  (await readJson("media/evidence/import-report.json", [])).map((row) => [row.id, row]),
);
const hashes = new Map(
  [...evidence.values()]
    .filter((row) => row.decodedSha256)
    .map((row) => [row.decodedSha256, row.id]),
);
const failures = [];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ["-nostats", "-filter_threads", "1", ...args]);
    children.add(child);
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-12000);
    });
    const timeout = setTimeout(() => child.kill("SIGKILL"), 180000);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      children.delete(child);
      clearTimeout(timeout);
      code === 0
        ? resolve({ stdout, stderr })
        : reject(new Error("Audio preparation failed: " + stderr.slice(-400)));
    });
  });
let saveChain = Promise.resolve();
let lastSave = 0;
const save = (force = false) => {
  if (!force && Date.now() - lastSave < 5000 && records.size % 10 !== 0) return Promise.resolve();
  lastSave = Date.now();
  saveChain = saveChain.then(async () => {
    const all = [...records.values()].sort((a, b) => a.position - b.position);
    await atomicJson("media/prepared/catalog.json", all);
    await atomicJson("media/evidence/import-report.json", [...evidence.values()]);
  });
  return saveChain;
};
const queues = [
  sources.filter((item) => item.evidence?.provider !== "Incompetech"),
  sources.filter((item) => item.evidence?.provider === "Incompetech"),
];
const cursors = [0, 0];
let committing = 0;
async function worker(preferred) {
  while (preparedCount() < target) {
    if (preferred === 1 && cursors[1] >= queues[1].length) break;
    const selected = cursors[preferred] < queues[preferred].length ? preferred : 1 - preferred;
    if (cursors[selected] >= queues[selected].length) break;
    const item = queues[selected][cursors[selected]++];
    if (!records.has(item.id) && isDerivativeRecording(item.originalTitle)) {
      failures.push({ id: item.id, reason: "excluded_derivative_recording" });
      continue;
    }
    try {
      if (!/^[0-9a-f-]{36}$/.test(item.id)) throw new Error("Invalid recording ID");
      const original = `media/originals/${item.id}`,
        path = `${item.id}.mp3`,
        prepared = `media/prepared/${path}`;
      const receipt = await readJson(`media/evidence/recordings/${item.id}.json`, null);
      const existing = records.get(item.id) || receipt?.track;
      if (existing) {
        const bytes = await readFile(prepared);
        if (sha(bytes) !== existing.sha256)
          throw new Error("Existing recording collision or integrity mismatch");
        records.set(
          item.id,
          trackInput.parse({ ...existing, licenseUrl: normalizedLicenseUrl(existing.licenseUrl) }),
        );
        if (receipt?.evidence) {
          evidence.set(item.id, receipt.evidence);
          if (receipt.evidence.decodedSha256) hashes.set(receipt.evidence.decodedSha256, item.id);
        }
        continue;
      }
      if (!(await stat(original).catch(() => null))) {
        const url = new URL(item.url);
        if (
          url.protocol !== "https:" ||
          !(
            url.hostname === "upload.wikimedia.org" ||
            (url.hostname === "incompetech.com" &&
              url.pathname.startsWith("/music/royalty-free/mp3-royaltyfree/"))
          )
        )
          throw new Error("Unapproved recording host");
        const response = await sourceFetch(url, 120000);
        if (!response.ok) throw new Error(`Source unavailable (${response.status})`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length || bytes.length > 64 * 1024 * 1024)
          throw new Error("Invalid original size");
        await writeFile(`${original}.tmp`, bytes);
        await rename(`${original}.tmp`, original);
      }
      const decoded = await run([
        "-v",
        "error",
        "-i",
        original,
        "-map",
        "0:a:0",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "hash",
        "-hash",
        "sha256",
        "-",
      ]);
      const decodedSha256 = decoded.stdout.match(/SHA256=([a-f0-9]{64})/)?.[1];
      if (!decodedSha256) throw new Error("Decoded audio fingerprint missing");
      if (hashes.has(decodedSha256) && hashes.get(decodedSha256) !== item.id) {
        failures.push({
          id: item.id,
          reason: "duplicate_decoded_audio",
          duplicateOf: hashes.get(decodedSha256),
        });
        continue;
      }
      hashes.set(decodedSha256, item.id);
      const analysis = await run([
        "-hide_banner",
        "-threads",
        "1",
        "-i",
        original,
        "-af",
        "loudnorm=I=-20:TP=-2:LRA=7:print_format=json",
        "-f",
        "null",
        "-",
      ]);
      const match = analysis.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
      if (!match) throw new Error("Loudness analysis missing");
      const loudness = JSON.parse(match[0]);
      if (!Number.isFinite(Number(loudness.input_i))) throw new Error("No measurable audio");
      const output = await run([
        "-hide_banner",
        "-threads",
        "1",
        "-y",
        "-i",
        original,
        "-vn",
        "-map_metadata",
        "-1",
        "-af",
        `loudnorm=I=-20:TP=-2:LRA=7:measured_I=${loudness.input_i}:measured_TP=${loudness.input_tp}:measured_LRA=${loudness.input_lra}:measured_thresh=${loudness.input_thresh}:offset=${loudness.target_offset}:linear=true`,
        "-ar",
        "44100",
        "-ac",
        "2",
        "-codec:a",
        "libmp3lame",
        "-b:a",
        "192k",
        "-metadata",
        `title=${item.originalTitle}`,
        "-metadata",
        `artist=${item.artist}`,
        "-metadata",
        `copyright=${item.license} ${item.licenseUrl}`,
        "-f",
        "mp3",
        `${prepared}.tmp`,
      ]);
      const durationMatch = output.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
      if (!durationMatch) throw new Error("Duration missing");
      const duration = Math.ceil(
        Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]),
      );
      if (duration < 30 || duration > 14400) throw new Error("Duration outside catalogue bounds");
      await run(["-v", "error", "-i", `${prepared}.tmp`, "-f", "null", "-"]);
      const bytes = await readFile(`${prepared}.tmp`),
        originalBytes = await readFile(original);
      const changes =
        "Converted to 44.1 kHz stereo MP3 at 192 kbps; loudness normalized toward -20 LUFS with -2 dBTP target. Original recording licence retained.";
      const track = {
        id: item.id,
        title: item.title,
        description: {
          vi:
            item.category === "nature"
              ? "Bản ghi âm thiên nhiên thực tế. Bản thu đang chờ người quản trị nghe và duyệt."
              : "Bản thu nhạc không lời. Bản thu đang chờ người quản trị nghe và duyệt.",
          en: "An attributed original recording, awaiting administrator listening and rights review.",
        },
        artist: item.artist,
        category: item.category,
        goals: item.goals,
        genres: item.genres || [],
        instruments: item.instruments || [],
        traditions: item.traditions || [],
        duration,
        source: { kind: "hosted", path },
        downloadAllowed: true,
        artwork: item.artwork,
        color: item.color,
        attribution:
          `${item.originalTitle} by ${item.artist}. ${item.license} (${item.licenseUrl}). ${item.provenanceUrl}. ${changes}`.slice(
            0,
            1000,
          ),
        license: item.license,
        licenseUrl: normalizedLicenseUrl(item.licenseUrl),
        provenanceUrl: item.provenanceUrl,
        status: "draft",
        rightsVerified: false,
        humanCreated: true,
        listeningReviewed: false,
        position: Math.min(10000, item.position),
        bytes: bytes.length,
        sha256: sha(bytes),
        changes,
      };
      const report = {
        id: item.id,
        originalSha256: sha(originalBytes),
        preparedSha256: track.sha256,
        decodedSha256,
        duration,
        bytes: bytes.length,
        loudness,
        source: item,
        technicalDecode: "passed",
        subjectiveAudio: "pending",
        preparedAt: new Date().toISOString(),
      };
      trackInput.parse(track);
      if (preparedCount() + committing >= target) {
        await unlink(`${prepared}.tmp`);
        break;
      }
      committing++;
      try {
        await rename(`${prepared}.tmp`, prepared);
        await atomicJson(`media/evidence/recordings/${item.id}.json`, { track, evidence: report });
        records.set(item.id, track);
        evidence.set(item.id, report);
      } finally {
        committing--;
      }
      await save();
      console.log(
        JSON.stringify({
          event: "audio_prepared",
          prepared: preparedCount(),
          target,
          id: item.id,
          review: "pending",
        }),
      );
    } catch (error) {
      if (error instanceof ReferenceError || error instanceof TypeError) throw error;
      failures.push({ id: item.id, reason: error.message });
      console.error(
        JSON.stringify({ event: "audio_candidate_failed", id: item.id, reason: error.message }),
      );
    }
  }
}
const concurrencyIndex = process.argv.indexOf("--concurrency");
const concurrency = concurrencyIndex < 0 ? 2 : Number(process.argv[concurrencyIndex + 1]);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
  throw new Error("Preparation concurrency must be 1 to 8.");
if (concurrency > 4 && (availableParallelism() < 8 || freemem() < 4e9))
  throw new Error("Eight-worker preparation needs at least eight CPUs and 4 GB free memory.");
await save(true);
await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index === 0 ? 0 : 1)));
await save(true);
const counts = {};
const artists = {};
const genres = {};
const instruments = {};
const traditions = {};
const nature = {};
for (const track of records.values()) {
  counts[track.status] = (counts[track.status] || 0) + 1;
  if (track.status === "retired") continue;
  artists[track.artist] = (artists[track.artist] || 0) + 1;
  for (const [field, map] of [
    ["genres", genres],
    ["instruments", instruments],
    ["traditions", traditions],
  ])
    for (const tag of track[field] || []) map[tag] = (map[tag] || 0) + 1;
  if (track.category === "nature") nature[track.artwork] = (nature[track.artwork] || 0) + 1;
}
await atomicJson("media/evidence/catalogue-report.json", {
  target,
  prepared: preparedCount(),
  retainedInventory: records.size,
  excludedOrRetired: counts.retired || 0,
  approved: [...records.values()].filter((t) => t.listeningReviewed && t.rightsVerified).length,
  published: 0,
  localPreviewLegacyPublished: counts.published || 0,
  preparedBytes: [...records.values()]
    .filter((track) => track.status !== "retired")
    .reduce((n, track) => n + track.bytes, 0),
  retainedPreparedBytes: [...records.values()].reduce((n, track) => n + track.bytes, 0),
  counts,
  artists,
  genres,
  instruments,
  traditions,
  nature,
  failures,
  review: "Local preview is not publication approval.",
});
if (preparedCount() < target && !available)
  throw new Error(
    `Prepared ${preparedCount()}/${target} unique recordings. Resume discovery and import; no placeholders were counted.`,
  );
console.log(
  JSON.stringify({
    event: "preparation_report",
    prepared: preparedCount(),
    target,
    approved: 0,
    published: 0,
  }),
);
