import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";
if (process.env.CI !== "true" || process.env.NEXT_PUBLIC_SUPABASE_URL)
  throw new Error("Synthetic audio fixtures are only permitted in isolated CI without Supabase.");
const sources = JSON.parse(await readFile("content/audio-sources.json", "utf8")).slice(0, 20);
await mkdir("media/prepared", { recursive: true });
const catalog = [];
for (const source of sources) {
  const path = `${source.id}.mp3`;
  const result = spawnSync(ffmpeg, [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220:duration=30",
    "-af",
    "volume=0.03",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "64k",
    `media/prepared/${path}`,
  ]);
  if (result.status !== 0) throw new Error("Fixture audio failed");
  const bytes = await readFile(`media/prepared/${path}`);
  catalog.push({
    id: source.id,
    title: source.title,
    description: {
      vi: "Dữ liệu thử nghiệm tổng hợp, không xuất bản.",
      en: "Synthetic test fixture. Never publish.",
    },
    artist: "Synthetic test fixture",
    category: source.category,
    goals: source.goals,
    duration: 30,
    source: { kind: "hosted", path },
    downloadAllowed: true,
    artwork: source.artwork,
    color: source.color,
    attribution: "Synthetic CI test fixture only.",
    license: "Test fixture",
    licenseUrl: "https://example.org/test",
    provenanceUrl: "https://example.org/test",
    status: "published",
    rightsVerified: true,
    humanCreated: true,
    position: source.position,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await writeFile("media/prepared/catalog.json", JSON.stringify(catalog));
console.log("Prepared isolated CI fixtures; never deploy these files.");
