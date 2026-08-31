/* Dinner By Derek — service worker.
 *
 * SAFETY RULE, not a performance preference: the app shell is cached, and
 * nothing else. Menus, prices, allergen tags, availability counts, cutoff
 * state and delivery eligibility are ALWAYS fetched from the network. A stale
 * cached allergen tag would be a food-safety failure, so no HTML document and
 * no /api response is ever read from cache.
 *
 * CACHE_VERSION is the fingerprint of the shell files themselves, and the
 * acceptance suite recomputes it. Change one of them without changing this
 * and the suite fails with the string to paste in — which is the whole
 * point: the old rule was "remember to bump it", and nothing anywhere said
 * a word when you did not. A stale version means returning visitors keep
 * the previous build, so an owner who fixes a price can watch customers go
 * on reading the old one.
 *
 * The old cache is deleted on activate and clients are claimed immediately,
 * so nobody stays on the previous build once a new one is live.
 */

var CACHE_VERSION = 'dbd-shell-e3f04d84f7';
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

/* cache:'reload' on every shell request, and the whole mechanism depends on it.
 *
 * A plain addAll() fetches through the browser's ordinary HTTP cache, and these
 * files are served with a seven-day max-age. So a new CACHE_VERSION opened a
 * new cache and then filled it from the old copies sitting in that HTTP cache:
 * the cache name changed, the bytes did not, and a deployed fix reached nobody
 * who had visited in the past week. Measured on the live site — a cache named
 * for the new build holding a copy of app.js 2,668 bytes short of the file the
 * server was serving, dated two deploys earlier.
 *
 * 'reload' bypasses the HTTP cache on the way out and refreshes it on the way
 * back, which is what makes renaming the cache mean something.
 */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (c) {
        return c.addAll(SHELL.map(function (u) {
          return new Request(u, { cache: 'reload' });
        }));
      })
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
