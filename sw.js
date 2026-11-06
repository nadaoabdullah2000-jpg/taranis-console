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

const VERSION = 'taranis-v22';
const SHELL = [
  './',
  './index.html',
  './meeting-time.js',
  './app.js',
  './pwa.js',
  './brand-pattern.svg',
  './brand-pattern-light.svg',
  './taranis-logo.svg',
  './icon-192.png',
  './icon-512.png',
  './manifest.webmanifest'
];

// The page asks for the new version when the person presses Reload, rather
// than swapping the code underneath them mid-task.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', (e) => {
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

  // build.txt (what the server is running) and config.js (secrets written at
  // deploy) are never cached: offline, build.txt must fail rather than come
  // back as a cached page, or the console announces a new version every time.
  if (/\/(build\.txt|config\.js)$/.test(url.pathname)) return;

  // One cache entry per file, whatever its ?v= or ?t= suffix, so the cache
  // holds the shell and stops growing with every deploy and every check.
  const key = url.origin + url.pathname;
  const navigate = req.mode === 'navigate';

  e.respondWith(
    fetch(req)
      .then((res) => {
        // Keep the shell fresh for the next offline moment.
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(navigate ? './index.html' : key, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(navigate ? './index.html' : key).then((hit) => {
          if (hit) return hit;
          // Only a page load falls back to the app page; a script or image
          // that is not cached fails as itself, not as HTML.
          if (navigate) return caches.match('./index.html');
          return Response.error();
        })
      )
  );
});
