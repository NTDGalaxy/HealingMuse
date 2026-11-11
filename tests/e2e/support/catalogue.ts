import { readFile } from "node:fs/promises";
import type { Track } from "@/lib/types";
import { preparedCatalogPath } from "./contracts";

// The prepared catalogue in media/prepared is gitignored; local checkouts and CI's synthetic
// fixtures both provide it with the identity recorded in contracts.recordings.

export async function preparedCatalogue(): Promise<Track[]> {
  return JSON.parse(await readFile(preparedCatalogPath, "utf8"));
}

/** The prepared audio bytes behind a hosted recording. */
export async function preparedAudio(track: Track): Promise<Buffer> {
  if (track.source.kind !== "hosted") throw new Error("Hosted fixture required");
  return readFile(`media/prepared/${track.source.path}`);
}

/**
 * A published catalogue of `count` hosted instrumentals built from the first prepared recording,
 * for routing `/api/catalog` when a test needs more recordings than CI's synthetic fixtures hold.
 * `customize` may change any recording, for example its title or its source.
 */
export async function syntheticCatalogue(
  count: number,
  customize: (track: Track, index: number) => Track = (track) => track,
): Promise<Track[]> {
  const template = (await preparedCatalogue())[0];
  return Array.from({ length: count }, (_, index) =>
    customize(
      {
        ...template,
        id: `80000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        title: { en: `Instrumental ${index + 1}`, vi: `Nhạc không lời ${index + 1}` },
        artist: "Synthetic catalogue fixture",
        status: "published",
        position: index,
        category: "instrumental",
        source: { kind: "hosted", path: "synthetic.mp3" },
        goals: ["relax"],
        genres: [index % 2 ? "folk" : "classical"],
        instruments: [index % 2 ? "strings" : "piano"],
        traditions: ["vietnamese"],
      },
      index,
    ),
  );
}

/** The first hosted instrumental, the kind the binaural mixer can play underneath its tones. */
export async function hostedInstrumental(): Promise<Track> {
  const track = (await preparedCatalogue()).find(
    (item) => item.category === "instrumental" && item.source.kind === "hosted",
  )!;
  if (track.source.kind !== "hosted") throw new Error("missing_hosted_fixture");
  return track;
}
