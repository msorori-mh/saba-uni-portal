/*
 * Routing + cache-eligibility policy of the mobile student offline worker
 * (public/mobile-sw.js, scope /mobile/). Pure functions only: the same file is
 * loaded by the worker (importScripts) and by the behavioural tests (node:vm),
 * so every routing decision is tested with real inputs.
 *
 * This worker is separate from the portal-wide worker (public/sw.js), whose
 * closed static allow-list and "no runtime caching" rule stay untouched.
 *
 * Privacy contract enforced here:
 *  - only immutable hashed build assets, the data-free app-shell HTML and the
 *    web-font files may ever be written to Cache Storage;
 *  - Supabase, server functions, API/auth routes, non-GET requests, staff /
 *    admin / faculty surfaces and every other cross-origin request are never
 *    intercepted (the worker does not call respondWith for them).
 */
(function exposeMobileOfflinePolicy(scope) {
  "use strict";

  const CACHE_PREFIX = "mobile-offline-";
  const CACHE_SCHEMA = "v1";
  const META_CACHE = `${CACHE_PREFIX}${CACHE_SCHEMA}-meta`;
  const FONT_CACHE = `${CACHE_PREFIX}${CACHE_SCHEMA}-fonts`;
  const BUILD_CACHE_PREFIX = `${CACHE_PREFIX}${CACHE_SCHEMA}-build-`;
  const BOOTSTRAP_BUILD_ID = "bootstrap";
  const META_KEY = "/__mobile-offline__/meta.json";

  const SCOPE_PATH = "/mobile/";
  const PRIMARY_SHELL_PATH = "/mobile/student";
  const LOGIN_SHELL_PATH = "/mobile/student-login";
  /** Documents stored as app shells. Both are rendered without any user data. */
  const SHELL_PATHS = Object.freeze([PRIMARY_SHELL_PATH, LOGIN_SHELL_PATH]);
  const NAVIGATION_TIMEOUT_MS = 2500;
  const MAX_SHELL_ASSETS = 400;
  const MAX_FONT_ENTRIES = 40;

  // Vite build output: /assets/<name>-<content hash>.<ext>. The content hash
  // makes every URL immutable, which is what makes cache-first safe.
  const HASHED_ASSET_PATH =
    /^\/assets\/[A-Za-z0-9._~@$-]*-[A-Za-z0-9_-]{8,}\.(js|mjs|css|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif|ico)$/;

  const ASSET_CONTENT_TYPES = Object.freeze({
    js: ["text/javascript", "application/javascript", "application/x-javascript"],
    mjs: ["text/javascript", "application/javascript", "application/x-javascript"],
    css: ["text/css"],
    woff: ["font/woff", "application/font-woff", "application/octet-stream"],
    woff2: ["font/woff2", "application/font-woff2", "application/octet-stream"],
    ttf: ["font/ttf", "font/sfnt", "application/x-font-ttf", "application/octet-stream"],
    otf: ["font/otf", "font/sfnt", "application/x-font-opentype", "application/octet-stream"],
    png: ["image/png"],
    jpg: ["image/jpeg"],
    jpeg: ["image/jpeg"],
    gif: ["image/gif"],
    svg: ["image/svg+xml"],
    webp: ["image/webp"],
    avif: ["image/avif"],
    ico: ["image/x-icon", "image/vnd.microsoft.icon"],
  });

  // Same-origin surfaces the worker must never touch, whatever the request
  // looks like. Checked before any positive rule.
  const NEVER_INTERCEPT_PATHS = [
    /^\/_serverFn(?:\/|$)/i,
    /^\/api(?:\/|$)/i,
    /^\/auth(?:\/|$)/i,
    /^\/portal-login(?:\/|$)/i,
    /^\/admin(?:\/|$)/i,
    /^\/staff(?:\/|$)/i,
    /^\/faculty(?:-portal)?(?:\/|$)/i,
    /^\/student(?:\/|$)/i,
    /^\/version\.json$/i,
    /^\/(?:mobile-)?sw(?:-cache-policy)?\.js$/i,
    /^\/mobile-offline-policy\.js$/i,
  ];

  // Auth callbacks / recovery links must always reach the network untouched.
  const AUTH_CALLBACK_PARAM =
    /(?:^|[?&#])(?:code|token|token_hash|access_token|refresh_token|error|error_code|error_description|type)=/i;

  const FONT_CSS_HOST = "fonts.googleapis.com";
  const FONT_FILE_HOST = "fonts.gstatic.com";

  function parseUrl(value, origin) {
    try {
      return new URL(typeof value === "string" ? value : value.url, origin);
    } catch {
      return null;
    }
  }

  function normalizePath(pathname) {
    return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  }

  function header(source, name) {
    try {
      return (source && source.headers && source.headers.get(name)) || "";
    } catch {
      return "";
    }
  }

  function isHashedAssetPath(pathname) {
    return HASHED_ASSET_PATH.test(pathname);
  }

  function isNeverInterceptPath(pathname) {
    return NEVER_INTERCEPT_PATHS.some((pattern) => pattern.test(pathname));
  }

  function isSupabaseHost(hostname) {
    return /(?:^|\.)supabase\.(?:co|in|net)$/i.test(hostname);
  }

  /**
   * Where an offline /mobile navigation may fall back to:
   *  - "exact": the stored shell for exactly this path;
   *  - "redirect": any other signed-in app path is sent to the stored home
   *    shell (never a different document served under a mismatching URL);
   *  - null: not an offline-capable navigation (network only).
   */
  function navigationFallback(pathname) {
    const path = normalizePath(pathname);
    if (SHELL_PATHS.includes(path)) return { mode: "exact", shellPath: path };
    if (path.startsWith(`${PRIMARY_SHELL_PATH}/`)) {
      return { mode: "redirect", shellPath: PRIMARY_SHELL_PATH };
    }
    return null;
  }

  /**
   * The single routing decision of the worker.
   * kind: "bypass" (worker does nothing) | "asset" | "navigate" | "font-css" | "font-file".
   */
  function classifyRequest(request, origin) {
    const bypass = (reason) => ({ kind: "bypass", reason });
    if (!request || request.method !== "GET") return bypass("non-get");

    const url = parseUrl(request, origin);
    if (!url) return bypass("unparsable-url");
    if (url.protocol !== "https:" && url.protocol !== "http:") return bypass("scheme");

    if (url.origin !== origin) {
      if (isSupabaseHost(url.hostname)) return bypass("supabase");
      if (url.protocol !== "https:") return bypass("cross-origin");
      if (url.hostname === FONT_CSS_HOST && url.pathname === "/css2") {
        return { kind: "font-css", reason: "web-font-stylesheet" };
      }
      if (
        url.hostname === FONT_FILE_HOST &&
        /^\/s\/[^?#]+\.(?:woff2?|ttf|otf)$/i.test(url.pathname)
      ) {
        return { kind: "font-file", reason: "web-font-file" };
      }
      return bypass("cross-origin");
    }

    if (header(request, "authorization")) return bypass("authorized-request");
    if (header(request, "range")) return bypass("range-request");
    if (isNeverInterceptPath(url.pathname)) return bypass("protected-path");

    const isNavigation = request.mode === "navigate" || request.destination === "document";
    if (isNavigation) {
      if (AUTH_CALLBACK_PARAM.test(url.search) || AUTH_CALLBACK_PARAM.test(url.hash)) {
        return bypass("auth-callback");
      }
      const fallback = navigationFallback(url.pathname);
      if (!fallback) return bypass("not-mobile-app-navigation");
      return { kind: "navigate", reason: "mobile-app-shell", fallback };
    }

    if (url.search) return bypass("query-string");
    if (isHashedAssetPath(url.pathname)) return { kind: "asset", reason: "hashed-build-asset" };
    return bypass("not-allow-listed");
  }

  function hasUnsafeResponseHeaders(response) {
    const cacheControl = header(response, "cache-control").toLowerCase();
    if (/(?:^|,)\s*(?:private|no-store)(?:\s*(?:=|,|$))/.test(cacheControl)) return true;
    if (header(response, "set-cookie")) return true;
    const vary = header(response, "vary")
      .toLowerCase()
      .split(",")
      .map((value) => value.trim());
    return vary.some((value) => value === "*" || value === "cookie" || value === "authorization");
  }

  function isPlainOkResponse(response) {
    if (!response || response.status !== 200 || response.redirected) return false;
    return (
      response.type !== "opaque" && response.type !== "opaqueredirect" && response.type !== "error"
    );
  }

  /** A hashed asset is stored only as a real 200 of the matching type — never an HTML 404 page. */
  function canCacheAssetResponse(pathname, response) {
    const match = HASHED_ASSET_PATH.exec(pathname);
    if (!match || !isPlainOkResponse(response) || hasUnsafeResponseHeaders(response)) return false;
    const allowed = ASSET_CONTENT_TYPES[match[1].toLowerCase()] || [];
    const contentType = header(response, "content-type").toLowerCase();
    return allowed.some((type) => contentType.startsWith(type));
  }

  function canCacheShellResponse(response) {
    if (!isPlainOkResponse(response) || hasUnsafeResponseHeaders(response)) return false;
    return header(response, "content-type").toLowerCase().startsWith("text/html");
  }

  /** A hashed asset that the server no longer has (deploy replaced it). */
  function isMissingAssetResponse(pathname, response) {
    if (!isHashedAssetPath(pathname) || !response) return false;
    if (response.status === 404 || response.status === 410) return true;
    return (
      response.status === 200 &&
      header(response, "content-type").toLowerCase().startsWith("text/html")
    );
  }

  /** Same-origin hashed build assets referenced anywhere in a shell document. */
  function extractShellAssets(html) {
    const found = new Set();
    const pattern = /\/assets\/[A-Za-z0-9._~@$-]+/g;
    let match;
    while ((match = pattern.exec(String(html || ""))) !== null) {
      if (isHashedAssetPath(match[0])) found.add(match[0]);
      if (found.size >= MAX_SHELL_ASSETS) break;
    }
    return Array.from(found).sort();
  }

  /**
   * Build identifier derived from the shell itself: the hashed asset names
   * change on every code change, so their digest identifies the deployed build
   * without depending on an injected value. Null = not an app shell.
   */
  function buildIdFromAssets(assets) {
    const list = Array.from(new Set(assets || [])).sort();
    if (!list.some((path) => /\.m?js$/.test(path))) return null;
    let hash = 0x811c9dc5;
    for (const char of list.join("\n")) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `${hash.toString(16).padStart(8, "0")}-${list.length}`;
  }

  function buildCacheName(buildId) {
    return `${BUILD_CACHE_PREFIX}${buildId}`;
  }

  function isOwnedCacheName(name) {
    return typeof name === "string" && name.startsWith(CACHE_PREFIX);
  }

  /** Owned caches to delete: everything except meta, fonts and the kept builds. */
  function selectStaleCaches(names, keepBuildIds) {
    const keep = new Set([META_CACHE, FONT_CACHE]);
    for (const id of keepBuildIds || []) if (id) keep.add(buildCacheName(id));
    return (names || []).filter((name) => isOwnedCacheName(name) && !keep.has(name));
  }

  scope.mobileOfflinePolicy = Object.freeze({
    CACHE_PREFIX,
    CACHE_SCHEMA,
    META_CACHE,
    FONT_CACHE,
    BUILD_CACHE_PREFIX,
    BOOTSTRAP_BUILD_ID,
    META_KEY,
    SCOPE_PATH,
    PRIMARY_SHELL_PATH,
    LOGIN_SHELL_PATH,
    SHELL_PATHS,
    NAVIGATION_TIMEOUT_MS,
    MAX_FONT_ENTRIES,
    buildCacheName,
    buildIdFromAssets,
    canCacheAssetResponse,
    canCacheShellResponse,
    classifyRequest,
    extractShellAssets,
    hasUnsafeResponseHeaders,
    isHashedAssetPath,
    isMissingAssetResponse,
    isNeverInterceptPath,
    isOwnedCacheName,
    navigationFallback,
    selectStaleCaches,
  });
})(typeof self !== "undefined" ? self : globalThis);
