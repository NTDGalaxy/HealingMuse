import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { atomicJson, readJson, targetCount } from "./audio-common.mjs";
import { releaseMetadata } from "./recording-row.mjs";
import { databaseClient } from "./database.mjs";

const path = "media/evidence/catalogue-release.json";
const canonical = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
const hash = (value) => createHash("sha256").update(canonical(value)).digest("hex");
try {
  const tracks = (await readJson("media/prepared/catalog.json", [])).filter(
    (track) => track.status !== "retired",
  );
  if (tracks.length !== targetCount() || new Set(tracks.map((t) => t.id)).size !== tracks.length)
    throw new Error("incomplete_inventory");
  const items = [];
  for (const track of tracks.sort((a, b) => a.id.localeCompare(b.id))) {
    const audio = await readFile(`media/prepared/${track.source.path}`);
    if (
      audio.length !== track.bytes ||
      createHash("sha256").update(audio).digest("hex") !== track.sha256
    )
      throw new Error("local_integrity_mismatch");
    items.push({ trackId: track.id, metadata: releaseMetadata(track) });
  }
  const payload = { version: 1, expectedCount: tracks.length, items };
  const manifestHash = hash(payload);
  const existing = await readJson(path, null);
  if (existing && existing.manifestHash !== manifestHash)
    throw new Error("immutable_manifest_changed");
  const manifest = existing ?? {
    ...payload,
    id: randomUUID(),
    title: "HealingMuse - 1,000 human-created recordings",
    manifestHash,
    preparedAt: new Date().toISOString(),
  };
  if (
    hash({
      version: manifest.version,
      expectedCount: manifest.expectedCount,
      items: manifest.items,
    }) !== manifestHash
  )
    throw new Error("manifest_integrity_mismatch");
  if (!existing) await atomicJson(path, manifest);
  if (process.argv.includes("--register")) {
    const db = databaseClient();
    try {
      await db.connect();
      await db.query("begin");
      await db.query("select pg_advisory_xact_lock(610110001)");
      const { rows } = await db.query(
        `select count(*)::integer as matching from
        jsonb_to_recordset($1::jsonb) as i("trackId" uuid,metadata jsonb)
        join public.tracks t on t.id=i."trackId" and public.release_track_metadata(t)=i.metadata
        join public.audio_deliveries d on d.track_id=t.id and d.sha256=t.sha256 and d.bytes=t.bytes
        join storage.objects o on o.id=d.object_id and o.updated_at=d.object_updated_at
          and o.bucket_id='audio' and o.name=t.source->>'path' and (o.metadata->>'size')::bigint=t.bytes
        where t.status<>'retired'`,
        [JSON.stringify(items)],
      );
      if (rows[0].matching !== tracks.length) throw new Error("delivery_or_metadata_incomplete");
      await db.query(
        `insert into public.catalogue_releases(id,manifest_hash,title,expected_count)
        values($1,$2,$3,$4) on conflict(id) do nothing`,
        [manifest.id, manifestHash, manifest.title, tracks.length],
      );
      const release = (
        await db.query("select manifest_hash from public.catalogue_releases where id=$1", [
          manifest.id,
        ])
      ).rows[0];
      if (release.manifest_hash !== manifestHash) throw new Error("immutable_release_changed");
      await db.query(
        `insert into public.catalogue_release_items(release_id,track_id,expected_metadata)
        select $1,i."trackId",i.metadata from jsonb_to_recordset($2::jsonb) as i("trackId" uuid,metadata jsonb)
        on conflict(release_id,track_id) do nothing`,
        [manifest.id, JSON.stringify(items)],
      );
      const stored = (
        await db.query(
          `select count(*)::integer as matching from public.catalogue_release_items r
        join jsonb_to_recordset($2::jsonb) as i("trackId" uuid,metadata jsonb)
        on i."trackId"=r.track_id and i.metadata=r.expected_metadata where r.release_id=$1`,
          [manifest.id, JSON.stringify(items)],
        )
      ).rows[0];
      if (stored.matching !== tracks.length) throw new Error("immutable_release_changed");
      await db.query("commit");
    } catch (error) {
      await db.query("rollback").catch(() => {});
      throw error;
    } finally {
      await db.end();
    }
  }
  console.log(
    JSON.stringify({
      event: "release_prepared",
      id: manifest.id,
      manifestHash,
      count: tracks.length,
      registered: process.argv.includes("--register"),
      publication: "awaiting_named_administrator_attestation",
    }),
  );
} catch (error) {
  const allowed = new Set([
    "incomplete_inventory",
    "local_integrity_mismatch",
    "immutable_manifest_changed",
    "manifest_integrity_mismatch",
    "delivery_or_metadata_incomplete",
    "immutable_release_changed",
  ]);
  console.error(
    JSON.stringify({
      event: "release_preparation_failed",
      code: allowed.has(error.message) ? error.message : "unavailable",
    }),
  );
  process.exitCode = 1;
}
