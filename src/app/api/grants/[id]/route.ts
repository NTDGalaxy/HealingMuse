import { stat } from "node:fs/promises";
import { join } from "node:path";
import { getTrack, localCatalogEnabled } from "@/lib/server/catalog";
import { HttpError, json, safeHandler, rateLimit } from "@/lib/server/http";
import { audioGrant } from "@/lib/server/audio-storage";
import { uuid } from "@/lib/validation";
export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return safeHandler(async () => {
    const { id } = await context.params;
    if (!uuid.safeParse(id).success) throw new HttpError(404, "not_found");
    const track = await getTrack(id);
    if (!track || track.source.kind !== "hosted") throw new HttpError(404, "not_found");
    const download = new URL(request.url).searchParams.get("download") === "1";
    if (download && !track.downloadAllowed) throw new HttpError(403, "forbidden");
    if (localCatalogEnabled()) {
      await stat(join(process.cwd(), "media/prepared", track.source.path));
      return json({
        url: `/api/local-audio/${id}`,
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        bytes: track.bytes,
        sha256: track.sha256,
      });
    }
    // A clinic can share one public IP across all 25 concurrent listeners.
    await rateLimit(
      request,
      download ? "download_grants" : "playback_grants",
      download ? 150 : 300,
    );
    // Track lookup uses publication RLS before any privileged URL issuance.
    return json(await audioGrant(track));
  });
}
