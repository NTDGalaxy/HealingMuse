import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { atomicJson, readJson, targetCount } from "./audio-common.mjs";
import { releaseMetadata } from "./recording-row.mjs";
import { b2Config, b2Client, assertB2Receipt, verifyB2Head } from "../src/lib/storage/b2.ts";
import { readRetry } from "./lib/b2-delivery.mjs";
import { databaseClient } from "./database.mjs";
import { subsetTracks } from "./lib/supabase-subset.mjs";

const subset = process.argv.includes("--subset");
const path = subset
  ? "media/evidence/supabase-free-release.json"
  : "media/evidence/catalogue-release.json";
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
  const catalogue = await readJson("media/prepared/catalog.json", []);
  const tracks = subset
    ? subsetTracks(catalogue, await readJson("media/evidence/supabase-free-selection.json", null))
    : catalogue.filter((track) => track.status !== "retired");
  if (
    (!subset && tracks.length !== targetCount()) ||
    !tracks.length ||
    new Set(tracks.map((t) => t.id)).size !== tracks.length
  )
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
    title: subset
      ? `HealingMuse - ${tracks.length} recordings within Supabase Free`
      : "HealingMuse - 1,000 human-created recordings",
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
  const provider =
    process.argv.find((arg) => arg.startsWith("--provider="))?.split("=")[1] ?? "supabase";
  if (!["supabase", "b2"].includes(provider)) throw new Error("delivery_or_metadata_incomplete");
  if (subset && provider !== "supabase") throw new Error("delivery_or_metadata_incomplete");
  if (process.argv.includes("--register")) {
    const db = databaseClient();
    try {
      await db.connect();
      await db.query("select pg_advisory_lock(610110001)");
      if (provider === "b2") {
        const config = b2Config("READ"),
          client = b2Client(config);
        try {
          const receipts = (
            await db.query(
              "select * from public.b2_audio_deliveries where track_id=any($1::uuid[])",
              [tracks.map((t) => t.id)],
            )
          ).rows;
          const byId = new Map(receipts.map((d) => [d.track_id, d]));
          for (const track of tracks) {
            const receipt = byId.get(track.id);
            if (!receipt) throw new Error("delivery_or_metadata_incomplete");
            assertB2Receipt(config, receipt, track.id, track.sha256, track.bytes);
            await readRetry(() => verifyB2Head(client, config, receipt));
          }
        } finally {
          client.destroy();
        }
      }
      await db.query("begin");
      const { rows } = await db.query(
        `select count(*)::integer as matching from
        jsonb_to_recordset($1::jsonb) as i("trackId" uuid,metadata jsonb)
        join public.tracks t on t.id=i."trackId" and public.release_track_metadata(t)=i.metadata
        ${
          provider === "b2"
            ? `join public.b2_audio_deliveries d on d.track_id=t.id and d.sha256=t.sha256 and d.bytes=t.bytes`
            : `join public.audio_deliveries d on d.track_id=t.id and d.sha256=t.sha256 and d.bytes=t.bytes
        join storage.objects o on o.id=d.object_id and o.updated_at=d.object_updated_at
          and o.bucket_id='audio' and o.name=t.source->>'path' and (o.metadata->>'size')::bigint=t.bytes`
        }
        where t.status<>'retired'`,
        [JSON.stringify(items)],
      );
      if (rows[0].matching !== tracks.length) throw new Error("delivery_or_metadata_incomplete");
      await db.query(
        `insert into public.catalogue_releases(id,manifest_hash,title,expected_count,required_storage_provider)
        values($1,$2,$3,$4,$5) on conflict(id) do nothing`,
        [manifest.id, manifestHash, manifest.title, tracks.length, provider],
      );
      const release = (
        await db.query(
          "select manifest_hash,required_storage_provider from public.catalogue_releases where id=$1",
          [manifest.id],
        )
      ).rows[0];
      if (release.manifest_hash !== manifestHash || release.required_storage_provider !== provider)
        throw new Error("immutable_release_changed");
      await db.query(
        `insert into public.catalogue_release_items(release_id,track_id,expected_metadata,expected_storage)
        select $1,i."trackId",i.metadata,${provider === "b2" ? "public.b2_delivery_metadata(d)" : "null"}
        from jsonb_to_recordset($2::jsonb) as i("trackId" uuid,metadata jsonb)
        ${provider === "b2" ? 'join public.b2_audio_deliveries d on d.track_id=i."trackId"' : ""}
        on conflict(release_id,track_id) do nothing`,
        [manifest.id, JSON.stringify(items)],
      );
      const stored = (
        await db.query(
          `select count(*)::integer as matching from public.catalogue_release_items r
        join jsonb_to_recordset($2::jsonb) as i("trackId" uuid,metadata jsonb)
        on i."trackId"=r.track_id and i.metadata=r.expected_metadata
        ${provider === "b2" ? "join public.b2_audio_deliveries d on d.track_id=r.track_id and public.b2_delivery_metadata(d)=r.expected_storage" : ""}
        where r.release_id=$1`,
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
      storageProvider: provider,
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
