import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { cancellableWebStream } from "@/lib/node-readable-stream";
import { getTrack, localCatalogEnabled } from "@/lib/server/catalog";
import { HttpError } from "@/lib/server/http";
import { defineRoute } from "@/lib/server/route";
import { parseRange } from "@/lib/audio";
import { uuid } from "@/lib/validation";
export const runtime = "nodejs";
const audio = (head: boolean) =>
  defineRoute({
    name: "local-audio",
    auth: "public",
    params: z.object({ id: uuid }),
    rateLimit: { exempt: "served only by the isolated local preview, disabled in production" },
    handler: async ({ request, params }) => {
      if (!localCatalogEnabled()) throw new HttpError(404, "not_found");
      const track = await getTrack(params.id);
      if (!track || track.source.kind !== "hosted") throw new HttpError(404, "not_found");
      const path = join(process.cwd(), "media/prepared", track.source.path);
      const file = await stat(path);
      const range = parseRange(request.headers.get("range"), file.size);
      if (range === "invalid")
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${file.size}`, "Cache-Control": "no-store" },
        });
      const start = range?.start ?? 0;
      const end = range?.end ?? file.size - 1;
      const headers = {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${file.size}` } : {}),
      };
      const stream = head ? null : cancellableWebStream(createReadStream(path, { start, end }));
      return new Response(stream, { status: range ? 206 : 200, headers });
    },
  });
export const GET = audio(false);
export const HEAD = audio(true);
