/* Portal-wide PWA: closed positive static-shell allowlist; no runtime caching. */
importScripts("/sw-cache-policy.js");

const VERSION = "v2";
const { OWNED_CACHE_PREFIX, PUBLIC_SHELL_ASSETS, canCacheRequest, canCacheResponse, isOwnedCacheName, isProtectedPath } =
  self.portalPwaCachePolicy;
const STATIC_CACHE = `${OWNED_CACHE_PREFIX}${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = Object.freeze(Object.keys(PUBLIC_SHELL_ASSETS));

async function precachePublicShell() {
  const cache = await caches.open(STATIC_CACHE);
  try {
    await Promise.all(
      PRECACHE_URLS.map(async (url) => {
        const request = new Request(url, {
          method: "GET",
          credentials: "omit",
          cache: "reload",
        });
        if (!canCacheRequest(request, self.location.origin)) throw new Error("Unsafe shell request");
        const response = await fetch(request);
        if (!canCacheResponse(request, response, self.location.origin)) {
          throw new Error(`Unsafe shell response: ${url}`);
        }
        await cache.put(request, response.clone());
      }),
    );
  } catch (error) {
    await caches.delete(STATIC_CACHE);
    throw error;
  }
}

self.addEventListener("install", (event) => {
  // Deliberately remain waiting. A visible client may explicitly send SKIP_WAITING.
  event.waitUntil(precachePublicShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => isOwnedCacheName(name) && name !== STATIC_CACHE)
          .map((name) => caches.delete(name)),
      );
      // Existing authenticated pages keep their current controller until their
      // next normal navigation, preventing mixed-version takeover.
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isProtectedPath(url.pathname + url.search)) return;

  // Navigations are network-only. On a network failure, only the harmless,
  // precached offline shell may be returned; HTML responses are never cached.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        const offline = await cache.match(OFFLINE_URL);
        return offline || new Response("Offline", { status: 503 });
      }),
    );
  }

  // Every non-navigation request is network-only. There is intentionally no
  // extension-based or other runtime Cache Storage write path.
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
