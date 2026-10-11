import { revalidateTag } from "next/cache";
import { z } from "zod";
import { body, json, safeHandler, requireAdmin, assertDb } from "@/lib/server/http";

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

export function POST(request: Request) {
  return safeHandler(async () => {
    const input = await body(request, publication);
    const { db } = await requireAdmin();
    const { data, error } = await db.rpc("publish_catalogue_release", {
      p_release_id: input.releaseId,
      p_manifest_hash: input.manifestHash,
      p_reviewer_name: input.reviewerName,
      p_attestation_version: input.attestationVersion,
    });
    assertDb(error);
    revalidateTag("catalog", { expire: 0 });
    return json(data);
  });
}
