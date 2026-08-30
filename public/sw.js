const CACHE = "haishirube-v2";
const CACHE_PREFIX = "haishirube-";
const APP_ROUTES = ["/", "/yaku", "/rules", "/glossary"];
const CORE_FILES = ["/manifest.webmanifest", "/icons/icon-192.svg", "/icons/icon-512.svg", "/icons/icon-maskable.svg"];

async function cacheResponse(cache, request) {
  try {
    const response = await fetch(request, { cache: "reload" });
    if (!response.ok) return;
    await cache.put(request, response.clone());
    return response;
  } catch {
    return undefined;
  }
}

async function precacheApp() {
  const cache = await caches.open(CACHE);
  await Promise.allSettled(CORE_FILES.map((url) => cacheResponse(cache, url)));

  for (const route of APP_ROUTES) {
    const response = await cacheResponse(cache, route);
    if (!response) continue;
    const html = await response.text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => new URL(match[1], self.location.origin))
      .filter((url) => url.origin === self.location.origin && url.pathname.startsWith("/_next/"))
      .map((url) => url.href);
    await Promise.allSettled([...new Set(assets)].map((url) => cacheResponse(cache, url)));
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheApp().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS" || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls
    .map((url) => new URL(url, self.location.origin))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => url.href);
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.allSettled(urls.map((url) => cacheResponse(cache, url)))));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(async () => (await caches.match(event.request)) || (await caches.match(url.pathname)) || caches.match("/"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }))
  );
});
