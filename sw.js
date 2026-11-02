/* Service worker: caches every file on install so the app works offline.
   The cache name comes from js/version.js, so a new version makes a new cache.
   This file never touches the data stored in IndexedDB. */
importScripts('js/version.js');

var CACHE = 'routine-tracker-v' + RT_VERSION;
var FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/version.js', 'js/dates.js', 'js/data.js', 'js/logic.js', 'js/db.js', 'js/ui.js',
  'js/today.js', 'js/progress.js', 'js/goals.js', 'js/alarms.js', 'js/settings.js', 'js/main.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/icon.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      /* cache: 'reload' skips the browser HTTP cache so a new version is never half old */
      return Promise.all(FILES.map(function (f) {
        return fetch(new Request(f, { cache: 'reload' })).then(function (res) {
          if (!res.ok) throw new Error('Could not cache ' + f);
          return cache.put(f, res);
        });
      }));
    })
  );
  /* No skipWaiting here: the page shows "Update ready. Tap to refresh" and asks for it. */
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf('routine-tracker-v') === 0 && k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('index.html');
      return fetch(req);
    })
  );
});

/* Tapping a phone notification opens the app. */
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) if ('focus' in list[i]) return list[i].focus();
    return self.clients.openWindow('./');
  }));
});
