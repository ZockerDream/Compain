/* Compain service worker: makes the app installable and opens it quickly.
   - App files (/static/...) come from the cache and are refreshed in the background.
   - The page itself is loaded fresh when online; offline the last copy is shown.
   - The API (/api/..., /ws) is never cached: chats, settings and logins always come from the server. */
const CACHE = "compain-v1.5.0";
const SHELL = ["/", "/static/style.css", "/static/designs-palettes.css", "/static/designs.css", "/static/app.js",
  "/static/i18n.js", "/static/help.js", "/static/sprite.svg", "/static/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
      const hit = await c.match(event.request);
      const fresh = fetch(event.request).then((res) => { if (res.ok) c.put(event.request, res.clone()); return res; }).catch(() => hit);
      return hit || fresh;
    }));
  }
});
