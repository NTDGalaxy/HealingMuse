import {
  assertSameOrigin,
  body,
  json,
  safeHandler,
  requireUser,
  assertDb,
  rateLimit,
} from "@/lib/server/http";
import { sessionInput, sessionEnd } from "@/lib/validation";
export function POST(request: Request) {
  return safeHandler(async () => {
    const input = await body(request, sessionInput);
    const { db, user } = await requireUser(request);
    await rateLimit(request, "sessions", 30, user.id);
    const { data, error } = await db.rpc("start_listening", {
      p_track: input.trackId,
      p_score: input.beforeScore ?? null,
    });
    assertDb(error);
    return json({ id: data }, 201);
  });
}
export function PATCH(request: Request) {
  return safeHandler(async () => {
    const input = await body(request, sessionEnd);
    const { db } = await requireUser(request);
    assertDb(
      (
        await db.rpc("end_listening", {
          p_session: input.sessionId,
          p_score: input.afterScore ?? null,
        })
      ).error,
    );
    return json({ ok: true });
  });
}
export function DELETE(request: Request) {
  return safeHandler(async () => {
    assertSameOrigin(request);
    const { db, user } = await requireUser(request);
    assertDb((await db.from("listening_sessions").delete().eq("owner_id", user.id)).error);
    return json({ ok: true });
  });
}
