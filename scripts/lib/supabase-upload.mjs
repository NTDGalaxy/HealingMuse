import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Native curl is a bounded fallback for interrupted Node uploads in WSL. */
export async function curlSupabaseUpload(url, key, path, audio) {
  const origin = new URL(url);
  if (
    origin.protocol !== "https:" ||
    !/^[a-z0-9]+\.supabase\.co$/.test(origin.hostname) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_/-]*\.mp3$/.test(path) ||
    path.includes("..")
  )
    throw new Error("storage_unavailable");
  const folder = await mkdtemp(join(tmpdir(), "healingmuse-upload-"));
  const quote = (value) =>
    `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n").replaceAll("\r", "\\r")}"`;
  try {
    const configuration = [
      `url = ${quote(new URL(`/storage/v1/object/audio/${path}`, origin).href)}`,
      `header = ${quote(`apikey: ${key}`)}`,
      `header = ${quote(`Authorization: Bearer ${key}`)}`,
      'header = "x-upsert: false"',
      'header = "Content-Type: audio/mpeg"',
      'header = "Cache-Control: max-age=0"',
    ].join("\n");
    const configPath = join(folder, "request.conf");
    await writeFile(configPath, configuration, { mode: 0o600 });
    const windows = process.env.SUBSET_UPLOAD_TRANSPORT === "windows";
    const executable = windows ? "/mnt/c/Windows/System32/curl.exe" : "curl";
    const requestConfig = windows
      ? execFileSync("wslpath", ["-w", configPath], { encoding: "utf8" }).trim()
      : configPath;
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        executable,
        [
          "--config",
          requestConfig,
          "--proto",
          "=https",
          "--tlsv1.2",
          "--ipv4",
          "--http1.1",
          "--silent",
          "--connect-timeout",
          "15",
          "--max-time",
          "180",
          "--request",
          "POST",
          "--data-binary",
          "@-",
          "--write-out",
          "\n%{http_code}",
        ],
        { stdio: ["pipe", "pipe", "ignore"] },
      );
      const chunks = [];
      let bytes = 0;
      child.stdout.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 1_000_000) child.kill();
        else chunks.push(chunk);
      });
      child.stdin.on("error", () => {});
      child.once("error", () => reject(new Error("storage_unavailable")));
      child.once("close", (code) => {
        const response = Buffer.concat(chunks).toString("utf8");
        const status = Number(response.slice(response.lastIndexOf("\n") + 1));
        resolve({ code, status });
      });
      child.stdin.end(audio);
    });
    if (result.code !== 0 || result.status < 200 || result.status >= 300)
      throw Object.assign(new Error("storage_unavailable"), {
        diagnostic: {
          operation: "upload",
          status: result.status || null,
          transportFailure: result.code !== 0,
          transportExitCode: result.code,
          quotaIndicated: result.status === 402 || result.status === 429,
          authorizationIndicated: result.status === 401 || result.status === 403,
        },
      });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
