// On localhost a leftover SW would keep serving stale dev chunks (the browser
// revalidates this script on navigation, so this self-destruct propagates even
// to already-installed old workers). Kill it, wipe caches, reload open tabs.
if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
    self.addEventListener('install', () => self.skipWaiting());
    self.addEventListener('activate', (event) => {
        event.waitUntil((async () => {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
            await self.registration.unregister();
            const clients = await self.clients.matchAll({ type: 'window' });
            clients.forEach((c) => c.navigate(c.url));
        })());
    });
    // No fetch handler in dev → nothing is ever served from cache.
} else {

// __BUILD_SHA__ is replaced at docker build time; falls back to 'dev' for local.
const CACHE_NAME = 'budget-tracker-__BUILD_SHA__';
const OFFLINE_URL = '/offline.html';

const PRECACHE_ASSETS = [
    '/offline.html',
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    '/icons/icon-32x32.png',
    '/icons/apple-touch-icon.png',
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

    // Don't touch auth endpoints — they set cookies, must be fresh, and a
    // cached failure here surfaces as a misleading "(from service worker)"
    // badge in DevTools that points the finger at the SW instead of the
    // actual upstream error.
    if (url.pathname.startsWith('/api/auth/')) return;

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

// ── Web Push ────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
    let payload = { title: 'Koruna', body: '', url: '/' };
    try {
        payload = { ...payload, ...event.data.json() };
    } catch {
        if (event.data) payload.body = event.data.text();
    }
    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            data: { url: payload.url },
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            for (const client of clients) {
                if ('focus' in client) {
                    client.focus();
                    if ('navigate' in client) client.navigate(url);
                    return;
                }
            }
            return self.clients.openWindow(url);
        })
    );
});

} // end production-only SW
