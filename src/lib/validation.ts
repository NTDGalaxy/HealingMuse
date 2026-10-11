import { z } from "zod";

export const uuid = z.uuid();
export const localizedText = z
  .object({ vi: z.string().trim().min(1).max(160), en: z.string().trim().min(1).max(160) })
  .strict();
const safeUrl = z
  .url()
  .refine((value) => new URL(value).protocol === "https:", "HTTPS is required");
export const trackSource = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("hosted"),
      path: z
        .string()
        .regex(/^[a-zA-Z0-9][a-zA-Z0-9_/-]*\.mp3$/)
        .max(180)
        .refine((p) => !p.includes("..")),
    })
    .strict(),
  z
    .object({ kind: z.literal("youtube"), videoId: z.string().regex(/^[a-zA-Z0-9_-]{11}$/) })
    .strict(),
  z
    .object({
      kind: z.literal("spotify_link"),
      url: safeUrl.refine((u) => new URL(u).hostname === "open.spotify.com"),
    })
    .strict(),
]);
export const trackInput = z
  .object({
    id: uuid.optional(),
    title: localizedText,
    description: z.object({ vi: z.string().max(600), en: z.string().max(600) }).strict(),
    artist: z.string().trim().min(1).max(120),
    category: z.enum(["instrumental", "nature"]),
    genres: z
      .array(z.string().regex(/^[a-z][a-z-]{0,39}$/))
      .max(10)
      .default([]),
    instruments: z
      .array(z.string().regex(/^[a-z][a-z-]{0,39}$/))
      .max(10)
      .default([]),
    traditions: z
      .array(z.string().regex(/^[a-z][a-z-]{0,39}$/))
      .max(10)
      .default([]),
    listeningReviewed: z.boolean().default(false),
    goals: z
      .array(z.enum(["relax", "rest", "focus"]))
      .min(1)
      .max(3),
    duration: z.number().int().positive().max(14400),
    source: trackSource,
    downloadAllowed: z.boolean(),
    artwork: z.enum(["forest", "rain", "sea", "piano", "river", "night"]),
    color: z.enum(["sage", "sand", "blue", "lavender", "rose"]),
    attribution: z.string().trim().min(1).max(1000),
    license: z.string().trim().min(1).max(80),
    licenseUrl: safeUrl,
    provenanceUrl: safeUrl,
    status: z.enum(["draft", "published", "retired"]),
    rightsVerified: z.boolean(),
    humanCreated: z.boolean(),
    position: z.number().int().min(0).max(10000),
    bytes: z.number().int().positive().optional(),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    changes: z.string().max(600).optional(),
  })
  .strict()
  .superRefine((t, ctx) => {
    if (t.source.kind !== "hosted" && t.downloadAllowed)
      ctx.addIssue({
        code: "custom",
        path: ["downloadAllowed"],
        message: "External media cannot be downloaded",
      });
    if (t.status === "published" && (!t.rightsVerified || !t.humanCreated))
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Publishing requires rights and provenance review",
      });
  });
export const playlistCreate = z.object({ title: z.string().trim().min(1).max(80) }).strict();
export const playlistEdit = z
  .object({
    revision: z.number().int().nonnegative(),
    title: z.string().trim().min(1).max(80),
    trackIds: z
      .array(uuid)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();
export const favoriteInput = z.object({ trackId: uuid, saved: z.boolean() }).strict();
export const profileInput = z
  .object({
    locale: z.enum(["vi", "en"]).optional(),
    calmMode: z.boolean().optional(),
    moodConsent: z.boolean().optional(),
  })
  .strict();
export const sessionInput = z
  .object({ trackId: uuid, beforeScore: z.number().int().min(1).max(5).optional() })
  .strict();
export const sessionEnd = z
  .object({ sessionId: uuid, afterScore: z.number().int().min(1).max(5).optional() })
  .strict();

export function capabilities(source: z.infer<typeof trackSource>, downloadAllowed: boolean) {
  return {
    inlineAudio: source.kind === "hosted",
    embeddedVideo: source.kind === "youtube",
    externalLink: source.kind === "spotify_link",
    download: source.kind === "hosted" && downloadAllowed,
  };
}
