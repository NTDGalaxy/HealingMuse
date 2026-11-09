import { stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { getTrack, localCatalogEnabled } from "@/lib/server/catalog";
import { HttpError, json } from "@/lib/server/http";
import { audioGrant } from "@/lib/server/audio-storage";
import { defineRoute } from "@/lib/server/route";
import { uuid } from "@/lib/validation";
const isDownload = (query: { download?: string }) => query.download === "1";
export const GET = defineRoute({
  name: "grants",
  auth: "public",
  params: z.object({ id: uuid }),
  query: z.object({ download: z.string().optional() }),
  // Limit before the uncached track lookup so rejected floods never reach Postgres.
  // A clinic can share one public IP across all 25 concurrent listeners.
  rateLimit: ({ query }) =>
    localCatalogEnabled()
      ? { exempt: "the isolated local preview has no rate limiter" }
      : isDownload(query)
        ? { bucket: "download_grants", limit: 150, per: "ip" }
        : { bucket: "playback_grants", limit: 300, per: "ip" },
  handler: async ({ params, query }) => {
    const track = await getTrack(params.id);
    if (!track || track.source.kind !== "hosted") throw new HttpError(404, "not_found");
    if (isDownload(query) && !track.downloadAllowed) throw new HttpError(403, "forbidden");
    if (localCatalogEnabled()) {
      await stat(join(process.cwd(), "media/prepared", track.source.path));
      return json({
        url: `/api/local-audio/${params.id}`,
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        bytes: track.bytes,
        sha256: track.sha256,
      });
    }
    // Track lookup uses publication RLS before any privileged URL issuance.
    return json(await audioGrant(track));
  },
});
