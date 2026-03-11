const CACHE_NAME = 'theatre-v1';
const BASE = new URL('.', self.location.href).href;
const STATIC_ASSETS = [
  BASE,
  new URL('index.html', BASE).href,
  new URL('movie.html', BASE).href,
  new URL('maze.html', BASE).href,
  new URL('maze.js', BASE).href,
  new URL('co-ganh-board.html', BASE).href,
  new URL('co-ganh-game.js', BASE).href,
  'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })))
        .catch((err) => {
          console.warn('SW: some assets failed to cache', err);
        });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin + CDN for crypto-js
  const isLocal = url.origin === self.location.origin;
  const isCryptoJs = url.href.includes('crypto-js');
  if (!isLocal && !isCryptoJs) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const clone = response.clone();
        if (response.status === 200 && (isLocal || isCryptoJs)) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => {
        if (request.mode === 'navigate') {
          return caches.match(new URL('index.html', BASE).href, { ignoreSearch: true })
            || caches.match(BASE, { ignoreSearch: true });
        }
        return new Response('', { status: 408, statusText: 'Offline' });
      });
    })
  );
});
