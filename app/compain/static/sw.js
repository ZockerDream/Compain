/* Compain service worker: makes the app installable and works offline.
   - App files (/static/...) come from the server when it is reachable (so an update shows at once),
     from the cache only when offline. A new version reloads open windows once (app.js).
   - The page itself is loaded fresh when online; offline the last copy is shown.
   - The API (/api/..., /ws) is never cached: chats, settings and logins always come from the server. */
const CACHE = "compain-v1.12.1";
const SHELL = ["/", "/static/style.css", "/static/designs-palettes.css", "/static/designs.css", "/static/app.js",
  "/static/i18n.js", "/static/help.js", "/static/sprite.svg", "/static/icons/icon-192.png",
  "/static/icons/icon.svg", "/static/icons/mark.svg", "/static/icons/mark-tile.svg", "/static/icons/spark.svg"];

self.addEventListener("install", (event) => {
  // cache: "reload" skips the browser's own cache, so the new version really gets the new files.
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/ws") return; // always live
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put("/", copy));
      return res;
    }).catch(() => caches.match("/")));
    return;
  }
  if (url.pathname.startsWith("/static/")) {
    event.respondWith(caches.open(CACHE).then(async (c) => {
      try {
        const res = await fetch(event.request, { cache: "no-cache" });
        if (res.ok) c.put(event.request, res.clone());
        return res;
      } catch (e) {
        return (await c.match(event.request)) || Response.error();
      }
    }));
  }
});
