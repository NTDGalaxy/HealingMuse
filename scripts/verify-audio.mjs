import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import { targetCount, atomicJson } from "./audio-common.mjs";
import { trackInput } from "../src/lib/validation.ts";
const target = targetCount();
const catalog = JSON.parse(await readFile("media/prepared/catalog.json", "utf8"));
const eligible = catalog.filter((track) => track.status !== "retired").length;
if (
  eligible < target ||
  eligible > 10000 ||
  new Set(catalog.map((track) => track.id)).size !== catalog.length
)
  throw new Error(`Expected ${target} to 10000 distinct prepared recordings`);
const decode = (file) =>
  new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, [
      "-v",
      "error",
      "-threads",
      "1",
      "-filter_threads",
      "1",
      "-i",
      file,
      "-f",
      "null",
      "-",
    ]);
    let error = "";
    child.stderr.on("data", (chunk) => (error = (error + chunk).slice(-2000)));
    const timer = setTimeout(() => child.kill("SIGKILL"), 120000);
    child.on("error", (problem) => {
      clearTimeout(timer);
      reject(problem);
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      status === 0 && !error.trim()
        ? resolve()
        : reject(new Error("Prepared audio failed full decoding"));
    });
  });
let cursor = 0,
  checked = 0,
  totalBytes = 0;
async function worker() {
  while (cursor < catalog.length) {
    const track = trackInput.parse(catalog[cursor++]);
    const file = `media/prepared/${track.source.path}`;
    const bytes = await readFile(file);
    if (
      bytes.length !== track.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== track.sha256
    )
      throw new Error(`Integrity failed: ${track.id}`);
    await decode(file);
    totalBytes += bytes.length;
    checked++;
    if (checked % 100 === 0)
      console.log(JSON.stringify({ event: "prepared_integrity", checked, total: catalog.length }));
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
await atomicJson("media/evidence/integrity-verification.json", {
  passed: true,
  checked,
  eligible,
  excludedOrRetired: catalog.length - eligible,
  totalBytes,
  verifiedAt: new Date().toISOString(),
  checks: [
    "application metadata schema",
    "prepared byte length",
    "prepared SHA256",
    "full prepared MP3 decoding",
  ],
  review: "Technical integrity does not grant human listening or rights approval.",
});
console.log(`${checked} prepared MP3 files decode and match their retained checksums.`);
