import { createHash } from "node:crypto";
import { atomicJson, readJson, sourceFetch } from "./audio-common.mjs";
import { genreTags, parsePublisherGenres } from "./publisher-tags.mjs";

const root = "https://incompetech.com/music/royalty-free/";
const [catalogue, licensing, discovery] = await Promise.all([
  sourceFetch(`${root}pieces.json`).then((response) => response.json()),
  sourceFetch(`${root}licenses/`).then((response) => response.text()),
  sourceFetch(`${root}music.html`).then((response) => response.text()),
]);
const genreDictionary = parsePublisherGenres(discovery);
if (!licensing.includes("By Attribution 4.0"))
  throw new Error("Publisher licence changed; human review required.");
await atomicJson("media/evidence/incompetech-catalogue.json", {
  retrievedAt: new Date().toISOString(),
  catalogue,
  licensing,
  discovery,
  genreDictionary: Object.fromEntries(genreDictionary),
});
const existing = await readJson("content/audio-sources.json", []);
const identities = new Set(
  existing.map(
    (item) => item.recordingId || item.originalTitle?.match(/USUAN\d+/)?.[0] || item.provenanceUrl,
  ),
);
const titles = new Set();
const candidates = catalogue.filter(
  (item) =>
    item.uploaded < "2020-01-01" &&
    item.isrc &&
    item.filename &&
    !/vocal|singing|horror|terror|scream|gunfire|loop|\bversion\b|\(.*?\)|alternate|faster|slower/i.test(
      `${item.title} ${item.instruments} ${item.description}`,
    ),
);
candidates.sort(
  (a, b) =>
    Number(
      !/calm|relax|gentle|peaceful|bright|easy|jazz|classical/i.test(`${a.feel} ${a.description}`),
    ) -
    Number(
      !/calm|relax|gentle|peaceful|bright|easy|jazz|classical/i.test(`${b.feel} ${b.description}`),
    ),
);
for (const item of candidates) {
  const title = item.title.trim();
  const canonical = title
    .toLowerCase()
    .replace(/\b(part|vol|volume)\s*[\divx]+\b/g, "")
    .trim();
  if (identities.has(item.isrc) || titles.has(canonical)) continue;
  titles.add(canonical);
  identities.add(item.isrc);
  const digest = createHash("sha256").update(`incompetech:${item.isrc}`).digest("hex");
  const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  const instruments = ["piano", "guitar", "flute", "strings", "percussion"].filter((tag) =>
    new RegExp(
      tag === "strings" ? "violin|cello|strings" : tag === "percussion" ? "drums|percussion" : tag,
      "i",
    ).test(item.instruments),
  );
  existing.push({
    id,
    recordingId: item.isrc,
    originalTitle: title,
    title: { vi: title, en: title },
    artist: "Kevin MacLeod",
    category: "instrumental",
    goals: ["relax"],
    genres: genreTags(item.genre, genreDictionary),
    instruments,
    traditions: [],
    artwork: instruments.includes("piano") ? "piano" : "night",
    color: "sage",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: `${root}mp3-royaltyfree/${encodeURIComponent(item.filename)}`,
    provenanceUrl: `${root}?isrc=${encodeURIComponent(item.isrc)}`,
    evidence: {
      provider: "Incompetech",
      recording: item,
      licensingUrl: `${root}licenses/`,
      licenceEvidence: "media/evidence/incompetech-catalogue.json",
    },
    review: {
      subjectiveAudio: "pending",
      provenance: "Publisher catalogue entry and title-specific CC attribution retained",
      humanOrigin: "Attributed pre-2020 Kevin MacLeod recording; human confirmation pending",
    },
    position: existing.length,
  });
}
await atomicJson("content/audio-sources.json", existing);
console.log(
  JSON.stringify({ event: "publisher_discovered", candidates: existing.length, review: "pending" }),
);
