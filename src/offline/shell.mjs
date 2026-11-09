// @ts-check
// The public offline shell, listed once. scripts/build-shell.mjs hashes these files into the
// service worker version and writes the list into public/sw.js, and the service worker spec
// serves exactly these files. Only public, versioned shell assets belong here: never app pages,
// API responses, credentials, signed URLs or audio. Node-only: the browser never imports this.
import { createHash } from "node:crypto";

/** URL paths the service worker precaches and serves cache-first, all under public/. */
export const shellFiles = [
  "/offline/index.html",
  "/offline/app.js",
  "/offline/appearance.js",
  "/gardens/cloister-day-480.avif",
  "/gardens/cloister-night-480.avif",
  "/offline/style.css",
  "/offline/vi.json",
  "/offline/en.json",
  "/offline/be-vietnam-pro-latin.woff2",
  "/offline/be-vietnam-pro-vietnamese.woff2",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

/** The service worker template that every rendered worker comes from. */
export const serviceWorkerTemplate = "src/offline/service-worker.js";

/**
 * Renders the service worker from its template: the cache version and the shell list replace
 * their placeholders, each of which must appear exactly once.
 * @param {string} template @param {string} version
 */
export function renderServiceWorker(template, version) {
  const list = `[\n${shellFiles.map((path) => `  ${JSON.stringify(path)},\n`).join("")}]`;
  /** @type {[string, string][]} */
  const replacements = [
    ['"__SHELL_VERSION__"', JSON.stringify(version)],
    ["__SHELL_FILES__", list],
  ];
  return replacements.reduce((source, [placeholder, value]) => {
    if (source.split(placeholder).length !== 2)
      throw new Error(`${placeholder} must appear exactly once in the service worker template`);
    return source.replace(placeholder, () => value);
  }, template);
}

/**
 * The shell cache version: a hash of every precached file (icons included) and of the rendered
 * worker, so a change to any of them installs a new shell.
 * @param {(path: string) => Promise<Uint8Array>} read reads a shell file by its URL path
 * @param {string} template
 */
export async function shellVersion(read, template) {
  const hash = createHash("sha256");
  for (const path of shellFiles) hash.update(await read(path));
  hash.update(renderServiceWorker(template, ""));
  return `healingmuse-shell-${hash.digest("hex").slice(0, 16)}`;
}
