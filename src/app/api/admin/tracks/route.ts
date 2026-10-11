import { revalidateTag } from "next/cache";
import { catalogQueryInput, decodeCursor, encodeCursor } from "@/lib/catalog-query";
import { randomUUID } from "node:crypto";
import { body, json, safeHandler, requireAdmin, assertDb, HttpError } from "@/lib/server/http";
import { trackInput } from "@/lib/validation";
import { fromRow, toRow } from "@/lib/server/catalog";
import type { Track } from "@/lib/types";

export function GET(request: Request) {
  return safeHandler(async () => {
    const { db } = await requireAdmin();
    const parsed = catalogQueryInput.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) throw new HttpError(400, "invalid");
    let cursor;
    try {
      cursor = decodeCursor(parsed.data.cursor);
    } catch {
      throw new HttpError(400, "invalid");
    }
    const { data, error } = await db.rpc("catalog_page", {
      p_query: { ...parsed.data, after_position: cursor?.position, after_id: cursor?.id },
      p_admin: true,
    });
    assertDb(error);
    const items = (data.items as Record<string, unknown>[]).map(fromRow);
    return json({
      items,
      total: data.total,
      nextCursor: data.hasMore && items.length ? encodeCursor(items[items.length - 1]) : null,
    });
  });
}
export function POST(request: Request) {
  return safeHandler(async () => {
    const input = await body(request, trackInput);
    const { db } = await requireAdmin();
    const track = { ...input, id: input.id ?? randomUUID() } as Track;
    if (track.status === "published" && !track.listeningReviewed)
      throw new HttpError(400, "invalid");
    if (track.source.kind === "hosted" && track.status === "published") {
      const filename = track.source.path.split("/").pop()!;
      const folder = track.source.path.includes("/")
        ? track.source.path.slice(0, track.source.path.lastIndexOf("/"))
        : "";
      const { data, error } = await db.storage.from("audio").list(folder, { search: filename });
      assertDb(error);
      if (!data?.some((file) => file.name === filename)) throw new HttpError(400, "invalid");
    }
    assertDb((await db.from("tracks").upsert(toRow(track))).error);
    revalidateTag("catalog", { expire: 0 });
    return json({ id: track.id }, 201);
  });
}
