import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import { atomicJson, readJson, sourceFetch } from "./audio-common.mjs";
const settings = await readJson(new URL("../content/providers.json", import.meta.url), {});
const sources = await readJson("content/audio-sources.json", []);
const item = sources.find(
  (source) =>
    source.evidence?.provider === "Wikimedia Commons" &&
    source.category === "nature" &&
    source.duration < 90,
);
if (!item) throw Error("No eligible Wikimedia preflight recording.");
const result = {
  userAgent: settings.wikimedia.userAgent,
  sourceUrl: item.provenanceUrl,
  recordingId: item.id,
  passed: false,
};
try {
  const response = await sourceFetch(item.url, 120000);
  result.status = response.status;
  if (!response.ok) throw Error(`Wikimedia download returned ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir("media/originals", { recursive: true });
  const path = `media/originals/${item.id}`;
  await writeFile(`${path}.preflight`, bytes);
  const decoded = spawnSync(ffmpeg, ["-v", "error", "-i", `${path}.preflight`, "-f", "null", "-"], {
    encoding: "utf8",
    timeout: 120000,
  });
  if (decoded.status !== 0) throw Error("Wikimedia original did not decode.");
  const existing = await readFile(path).catch(() => null);
  if (existing && !existing.equals(bytes)) throw Error("Original recording collision.");
  await rename(`${path}.preflight`, path);
  Object.assign(result, {
    passed: true,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    verifiedAt: new Date().toISOString(),
  });
} catch (error) {
  result.reason = error.message;
  process.exitCode = 1;
}
await atomicJson("media/evidence/wikimedia-preflight.json", result);
console.log(JSON.stringify(result));
