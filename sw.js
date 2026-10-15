const CACHE = "bovironda-v1.9.4";
const CORE = ["./","./index.html","./styles.css?v=194-20261015","./app.js?v=194-20261015","./config.js?v=194-20261015","./manifest.json?v=194-20261015"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE))));
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
