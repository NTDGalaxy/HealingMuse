import { assertDb, HttpError, json, safeHandler, requireAdmin } from "@/lib/server/http";
import { privilegedClient } from "@/lib/supabase/admin";
import { fromRow } from "@/lib/server/catalog";
import { uuid } from "@/lib/validation";
export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return safeHandler(async () => {
    const { db } = await requireAdmin();
    const { id } = await context.params;
    if (!uuid.safeParse(id).success) throw new HttpError(404, "not_found");
    const result = await db.from("tracks").select("*").eq("id", id).single();
    assertDb(result.error);
    const track = fromRow(result.data);
    if (track.source.kind !== "hosted" || track.status === "retired")
      throw new HttpError(404, "not_found");
    const { data, error } = await privilegedClient()
      .storage.from("audio")
      .createSignedUrl(track.source.path, 300);
    assertDb(error);
    return json({ url: data?.signedUrl, expiresAt: new Date(Date.now() + 300_000).toISOString() });
  });
}
