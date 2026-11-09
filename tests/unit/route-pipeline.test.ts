import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  revalidateTag: vi.fn(),
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
  rateLimit: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("@/lib/server/http", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/http")>();
  return {
    ...original,
    requireUser: mocks.requireUser,
    requireAdmin: mocks.requireAdmin,
    rateLimit: mocks.rateLimit,
  };
});
import { defineRoute } from "@/lib/server/route";
import { HttpError, json } from "@/lib/server/http";

const origin = "https://healingmuse.vercel.app";
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${origin}/api/things/1`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      host: "healingmuse.vercel.app",
      ...headers,
    },
    body: JSON.stringify(body),
  });
const context = (params: Record<string, string>) => ({ params: Promise.resolve(params) });
const user = { db: {}, user: { id: "owner-1" } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.length = 0;
  mocks.requireUser.mockImplementation(async () => (mocks.calls.push("auth"), user));
  mocks.requireAdmin.mockImplementation(async () => (mocks.calls.push("admin"), user));
  mocks.rateLimit.mockImplementation(async () => void mocks.calls.push("rate"));
});

const route = defineRoute({
  name: "things",
  auth: "user",
  params: z.object({ id: z.string().regex(/^\d+$/) }),
  body: z.object({ value: z.number() }).strict(),
  rateLimit: { bucket: "things", limit: 5, per: "user" },
  revalidate: ["catalog"],
  handler: async ({ params, body, user: caller }) => {
    mocks.calls.push("handler");
    return json({ id: params.id, value: body.value, owner: caller.id }, 201);
  },
});

describe("defineRoute pipeline", () => {
  it("runs params, body, auth, rate limit, handler and revalidation in order", async () => {
    const response = await route(post({ value: 3 }), context({ id: "1" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "1", value: 3, owner: "owner-1" });
    expect(mocks.calls).toEqual(["auth", "rate", "handler"]);
    expect(mocks.rateLimit).toHaveBeenCalledWith(expect.any(Request), "things", 5, "owner-1");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("catalog", { expire: 0 });
    expect(response.headers.get("Cache-Control")).toContain("private, no-store");
  });

  it("rejects cross-origin mutations before parsing, auth or rate limiting", async () => {
    const response = await route(
      post({ value: 3 }, { origin: "https://elsewhere.example" }),
      context({ id: "x" }),
    );
    expect(response.status).toBe(403);
    expect(mocks.calls).toEqual([]);
  });

  it("maps bad params to 404 and bad bodies to 400 before authentication", async () => {
    expect((await route(post({ value: 3 }), context({ id: "x" }))).status).toBe(404);
    expect((await route(post({ value: 3, extra: 1 }), context({ id: "1" }))).status).toBe(400);
    expect(mocks.calls).toEqual([]);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("skips the limiter only for explicit exemptions and never revalidates on failure", async () => {
    const failing = defineRoute({
      name: "failing",
      auth: "public",
      rateLimit: { exempt: "test" },
      revalidate: ["catalog"],
      handler: async () => {
        throw new HttpError(503, "unavailable", "db");
      },
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await failing(new Request(`${origin}/api/failing`));
    expect(response.status).toBe(503);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    expect(JSON.parse(errors.mock.calls[0][0] as string)).toEqual({
      event: "request_failed",
      route: "failing",
      code: "unavailable",
      status: 503,
      category: "db",
    });
    errors.mockRestore();
  });

  it("refuses a per-user limit on a public route instead of silently limiting by IP", async () => {
    const misconfigured = defineRoute({
      name: "misconfigured",
      auth: "public",
      rateLimit: { bucket: "x", limit: 1, per: "user" },
      handler: async () => json({ ok: true }),
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await misconfigured(new Request(`${origin}/api/x`))).status).toBe(503);
    errors.mockRestore();
  });

  it("lets GET skip the origin check and computes rules per request", async () => {
    const read = defineRoute({
      name: "read",
      auth: "public",
      query: z.object({ download: z.string().optional() }),
      rateLimit: ({ query }) =>
        query.download === "1"
          ? { bucket: "downloads", limit: 2, per: "ip" }
          : { exempt: "plain read" },
      handler: async () => json({ ok: true }),
    });
    expect(
      (
        await read(
          new Request(`${origin}/api/read?download=1`, {
            headers: { origin: "https://x.example" },
          }),
        )
      ).status,
    ).toBe(200);
    expect(mocks.rateLimit).toHaveBeenCalledWith(expect.any(Request), "downloads", 2, undefined);
    await read(new Request(`${origin}/api/read`));
    expect(mocks.rateLimit).toHaveBeenCalledTimes(1);
  });
});
