const VERSION = 'v3.04.09.08';
const STATIC_CACHE = `biznav-static-${VERSION}`;
const DYNAMIC_CACHE = `biznav-dynamic-${VERSION}`;
const API_CACHE = `biznav-api-${VERSION}`;
const MAX_DYNAMIC_ITEMS = 50;

const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/pages/Tools/offline.html',
    '/assets/img/applogo-192x192.png'
];

/* ================= UTILITIES ================= */
async function limitCache(cacheName, maxItems) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
        await cache.delete(keys[0]);
        await limitCache(cacheName, maxItems);
    }
}

/* ================= LIFECYCLE ================= */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then(async cache => {
            // Use cache-busting during install to avoid caching stale CDN/proxy responses
            const fetchPromises = PRECACHE_ASSETS.map(async url => {
                try {
                    const res = await fetch(url, { cache: 'no-cache' });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    await cache.put(url, res);
                } catch (err) {
                    console.error(`[SW] Precache failed for: ${url}`, err);
                }
            });
            return Promise.all(fetchPromises);
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        (async () => {
            // Enable Navigation Preload if supported
            if ('navigationPreload' in self.registration) {
                await self.registration.navigationPreload.enable();
            }

            const activeCaches = [STATIC_CACHE, DYNAMIC_CACHE, API_CACHE];
            const keys = await caches.keys();

            await Promise.all(
                keys
                    .filter(key => key.startsWith('biznav-') && !activeCaches.includes(key))
                    .map(key => caches.delete(key))
            );

            await self.clients.claim();
        })()
    );
});

/* ================= CLIENT COMMUNICATION ================= */
self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING' || event.data?.action === 'skipWaiting') {
        self.skipWaiting();
    }
});

/* ================= FETCH ROUTING ================= */
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. Non-GET or non-HTTP requests: Pass straight to network
    if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
        return;
    }

    // 2. External Third-Party APIs (No cache)
    if (url.hostname.includes('api.postalpincode.in')) {
        return;
    }

    // 3. Supabase REST/GraphQL: Network-First with Fallback
    if (url.hostname.includes('supabase.co')) {
        // Only cache read queries (GET). Never cache auth tokens or mutations.
        if (url.pathname.includes('/auth/')) return;

        event.respondWith(
            (async () => {
                try {
                    const response = await fetch(request);
                    if (response.status === 200) {
                        const copy = response.clone();
                        const cache = await caches.open(API_CACHE);
                        cache.put(request, copy);
                        limitCache(API_CACHE, MAX_DYNAMIC_ITEMS);
                    }
                    return response;
                } catch {
                    const cached = await caches.match(request);
                    if (cached) return cached;

                    return new Response(
                        JSON.stringify({ error: 'Offline', message: 'No network connection available' }),
                        { status: 503, headers: { 'Content-Type': 'application/json' } }
                    );
                }
            })()
        );
        return;
    }

    // 4. HTML Navigations: Network-First with Preload & Offline Fallback
    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    const preloadResponse = await event.preloadResponse;
                    if (preloadResponse) return preloadResponse;

                    return await fetch(request);
                } catch {
                    const cachedPage = await caches.match(request);
                    if (cachedPage) return cachedPage;

                    const offlineFallback = await caches.match('/pages/Tools/offline.html');
                    return offlineFallback || new Response('Offline', { status: 503 });
                }
            })()
        );
        return;
    }

    // 5. Static Assets (CSS, JS, Fonts, Images): Stale-While-Revalidate
    event.respondWith(
        (async () => {
            const cachedResponse = await caches.match(request);

            const networkFetch = fetch(request)
                .then(async networkResponse => {
                    if (
                        networkResponse &&
                        networkResponse.status === 200 &&
                        (networkResponse.type === 'basic' || networkResponse.type === 'cors')
                    ) {
                        const cache = await caches.open(DYNAMIC_CACHE);
                        cache.put(request, networkResponse.clone());
                        limitCache(DYNAMIC_CACHE, MAX_DYNAMIC_ITEMS);
                    }
                    return networkResponse;
                })
                .catch(async () => {
                    if (request.destination === 'image') {
                        return caches.match('/assets/img/applogo-192x192.png');
                    }
                    return null;
                });

            return cachedResponse || (await networkFetch);
        })()
    );
});