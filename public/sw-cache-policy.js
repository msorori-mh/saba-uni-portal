/* Security policy shared by the portal service worker and its behavioral tests. */
(function exposePortalPwaCachePolicy(scope) {
  "use strict";

  const OWNED_CACHE_PREFIX = "portal-pwa-";
  // Exact cache name used by PR315 v1 before the owned prefix was introduced.
  // It is included only so the vulnerable cache cannot survive the v2 upgrade.
  const LEGACY_OWNED_CACHE_NAMES = Object.freeze(["static-portal-pwa-v1"]);
  const PUBLIC_SHELL_ASSETS = Object.freeze({
    "/offline.html": ["text/html"],
    "/manifest.webmanifest": ["application/manifest+json", "application/json"],
    "/icon-192.png": ["image/png"],
    "/icon-512.png": ["image/png"],
    "/icon-maskable-512.png": ["image/png"],
  });

  const PROTECTED_PATH_PATTERNS = [
    /^\/api(?:\/|$)/i,
    /^\/_serverFn(?:\/|$)/i,
    /^\/auth(?:\/|$)/i,
    /^\/portal-login(?:\/|$)/i,
    /^\/admin(?:\/|$)/i,
    /^\/faculty-portal(?:\/|$)/i,
    /^\/student(?:\/|$)/i,
    /^\/mobile\/student(?:\/|$)/i,
    /student[-_/ ]?requests?/i,
    /official[-_/ ]?documents?/i,
    /(?:download|signed[-_/ ]?url|attachments?)/i,
    /(?:academic[-_/ ]?(?:data|record)|grades?)/i,
    /(?:payments?|payment[-_/ ]?confirmations?)/i,
    /councils?/i,
    /graduation[-_/ ]?projects?/i,
    /graduates?[-_/ ]?affairs?/i,
  ];

  function parseUrl(value, origin) {
    try {
      return new URL(typeof value === "string" ? value : value.url, origin);
    } catch {
      return null;
    }
  }

  function isProtectedPath(pathnameAndSearch) {
    return PROTECTED_PATH_PATTERNS.some((pattern) => pattern.test(pathnameAndSearch));
  }

  function getPublicShellAsset(value, origin) {
    const url = parseUrl(value, origin);
    if (!url || url.origin !== origin || url.search || url.hash) return null;
    if (isProtectedPath(url.pathname)) return null;
    const contentTypes = PUBLIC_SHELL_ASSETS[url.pathname];
    return contentTypes ? { url, contentTypes } : null;
  }

  function hasPrivateRequestContext(request) {
    if (request.credentials !== "omit") return true;
    return Boolean(request.headers.get("authorization") || request.headers.get("cookie"));
  }

  function canCacheRequest(request, origin) {
    return (
      request.method === "GET" &&
      !hasPrivateRequestContext(request) &&
      getPublicShellAsset(request, origin) !== null
    );
  }

  function hasUnsafeResponseHeaders(response) {
    const cacheControl = (response.headers.get("cache-control") || "").toLowerCase();
    if (/(?:^|,)\s*(?:private|no-store|no-cache)(?:\s*(?:=|,|$))/.test(cacheControl)) {
      return true;
    }
    if (response.headers.get("set-cookie")) return true;

    const vary = (response.headers.get("vary") || "")
      .toLowerCase()
      .split(",")
      .map((value) => value.trim());
    return vary.some((value) => value === "*" || value === "cookie" || value === "authorization");
  }

  function canCacheResponse(request, response, origin) {
    const shellAsset = getPublicShellAsset(request, origin);
    if (!shellAsset || !canCacheRequest(request, origin)) return false;
    if (!response || !response.ok || response.status !== 200 || hasUnsafeResponseHeaders(response)) {
      return false;
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    return shellAsset.contentTypes.some((allowed) => contentType.startsWith(allowed));
  }

  function isOwnedCacheName(name) {
    return name.startsWith(OWNED_CACHE_PREFIX) || LEGACY_OWNED_CACHE_NAMES.includes(name);
  }

  scope.portalPwaCachePolicy = Object.freeze({
    OWNED_CACHE_PREFIX,
    LEGACY_OWNED_CACHE_NAMES,
    PUBLIC_SHELL_ASSETS,
    canCacheRequest,
    canCacheResponse,
    getPublicShellAsset,
    hasPrivateRequestContext,
    hasUnsafeResponseHeaders,
    isOwnedCacheName,
    isProtectedPath,
  });
})(typeof self !== "undefined" ? self : globalThis);
