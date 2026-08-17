const CACHE_PREFIX = "medminds-sales-agent";
const SHELL_CACHE = `${CACHE_PREFIX}-shell-v4`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-v4`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  OFFLINE_URL,
  "/app",
  "/medminds-logo.png",
  "/favicon-32.png",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
  "/pwa-maskable-512.png",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function isSensitivePath(pathname) {
  return pathname.startsWith("/admin") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/documents/") ||
    pathname.startsWith("/widget") ||
    pathname.startsWith("/test-chat");
}

function isSafeCacheable(response) {
  if (!response || !response.ok || response.type === "opaque") return false;
  const cacheControl = response.headers.get("cache-control") || "";
  return !/no-store|private/i.test(cacheControl);
}

async function networkOnlyNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

async function publicNavigation(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (isSafeCacheable(response)) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

async function staticAsset(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isSafeCacheable(response)) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/sw.js" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(isSensitivePath(url.pathname) ? networkOnlyNavigation(request) : publicNavigation(request));
    return;
  }

  if (isSensitivePath(url.pathname)) return;

  const isHashedNextAsset = url.pathname.startsWith("/_next/static/");
  const isStaticDestination = ["style", "script", "image", "font"].includes(request.destination);
  const isPwaAsset = PRECACHE.includes(url.pathname);

  if (isHashedNextAsset || isStaticDestination || isPwaAsset) event.respondWith(staticAsset(request));
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
