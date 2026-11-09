import { assertDb, json } from "@/lib/server/http";
import { defineRoute } from "@/lib/server/route";
import { favoriteInput } from "@/lib/validation";
export const POST = defineRoute({
  name: "favorites",
  auth: "user",
  body: favoriteInput,
  rateLimit: { bucket: "personal", limit: 60, per: "user" },
  handler: async ({ body, db, user }) => {
    const result = body.saved
      ? await db
          .from("favorites")
          .upsert({ owner_id: user.id, track_id: body.trackId }, { ignoreDuplicates: true })
      : await db.from("favorites").delete().eq("owner_id", user.id).eq("track_id", body.trackId);
    assertDb(result.error);
    return json({ ok: true });
  },
});
