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

/** The first hosted instrumental, the kind the binaural mixer can play underneath its tones. */
export async function hostedInstrumental(): Promise<Track> {
  const track = (await preparedCatalogue()).find(
    (item) => item.category === "instrumental" && item.source.kind === "hosted",
  )!;
  if (track.source.kind !== "hosted") throw new Error("missing_hosted_fixture");
  return track;
}
