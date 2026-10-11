import { z } from "zod";
import { body, json, rateLimit, safeHandler } from "@/lib/server/http";
import { isConfigured } from "@/lib/supabase/config";
export function POST(request: Request) {
  return safeHandler(async () => {
    const input = await body(
      request,
      z
        .object({
          event: z.enum(["playback_failed", "authentication_failed", "synchronization_failed"]),
        })
        .strict(),
    );
    if (isConfigured) await rateLimit(request, "events", 20);
    console.info(JSON.stringify({ event: input.event }));
    return json({ ok: true });
  });
}
