const CACHE = 'jet-flights-v2';
const SHELL = ['/', '/style.css', '/app.js', '/manifest.json', '/icon-192.svg', '/icon-512.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('flights.json')) {
    // Network-first for flight data
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const clone = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    // Cache-first for app shell
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
  }
});
