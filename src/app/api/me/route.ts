import { z } from "zod";
import { assertDb, json } from "@/lib/server/http";
import { defineRoute } from "@/lib/server/route";
import { profileInput } from "@/lib/validation";
import { privilegedClient } from "@/lib/supabase/admin";

export const GET = defineRoute({
  name: "me",
  auth: "user",
  rateLimit: { exempt: "reads only the verified caller's own rows" },
  handler: async ({ db, user }) => {
    const results = await Promise.all([
      db
        .from("profiles")
        .select("id, locale, calm_mode, mood_consent_at")
        .eq("id", user.id)
        .single(),
      db.from("favorites").select("track_id").eq("owner_id", user.id),
      db
        .from("playlists")
        .select("id, title, revision, playlist_items(track_id,position)")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }),
      db
        .from("mood_checkins")
        .select("id, session_id, phase, score, created_at")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1000),
      db.rpc("is_content_admin"),
    ]);
    for (const result of results) assertDb(result.error);
    return json({
      profile: results[0].data,
      favorites: results[1].data?.map((x) => x.track_id) ?? [],
      playlists:
        results[2].data?.map((p) => ({
          id: p.id,
          title: p.title,
          revision: p.revision,
          trackIds: p.playlist_items.sort((a, b) => a.position - b.position).map((i) => i.track_id),
        })) ?? [],
      checkins: results[3].data ?? [],
      isAdmin: results[4].data === true,
    });
  },
});
export const PATCH = defineRoute({
  name: "me",
  auth: "user",
  body: profileInput,
  rateLimit: { bucket: "personal", limit: 60, per: "user" },
  handler: async ({ body, db, user }) => {
    if (body.moodConsent !== undefined)
      assertDb((await db.rpc("set_mood_consent", { p_consent: body.moodConsent })).error);
    const changes = {
      ...(body.locale ? { locale: body.locale } : {}),
      ...(body.calmMode !== undefined ? { calm_mode: body.calmMode } : {}),
    };
    if (Object.keys(changes).length)
      assertDb((await db.from("profiles").update(changes).eq("id", user.id)).error);
    return json({ ok: true });
  },
});
export const DELETE = defineRoute({
  name: "me",
  auth: "user",
  body: z.object({ confirmation: z.literal("DELETE") }).strict(),
  rateLimit: { bucket: "account_delete", limit: 5, per: "user" },
  handler: async ({ db, user }) => {
    // The privileged deletion target is always the freshly verified caller.
    const { error } = await privilegedClient().auth.admin.deleteUser(user.id);
    assertDb(error);
    await db.auth.signOut({ scope: "local" });
    return json({ ok: true });
  },
});
