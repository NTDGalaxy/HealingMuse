import { revalidateTag } from "next/cache";
import { z } from "zod";
import { body, json, requireAdmin, safeHandler, assertDb } from "@/lib/server/http";
import { localizedText, uuid } from "@/lib/validation";
export function GET() {
  return safeHandler(async () => {
    const { db } = await requireAdmin();
    const { data, error } = await db
      .from("curated_collections")
      .select("*,curated_collection_items(track_id,position)")
      .order("position");
    assertDb(error);
    return json(data);
  });
}
export function POST(request: Request) {
  return safeHandler(async () => {
    const input = await body(
      request,
      z
        .object({
          id: uuid.nullable(),
          revision: z.number().int().nonnegative(),
          title: localizedText,
          goal: z.enum(["relax", "rest", "focus"]),
          published: z.boolean(),
          trackIds: z
            .array(uuid)
            .max(100)
            .refine((ids) => new Set(ids).size === ids.length),
        })
        .strict(),
    );
    const { db } = await requireAdmin();
    const { data, error } = await db.rpc("save_collection", {
      p_id: input.id,
      p_revision: input.revision,
      p_title: input.title,
      p_goal: input.goal,
      p_published: input.published,
      p_tracks: input.trackIds,
    });
    assertDb(error);
    revalidateTag("catalog", { expire: 0 });
    return json({ id: data });
  });
}
