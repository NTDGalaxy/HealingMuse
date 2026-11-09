import "server-only";
import { revalidateTag } from "next/cache";
import type { User } from "@supabase/supabase-js";
import type { ZodType } from "zod";
import {
  assertSameOrigin,
  body as readBody,
  HttpError,
  rateLimit,
  requireAdmin,
  requireUser,
  safeHandler,
} from "./http";

type Auth = "public" | "user" | "admin";
type Db = Awaited<ReturnType<typeof requireUser>>["db"];

/** Every route states its rate-limit stance: a rule, or an exemption with its reason. */
export type RateRule = { bucket: string; limit: number; per: "user" | "ip" } | { exempt: string };

type Input<P, B, Q> = { request: Request; params: P; body: B; query: Q };
type Identity<A extends Auth> = A extends "public" ? object : { db: Db; user: User };

export type RouteDefinition<A extends Auth, P, B, Q> = {
  /** Fixed, data-free route name for logs. */
  name: string;
  auth: A;
  /** Path parameters; a failed parse is a 404, like an unknown resource. */
  params?: ZodType<P>;
  /** JSON body via body(): same origin, JSON content type, 32 KB cap, strict schema. */
  body?: ZodType<B>;
  /** Search parameters; a failed parse is a 400. */
  query?: ZodType<Q>;
  rateLimit: RateRule | ((input: Input<P, B, Q>) => RateRule);
  /** Cache tags revalidated after a successful handler. */
  revalidate?: readonly "catalog"[];
  handler: (input: Input<P, B, Q> & Identity<A>) => Promise<Response>;
};

type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

/**
 * One request pipeline for every API route, in a fixed order:
 * same origin (every method except GET and HEAD), params (404), body or query (400),
 * authentication, rate limit, handler, cache revalidation. Errors map through safeHandler.
 */
export function defineRoute<A extends Auth, P = undefined, B = undefined, Q = undefined>(
  definition: RouteDefinition<A, P, B, Q>,
) {
  return (request: Request, context?: RouteContext) =>
    safeHandler(async () => {
      const method = request.method.toUpperCase();
      if (method !== "GET" && method !== "HEAD") assertSameOrigin(request);
      let params = undefined as P;
      if (definition.params) {
        const parsed = definition.params.safeParse(await context?.params);
        if (!parsed.success) throw new HttpError(404, "not_found");
        params = parsed.data;
      }
      const body = (definition.body ? await readBody(request, definition.body) : undefined) as B;
      let query = undefined as Q;
      if (definition.query) {
        const parsed = definition.query.safeParse(
          Object.fromEntries(new URL(request.url).searchParams),
        );
        if (!parsed.success) throw new HttpError(400, "invalid");
        query = parsed.data;
      }
      const input = { request, params, body, query };
      const identity =
        definition.auth === "admin"
          ? await requireAdmin(request)
          : definition.auth === "user"
            ? await requireUser(request)
            : null;
      const rule =
        typeof definition.rateLimit === "function"
          ? definition.rateLimit(input)
          : definition.rateLimit;
      if (!("exempt" in rule)) {
        if (rule.per === "user" && !identity)
          throw new Error(`Route ${definition.name} limits per user but is public`);
        await rateLimit(request, rule.bucket, rule.limit, identity?.user.id);
      }
      const response = await definition.handler({
        ...input,
        ...(identity ?? {}),
      } as Input<P, B, Q> & Identity<A>);
      for (const tag of definition.revalidate ?? []) revalidateTag(tag, { expire: 0 });
      return response;
    }, definition.name);
}
