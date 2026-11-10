import { assertDb, json } from "@/lib/server/http";
import { defineRoute } from "@/lib/server/route";
import { sessionInput, sessionEnd } from "@/lib/validation";
export const POST = defineRoute({
  name: "sessions",
  auth: "user",
  body: sessionInput,
  rateLimit: { bucket: "sessions", limit: 30, per: "user" },
  handler: async ({ body, db }) => {
    const { data, error } = await db.rpc("start_listening", {
      p_track: body.trackId,
      p_score: body.beforeScore ?? null,
    });
    assertDb(error);
    return json({ id: data }, 201);
  },
});
export const PATCH = defineRoute({
  name: "sessions",
  auth: "user",
  body: sessionEnd,
  // Own bucket so listeners who skip quickly (start plus end per skip) never share one budget.
  rateLimit: { bucket: "session_end", limit: 60, per: "user" },
  handler: async ({ body, db }) => {
    assertDb(
      (
        await db.rpc("end_listening", {
          p_session: body.sessionId,
          p_score: body.afterScore ?? null,
        })
      ).error,
    );
    return json({ ok: true });
  },
});
export const DELETE = defineRoute({
  name: "sessions",
  auth: "user",
  rateLimit: { bucket: "personal", limit: 60, per: "user" },
  handler: async ({ db, user }) => {
    assertDb((await db.from("listening_sessions").delete().eq("owner_id", user.id)).error);
    return json({ ok: true });
  },
});
