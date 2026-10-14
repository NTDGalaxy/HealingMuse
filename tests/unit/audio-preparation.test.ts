import { it, expect } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";
it("prepares concurrent originals into distinct resumable draft receipts without granting review", async () => {
  const directory = await mkdtemp(join(tmpdir(), "healingmuse-preparation-"));
  try {
    await mkdir(join(directory, "content"));
    await mkdir(join(directory, "media/originals"), { recursive: true });
    const sources = [];
    for (let index = 1; index <= 2; index++) {
      const id = `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      const generated = spawnSync(
        ffmpeg!,
        [
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          `sine=frequency=${220 * index}:duration=31`,
          "-f",
          "wav",
          join(directory, `media/originals/${id}`),
        ],
        { timeout: 10000 },
      );
      expect(generated.status).toBe(0);
      sources.push({
        id,
        position: index,
        originalTitle: "Synthetic test fixture only",
        title: { vi: "Dữ liệu thử", en: "Synthetic test fixture" },
        artist: "Synthetic fixture",
        category: "instrumental",
        goals: ["relax"],
        artwork: "piano",
        color: "sage",
        license: "Fixture",
        licenseUrl: "https://example.invalid",
        provenanceUrl: `https://example.invalid/${index}`,
      });
    }
    await writeFile(join(directory, "content/audio-sources.json"), JSON.stringify(sources));
    const result = spawnSync(
      process.execPath,
      [resolve("scripts/import-audio.mjs"), "--available", "--concurrency", "2"],
      { cwd: directory, encoding: "utf8", timeout: 30000 },
    );
    expect(result.status, result.stderr).toBe(0);
    const catalogue = JSON.parse(
      await readFile(join(directory, "media/prepared/catalog.json"), "utf8"),
    );
    expect(catalogue).toHaveLength(2);
    expect(new Set(catalogue.map((track: { sha256: string }) => track.sha256)).size).toBe(2);
    for (const track of catalogue) {
      expect(track.status).toBe("draft");
      expect(track.rightsVerified).toBe(false);
      expect(track.listeningReviewed).toBe(false);
      expect(
        JSON.parse(
          await readFile(join(directory, `media/evidence/recordings/${track.id}.json`), "utf8"),
        ).evidence.decodedSha256,
      ).toMatch(/^[a-f0-9]{64}$/);
    }
    const resumed = spawnSync(
      process.execPath,
      [resolve("scripts/import-audio.mjs"), "--available"],
      { cwd: directory, encoding: "utf8", timeout: 10000 },
    );
    expect(resumed.status, resumed.stderr).toBe(0);
    expect(
      JSON.parse(await readFile(join(directory, "media/prepared/catalog.json"), "utf8")),
    ).toHaveLength(2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 45000);
