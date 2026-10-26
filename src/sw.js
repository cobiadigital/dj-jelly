/* Service worker: app shell precache only.
 * Built by the plugin in vite.config.ts, which replaces the two placeholders below.
 * Audio is never handled here; see src/lib/sources.ts. */

const PRECACHE = self.__PRECACHE__;
const VERSION = self.__VERSION__;
const SHELL_CACHE = `shell-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // App navigations: network first so deploys show up, fall back to the cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.match('/')) || Response.error()));
    return;
  }
  // Static files: cache first (hashed filenames make this safe).
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
