/* =========================================================================
   Taranis Console — service worker
   -------------------------------------------------------------------------
   This exists for one reason: a site is only installable as an app if it has
   one. It deliberately does as little as possible.

   NETWORK FIRST, always. The console shows live data from the fundraise, and
   a stale contact record is worse than no contact record. So every request
   goes to the network; the cache is only consulted when the network fails,
   which in practice means the person is on a plane or in a lift.

   Nothing from the gateway or Supabase is ever cached — only the app shell
   (the HTML, the script, the icons).
   ========================================================================= */

const VERSION = 'taranis-v5';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './pwa.js',
  './brand-pattern.svg',
  './taranis-logo.png',
  './icon-192.png',
  './icon-512.png',
  './manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  // Take over straight away rather than waiting for every tab to close,
  // so a deploy reaches people on their next refresh instead of next week.
  self.skipWaiting();
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Only ever touch our own files, and only plain page loads.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // gateway + Supabase pass straight through

  e.respondWith(
    fetch(req)
      .then((res) => {
        // Keep the shell fresh for the next offline moment.
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || caches.match('./index.html'))
      )
  );
});
