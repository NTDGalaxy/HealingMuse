import { body, json, safeHandler, requireUser, assertDb, rateLimit } from "@/lib/server/http";
import { playlistCreate } from "@/lib/validation";
export function POST(request: Request) {
  return safeHandler(async () => {
    const input = await body(request, playlistCreate);
    const { db, user } = await requireUser(request);
    await rateLimit(request, "personal", 60, user.id);
    const { data, error } = await db
      .from("playlists")
      .insert({ owner_id: user.id, title: input.title })
      .select("id")
      .single();
    assertDb(error);
    return json(data, 201);
  });
}
