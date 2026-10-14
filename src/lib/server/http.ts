import "server-only";
import { createHash } from "node:crypto";
import type { ZodType } from "zod";
import { serverClient } from "@/lib/supabase/server";
import { privilegedClient } from "@/lib/supabase/admin";
import type { ApiErrorCode } from "@/lib/types";
import { hasSameOrigin } from "@/lib/request-origin";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode,
  ) {
    super(code);
  }
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
  });
}
export function safeHandler(fn: () => Promise<Response>) {
  return fn().catch((error: unknown) => {
    if (error instanceof HttpError) return json({ error: { code: error.code } }, error.status);
    // No request bodies, patient values, emails, tokens, or database messages.
    console.error(JSON.stringify({ event: "request_failed", code: "unavailable" }));
    return json({ error: { code: "unavailable" } }, 503);
  });
}
export function assertSameOrigin(request: Request) {
  if (!hasSameOrigin(request)) throw new HttpError(403, "forbidden");
}
export async function body<T>(request: Request, schema: ZodType<T>): Promise<T> {
  assertSameOrigin(request);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(400, "invalid");
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 32_768) throw new HttpError(413, "invalid");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "invalid");
  const decoder = new TextDecoder();
  let bytes = 0;
  let raw = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 32_768) {
        await reader.cancel();
        throw new HttpError(413, "invalid");
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    const result = schema.safeParse(JSON.parse(raw));
    if (!result.success) throw new HttpError(400, "invalid");
    return result.data;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "invalid");
  }
}
export async function requireUser(request?: Request) {
  const db = await serverClient();
  if (!db) throw new HttpError(503, "unavailable");
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "unauthorized");
  const expected = request?.headers.get("X-HealingMuse-Account");
  if (expected && expected !== data.user.id) throw new HttpError(403, "forbidden");
  return { db, user: data.user };
}
export async function requireAdmin() {
  const context = await requireUser();
  const { data, error } = await context.db.rpc("is_content_admin");
  if (error || data !== true) throw new HttpError(403, "forbidden");
  return context;
}
export function assertDb(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "40001") throw new HttpError(409, "conflict");
  if (error.code === "22023" || error.code === "23514" || error.code === "23503")
    throw new HttpError(400, "invalid");
  if (error.code === "42501")
    throw new HttpError(
      403,
      error.message === "consent_required" ? "consent_required" : "forbidden",
    );
  throw new HttpError(503, "unavailable");
}
export async function rateLimit(request: Request, bucket: string, limit: number, owner?: string) {
  const identity =
    owner ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "guest";
  const key = createHash("sha256")
    .update(`${process.env.RATE_LIMIT_SALT ?? process.env.SUPABASE_SECRET_KEY}:${identity}`)
    .digest("hex");
  const { data, error } = await privilegedClient().rpc("consume_rate_limit", {
    p_key: key,
    p_bucket: bucket,
    p_limit: limit,
    p_seconds: 60,
  });
  if (error) throw new HttpError(503, "unavailable");
  if (!data) throw new HttpError(429, "rate_limited");
}
