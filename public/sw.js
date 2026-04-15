/* sw.js — Sandman PWA (hosting + Silver intake)
   - Version bump when you change this file
*/

const VERSION = 'v1.0.4';
const STATIC_CACHE  = `sandman-static-${VERSION}`;
const RUNTIME_CACHE = `sandman-runtime-${VERSION}`;

// Precache only small, stable assets you need offline.
// (PDFs are intentionally NOT precached.)
const PRECACHE_URLS = [
  '/',
  '/timer-engine/sandman-timer-mobile.html',
  '/manifest.json',
  '/icons/sandman-192.png',
  '/icons/sandman-512.png',
  '/icons/sandman-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      for (const url of PRECACHE_URLS) {
        try {
          await cache.add(url);
        } catch (err) {
          console.warn("SW skipped missing file:", url);
        }
      }
    })
  );

  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(k => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
        .map(k => caches.delete(k))
    );
  })());

  self.clients.claim();
});

// Optional: allow page to trigger immediate SW activation
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;

  // --- BYPASS PDFs outright (no cache) ---
  if (url.pathname.endsWith('.pdf')) {
    event.respondWith(fetch(req));
    return;
  }

  // --- HTML: network-first so you always see latest UI ---
  const isHTML =
    req.destination === 'document' ||
    req.headers.get('accept')?.includes('text/html');

  if (isHTML) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });

        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, fresh.clone());

        return fresh;

      } catch (e) {
        const cached = await caches.match(req);
        return cached || caches.match('/timer-engine/sandman-timer-mobile.html');
      }
    })());

    return;
  }

  // --- Everything else: cache-first with network fallback ---
  event.respondWith((async () => {

    const hit = await caches.match(req);
    if (hit) return hit;

    try {

      const res = await fetch(req);

      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(req, res.clone());

      return res;

    } catch (e) {

      return new Response('', { status: 504, statusText: 'Offline' });

    }

  })());
});