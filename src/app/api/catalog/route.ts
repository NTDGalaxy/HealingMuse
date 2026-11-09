import { getCatalogPage } from "@/lib/server/catalog";
import { HttpError, json } from "@/lib/server/http";
import { defineRoute } from "@/lib/server/route";
import { catalogQueryInput, decodeCursor } from "@/lib/catalog-query";
export const dynamic = "force-dynamic";
export const GET = defineRoute({
  name: "catalog",
  auth: "public",
  query: catalogQueryInput,
  rateLimit: { exempt: "public catalogue reads are served from the 60 s data cache" },
  handler: async ({ query }) => {
    if (query.status) throw new HttpError(400, "invalid");
    try {
      decodeCursor(query.cursor);
    } catch {
      throw new HttpError(400, "invalid");
    }
    return json(await getCatalogPage(query));
  },
});
