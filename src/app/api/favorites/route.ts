import { body, json, safeHandler, requireUser, assertDb, rateLimit } from "@/lib/server/http";
import { favoriteInput } from "@/lib/validation";
export function POST(request: Request) {
  return safeHandler(async () => {
    const input = await body(request, favoriteInput);
    const { db, user } = await requireUser(request);
    await rateLimit(request, "personal", 60, user.id);
    const result = input.saved
      ? await db
          .from("favorites")
          .upsert({ owner_id: user.id, track_id: input.trackId }, { ignoreDuplicates: true })
      : await db.from("favorites").delete().eq("owner_id", user.id).eq("track_id", input.trackId);
    assertDb(result.error);
    return json({ ok: true });
  });
}
