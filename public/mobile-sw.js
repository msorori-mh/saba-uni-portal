/*
 * Mobile student app — offline-first service worker. Scope: /mobile/ only.
 * See docs/mobile/OFFLINE-FIRST-01.md.
 *
 * ROLLOUT SWITCH (mirrors MOBILE_OFFLINE_ROLLOUT in
 * src/lib/mobile/offline/config.ts — a test keeps both in sync):
 *   "off"   kill switch: on the next online launch this worker deletes every
 *           cache it owns and unregisters itself.
 *   "pilot" the worker runs only on devices that opted in from Settings. A
 *           worker cannot read localStorage, so the APP decides whether to
 *           register it; a device that did not opt in never has this worker.
 *   "on"    every device.
 */
const MOBILE_OFFLINE_ROLLOUT = "pilot";
/** Defensive: a worker that finds itself running while "off" purges and unregisters. */
const MOBILE_OFFLINE_ENABLED = MOBILE_OFFLINE_ROLLOUT !== "off";
/** Bump on any change to this file or to mobile-offline-policy.js. */
const MOBILE_SW_VERSION = "2026-10-06.2";

importScripts("/mobile-offline-policy.js");

const policy = self.mobileOfflinePolicy;
const ORIGIN = self.location.origin;
const SHELL_REFRESH_MIN_INTERVAL_MS = 60 * 1000;
const ASSET_MISSING_MIN_INTERVAL_MS = 30 * 1000;
const MAX_CLIENT_PRECACHE_URLS = 300;

let metaMemo = null;
let shellRefreshInFlight = null;
let lastShellRefreshAt = 0;
let lastAssetMissingAt = 0;
/** How the most recent /mobile navigation was answered (read by the page on launch). */
let lastNavigation = null;

// ---------------------------------------------------------------- meta + caches

async function readMeta() {
  if (metaMemo) return metaMemo;
  let meta = { current: null, previous: null, updatedAt: 0 };
  try {
    const cache = await caches.open(policy.META_CACHE);
    const stored = await cache.match(policy.META_KEY);
    if (stored) {
      const parsed = await stored.json();
      if (parsed && typeof parsed === "object") {
        meta = {
          current: typeof parsed.current === "string" ? parsed.current : null,
          previous: typeof parsed.previous === "string" ? parsed.previous : null,
          updatedAt: Number(parsed.updatedAt) || 0,
        };
      }
    }
  } catch {
    /* unreadable meta = no build yet */
  }
  metaMemo = meta;
  return meta;
}

async function writeMeta(meta) {
  metaMemo = meta;
  const cache = await caches.open(policy.META_CACHE);
  await cache.put(
    policy.META_KEY,
    new Response(JSON.stringify(meta), { headers: { "content-type": "application/json" } }),
  );
}

async function deleteOwnedCaches(keepBuildIds) {
  const names = await caches.keys();
  const stale =
    keepBuildIds === null
      ? names.filter((name) => policy.isOwnedCacheName(name))
      : policy.selectStaleCaches(names, keepBuildIds);
  await Promise.all(stale.map((name) => caches.delete(name)));
}

/** Keep the current build and the one before it; delete every older build cache. */
async function cleanupOldBuilds() {
  const meta = await readMeta();
  await deleteOwnedCaches([meta.current, meta.previous, policy.BOOTSTRAP_BUILD_ID]);
}

async function matchInBuild(buildId, url) {
  if (!buildId) return undefined;
  // CacheStorage.match with cacheName never creates a missing cache.
  return caches.match(url, { cacheName: policy.buildCacheName(buildId), ignoreVary: true });
}

/** Cache-first lookup across the builds this worker still keeps. */
async function matchAsset(url) {
  const meta = await readMeta();
  for (const buildId of [meta.current, meta.previous, policy.BOOTSTRAP_BUILD_ID]) {
    const hit = await matchInBuild(buildId, url);
    if (hit) return hit;
  }
  return undefined;
}

async function matchShell(shellPath) {
  const meta = await readMeta();
  return matchInBuild(meta.current, shellPath);
}

async function notifyClients(message) {
  try {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) client.postMessage(message);
  } catch {
    /* best-effort */
  }
}

// ---------------------------------------------------------------- shell + assets

/** Fetches one hashed asset without credentials and stores it only if it is a valid 200. */
async function fetchAndStoreAsset(cache, pathname) {
  if (await cache.match(pathname, { ignoreVary: true })) return true;
  const existing = await matchAsset(pathname);
  if (existing) {
    await cache.put(pathname, existing.clone());
    return true;
  }
  const response = await fetch(new Request(pathname, { method: "GET", credentials: "omit" }));
  if (!policy.canCacheAssetResponse(pathname, response)) return false;
  await cache.put(pathname, response);
  return true;
}

/**
 * Downloads the app shells with a credential-less request (so the stored HTML
 * can never be user-specific), derives the build id from the assets they
 * reference, stores those assets, and only then swaps the current build.
 * Any failure leaves the previous shell + assets untouched.
 */
