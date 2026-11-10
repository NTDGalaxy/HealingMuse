import { assertDb, json } from "@/lib/server/http";
import { defineRoute } from "@/lib/server/route";
import { playlistCreate } from "@/lib/validation";
export const POST = defineRoute({
  name: "playlists",
  auth: "user",
  body: playlistCreate,
  rateLimit: { bucket: "personal", limit: 60, per: "user" },
  handler: async ({ body, db, user }) => {
    const { data, error } = await db
      .from("playlists")
      .insert({ owner_id: user.id, title: body.title })
      .select("id")
      .single();
    assertDb(error);
    return json(data, 201);
  },
});
