const CACHE_NAME = 'quiz-app-v9';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './questions.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// Install: cache all assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching all assets');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Fetch: network-first strategy (always get latest, fallback to cache when offline)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).then((response) => {
            // Update cache with fresh response
            if (event.request.method === 'GET' && event.request.url.startsWith(self.location.origin)) {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
            }
            return response;
        }).catch(() => {
            // Network failed, fallback to cache (offline mode)
            return caches.match(event.request).then((cachedResponse) => {
                return cachedResponse || caches.match('./index.html');
            });
        })
    );
});
