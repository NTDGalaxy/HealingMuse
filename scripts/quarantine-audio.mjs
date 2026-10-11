import { atomicJson, readJson } from "./audio-common.mjs";
const index = process.argv.indexOf("--ids"),
  reasonIndex = process.argv.indexOf("--reason");
if (index < 0 || reasonIndex < 0)
  throw new Error("Provide recording IDs and an evidence-based exclusion reason.");
const ids = process.argv[index + 1].split(","),
  reason = process.argv[reasonIndex + 1];
if (
  !reason ||
  ids.some((id) => !/^[a-f0-9-]{36}$/.test(id) || id.startsWith("00000000-0000-4000-8000-"))
)
  throw new Error("Initial recordings are protected and all exclusions need evidence.");
const catalogue = await readJson("media/prepared/catalog.json", []);
const known = new Set(catalogue.map((track) => track.id));
if (ids.some((id) => !known.has(id))) throw new Error("Unknown exclusion ID.");
const decisions = await readJson("media/evidence/identity-exclusions.json", []);
for (const id of ids) {
  const track = catalogue.find((track) => track.id === id);
  track.status = "retired";
  track.rightsVerified = false;
  track.listeningReviewed = false;
  const receipt = await readJson(`media/evidence/recordings/${id}.json`, null);
  if (receipt)
    await atomicJson(`media/evidence/recordings/${id}.json`, {
      ...receipt,
      track,
      distinctOriginal: "excluded",
      exclusionReason: reason,
    });
  if (!decisions.some((item) => item.id === id))
    decisions.push({ id, reason, excludedAt: new Date().toISOString(), originalsRetained: true });
}
await atomicJson("media/evidence/identity-exclusions.json", decisions);
await atomicJson("media/prepared/catalog.json", catalogue);
console.log(JSON.stringify({ event: "recordings_quarantined", excluded: ids.length, reason }));
