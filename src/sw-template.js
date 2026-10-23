// POS - For Micro Business offline shell. The build fills in the cache version and file list (see vite.config.ts).
// API calls are never handled here: live data, sign-in and the offline sale queue keep their own logic.
const CACHE = 'adfirm-pos-__VERSION__';
const FILES = __FILES__;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('adfirm-pos-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // Pages: always try the network so a deploy shows up at once; fall back to the saved app when offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/', {cacheName: CACHE})));
    return;
  }
  // Built files have content hashes in their names, so a saved copy is always correct.
  event.respondWith(caches.match(request, {cacheName: CACHE}).then(saved => saved || fetch(request).then(response => {
    if (response.ok && url.pathname.startsWith('/assets/')) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(request, copy)); }
    return response;
  })));
});
