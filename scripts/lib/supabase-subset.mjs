import { createHash } from "node:crypto";

export const canonical = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
export const hashJson = (value) => createHash("sha256").update(canonical(value)).digest("hex");

export function subsetLimits(evidence, now = Date.now()) {
  const checkedAt = Date.parse(evidence?.checkedAt);
  if (
    evidence?.version !== 1 ||
    evidence.plan !== "free" ||
    evidence.freeOnly !== true ||
    evidence.organizationProjects !== 1 ||
    evidence.otherProjectStorageBytes !== 0 ||
    !Number.isSafeInteger(evidence.organizationStorageBytes) ||
    evidence.organizationStorageBytes < 0 ||
    !Number.isSafeInteger(evidence.globalFileLimitBytes) ||
    evidence.globalFileLimitBytes <= 0 ||
    evidence.globalFileLimitBytes > 52_428_800 ||
    !Number.isSafeInteger(evidence.egressBudgetBytes) ||
    evidence.egressBudgetBytes <= 0 ||
    evidence.egressBudgetBytes > 4_000_000_000 ||
    !Number.isFinite(checkedAt) ||
    checkedAt > now ||
    now - checkedAt > 86_400_000
  )
    throw new Error("account_limits_unconfirmed");
  return {
    uploadBytes: Math.min(
      750_000_000,
      Math.max(0, 1_000_000_000 - evidence.organizationStorageBytes - 200_000_000),
    ),
    maximumStoredBytes: 800_000_000,
    fileBytes: Math.min(50_000_000, evidence.globalFileLimitBytes),
    egressBytes: evidence.egressBudgetBytes,
    validUntil: checkedAt + 86_400_000,
  };
}

export function subsetTracks(catalogue, selection) {
  const { selectionHash, ...payload } = selection;
  if (
    hashJson(payload) !== selectionHash ||
    selection.inputs?.catalogueSha256 !== hashJson(catalogue)
  )
    throw new Error("selection_changed");
  const ids = selection.items
    .filter((row) => row.status === "selected_provisional")
    .map((row) => row.recordingId);
  const byId = new Map(catalogue.map((track) => [track.id, track]));
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error("selection_changed");
  return ids.map((id) => {
    const track = byId.get(id);
    const row = selection.items.find((item) => item.recordingId === id);
    if (
      !track ||
      track.status === "retired" ||
      track.source.kind !== "hosted" ||
      track.sha256 !== row.sha256 ||
      track.bytes !== row.originalFileBytes ||
      track.source.path !== row.expectedSupabaseObjectPath
    )
      throw new Error("selection_changed");
    return track;
  });
}

export async function deliverSubsetTrack({
  track,
  audio,
  checkpoint = /** @type {Record<string, unknown> | undefined} */ (undefined),
  inspect,
  upload,
  download,
  assertCapacity,
  reserve,
  save,
  record,
  confirmMissing = async () => false,
}) {
  if (
    audio.length !== track.bytes ||
    createHash("sha256").update(audio).digest("hex") !== track.sha256
  )
    throw new Error("local_integrity_mismatch");
  if (
    checkpoint &&
    (checkpoint.sha256 !== track.sha256 ||
      checkpoint.bytes !== track.bytes ||
      checkpoint.path !== track.source.path)
  )
    throw new Error("checkpoint_mismatch");
  let object = await inspect();
  if (checkpoint?.state === "verified") {
    if (
      !object ||
      object.id !== checkpoint.objectId ||
      object.updatedAt !== checkpoint.objectUpdatedAt ||
      object.bytes !== track.bytes
    )
      throw new Error("remote_version_mismatch");
    await record(object);
    return checkpoint;
  }
  // Reserve all verification egress before a new write; never automatically retry a GET.
  if (checkpoint?.state !== "retry_ready") await reserve("egress", track.bytes);
  if (!object) {
    if (checkpoint?.state === "writing") throw new Error("uncertain_write");
    await assertCapacity(track.bytes);
    if (checkpoint?.state !== "retry_ready") await reserve("upload", track.bytes);
    await save({
      state: "writing",
      path: track.source.path,
      sha256: track.sha256,
      bytes: track.bytes,
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await upload(audio);
        break;
      } catch (error) {
        object = await inspect();
        if (object) break;
        if (
          attempt === 2 ||
          error.diagnostic?.transportFailure !== true ||
          error.diagnostic?.quotaIndicated ||
          error.diagnostic?.authorizationIndicated ||
          !(await confirmMissing())
        )
          throw error;
        await assertCapacity(track.bytes);
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
    object ??= await inspect();
  }
  if (!object || object.bytes !== track.bytes) throw new Error("remote_version_mismatch");
  await save({
    state: "uploaded",
    path: track.source.path,
    sha256: track.sha256,
    bytes: track.bytes,
    objectId: object.id,
    objectUpdatedAt: object.updatedAt,
  });
  const stored = await download();
  if (
    stored.length !== track.bytes ||
    createHash("sha256").update(stored).digest("hex") !== track.sha256
  )
    throw new Error("remote_integrity_mismatch");
  const current = await inspect();
  if (
    !current ||
    current.id !== object.id ||
    current.updatedAt !== object.updatedAt ||
    current.bytes !== object.bytes
  )
    throw new Error("remote_version_mismatch");
  const verified = {
    state: "verified",
    path: track.source.path,
    sha256: track.sha256,
    bytes: track.bytes,
    objectId: object.id,
    objectUpdatedAt: object.updatedAt,
    verifiedAt: new Date().toISOString(),
  };
  await save(verified);
  await record(object);
  return verified;
}
