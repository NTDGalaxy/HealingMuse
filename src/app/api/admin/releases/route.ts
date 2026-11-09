import { assertDb, json } from "@/lib/server/http";
import { defineRoute } from "@/lib/server/route";
export const GET = defineRoute({
  name: "admin-releases",
  auth: "admin",
  rateLimit: { exempt: "authenticated content administrators reading release summaries" },
  handler: async ({ db }) => {
    const { data, error } = await db.rpc("catalogue_release_summary");
    assertDb(error);
    return json({ items: data });
  },
});
