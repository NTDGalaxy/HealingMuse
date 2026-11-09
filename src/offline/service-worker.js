/* Public shell only. Private HTML, APIs, credentials, grants, and audio never enter Cache Storage. */
/* VERSION and SHELL come from renderServiceWorker() in src/offline/shell.mjs. */
const VERSION = "__SHELL_VERSION__";
const SHELL = __SHELL_FILES__;
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("healingmuse-shell-") && key !== VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("message", (event) => {
  if (event.data === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
    return;
  }
  if (event.request.mode === "navigate" && /^\/(vi|en)(\/|$)/.test(url.pathname)) {
    event.respondWith(
      fetch(event.request).catch(
        async () => (await caches.match("/offline/index.html")) || Response.error(),
      ),
    );
  }
});
