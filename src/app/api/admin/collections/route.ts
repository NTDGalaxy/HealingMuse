import { z } from "zod";
import { assertDb, json } from "@/lib/server/http";
import { defineRoute } from "@/lib/server/route";
import { localizedText, uuid } from "@/lib/validation";
export const GET = defineRoute({
  name: "admin-collections",
  auth: "admin",
  rateLimit: { exempt: "authenticated content administrators reading collections" },
  handler: async ({ db }) => {
    const { data, error } = await db
      .from("curated_collections")
      .select("*,curated_collection_items(track_id,position)")
      .order("position");
    assertDb(error);
    return json(data);
  },
});
export const POST = defineRoute({
  name: "admin-collections",
  auth: "admin",
  body: z
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
  rateLimit: { bucket: "admin_writes", limit: 60, per: "user" },
  revalidate: ["catalog"],
  handler: async ({ body, db }) => {
    const { data, error } = await db.rpc("save_collection", {
      p_id: body.id,
      p_revision: body.revision,
      p_title: body.title,
      p_goal: body.goal,
      p_published: body.published,
      p_tracks: body.trackIds,
    });
    assertDb(error);
    return json({ id: data });
  },
});
