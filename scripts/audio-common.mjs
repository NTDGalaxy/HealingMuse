import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { toolFetch } from "./tool-fetch.mjs";

export function targetCount(fallback = 1000) {
  const at = process.argv.indexOf("--target");
  const count = at < 0 ? fallback : Number(process.argv[at + 1]);
  if (!Number.isInteger(count) || count < 1000 || count > 10000)
    throw new Error("The catalogue target must be between 1000 and 10000.");
  return count;
}
export async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}
export async function atomicJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2) + "\n");
  await rename(temporary, path);
}
export const plain = (value = "") =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
export function normalizedLicenseUrl(value) {
  const url = new URL(value.replace(/^\/\//, "https://"));
  if (
    url.protocol === "http:" &&
    url.hostname === "creativecommons.org" &&
    /^\/(licenses|publicdomain)\//.test(url.pathname)
  )
    url.protocol = "https:";
  if (url.protocol !== "https:") throw new Error("Licence evidence requires an HTTPS URL.");
  return url.href;
}
export function isDerivativeRecording(title = "") {
  return /\b(?:loop(?:ed)?|excerpt|snippet|shortened|trimmed|sped|slowed|alternate|remix|edit)\b|\b\d+\s*(?:second|seconds|sec)\b/i.test(
    title,
  );
}
const providerConfig = await readJson(new URL("../content/providers.json", import.meta.url), {});
const cooldownPath = "media/evidence/provider-cooldowns.json";
const cooldowns = new Map(Object.entries(await readJson(cooldownPath, {})));
let cooldownSave = Promise.resolve();

export async function sourceFetch(url, timeout = 60000) {
  const host = new URL(url).hostname;
  while ((cooldowns.get(host) || 0) > Date.now())
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(30000, cooldowns.get(host) - Date.now())),
    );
  for (let attempt = 0; attempt < 4; attempt++) {
    while ((cooldowns.get(host) || 0) > Date.now())
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(30000, cooldowns.get(host) - Date.now())),
      );
    const shared = await readJson(cooldownPath, {});
    cooldowns.set(host, Math.max(cooldowns.get(host) || 0, shared[host] || 0));
    while ((cooldowns.get(host) || 0) > Date.now())
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(30000, cooldowns.get(host) - Date.now())),
      );
    const response = await toolFetch(url, {
      headers: { "User-Agent": providerConfig.wikimedia.userAgent },
      signal: AbortSignal.timeout(timeout),
    });
    if (response.status !== 429 && response.status < 500) return response;
    const header = response.headers.get("retry-after");
    const retry =
      header && /^\d+$/.test(header)
        ? Number(header)
        : header
          ? Math.ceil((Date.parse(header) - Date.now()) / 1000)
          : 0;
    const delay = Math.max(2, Number.isFinite(retry) && retry > 0 ? retry : (attempt + 1) * 3);
    if (delay > 3600) throw new Error(`Provider requests a ${delay}s cooldown; resume later.`);
    cooldowns.set(host, Math.max(cooldowns.get(host) || 0, Date.now() + delay * 1000));
    cooldownSave = cooldownSave.then(async () => {
      const stored = await readJson(cooldownPath, {});
      for (const [name, until] of cooldowns) stored[name] = Math.max(stored[name] || 0, until);
      await atomicJson(cooldownPath, stored);
    });
    await cooldownSave;
    console.log(JSON.stringify({ event: "provider_cooldown", host, seconds: delay }));
    let remaining = delay;
    while (remaining > 0) {
      const interval = Math.min(30, remaining);
      await new Promise((resolve) => setTimeout(resolve, interval * 1000));
      remaining -= interval;
    }
  }
  throw new Error("Provider unavailable after bounded retries.");
}
