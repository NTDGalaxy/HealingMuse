import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { databaseClient } from "./database.mjs";
import { toolFetch } from "./tool-fetch.mjs";
import { atomicJson, readJson } from "./audio-common.mjs";
import { recordingRow, releaseMetadata } from "./recording-row.mjs";
import { curlSupabaseUpload } from "./lib/supabase-upload.mjs";
import {
  subsetLimits,
  subsetTracks,
  hashJson,
  deliverSubsetTrack,
} from "./lib/supabase-subset.mjs";

let db;
const allowed = new Set([
  "account_limits_unconfirmed",
  "selection_changed",
  "licensing_unverified",
  "delivery_busy",
  "storage_budget_exhausted",
  "egress_budget_exhausted",
  "file_limit_exceeded",
  "local_integrity_mismatch",
  "checkpoint_mismatch",
  "remote_version_mismatch",
  "remote_integrity_mismatch",
  "uncertain_write",
  "metadata_mismatch",
  "pilot_required",
  "storage_unavailable",
]);
try {
  const command = process.argv[2] || "plan";
  if (!["plan", "pilot", "upload", "verify"].includes(command))
    throw new Error("selection_changed");
  const evidence = await readJson("media/evidence/supabase-free-account.json", null);
  const limits = subsetLimits(evidence);
  const selection = await readJson("media/evidence/supabase-free-selection.json", null);
  const tracks = subsetTracks(await readJson("media/prepared/catalog.json", []), selection);
  const licenses = await readJson("media/evidence/supabase-free-licensing.json", null);
  if (
    !licenses ||
    licenses.selectionHash !== selection.selectionHash ||
    !Number.isFinite(Date.parse(licenses.checkedAt)) ||
    Date.parse(licenses.checkedAt) > Date.now() ||
    Date.now() - Date.parse(licenses.checkedAt) > 86_400_000 ||
    tracks.some(
      (track) =>
        !licenses.items.some(
          (item) =>
            item.id === track.id &&
            item.sha256 === track.sha256 &&
            item.distributionEvidenceVerified === true,
        ),
    )
  )
    throw new Error("licensing_unverified");
  if (tracks.some((track) => track.bytes > limits.fileBytes))
    throw new Error("file_limit_exceeded");
  db = databaseClient();
  await db.connect();
  if (!(await db.query("select pg_try_advisory_lock(610110001) as acquired")).rows[0].acquired)
    throw new Error("delivery_busy");
  const capacity = async (additional = 0) => {
    if (Date.now() >= limits.validUntil) throw new Error("account_limits_unconfirmed");
    const bucket = (
      await db.query(
        "select public,file_size_limit,allowed_mime_types from storage.buckets where id='audio'",
      )
    ).rows[0];
    if (
      !bucket ||
      bucket.public ||
      Number(bucket.file_size_limit) < Math.max(...tracks.map((t) => t.bytes)) ||
      (bucket.allowed_mime_types && !bucket.allowed_mime_types.includes("audio/mpeg"))
    )
      throw new Error("file_limit_exceeded");
    const row = (
      await db.query(`select coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::numeric else 0 end),0)::text as bytes,
      count(*) filter(where metadata->>'size' is null or metadata->>'size' !~ '^[0-9]+$')::integer as unknown from storage.objects`)
    ).rows[0];
    if (row.unknown || !Number.isSafeInteger(Number(row.bytes)))
      throw new Error("account_limits_unconfirmed");
    if (Number(row.bytes) + additional > limits.maximumStoredBytes)
      throw new Error("storage_budget_exhausted");
    return Number(row.bytes);
  };
  const currentBytes = await capacity();
  const objects = (
    await db.query(
      "select id,name,(metadata->>'size')::text as bytes,updated_at from storage.objects where bucket_id='audio'",
    )
  ).rows;
  const additionalBytes = tracks
    .filter((track) => !objects.some((o) => o.name === track.source.path))
    .reduce((n, t) => n + t.bytes, 0);
  if (
    additionalBytes > limits.uploadBytes ||
    currentBytes + additionalBytes > limits.maximumStoredBytes
  )
    throw new Error("storage_budget_exhausted");
  console.log(
    JSON.stringify({
      event: "supabase_subset_preflight",
      selected: tracks.length,
      additionalBytes,
      currentBytes,
      uploadBudgetBytes: limits.uploadBytes,
      maximumStoredBytes: limits.maximumStoredBytes,
      fileLimitBytes: limits.fileBytes,
      egressBudgetBytes: limits.egressBytes,
      ownerConfirmedOrganizationPlan: evidence.plan,
      publication: "awaiting_named_administrator_attestation",
    }),
  );
  if (command !== "plan") {
    const statePath = "media/evidence/supabase-free-delivery.json";
    const identity = hashJson({
      selectionHash: selection.selectionHash,
      uploadBudgetBytes: limits.uploadBytes,
      fileLimitBytes: limits.fileBytes,
      licensing: licenses.items,
    });
    const state = await readJson(statePath, {
      version: 1,
      selectionHash: selection.selectionHash,
      accountHash: identity,
      uploadedBytes: 0,
      egressBytes: 0,
      items: {},
    });
    if (
      state.version !== 1 ||
      state.selectionHash !== selection.selectionHash ||
      state.accountHash !== identity ||
      ![state.uploadedBytes, state.egressBytes].every((n) => Number.isSafeInteger(n) && n >= 0)
    )
      throw new Error("checkpoint_mismatch");
    if (command === "upload" && !state.pilotVerified) throw new Error("pilot_required");
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: toolFetch },
        db: { retry: false },
      },
    );
    let saving = Promise.resolve();
    const persist = () => {
      const snapshot = JSON.parse(JSON.stringify(state));
      saving = saving.then(() => atomicJson(statePath, snapshot));
      return saving;
    };
    const reserve = async (kind, bytes) => {
      if (Date.now() >= limits.validUntil) throw new Error("account_limits_unconfirmed");
      const field = kind === "upload" ? "uploadedBytes" : "egressBytes";
      const maximum = kind === "upload" ? limits.uploadBytes : limits.egressBytes;
      if (state[field] + bytes > maximum)
        throw new Error(kind === "upload" ? "storage_budget_exhausted" : "egress_budget_exhausted");
      state[field] += bytes;
      await persist();
    };
    const additions = tracks.filter((track) => !objects.some((o) => o.name === track.source.path));
    if (command === "pilot" && !state.pilotIds) {
      state.pilotIds = additions
        .sort((a, b) => a.bytes - b.bytes || a.id.localeCompare(b.id))
        .slice(0, 5)
        .map((track) => track.id);
      await persist();
    }
    if (
      command === "pilot" &&
      (!state.pilotIds?.length ||
        state.pilotIds.length > 5 ||
        new Set(state.pilotIds).size !== state.pilotIds.length)
    )
      throw new Error("checkpoint_mismatch");
    const selected =
      command === "pilot"
        ? state.pilotIds.map((id) => {
            const track = tracks.find((track) => track.id === id);
            if (!track) throw new Error("checkpoint_mismatch");
            return track;
          })
        : tracks;
    let stop = false;
    const interrupt = () => {
      stop = true;
    };
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", interrupt);
    const workerClients = [];
    try {
      for (let index = 0; index < 2; index++) {
        const worker = databaseClient();
        await worker.connect();
        workerClients.push(worker);
      }
      const deliver = async (track, db) => {
        const path = resolve("media/prepared", track.source.path);
        if (!path.startsWith(resolve("media/prepared") + sep) || !path.endsWith(".mp3"))
          throw new Error("local_integrity_mismatch");
        const row = recordingRow(track),
          columns = Object.keys(row);
        await db.query(
          `insert into public.tracks(${columns.join(",")}) select ${columns.map((c) => `r.${c}`).join(",")} from jsonb_populate_record(null::public.tracks,$1::jsonb) r on conflict(id) do nothing`,
          [JSON.stringify(row)],
        );
        const matching = (
          await db.query(
            "select public.release_track_metadata(t)=$2::jsonb as matching from public.tracks t where id=$1",
            [track.id, JSON.stringify(releaseMetadata(track))],
          )
        ).rows[0];
        if (!matching?.matching) throw new Error("metadata_mismatch");
        const inspect = async () => {
          const r = (
            await db.query(
              "select id,(metadata->>'size')::text as bytes,updated_at::text as updated_at from storage.objects where bucket_id='audio' and name=$1",
              [track.source.path],
            )
          ).rows[0];
          return r ? { id: r.id, bytes: Number(r.bytes), updatedAt: r.updated_at } : null;
        };
        if (
          process.argv.includes("--reconcile-missing") &&
          state.items[track.id]?.state === "writing"
        ) {
          // Explicit recovery requires agreement from both independent metadata interfaces.
          const information = await client.storage.from("audio").info(track.source.path);
          if (
            (await inspect()) ||
            Number(information.error?.statusCode) !== 404 ||
            information.error?.code !== "NoSuchKey"
          )
            throw new Error("uncertain_write");
          state.items[track.id] = {
            ...state.items[track.id],
            state: "retry_ready",
            absenceConfirmedAt: new Date().toISOString(),
          };
          await persist();
        }
        if (command === "verify" && state.items[track.id]?.state !== "verified")
          throw new Error("remote_version_mismatch");
        await deliverSubsetTrack({
          track,
          audio: await readFile(path),
          checkpoint: state.items[track.id],
          inspect,
          assertCapacity: async (bytes) => {
            if (stop) throw new Error("storage_unavailable");
            return capacity(bytes);
          },
          confirmMissing: async () => {
            const information = await client.storage.from("audio").info(track.source.path);
            return (
              !stop &&
              Number(information.error?.statusCode) === 404 &&
              information.error?.code === "NoSuchKey" &&
              !(await inspect())
            );
          },
          reserve,
          save: async (entry) => {
            state.items[track.id] = entry;
            await persist();
          },
          upload: async (audio) => {
            if (process.env.SUBSET_UPLOAD_TRANSPORT !== "node")
              return curlSupabaseUpload(
                process.env.NEXT_PUBLIC_SUPABASE_URL,
                process.env.SUPABASE_SECRET_KEY,
                track.source.path,
                audio,
              );
            const r = await client.storage.from("audio").upload(track.source.path, audio, {
              contentType: "audio/mpeg",
              cacheControl: "0",
              upsert: false,
            });
            if (r.error) {
              const status = Number(r.error.status) || Number(r.error.statusCode) || null;
              const failure = {
                operation: "upload",
                status,
                transportFailure: r.error.name === "StorageUnknownError",
                quotaIndicated: /quota|exceed|billing|payment/i.test(r.error.message),
                authorizationIndicated: status === 401 || status === 403,
              };
              state.lastFailure = failure;
              await persist();
              throw Object.assign(new Error("storage_unavailable"), { diagnostic: failure });
            }
          },
          download: async () => {
            const r = await client.storage.from("audio").download(track.source.path);
            if (r.error || !r.data) throw new Error("storage_unavailable");
            return Buffer.from(await r.data.arrayBuffer());
          },
          record: async (object) => {
            await db.query("begin");
            try {
              const locked = (
                await db.query(
                  "select id,updated_at::text as updated_at from storage.objects where bucket_id='audio' and name=$1 for share",
                  [track.source.path],
                )
              ).rows[0];
              if (!locked || locked.id !== object.id || locked.updated_at !== object.updatedAt)
                throw new Error("remote_version_mismatch");
              await db.query("select public.record_audio_delivery($1,$2,$3)", [
                track.id,
                track.sha256,
                track.bytes,
              ]);
              await db.query("commit");
            } catch (error) {
              await db.query("rollback");
              throw error;
            }
          },
        });
      };
      for (let index = 0; index < selected.length && !stop; index += 5) {
        await capacity();
        let cursor = index;
        const end = Math.min(selected.length, index + 5);
        const results = await Promise.allSettled(
          workerClients.map(async (worker) => {
            while (cursor < end && !stop) {
              const track = selected[cursor++];
              try {
                await deliver(track, worker);
              } catch (error) {
                stop = true;
                throw error;
              }
            }
          }),
        );
        const failure = results.find((result) => result.status === "rejected");
        if (failure) throw failure.reason;
        console.log(
          JSON.stringify({
            event: "supabase_subset_batch_verified",
            processed: end,
            selected: selected.length,
            reservedUploadBytes: state.uploadedBytes,
            verificationEgressBytes: state.egressBytes,
            currentStoredBytes: await capacity(),
          }),
        );
      }
      if (stop) throw new Error("storage_unavailable");
      if (command === "pilot") {
        state.pilotVerified = true;
        state.pilotIds = selected.map((t) => t.id);
        await persist();
      }
      console.log(
        JSON.stringify({
          event: "supabase_subset_complete",
          command,
          verified: Object.values(state.items).filter((i) => i.state === "verified").length,
          reservedUploadBytes: state.uploadedBytes,
          verificationEgressBytes: state.egressBytes,
          approved: 0,
          published: 0,
        }),
      );
    } finally {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", interrupt);
      await Promise.allSettled(workerClients.map((worker) => worker.end()));
      await saving;
    }
  }
} catch (error) {
  console.error(
    JSON.stringify({
      event: "supabase_subset_paused",
      code: allowed.has(error.message) ? error.message : "unavailable",
      progressRetained: true,
      ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}),
    }),
  );
  process.exitCode = 1;
} finally {
  if (db) await db.end().catch(() => {});
}
