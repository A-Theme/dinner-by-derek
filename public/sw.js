/* Dinner By Derek — service worker.
 *
 * SAFETY RULE, not a performance preference: the app shell is cached, and
 * nothing else. Menus, prices, allergen tags, availability counts, cutoff
 * state and delivery eligibility are ALWAYS fetched from the network. A stale
 * cached allergen tag would be a food-safety failure, so no HTML document and
 * no /api response is ever read from cache.
 *
 * Bump CACHE_VERSION on any shell change. The old cache is deleted on
 * activate, and clients are claimed immediately, so an owner who changes a
 * price never has customers pinned to the previous build.
 */

var CACHE_VERSION = 'dbd-shell-v3';
var SHELL = [
  '/theme.css',
  '/app.css',
  '/app.js',
  '/order.js',
  '/offline',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (c) { return c.addAll(SHELL); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_VERSION) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache live data or anything behind the admin session.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  var isDoc = req.mode === 'navigate'
    || (req.headers.get('accept') || '').indexOf('text/html') !== -1;

  if (isDoc) {
    // Network-only for pages, with a branded offline screen as the fallback.
    e.respondWith(
      fetch(req).catch(function () {
        return caches.match('/offline');
      })
    );
    return;
  }

  // Static shell assets: cache first, refreshed in the background.
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
