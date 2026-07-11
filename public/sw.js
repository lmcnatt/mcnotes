// McNotes service worker — installable PWA with a basic offline shell.
// Intentionally minimal: we do NOT cache API responses or note data because the
// app is auth-gated and caching could serve stale or cross-user content.

const CACHE_VERSION = "mcnotes-v1";
const OFFLINE_URL = "/offline";

// Precache only the offline fallback shell.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.add(OFFLINE_URL))
  );
  self.skipWaiting();
});

// Remove old caches on activation.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle same-origin GET navigations. Everything else (assets, API,
  // cross-origin) goes straight to the network and is never cached.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API calls — always live network, no caching.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode !== "navigate") return;

  // Network-first for navigations; fall back to the offline shell when the
  // network is unavailable.
  event.respondWith(
    fetch(request).catch(() =>
      caches.open(CACHE_VERSION).then((cache) => cache.match(OFFLINE_URL))
    )
  );
});
