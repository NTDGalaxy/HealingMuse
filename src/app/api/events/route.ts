import { z } from "zod";
import { json } from "@/lib/server/http";
import { defineRoute } from "@/lib/server/route";
import { isConfigured } from "@/lib/supabase/config";
export const POST = defineRoute({
  name: "events",
  auth: "public",
  body: z
    .object({
      event: z.enum(["playback_failed", "authentication_failed", "synchronization_failed"]),
    })
    .strict(),
  rateLimit: () =>
    isConfigured
      ? { bucket: "events", limit: 20, per: "ip" }
      : { exempt: "the unconfigured preview has no rate limiter" },
  handler: async ({ body }) => {
    console.info(JSON.stringify({ event: body.event }));
    return json({ ok: true });
  },
});
