import { config as dotenv } from "dotenv";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { b2Config, b2Client } from "../src/lib/storage/b2.ts";
import { accountPreflight, b2ErrorCode } from "./lib/b2-account.mjs";
import { deliverB2Track, deliveryBudget } from "./lib/b2-delivery.mjs";
import { atomicJson, readJson, targetCount } from "./audio-common.mjs";
import { databaseClient } from "./database.mjs";
import { recordingRow, releaseMetadata } from "./recording-row.mjs";

dotenv({ path: ".env.local", quiet: true });
const checkpointPath = "media/evidence/b2-delivery.json";
let db, client, reader;
try {
  const upload = b2Config("UPLOAD"),
    read = b2Config("READ");
  client = b2Client(upload);
  reader = b2Client(read);
  const command = process.argv[2] || "preflight";
  if (!["preflight", "upload", "verify"].includes(command))
    throw new Error("b2_invalid_configuration");
  const tracks = (await readJson("media/prepared/catalog.json", [])).filter(
    (t) => t.status !== "retired",
  );
  if (
    tracks.length !== targetCount() ||
    new Set(tracks.map((t) => t.id)).size !== tracks.length ||
    tracks.some((t) => t.source.kind !== "hosted")
  )
    throw new Error("incomplete_inventory");
  const totalBytes = tracks.reduce((sum, t) => sum + t.bytes, 0);
  if (
    !Number.isSafeInteger(totalBytes) ||
    tracks.some((t) => !Number.isSafeInteger(t.bytes) || t.bytes <= 0)
  )
    throw new Error("local_integrity_mismatch");
  const preflight = await accountPreflight(upload, read, reader);
  console.log(
    JSON.stringify({ event: "b2_preflight", count: tracks.length, totalBytes, ...preflight }),
  );
  if (command !== "preflight") {
    db = databaseClient();
    await db.connect();
    if (!(await db.query("select pg_try_advisory_lock(610110001) as acquired")).rows[0].acquired)
      throw new Error("delivery_busy");
    const checkpoint = await readJson(checkpointPath, { version: 1, items: {} });
    if (checkpoint.version !== 1 || !checkpoint.items) throw new Error("checkpoint_mismatch");
    let saving = Promise.resolve(),
      stop = false;
    const interrupt = () => {
      stop = true;
    };
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", interrupt);
    const persistCheckpoint = () => {
      saving = saving.then(() => atomicJson(checkpointPath, checkpoint));
      return saving;
    };
    if (checkpoint.budget?.checkedAt !== preflight.evidenceCheckedAt)
      checkpoint.budget = { checkedAt: preflight.evidenceCheckedAt, storage: 0, download: 0 };
    if (
      ![checkpoint.budget.storage, checkpoint.budget.download].every(
        (n) => Number.isSafeInteger(n) && n >= 0,
      )
    )
      throw new Error("checkpoint_mismatch");
    const budget = deliveryBudget(
      Math.max(0, preflight.storageRemaining - checkpoint.budget.storage),
      Math.max(0, preflight.downloadRemaining - checkpoint.budget.download),
      async (kind, bytes) => {
        checkpoint.budget[kind] += bytes;
        await persistCheckpoint();
      },
    );
    let cursor = 0,
      verified = 0,
      failure;
    const worker = async () => {
      while (!stop && cursor < tracks.length) {
        const track = tracks[cursor++];
        try {
          const path = resolve("media/prepared", track.source.path);
          if (!path.startsWith(resolve("media/prepared") + sep) || !path.endsWith(".mp3"))
            throw new Error("local_integrity_mismatch");
          const prior = checkpoint.items[track.id];
          if (command === "verify" && !prior?.version_id)
            throw new Error("remote_version_mismatch");
          // Preserve existing metadata: insert drafts only, then reject any mismatching cloud row.
          const row = recordingRow(track);
          const columns = Object.keys(row);
          await db.query(
            `insert into public.tracks(${columns.join(",")})
            select ${columns.map((name) => `r.${name}`).join(",")} from jsonb_populate_record(null::public.tracks,$1::jsonb) r
            on conflict(id) do nothing`,
            [JSON.stringify(row)],
          );
          const matching = (
            await db.query(
              "select public.release_track_metadata(t)=$2::jsonb as matching from public.tracks t where id=$1",
              [track.id, JSON.stringify(releaseMetadata(track))],
            )
          ).rows[0];
          if (!matching?.matching) throw new Error("delivery_mismatch");
          await deliverB2Track({
            client,
            reader,
            config: upload,
            track,
            audio: await readFile(path),
            checkpoint: prior,
            budget,
            save: async (entry) => {
              checkpoint.items[track.id] = entry;
              await persistCheckpoint();
            },
            record: async (receipt) => {
              await db.query("select public.record_b2_audio_delivery($1,$2,$3,$4,$5,$6,$7,$8)", [
                track.id,
                receipt.endpoint,
                receipt.bucket,
                receipt.object_key,
                receipt.version_id,
                receipt.sha256,
                receipt.bytes,
                receipt.etag,
              ]);
            },
          });
          verified++;
          console.log(JSON.stringify({ event: "b2_delivery_verified", id: track.id, verified }));
        } catch (error) {
          failure ||= error;
          stop = true;
        }
      }
    };
    await Promise.all([worker(), worker()]);
    await saving;
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    if (failure) throw failure;
    if (stop) {
      console.log(JSON.stringify({ event: "b2_delivery_paused", verified }));
      process.exitCode = 1;
    } else
      console.log(
        JSON.stringify({
          event: "b2_delivery_complete",
          verified,
          publication: "awaiting_named_administrator_attestation",
        }),
      );
  }
} catch (error) {
  console.error(
    JSON.stringify({
      event: "b2_delivery_paused",
      code: b2ErrorCode(error),
      progressRetained: true,
    }),
  );
  process.exitCode = 1;
} finally {
  client?.destroy();
  reader?.destroy();
  if (db) await db.end().catch(() => {});
}
