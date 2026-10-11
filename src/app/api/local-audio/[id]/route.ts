import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { cancellableWebStream } from "@/lib/node-readable-stream";
import { getTrack, localCatalogEnabled } from "@/lib/server/catalog";
import { HttpError, safeHandler } from "@/lib/server/http";
import { parseRange } from "@/lib/audio";
import { uuid } from "@/lib/validation";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
function respond(request: Request, context: Context, head = false) {
  return safeHandler(async () => {
    if (!localCatalogEnabled()) throw new HttpError(404, "not_found");
    const { id } = await context.params;
    if (!uuid.safeParse(id).success) throw new HttpError(404, "not_found");
    const track = await getTrack(id);
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
  });
}
export const GET = (request: Request, context: Context) => respond(request, context);
export const HEAD = (request: Request, context: Context) => respond(request, context, true);
