const CACHE = "bovironda-v1.9.8";
const CORE = ["./","./index.html","./styles.css?v=198-20261016","./app.js?v=198-20261016","./config.js?v=198-20261016","./manifest.json?v=198-20261016"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("bovironda-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Never persist Drive images, authenticated API responses or external redirects.
  if (url.origin !== self.location.origin || !["/", "index.html", "app.js", "config.js", "styles.css", "manifest.json", "monte-do-pasto-logo.png"].includes(url.pathname.split("/").pop() || "/")) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        if (response.ok && response.type !== "opaque") caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