async function refreshShell() {
  const shells = [];
  for (const shellPath of policy.SHELL_PATHS) {
    const response = await fetch(
      new Request(shellPath, { method: "GET", credentials: "omit", cache: "no-store" }),
    );
    if (!policy.canCacheShellResponse(response)) throw new Error(`Unsafe shell: ${shellPath}`);
    const html = await response.clone().text();
    shells.push({ shellPath, response, assets: policy.extractShellAssets(html) });
  }

  const assets = Array.from(new Set(shells.flatMap((shell) => shell.assets))).sort();
  const buildId = policy.buildIdFromAssets(assets);
  if (!buildId) throw new Error("Shell references no build assets");

  const cache = await caches.open(policy.buildCacheName(buildId));
  const stored = await Promise.all(assets.map((pathname) => fetchAndStoreAsset(cache, pathname)));
  if (stored.includes(false)) throw new Error("Shell asset could not be stored");
  for (const shell of shells) await cache.put(shell.shellPath, shell.response);

  const meta = await readMeta();
  const changed = meta.current !== buildId;
  if (changed) {
    await writeMeta({
      current: buildId,
      previous: meta.current || policy.BOOTSTRAP_BUILD_ID,
      updatedAt: Date.now(),
    });
  }
  const next = await readMeta();
  await deleteOwnedCaches([next.current, next.previous]);
  if (changed) await notifyClients({ type: "MOBILE_OFFLINE_SHELL_UPDATED", buildId });
  return buildId;
}

function refreshShellOnce(force) {
  if (shellRefreshInFlight) return shellRefreshInFlight;
  if (!force && Date.now() - lastShellRefreshAt < SHELL_REFRESH_MIN_INTERVAL_MS) {
    return Promise.resolve(null);
  }
  lastShellRefreshAt = Date.now();
  shellRefreshInFlight = refreshShell()
    .catch(() => null)
    .finally(() => {
      shellRefreshInFlight = null;
    });
  return shellRefreshInFlight;
}

/** Assets the page loaded before this worker controlled it (first launch). */
async function precacheClientAssets(urls) {
  if (!Array.isArray(urls)) return;
  const meta = await readMeta();
  const cache = await caches.open(policy.buildCacheName(meta.current || policy.BOOTSTRAP_BUILD_ID));
  const seen = new Set();
  for (const raw of urls.slice(0, MAX_CLIENT_PRECACHE_URLS)) {
    let url;
    try {
      url = new URL(String(raw), ORIGIN);
    } catch {
      continue;
    }
    const decision = policy.classifyRequest({ method: "GET", url: url.href, mode: "cors" }, ORIGIN);
    if (decision.kind !== "asset" || seen.has(url.pathname)) continue;
    seen.add(url.pathname);
    try {
      await fetchAndStoreAsset(cache, url.pathname);
    } catch {
      /* offline or transient: retried on the next launch */
    }
  }
}

// ---------------------------------------------------------------- fetch strategies

async function handleAsset(event, url) {
  const cached = await matchAsset(url.pathname);
  if (cached) return cached;

  const response = await fetch(event.request);
  if (policy.canCacheAssetResponse(url.pathname, response)) {
    const meta = await readMeta();
    const cache = await caches.open(
      policy.buildCacheName(meta.current || policy.BOOTSTRAP_BUILD_ID),
    );
    await cache.put(url.pathname, response.clone());
  } else if (policy.isMissingAssetResponse(url.pathname, response)) {
    // The running document references a build the server no longer has.
    event.waitUntil(onAssetMissing());
  }
  return response;
}

async function onAssetMissing() {
  if (Date.now() - lastAssetMissingAt < ASSET_MISSING_MIN_INTERVAL_MS) return;
  lastAssetMissingAt = Date.now();
  const buildId = await refreshShellOnce(true);
  await notifyClients({ type: "MOBILE_OFFLINE_ASSET_MISSING", refreshed: Boolean(buildId) });
}

