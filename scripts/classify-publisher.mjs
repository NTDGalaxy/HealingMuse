import { atomicJson, readJson, sourceFetch } from "./audio-common.mjs";
import { genreTags, parsePublisherGenres } from "./publisher-tags.mjs";
import { trackInput } from "../src/lib/validation.ts";
if (await readJson("media/evidence/import.lock", null))
  throw new Error("Finish preparation before reconciling publisher classifications.");
const url = "https://incompetech.com/music/royalty-free/music.html";
const response = await sourceFetch(url);
if (!response.ok) throw new Error("Publisher genre source unavailable.");
const html = await response.text();
const dictionary = parsePublisherGenres(html);
await atomicJson("media/evidence/incompetech-genres.json", {
  retrievedAt: new Date().toISOString(),
  sourceUrl: url,
  dictionary: Object.fromEntries(dictionary),
  html,
});
const sources = await readJson("content/audio-sources.json", []);
for (const source of sources)
  if (source.evidence?.provider === "Incompetech") {
    source.genres = genreTags(source.evidence.recording.genre, dictionary);
    source.evidence.genreLabel = dictionary.get(String(source.evidence.recording.genre));
    source.evidence.genreEvidence = "media/evidence/incompetech-genres.json";
  }
await atomicJson("content/audio-sources.json", sources);
const byId = new Map(sources.map((source) => [source.id, source]));
const catalogue = await readJson("media/prepared/catalog.json", []);
let classified = 0;
const sourceGenres = {};
const requiresContentReview = [];
for (const track of catalogue) {
  const source = byId.get(track.id);
  if (
    track.id.startsWith("00000000-0000-4000-8000-") ||
    source?.evidence?.provider !== "Incompetech"
  )
    continue;
  track.genres = source.genres;
  trackInput.parse(track);
  const path = `media/evidence/recordings/${track.id}.json`;
  const receipt = await readJson(path, null);
  if (!receipt) throw new Error(`Missing retained recording evidence: ${track.id}`);
  await atomicJson(path, {
    ...receipt,
    track,
    classification: {
      sourceUrl: url,
      publisherGenreId: source.evidence.recording.genre,
      publisherGenre: source.evidence.genreLabel,
      genreTags: track.genres,
      evidence: "media/evidence/incompetech-genres.json",
      traditions: "Unverified; no inferred tradition tags.",
    },
  });
  if (track.status === "retired") continue;
  classified += Number(track.genres.length > 0);
  const label = source.evidence.genreLabel || "Unknown";
  sourceGenres[label] = (sourceGenres[label] || 0) + 1;
  if (["Horror", "Stings", "Unclassifiable"].includes(label))
    requiresContentReview.push({ id: track.id, publisherGenre: label });
}
await atomicJson("media/prepared/catalog.json", catalogue);
await atomicJson("media/evidence/publisher-classification.json", {
  classified,
  sourceGenres,
  requiresContentReview,
  approved: 0,
  note: "Source labels are classification evidence, not listening approval or a suitability assessment.",
});
console.log(JSON.stringify({ event: "publisher_classified", classified, sourceGenres }));
