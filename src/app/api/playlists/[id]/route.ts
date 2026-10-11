import {
  assertSameOrigin,
  body,
  json,
  safeHandler,
  requireUser,
  assertDb,
  HttpError,
  rateLimit,
} from "@/lib/server/http";
import { playlistEdit, uuid } from "@/lib/validation";
type Context = { params: Promise<{ id: string }> };
export function PATCH(request: Request, context: Context) {
  return safeHandler(async () => {
    const { id } = await context.params;
    if (!uuid.safeParse(id).success) throw new HttpError(404, "not_found");
    const input = await body(request, playlistEdit);
    const { db, user } = await requireUser(request);
    await rateLimit(request, "personal", 60, user.id);
    assertDb(
      (
        await db.rpc("save_playlist", {
          p_id: id,
          p_revision: input.revision,
          p_title: input.title,
          p_tracks: input.trackIds,
        })
      ).error,
    );
    return json({ ok: true });
  });
}
export function DELETE(request: Request, context: Context) {
  return safeHandler(async () => {
    assertSameOrigin(request);
    const { id } = await context.params;
    if (!uuid.safeParse(id).success) throw new HttpError(404, "not_found");
    const { db, user } = await requireUser(request);
    assertDb((await db.from("playlists").delete().eq("id", id).eq("owner_id", user.id)).error);
    return json({ ok: true });
  });
}