function offlineDocument() {
  const html =
    '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    "<title>غير متصل — بوابة الطالب</title></head>" +
    '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#061F33;' +
    'color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px">' +
    '<main><h1 style="font-size:20px">لا يوجد اتصال بالإنترنت</h1>' +
    '<p style="font-size:13px;line-height:1.7;opacity:.8">يحتاج التطبيق إلى الاتصال بالإنترنت ' +
    "مرة واحدة على الأقل ليعمل بعدها دون اتصال.</p>" +
    `<p><a href="${policy.LOGIN_SHELL_PATH}" style="color:#D99A17;font-weight:800">إعادة المحاولة</a></p>` +
    "</main></body></html>";
  return new Response(html, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function recordNavigation(source, reason) {
  lastNavigation = { source, reason: reason || null, at: Date.now() };
}

/**
 * Network-first. The fresh document is always preferred, so an online launch
 * after a deploy gets the new shell (and therefore the new asset hashes). The
 * stored shell is used only when the network fails, answers 5xx, or — for an
 * exact shell path — does not answer within NAVIGATION_TIMEOUT_MS.
 * Navigation responses themselves are never written to the cache.
 */
async function handleNavigation(event, fallback) {
  const network = fetch(event.request);
  const settled = network.then(
    (response) => ({ response }),
    () => ({ failed: true }),
  );

  if (fallback.mode === "exact") {
    const cached = await matchShell(fallback.shellPath);
    if (cached) {
      let timer;
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true }), policy.NAVIGATION_TIMEOUT_MS);
      });
      const outcome = await Promise.race([settled, timeout]);
      clearTimeout(timer);
      if (outcome.response && outcome.response.status < 500) {
        recordNavigation("network");
        event.waitUntil(refreshShellOnce(false));
        return outcome.response;
      }
      recordNavigation("cache", outcome.timedOut ? "timeout" : "network-error");
      if (outcome.timedOut) {
        // Slow link: let the request finish and pick up a new build for next time.
        event.waitUntil(settled.then((late) => (late.response ? refreshShellOnce(false) : null)));
      }
      return cached;
    }
  }

  const outcome = await settled;
  if (outcome.response && outcome.response.status < 500) {
    recordNavigation("network");
    event.waitUntil(refreshShellOnce(false));
    return outcome.response;
  }

  if (fallback.mode === "redirect" && (await matchShell(fallback.shellPath))) {
    // Deep app path while unreachable: land on the stored home shell instead
    // of serving a document under a URL it was not rendered for.
    recordNavigation("cache", "network-error");
    return Response.redirect(new URL(fallback.shellPath, ORIGIN).href, 302);
  }
  if (outcome.response) {
    recordNavigation("network");
    return outcome.response;
  }
  recordNavigation("none", "network-error");
  return offlineDocument();
}

async function trimFontCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - policy.MAX_FONT_ENTRIES;
  for (let index = 0; index < excess; index += 1) await cache.delete(keys[index]);
}

/** Web fonts: the stylesheet is stale-while-revalidate, the immutable font files cache-first. */
async function handleFont(event, kind) {
  const cache = await caches.open(policy.FONT_CACHE);
  const cached = await cache.match(event.request.url, { ignoreVary: true });
  if (cached && kind === "font-file") return cached;
  const fromNetwork = fetch(event.request).then(async (response) => {
    const storable = response.status === 200 || (kind === "font-css" && response.type === "opaque");
    if (storable) {
      await cache.put(event.request.url, response.clone());
      await trimFontCache(cache);
    }
    return response;
  });
  if (!cached) return fromNetwork;
  event.waitUntil(fromNetwork.catch(() => undefined));
  return cached;
}

// ---------------------------------------------------------------- lifecycle

self.addEventListener("install", (event) => {
  // Safe to take over immediately: assets are immutable (served by exact
  // hashed URL) and documents stay network-first, so there is no mixed-version
  // takeover to protect against.
  self.skipWaiting();
  if (!MOBILE_OFFLINE_ENABLED) return;
  event.waitUntil(refreshShellOnce(true));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (!MOBILE_OFFLINE_ENABLED) {
        await deleteOwnedCaches(null);
        metaMemo = null;
        await self.registration.unregister();
        await notifyClients({ type: "MOBILE_OFFLINE_DISABLED" });
        return;
      }
      await cleanupOldBuilds();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (!MOBILE_OFFLINE_ENABLED) return;
  const decision = policy.classifyRequest(event.request, ORIGIN);
  // "bypass" = the browser handles the request as if this worker did not exist.
  if (decision.kind === "bypass") return;

  const url = new URL(event.request.url);
  if (decision.kind === "asset") {
    event.respondWith(handleAsset(event, url));
  } else if (decision.kind === "navigate") {
    event.respondWith(handleNavigation(event, decision.fallback));
  } else if (decision.kind === "font-css" || decision.kind === "font-file") {
    event.respondWith(handleFont(event, decision.kind));
  }
});

self.addEventListener("message", (event) => {
  const data = event.data;
  const type = typeof data === "string" ? data : data && data.type;
  const reply = (payload) => {
    const port = event.ports && event.ports[0];
    if (port) port.postMessage(payload);
  };

  if (type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (type === "MOBILE_OFFLINE_STATUS") {
    event.waitUntil(
      readMeta().then((meta) =>
        reply({
          enabled: MOBILE_OFFLINE_ENABLED,
          rollout: MOBILE_OFFLINE_ROLLOUT,
          version: MOBILE_SW_VERSION,
          buildId: meta.current,
          lastNavigation,
        }),
      ),
    );
  } else if (type === "MOBILE_OFFLINE_PRECACHE") {
    if (MOBILE_OFFLINE_ENABLED) event.waitUntil(precacheClientAssets(data.urls));
  } else if (type === "MOBILE_OFFLINE_REFRESH") {
    if (MOBILE_OFFLINE_ENABLED) event.waitUntil(refreshShellOnce(true));
  } else if (type === "MOBILE_OFFLINE_PURGE") {
    // Recovery path: drop every stored shell/asset; the page then reloads from the network.
    event.waitUntil(
      deleteOwnedCaches(null).then(() => {
        metaMemo = null;
        lastShellRefreshAt = 0;
        reply({ ok: true });
      }),
    );
  }
});
