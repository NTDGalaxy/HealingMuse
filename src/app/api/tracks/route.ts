import { z } from "zod";
import { getTracksByIds } from "@/lib/server/catalog";
import { uuid } from "@/lib/validation";
import { HttpError, json } from "@/lib/server/http";
import { defineRoute } from "@/lib/server/route";
export const GET = defineRoute({
  name: "tracks",
  auth: "public",
  query: z.object({ ids: z.string() }),
  rateLimit: { exempt: "public catalogue reads are served from the 60 s data cache" },
  handler: async ({ query }) => {
    const ids = query.ids.split(",");
    if (ids.length > 100 || ids.some((id) => !uuid.safeParse(id).success))
      throw new HttpError(400, "invalid");
    return json(await getTracksByIds([...new Set(ids)]));
  },
});
