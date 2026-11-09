import { json } from "@/lib/server/http";
import { getCollections } from "@/lib/server/catalog";
import { defineRoute } from "@/lib/server/route";
export const GET = defineRoute({
  name: "collections",
  auth: "public",
  rateLimit: { exempt: "public collection reads are served from the 60 s data cache" },
  handler: async () => json(await getCollections()),
});
