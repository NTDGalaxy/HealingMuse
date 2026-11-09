import { test, expect, expectPlaying, registerServiceWorker, seedDownload } from "./support/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { preparedAudio, preparedCatalogue } from "./support/catalogue";
import { Recordings } from "./support/pages";

test("a waiting shell update preserves downloaded playback and offline startup", async ({
  page,
  context,
}) => {
  let version = 1;
  const template = await readFile("src/offline/service-worker.js", "utf8");
  const track = (await preparedCatalogue())[0];
  const bytes = await preparedAudio(track);
  const recordings = new Recordings(page);
  const files = new Map<string, Buffer>([["/fixture.mp3", bytes]]);
  for (const path of [
    "/offline/index.html",
    "/offline/app.js",
    "/offline/appearance.js",
    "/gardens/cloister-day-480.avif",
    "/gardens/cloister-night-480.avif",
    "/offline/style.css",
    "/offline/en.json",
    "/offline/vi.json",
    "/offline/be-vietnam-pro-latin.woff2",
    "/offline/be-vietnam-pro-vietnamese.woff2",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
  ])
    files.set(path, await readFile(`public${path}`));
  const server = createServer((request, response) => {
    const path = new URL(request.url!, "http://localhost").pathname;
    response.setHeader("Cache-Control", "no-store");
    if (path === "/sw.js") {
      response.setHeader("Content-Type", "application/javascript");
      response.end(template.replace("__SHELL_VERSION__", `healingmuse-shell-test-${version}`));
    } else {
      const file = files.get(path.startsWith("/en") ? "/offline/index.html" : path);
      if (!file) {
        response.statusCode = 404;
        response.end();
      } else {
        response.setHeader(
          "Content-Type",
          path.endsWith(".js")
            ? "application/javascript"
            : path.endsWith(".css")
              ? "text/css"
              : path.endsWith(".json")
                ? "application/json"
                : path.endsWith(".mp3")
                  ? "audio/mpeg"
                  : path.endsWith(".avif")
                    ? "image/avif"
                    : path.endsWith(".png")
                      ? "image/png"
                      : path.endsWith(".woff2")
                        ? "font/woff2"
                        : "text/html",
        );
        response.end(file);
      }
    }
  });
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server unavailable");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    await page.goto(`${origin}/en/downloads`);
    await registerServiceWorker(page, "/sw.js");
    await seedDownload(page, track, "/fixture.mp3");
    await page.reload();
    await recordings.listen(track.title.en).click();
    await expectPlaying(page);
    version = 2;
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())!.update();
    });
    await expect
      .poll(() =>
        page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting),
      )
      .toBe(true);
    await expectPlaying(page);
    await page.evaluate(async () => {
      const registration = (await navigator.serviceWorker.getRegistration())!;
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true,
        });
        registration.waiting!.postMessage("ACTIVATE_UPDATE");
      });
    });
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .toEqual(["healingmuse-shell-test-2"]);
    await context.setOffline(true);
    await page.goto(`${origin}/en/downloads`);
    await recordings.listen(track.title.en).click();
    await expectPlaying(page);
    await page.getByText(recordings.t("catalog.credit"), { exact: true }).click();
    await expect(page.getByText(track.attribution, { exact: true })).toBeVisible();
  } finally {
    await context.setOffline(false);
    await new Promise<void>((done) => server.close(() => done()));
  }
});
