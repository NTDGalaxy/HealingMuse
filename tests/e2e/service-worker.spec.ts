import { test, expect, expectPlaying, registerServiceWorker, seedDownload } from "./support/test";
import { createServer } from "node:http";
import { preparedAudio, preparedCatalogue } from "./support/catalogue";
import { Recordings } from "./support/pages";
import { cachedPaths, serviceWorkerSource, shellAssets, shellFiles } from "./support/shell";

test("a waiting shell update preserves downloaded playback and offline startup", async ({
  page,
  context,
}) => {
  const workers = [
    await serviceWorkerSource("healingmuse-shell-test-1"),
    await serviceWorkerSource("healingmuse-shell-test-2"),
  ];
  let worker = workers[0];
  const track = (await preparedCatalogue())[0];
  const bytes = await preparedAudio(track);
  const recordings = new Recordings(page);
  const files = await shellAssets();
  files.set("/fixture.mp3", bytes);
  const server = createServer((request, response) => {
    const path = new URL(request.url!, "http://localhost").pathname;
    response.setHeader("Cache-Control", "no-store");
    if (path === "/sw.js") {
      response.setHeader("Content-Type", "application/javascript");
      response.end(worker);
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
    worker = workers[1];
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
    // Cache Storage holds the public shell only: never the page, an API response or the audio.
    expect(await cachedPaths(page)).toEqual([...shellFiles].sort());
  } finally {
    await context.setOffline(false);
    await new Promise<void>((done) => server.close(() => done()));
  }
});
