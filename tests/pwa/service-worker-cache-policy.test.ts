import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

type Policy = {
  OWNED_CACHE_PREFIX: string;
  LEGACY_OWNED_CACHE_NAMES: readonly string[];
  canCacheRequest(request: Request, origin: string): boolean;
  canCacheResponse(request: Request, response: Response, origin: string): boolean;
  getPublicShellAsset(value: string | Request, origin: string): unknown;
  isOwnedCacheName(name: string): boolean;
  isProtectedPath(path: string): boolean;
};

const ORIGIN = "https://portal.example";
let policy: Policy;

beforeAll(() => {
  const context: Record<string, unknown> = { URL };
  context.globalThis = context;
  vm.runInNewContext(
    readFileSync(join(process.cwd(), "public/sw-cache-policy.js"), "utf8"),
    context,
  );
  policy = context.portalPwaCachePolicy as Policy;
});

const request = (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  return {
    method: init.method ?? "GET",
    credentials: init.credentials ?? "omit",
    headers,
    url: new URL(path, ORIGIN).href,
  } as Request;
};

const publicResponse = (contentType: string, headers: HeadersInit = {}) =>
  new Response("safe", { status: 200, headers: { "Content-Type": contentType, ...headers } });

describe("closed static-shell cache policy", () => {
  test.each([
    ["public icon", "/icon-192.png", "image/png"],
    ["manifest", "/manifest.webmanifest", "application/manifest+json"],
    ["offline shell", "/offline.html", "text/html; charset=utf-8"],
  ])("allows %s", (_name, path, contentType) => {
    const req = request(path);
    expect(policy.canCacheRequest(req, ORIGIN)).toBe(true);
    expect(policy.canCacheResponse(req, publicResponse(contentType), ORIGIN)).toBe(true);
  });

  test.each([
    "/faculty-portal/file.pdf",
    "/admin/export.csv",
    "/student/document.png",
    "/_serverFn/foo.js",
    "/api/report.css",
    "/mobile/student/requests/icon.png",
    "/official-documents/download/signed.png",
    "/assets/unknown.js",
  ])("denies protected or unknown asset-looking URL %s", (path) => {
    const req = request(path);
    expect(policy.canCacheRequest(req, ORIGIN)).toBe(false);
    expect(policy.canCacheResponse(req, publicResponse("image/png"), ORIGIN)).toBe(false);
  });

  test("denies cross-origin Supabase", () => {
    const req = request("https://example.supabase.co/storage/v1/object/public/icon-192.png");
    expect(policy.canCacheRequest(req, ORIGIN)).toBe(false);
  });

  test("denies credentialled and authenticated requests", () => {
    expect(policy.canCacheRequest(request("/icon-192.png", { credentials: "include" }), ORIGIN)).toBe(false);
    expect(
      policy.canCacheRequest(
        request("/icon-192.png", { headers: { Authorization: "Bearer secret" } }),
        ORIGIN,
      ),
    ).toBe(false);
  });

  test.each(["no-store", "private, max-age=60", "no-cache"])(
    "denies Cache-Control: %s",
    (cacheControl) => {
      const req = request("/icon-192.png");
      expect(
        policy.canCacheResponse(
          req,
          publicResponse("image/png", { "Cache-Control": cacheControl }),
          ORIGIN,
        ),
      ).toBe(false);
    },
  );

  test("denies user-specific response headers and wrong content types", () => {
    const req = request("/icon-192.png");
    expect(policy.canCacheResponse(req, publicResponse("image/png", { Vary: "Cookie" }), ORIGIN)).toBe(false);
    expect(policy.canCacheResponse(req, publicResponse("image/png", { Vary: "Authorization" }), ORIGIN)).toBe(false);
    expect(policy.canCacheResponse(req, publicResponse("image/png", { "Set-Cookie": "sid=private" }), ORIGIN)).toBe(false);
    expect(policy.canCacheResponse(req, publicResponse("application/json"), ORIGIN)).toBe(false);
    expect(policy.canCacheResponse(req, new Response("no", { status: 404 }), ORIGIN)).toBe(false);
    expect(policy.canCacheRequest(request("/icon-192.png", { method: "POST" }), ORIGIN)).toBe(false);
  });

  test("logout invariant: no private request has any cache-write eligibility", () => {
    const privateRequests = [
      request("/student/profile.png"),
      request("/faculty-portal/file.pdf"),
      request("/icon-192.png", { credentials: "include" }),
    ];
    expect(privateRequests.filter((req) => policy.canCacheRequest(req, ORIGIN))).toHaveLength(0);
  });
});

describe("owned cache lifecycle", () => {
  test("v1 to v2 cleanup selects only old portal-owned caches", () => {
    const current = "portal-pwa-v2";
    const names = [
      "portal-pwa-v1",
      "static-portal-pwa-v1",
      current,
      "foreign-cache",
      "workbox-precache-v1",
    ];
    const deleted = names.filter((name) => policy.isOwnedCacheName(name) && name !== current);
    expect(policy.OWNED_CACHE_PREFIX).toBe("portal-pwa-");
    expect(policy.LEGACY_OWNED_CACHE_NAMES).toEqual(["static-portal-pwa-v1"]);
    expect(deleted).toEqual(["portal-pwa-v1", "static-portal-pwa-v1"]);
    expect(deleted).not.toContain("foreign-cache");
  });

  test("worker lifecycle has no automatic takeover or reload loop", () => {
    const sw = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
    expect(sw).not.toContain("clients.claim()");
    expect(sw).not.toContain("location.reload()");
    expect(sw.indexOf("self.skipWaiting()"))
      .toBeGreaterThan(sw.indexOf('addEventListener("message"'));
    expect(sw).toContain('event.data === "SKIP_WAITING"');
  });
});
