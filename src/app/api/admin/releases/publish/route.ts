import { z } from "zod";
import { assertDb, json } from "@/lib/server/http";
import { defineRoute } from "@/lib/server/route";

const publication = z
  .object({
    releaseId: z.uuid(),
    manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
    reviewerName: z.string().trim().min(1).max(120),
    attestationVersion: z.literal("human-review-v1"),
    listeningConfirmed: z.literal(true),
    rightsConfirmed: z.literal(true),
    provenanceConfirmed: z.literal(true),
  })
  .strict();

export const POST = defineRoute({
  name: "admin-release-publish",
  auth: "admin",
  body: publication,
  rateLimit: { bucket: "admin_writes", limit: 60, per: "user" },
  revalidate: ["catalog"],
  handler: async ({ body, db }) => {
    const { data, error } = await db.rpc("publish_catalogue_release", {
      p_release_id: body.releaseId,
      p_manifest_hash: body.manifestHash,
      p_reviewer_name: body.reviewerName,
      p_attestation_version: body.attestationVersion,
    });
    assertDb(error);
    return json(data);
  },
});
