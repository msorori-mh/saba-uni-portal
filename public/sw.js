/* Student Mobile PWA — minimal app-shell service worker.
 * Scope: '/'. Only caches static app-shell assets.
 * Never caches API/auth/sensitive student data (finance, documents,
 * requests, grades, academic record, supabase auth/storage, etc.).
 */
const VERSION = "student-mobile-pwa-v1";
const STATIC_CACHE = `static-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
];

// Paths that must NEVER be cached (sensitive / dynamic / auth).
const NEVER_CACHE_PATTERNS = [
  /\/mobile\/student\/finance/i,
  /\/mobile\/student\/documents/i,
  /\/mobile\/student\/requests/i,
  /\/mobile\/student\/grades/i,
  /\/mobile\/student\/academic-record/i,
  /\/mobile\/student\/schedule/i,
  /\/api\//i,
  /\/_serverFn\//i,
  /supabase\.co/i,
  /supabase\.in/i,
  /\/auth\//i,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== STATIC_CACHE).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

function isNeverCache(url) {
  return NEVER_CACHE_PATTERNS.some((re) => re.test(url));
}

function isStaticAsset(url) {
  return /\.(?:css|js|mjs|woff2?|ttf|otf|png|jpg|jpeg|webp|svg|ico)$/i.test(url);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Same-origin only. Bypass everything cross-origin (incl. Supabase).
  if (url.origin !== self.location.origin) return;

  // Sensitive / dynamic paths -> network only, no caching.
  if (isNeverCache(url.pathname + url.search)) return;

  // HTML navigations -> NetworkFirst, fallback to offline page.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          return fresh;
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return offline || new Response("Offline", { status: 503 });
        }
      })()
    );
    return;
  }

  // Static assets -> StaleWhileRevalidate (app shell).
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })()
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
