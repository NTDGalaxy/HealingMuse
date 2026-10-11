import { json, safeHandler, requireAdmin, assertDb } from "@/lib/server/http";

export function GET() {
  return safeHandler(async () => {
    const { db } = await requireAdmin();
    const { data, error } = await db.rpc("catalogue_release_summary");
    assertDb(error);
    return json({ items: data });
  });
}
