// __BUILD_SHA__ is replaced at docker build time; falls back to 'dev' for local.
const CACHE_NAME = 'budget-tracker-__BUILD_SHA__';
const OFFLINE_URL = '/offline.html';

const PRECACHE_ASSETS = [
    '/offline.html',
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            )
        ).then(() => self.clients.claim())
    );
});

// Allow page to force-activate a waiting SW
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;

    // Navigation (HTML documents): network-first, fall back to offline page
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => response)
                .catch(() => caches.match(OFFLINE_URL))
        );
        return;
    }

    // Hashed Next.js build assets: stale-while-revalidate (safe — filenames change per build)
    if (url.pathname.startsWith('/_next/static/')) {
        event.respondWith(
            caches.match(request).then((cached) => {
                const networkFetch = fetch(request).then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    }
                    return response;
                }).catch(() => cached);
                return cached || networkFetch;
            })
        );
        return;
    }

    // Icons, manifest, logos: cache-first
    if (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/logos/') || url.pathname === '/manifest.json') {
        event.respondWith(
            caches.match(request).then((cached) => cached || fetch(request).then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            }))
        );
        return;
    }

    // Everything else: network-first
    event.respondWith(
        fetch(request).catch(() => caches.match(request))
    );
});
