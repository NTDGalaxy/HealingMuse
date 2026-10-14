import { readFile, writeFile } from "node:fs/promises";
const root = process.cwd();
import { toolFetch } from "./tool-fetch.mjs";
import { subsetTracks } from "./lib/supabase-subset.mjs";
const read = async (p) => JSON.parse(await readFile(`${root}/${p}`, "utf8"));
const selection = await read("media/evidence/supabase-free-selection.json"),
  catalogue = await read("media/prepared/catalog.json");
const tracks = subsetTracks(catalogue, selection),
  sources = new Map((await read("content/audio-sources.json")).map((t) => [t.id, t]));
const normalized = (value) =>
  String(value || "")
    .replace(/^http:/, "https:")
    .replace(/\/$/, "");
const request = async (url) => {
  const r = await toolFetch(url, {
    headers: { "User-Agent": "HealingMuse/1.0 (catalogue provenance verification; metadata only)" },
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
  if (!r.ok) throw new Error("provider_evidence_unavailable");
  return r;
};
try {
  const policy = await (
    await request("https://incompetech.com/music/royalty-free/licenses/")
  ).text();
  const pieces = await (
    await request("https://incompetech.com/music/royalty-free/pieces.json")
  ).json();
  if (!Array.isArray(pieces) || !policy.includes("creativecommons.org/licenses/by/4.0/"))
    throw new Error("publisher_license_changed");
  const publisher = new Map(pieces.map((p) => [p.isrc, p]));
  const items = [],
    commons = [];
  for (const t of tracks) {
    const s = sources.get(t.id);
    if (s?.evidence?.provider === "Incompetech") {
      const live = publisher.get(s.recordingId);
      if (
        !live ||
        live.filename !== s.evidence.recording.filename ||
        live.title !== s.evidence.recording.title ||
        t.license !== "CC BY 4.0" ||
        !t.attribution.includes(t.artist) ||
        !t.changes ||
        t.downloadAllowed !== true
      )
        throw new Error("publisher_recording_mismatch");
      items.push({
        id: t.id,
        sha256: t.sha256,
        distributionEvidenceVerified: true,
        provider: "Incompetech",
        license: t.license,
        licenseUrl: t.licenseUrl,
        provenanceUrl: t.provenanceUrl,
        verification:
          "current publisher catalogue ISRC and filename plus current Creative Commons policy; credit, change notice and download preserved",
        publicationApproval: false,
      });
    } else commons.push(t);
  }
  for (let i = 0; i < commons.length; i += 10) {
    const batch = commons.slice(i, i + 10);
    const titles = batch.map((t) =>
      decodeURIComponent(new URL(t.provenanceUrl).pathname.replace(/^\/wiki\//, "")),
    );
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.search = new URLSearchParams({
      action: "query",
      format: "json",
      prop: "imageinfo",
      iiprop: "extmetadata|url|sha1",
      titles: titles.join("|"),
      redirects: "1",
      maxlag: "5",
    }).toString();
    const data = await (await request(url.href)).json();
    if (data.error) throw new Error("commons_metadata_unavailable");
    const pages = Object.values(data.query?.pages || {});
    for (let j = 0; j < batch.length; j++) {
      const t = batch[j],
        title = titles[j].replaceAll("_", " ");
      const page = pages.find(
        (p) =>
          p.title === title ||
          normalized(p.imageinfo?.[0]?.descriptionurl) === normalized(t.provenanceUrl),
      );
      const info = page?.imageinfo?.[0],
        meta = info?.extmetadata;
      const license = meta?.LicenseShortName?.value;
      if (
        !info ||
        license !== t.license ||
        (t.license !== "Public domain" &&
          normalized(meta?.LicenseUrl?.value) !== normalized(t.licenseUrl)) ||
        !t.attribution ||
        !t.changes ||
        t.downloadAllowed !== true ||
        (meta.Restrictions?.value || "").trim()
      )
        throw new Error("commons_license_or_recording_mismatch");
      items.push({
        id: t.id,
        sha256: t.sha256,
        distributionEvidenceVerified: true,
        provider: "Wikimedia Commons",
        license,
        licenseUrl: t.licenseUrl,
        provenanceUrl: t.provenanceUrl,
        sourceSha1: info.sha1,
        verification:
          "current per-file Commons license metadata; attribution, retained license and conversion notice checked",
        publicationApproval: false,
      });
    }
  }
  if (items.length !== tracks.length) throw new Error("incomplete_license_evidence");
  const report = {
    version: 1,
    checkedAt: new Date().toISOString(),
    selectionHash: selection.selectionHash,
    publicationApproved: false,
    humanListeningReview: "pending_named_administrator",
    items: items.sort((a, b) => a.id.localeCompare(b.id)),
  };
  await writeFile(
    `${root}/media/evidence/supabase-free-licensing.json`,
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      event: "subset_distribution_evidence_verified",
      recordings: items.length,
      publisher: items.filter((i) => i.provider === "Incompetech").length,
      commons: commons.length,
      publicationApproved: false,
      audioDownloaded: 0,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      event: "subset_distribution_evidence_paused",
      code: [
        "provider_evidence_unavailable",
        "publisher_license_changed",
        "publisher_recording_mismatch",
        "commons_metadata_unavailable",
        "commons_license_or_recording_mismatch",
        "incomplete_license_evidence",
      ].includes(error.message)
        ? error.message
        : "unavailable",
      uploads: 0,
    }),
  );
  process.exitCode = 1;
}
