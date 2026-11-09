import { z } from "zod";
import { assertDb, json } from "@/lib/server/http";
import { defineRoute } from "@/lib/server/route";
import { playlistEdit, uuid } from "@/lib/validation";
const params = z.object({ id: uuid });
export const PATCH = defineRoute({
  name: "playlist",
  auth: "user",
  params,
  body: playlistEdit,
  rateLimit: { bucket: "personal", limit: 60, per: "user" },
  handler: async ({ params: { id }, body, db }) => {
    assertDb(
      (
        await db.rpc("save_playlist", {
          p_id: id,
          p_revision: body.revision,
          p_title: body.title,
          p_tracks: body.trackIds,
        })
      ).error,
    );
    return json({ ok: true });
  },
});
export const DELETE = defineRoute({
  name: "playlist",
  auth: "user",
  params,
  rateLimit: { bucket: "personal", limit: 60, per: "user" },
  handler: async ({ params: { id }, db, user }) => {
    assertDb((await db.from("playlists").delete().eq("id", id).eq("owner_id", user.id)).error);
    return json({ ok: true });
  },
});
