import "server-only";
import { privilegedClient } from "@/lib/supabase/admin";
import { HttpError } from "./http";
import { b2Config, b2Client, assertB2Receipt, b2SignedGet, type B2Receipt } from "@/lib/storage/b2";
import type { Track, PlaybackGrant } from "@/lib/types";

let reader: ReturnType<typeof b2Client> | undefined;
// Caller must freshly authorize publication/download rights or administrator access.
export async function audioGrant(track: Track): Promise<PlaybackGrant> {
  if (track.source.kind !== "hosted" || track.status === "retired")
    throw new HttpError(404, "not_found");
  const db = privilegedClient();
  const { data: locator, error } = await db.rpc("audio_storage_locator", { p_track_id: track.id });
  if (error || !locator || locator.unavailable) throw new HttpError(503, "unavailable");
  let url: string;
  if (locator.provider === "b2") {
    const config = b2Config("READ");
    const receipt = locator.delivery as B2Receipt;
    if (!receipt) throw new HttpError(503, "unavailable");
    if (typeof track.sha256 !== "string" || typeof track.bytes !== "number")
      throw new HttpError(503, "unavailable");
    assertB2Receipt(config, receipt, track.id, track.sha256, track.bytes);
    reader ??= b2Client(config);
    url = await b2SignedGet(reader, config, receipt);
  } else if (locator.provider === "supabase") {
    const { data, error } = await db.storage.from("audio").createSignedUrl(track.source.path, 600);
    if (error || !data) throw new HttpError(503, "unavailable");
    url = data.signedUrl;
  } else throw new HttpError(503, "unavailable");
  return {
    url,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    bytes: track.bytes,
    sha256: track.sha256,
  };
}
