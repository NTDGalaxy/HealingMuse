import { it, expect } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

it("the draft import refuses an unverified object-name collision", async () => {
  const folder = await mkdtemp(join(tmpdir(), "healingmuse-import-"));
  let inserted = false;
  let uploadAttempted = false;
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/storage/v1/bucket/audio")
      response.end(JSON.stringify({ id: "audio", public: false, file_size_limit: 52428800 }));
    else if (request.url?.startsWith("/rest/v1/tracks") && request.method === "GET")
      response.end("null");
    else if (request.url?.startsWith("/rest/v1/tracks") && request.method === "POST") {
      inserted = true;
      response.statusCode = 201;
      response.end("{}");
    } else if (request.method === "POST") {
      uploadAttempted = true;
      response.statusCode = 409;
      response.end(
        JSON.stringify({ statusCode: "409", error: "Duplicate", message: "Object already exists" }),
      );
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
    await mkdir(join(folder, "media/prepared"), { recursive: true });
    const audio = Buffer.from("Synthetic import collision fixture");
    await writeFile(join(folder, "media/prepared/test.mp3"), audio);
    await writeFile(
      join(folder, "media/prepared/catalog.json"),
      JSON.stringify(
        Array.from({ length: 1000 }, (_, index) => ({
          id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          bytes: audio.length,
          source: { path: "test.mp3" },
          title: { en: "Synthetic fixture" },
          sha256: createHash("sha256").update(audio).digest("hex"),
        })),
      ),
    );
    const code = await new Promise<number | null>((done) => {
      const child = spawn(
        process.execPath,
        [resolve("scripts/upload-audio.mjs"), "--upload-drafts"],
        {
          cwd: folder,
          stdio: "ignore",
          env: {
            ...process.env,
            NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${address.port}`,
            SUPABASE_SECRET_KEY: "synthetic-key",
            SUPABASE_STORAGE_AVAILABLE_BYTES: String(audio.length * 1000),
          },
        },
      );
      child.on("exit", done);
      child.on("error", () => done(-1));
    });
    expect(uploadAttempted).toBe(true);
    expect(inserted).toBe(false);
    expect(code).not.toBe(0);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    await rm(folder, { recursive: true, force: true });
  }
}, 10000);
