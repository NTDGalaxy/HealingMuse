import { it, expect } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

it("a failed staging setup still removes synthetic accounts created by slower requests", async () => {
  const folder = await mkdtemp(join(tmpdir(), "healingmuse-sync-"));
  const created = new Set<string>();
  const removed = new Set<string>();
  const pending: Promise<void>[] = [];
  const requests: string[] = [];
  let attempts = 0;
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.setHeader("Content-Type", "application/json");
    if (request.url?.startsWith("/rest/v1/tracks")) {
      response.end(JSON.stringify([{ id: randomUUID() }]));
    } else if (request.url === "/auth/v1/admin/generate_link") {
      attempts += 1;
      if (attempts === 1) {
        pending.push(
          new Promise((done) =>
            setTimeout(() => {
              response.statusCode = 400;
              response.end(JSON.stringify({ msg: "Synthetic setup failure" }));
              done();
            }, 100),
          ),
        );
      } else {
        const id = randomUUID();
        pending.push(
          new Promise((done) =>
            setTimeout(() => {
              created.add(id);
              response.end(JSON.stringify({ id, hashed_token: "synthetic-token" }));
              done();
            }, 250),
          ),
        );
      }
    } else if (request.url === "/auth/v1/verify") {
      response.statusCode = 400;
      response.end(JSON.stringify({ msg: "Synthetic verification failure" }));
    } else if (request.method === "DELETE" && request.url?.startsWith("/auth/v1/admin/users/")) {
      const id = request.url.split("/").at(-1)!;
      removed.add(id);
      response.end(JSON.stringify({ id }));
    } else {
      response.statusCode = 404;
      response.end("{}");
    }
  });
  try {
    await new Promise<void>((ready, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", ready);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server unavailable");
    const code = await new Promise<number | null>((done) => {
      const child = spawn(process.execPath, [resolve("scripts/sync-load-test.mjs")], {
        cwd: folder,
        stdio: "ignore",
        env: {
          ...process.env,
          STAGING_TESTS_ALLOWED: "true",
          NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${address.port}`,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-public-key",
          SUPABASE_SECRET_KEY: "synthetic-secret-key",
        },
      });
      const deadline = setTimeout(() => child.kill("SIGTERM"), 5000);
      child.once("exit", (code) => {
        clearTimeout(deadline);
        done(code);
      });
      child.once("error", () => done(-1));
    });
    await Promise.all(pending);
    expect(code, JSON.stringify(requests)).toBe(1);
    expect(created.size).toBe(24);
    expect(removed).toEqual(created);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    await rm(folder, { recursive: true, force: true });
  }
}, 10000);
