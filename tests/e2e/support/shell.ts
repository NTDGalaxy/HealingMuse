import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  renderServiceWorker,
  serviceWorkerTemplate,
  shellFiles,
} from "../../../src/offline/shell.mjs";

export { shellFiles };

/** The offline shell's public files, keyed by URL path, exactly as the service worker caches them. */
export async function shellAssets(): Promise<Map<string, Buffer>> {
  return new Map(
    await Promise.all(
      shellFiles.map(async (path) => [path, await readFile(`public${path}`)] as const),
    ),
  );
}

/** The real service worker, rendered the way scripts/build-shell.mjs renders it, at a test version. */
export async function serviceWorkerSource(version: string): Promise<string> {
  return renderServiceWorker(await readFile(serviceWorkerTemplate, "utf8"), version);
}

/** Sorted URL paths of every response in every Cache Storage cache of the page's origin. */
export async function cachedPaths(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const paths: string[] = [];
    for (const name of await caches.keys())
      for (const request of await (await caches.open(name)).keys())
        paths.push(new URL(request.url).pathname);
    return paths.sort();
  });
}
