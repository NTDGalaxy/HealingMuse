import { randomUUID } from "node:crypto";
import { catalogQueryInput } from "@/lib/catalog-query";
import { assertDb, HttpError, json } from "@/lib/server/http";
import { assertNotPublishing } from "@/lib/server/publication";
import { defineRoute } from "@/lib/server/route";
import { trackInput } from "@/lib/validation";
import { catalogPage, toRow } from "@/lib/server/catalog";
import type { Track } from "@/lib/types";

export const GET = defineRoute({
  name: "admin-tracks",
  auth: "admin",
  query: catalogQueryInput,
  rateLimit: { exempt: "authenticated content administrators reading the review queue" },
  handler: async ({ query, db }) => json(await catalogPage(db, query, true)),
});
export const POST = defineRoute({
  name: "admin-tracks",
  auth: "admin",
  body: trackInput,
  rateLimit: { bucket: "admin_writes", limit: 60, per: "user" },
  revalidate: ["catalog"],
  handler: async ({ body, db }) => {
    const track = { ...body, id: body.id ?? randomUUID() } as Track;
    if (track.status === "published" && !track.listeningReviewed)
      throw new HttpError(400, "invalid");
    await assertNotPublishing(db, track.id, track.status);
    if (track.source.kind === "hosted" && track.status === "published") {
      const filename = track.source.path.split("/").pop()!;
      const folder = track.source.path.includes("/")
        ? track.source.path.slice(0, track.source.path.lastIndexOf("/"))
        : "";
      const { data, error } = await db.storage.from("audio").list(folder, { search: filename });
      assertDb(error);
      if (!data?.some((file) => file.name === filename)) throw new HttpError(400, "invalid");
    }
    assertDb((await db.from("tracks").upsert(toRow(track))).error);
    return json({ id: track.id }, 201);
  },
});
