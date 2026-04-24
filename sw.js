const CACHE_NAME = 'colhedoras-v3';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// INSTALL
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// ACTIVATE
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// FETCH
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request)
                .then(fetchRes => {
                    if (!fetchRes || fetchRes.status !== 200) return fetchRes;

                    const clone = fetchRes.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, clone);
                    });

                    return fetchRes;
                })
                .catch(() => {
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                });
        })
    );
});