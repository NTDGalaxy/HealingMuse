import { createHash } from "node:crypto";
import {
  atomicJson,
  plain,
  readJson,
  sourceFetch,
  targetCount,
  isDerivativeRecording,
} from "./audio-common.mjs";
const target = targetCount();
// Candidates can exceed the recording target because unsuitable or duplicate sources are rejected.
const poolSize = target + Math.ceil(target / 2);
const roots = [
  "Sounds of nature",
  "Sounds of rain",
  "Sounds of water",
  "Sounds of birds",
  "Contemporary music from Incompetech",
  "Audio files of instrumental music",
  "Audio files of classical music",
  "Audio files of music by instrument",
  "Audio files of jazz",
  "Audio files of folk music",
  "Audio files of music by composer",
];
const excluded =
  /vocal|singing|songs?\b|hymns?|anthems?|opera\b|marches|military|gun|speech|midi|scales|sound logo|demonstration|partial music|generated|artificial intelligence/i;
const existing = await readJson("content/audio-sources.json", []);
const state = await readJson("media/evidence/discovery-state.json", {
  queue: roots.map((category) => ({ category, depth: 0 })),
  seen: [],
  sources: existing,
});
const sources = new Map(
  [...existing, ...state.sources].map((source) => [source.provenanceUrl, source]),
);
const seen = new Set(state.seen);
const identities = new Set(
  [...sources.values()].map(
    (source) =>
      source.recordingId || source.originalTitle?.match(/USUAN\d+/)?.[0] || source.provenanceUrl,
  ),
);
const save = async () => {
  const all = [...sources.values()];
  await atomicJson("media/evidence/discovery-state.json", {
    queue: state.queue,
    seen: [...seen],
    sources: all,
  });
  await atomicJson(
    "content/audio-sources.json",
    all.map((source, position) => ({ ...source, position })),
  );
};
const query = async (params) => {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    maxlag: "5",
    ...params,
  }).toString();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const response = await sourceFetch(url);
  if (!response.ok) throw new Error(`Metadata provider returned ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`Metadata error: ${data.error.code}`);
  return data;
};
while (state.queue.length && sources.size < poolSize) {
  const current = state.queue[0];
  if (seen.has(current.category) || excluded.test(current.category) || current.depth > 8) {
    state.queue.shift();
    continue;
  }
  const data = await query({
    generator: "categorymembers",
    gcmtitle: `Category:${current.category}`,
    gcmtype: "file",
    gcmlimit: "50",
    prop: "imageinfo",
    iiprop: "url|extmetadata|size|timestamp",
    ...(current.continuation || {}),
  });
  for (const page of Object.values(data.query?.pages || {})) {
    const info = page.imageinfo?.[0],
      meta = info?.extmetadata || {};
    const originalTitle = page.title?.slice(5) || "";
    if (
      !info ||
      excluded.test(originalTitle) ||
      isDerivativeRecording(originalTitle) ||
      !/\.(mp3|ogg|oga|wav|flac)$/i.test(originalTitle) ||
      !info.duration ||
      info.duration < 30 ||
      info.duration > 1800 ||
      info.size > 64 * 1024 * 1024
    )
      continue;
    const license = plain(meta.LicenseShortName?.value),
      licenseUrl = meta.LicenseUrl?.value
        ?.replace(/^\/\//, "https://")
        .replace(/^http:\/\/creativecommons\.org\//, "https://creativecommons.org/");
    if (
      !/^(CC BY(?:-SA)? [234]\.0|CC0|Public domain)$/i.test(license) ||
      plain(meta.Restrictions?.value)
    )
      continue;
    const artist = plain(meta.Artist?.value);
    if (
      !artist ||
      /AI.generated|artificial intelligence|suno|udio/i.test(
        artist + plain(meta.ImageDescription?.value),
      )
    )
      continue;
    if (Date.parse(info.timestamp) >= Date.parse("2020-01-01")) continue;
    const recordingId = originalTitle.match(/USUAN\d+/)?.[0] || info.descriptionurl;
    if (identities.has(recordingId) || sources.has(info.descriptionurl)) continue;
    const nature = /sounds|recordings of wind/i.test(current.category);
    const genre = /jazz/i.test(current.category)
      ? "jazz"
      : /classical|composer/i.test(current.category)
        ? "classical"
        : /folk/i.test(current.category)
          ? "folk"
          : null;
    const instrument = /piano/i.test(current.category + originalTitle)
      ? "piano"
      : /guitar/i.test(current.category + originalTitle)
        ? "guitar"
        : /flute/i.test(current.category + originalTitle)
          ? "flute"
          : null;
    const artwork = nature
      ? /rain/i.test(originalTitle + current.category)
        ? "rain"
        : /sea|wave|beach/i.test(originalTitle)
          ? "sea"
          : /water|river|creek/i.test(originalTitle + current.category)
            ? "river"
            : "forest"
      : instrument === "piano"
        ? "piano"
        : "night";
    const title = originalTitle
      .replace(/\s*\(ISRC[^)]*\)/i, "")
      .replace(/\.[^.]+$/, "")
      .slice(0, 150);
    const digest = createHash("sha256").update(info.descriptionurl).digest("hex");
    const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    sources.set(info.descriptionurl, {
      id,
      recordingId,
      originalTitle,
      title: { vi: title, en: title },
      artist: artist.slice(0, 120),
      duration: info.duration,
      category: nature ? "nature" : "instrumental",
      artwork,
      color: "sage",
      genres: genre ? [genre] : [],
      instruments: instrument ? [instrument] : [],
      traditions: [],
      goals: ["relax"],
      license,
      licenseUrl: licenseUrl || "https://creativecommons.org/publicdomain/mark/1.0/",
      url: info.url,
      provenanceUrl: info.descriptionurl,
      evidence: {
        provider: "Wikimedia Commons",
        uploadedAt: info.timestamp,
        metadata: meta,
        category: current.category,
      },
      review: {
        provenance:
          "Provider evidence retained; distribution rights require administrator confirmation",
        subjectiveAudio: "pending",
        humanOrigin: "Pre-2020 attributed recording; pending administrator confirmation",
      },
    });
    identities.add(recordingId);
  }
  if (data.continue) current.continuation = data.continue;
  else {
    const children = await query({
      list: "categorymembers",
      cmtitle: `Category:${current.category}`,
      cmtype: "subcat",
      cmlimit: "500",
    });
    for (const child of children.query?.categorymembers || []) {
      const category = child.title.slice(9);
      if (!seen.has(category) && !excluded.test(category))
        state.queue.push({ category, depth: current.depth + 1 });
    }
    seen.add(current.category);
    state.queue.shift();
  }
  await save();
  console.log(
    JSON.stringify({
      event: "discovery",
      candidates: sources.size,
      target: poolSize,
      category: current.category,
      remainingCategories: state.queue.length,
    }),
  );
}
await save();
if (sources.size < target)
  throw new Error(
    `Only ${sources.size} distinct eligible candidates found; do not count placeholders.`,
  );
console.log(
  JSON.stringify({ event: "discovery_ready", candidates: sources.size, review: "pending" }),
);
