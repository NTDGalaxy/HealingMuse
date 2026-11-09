import { z } from "zod";
import { assertDb, HttpError, json } from "@/lib/server/http";
import { audioGrant } from "@/lib/server/audio-storage";
import { fromRow } from "@/lib/server/catalog";
import { defineRoute } from "@/lib/server/route";
import { uuid } from "@/lib/validation";
export const GET = defineRoute({
  name: "admin-preview",
  auth: "admin",
  params: z.object({ id: uuid }),
  rateLimit: { exempt: "authenticated content administrators previewing review audio" },
  handler: async ({ params, db }) => {
    const result = await db.from("tracks").select("*").eq("id", params.id).maybeSingle();
    assertDb(result.error);
    if (!result.data) throw new HttpError(404, "not_found");
    const track = fromRow(result.data);
    if (track.source.kind !== "hosted" || track.status === "retired")
      throw new HttpError(404, "not_found");
    return json(await audioGrant(track));
  },
});
