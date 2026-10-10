/**
 * OFFLINE-FIRST-01 — routing decisions of the mobile offline worker.
 *
 * The policy file is the SAME file the worker loads with importScripts, so
 * these are behavioural tests of the real rules, with real inputs.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

type Decision = { kind: string; reason: string; fallback?: { mode: string; shellPath: string } };
type Policy = {
  CACHE_PREFIX: string;
  META_CACHE: string;
  FONT_CACHE: string;
  SCOPE_PATH: string;
  SHELL_PATHS: readonly string[];
  PRIMARY_SHELL_PATH: string;
  NAVIGATION_TIMEOUT_MS: number;
  buildCacheName(id: string): string;
  buildIdFromAssets(assets: string[]): string | null;
  canCacheAssetResponse(pathname: string, response: Response): boolean;
  canCacheShellResponse(response: Response): boolean;
  classifyRequest(request: unknown, origin: string): Decision;
  extractShellAssets(html: string): string[];
  isMissingAssetResponse(pathname: string, response: Response): boolean;
  isOwnedCacheName(name: string): boolean;
  navigationFallback(pathname: string): { mode: string; shellPath: string } | null;
  selectStaleCaches(names: string[], keep: Array<string | null>): string[];
};

const ORIGIN = "https://quboolye.com";
const SUPABASE = "https://wpmicqriltrowwonknox.supabase.co";
let policy: Policy;

beforeAll(() => {
  const context: Record<string, unknown> = { URL };
  context.globalThis = context;
  vm.runInNewContext(
    readFileSync(join(process.cwd(), "public/mobile-offline-policy.js"), "utf8"),
    context,
  );
  policy = context.mobileOfflinePolicy as Policy;
});

const req = (
  url: string,
  init: {
    method?: string;
    mode?: string;
    destination?: string;
    headers?: Record<string, string>;
  } = {},
) => ({
  method: init.method ?? "GET",
  url: new URL(url, ORIGIN).href,
  mode: init.mode ?? "cors",
  destination: init.destination ?? "",
  headers: new Headers(init.headers),
});
const nav = (url: string) => req(url, { mode: "navigate", destination: "document" });
const kind = (request: unknown) => policy.classifyRequest(request, ORIGIN).kind;

describe("hashed build assets are the only cache-first resources", () => {
  test.each([
    "/assets/index-DXB_A-j9.js",
    "/assets/styles-C_Qymcr2.css",
    "/assets/mobile.student.schedule-Bx7_kQ2a.js",
    "/assets/college-logo-D4f6GhJk.jpg",
    "/assets/Cairo-Variable-a1B2c3D4.woff2",
  ])("cache-first: %s", (path) => {
    expect(kind(req(path))).toBe("asset");
  });

  test.each([
    ["no content hash", "/assets/app.js"],
    ["query string", "/assets/index-DXB_A-j9.js?v=2"],
    ["outside the build directory", "/index-DXB_A-j9.js"],
    ["nested path", "/assets/x/index-DXB_A-j9.js"],
    ["unknown extension", "/assets/data-DXB_A-j9.json"],
    ["HTML", "/assets/page-DXB_A-j9.html"],
    ["public icon (not a build asset)", "/icon-192.png"],
    ["manifest", "/manifest.webmanifest"],
  ])("not cached — %s", (_name, path) => {
    expect(kind(req(path))).toBe("bypass");
  });

  test("an asset request carrying credentials headers or a range is never handled", () => {
    expect(kind(req("/assets/index-DXB_A-j9.js", { headers: { Authorization: "Bearer x" } }))).toBe(
      "bypass",
    );
    expect(kind(req("/assets/index-DXB_A-j9.js", { headers: { Range: "bytes=0-1" } }))).toBe(
      "bypass",
    );
  });
});

describe("explicit never-intercept list", () => {
  test.each([
    ["server function POST", req("/_serverFn/abc123", { method: "POST" })],
    ["server function GET", req("/_serverFn/abc123")],
    ["asset-looking server function", req("/_serverFn/index-DXB_A-j9.js")],
    ["API route", req("/api/public/file-redirect?u=1")],
    ["auth callback route", req("/auth/callback?code=abc")],
    ["Supabase REST", req(`${SUPABASE}/rest/v1/student_profiles?select=id`)],
    [
      "Supabase auth token refresh",
      req(`${SUPABASE}/auth/v1/token?grant_type=refresh_token`, { method: "POST" }),
    ],
    ["Supabase storage signed URL", req(`${SUPABASE}/storage/v1/object/sign/docs/a.pdf?token=x`)],
    [
      "Supabase asset-looking object",
      req(`${SUPABASE}/storage/v1/object/public/assets/index-DXB_A-j9.js`),
    ],
    ["version probe", req("/version.json?probe=1")],
    ["the worker script itself", req("/mobile-sw.js")],
    ["any POST", req("/mobile/student/requests", { method: "POST" })],
    ["PUT", req("/assets/index-DXB_A-j9.js", { method: "PUT" })],
    ["other cross-origin host", req("https://example.com/assets/index-DXB_A-j9.js")],
    ["cross-origin image CDN", req("https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a.png")],
  ])("bypass — %s", (_name, request) => {
    expect(kind(request)).toBe("bypass");
  });

  test.each([
    "/admin",
    "/admin/students",
    "/staff/requests",
    "/faculty-portal/grades",
    "/student/requests",
    "/portal-login",
    "/",
    "/news",
    "/mobile",
    "/mobile/student-forgot-password",
  ])("navigation to %s is never served from the app shell", (path) => {
    expect(kind(nav(path))).toBe("bypass");
  });

  test("protected surfaces are rejected by the explicit list itself, before any positive rule", () => {
    const reason = (request: unknown) => policy.classifyRequest(request, ORIGIN).reason;
    for (const path of [
      "/_serverFn/abc",
      "/api/x",
      "/auth/callback",
      "/version.json",
      "/mobile-sw.js",
    ]) {
      expect(reason(req(path))).toBe("protected-path");
    }
    for (const path of [
      "/admin",
      "/staff/requests",
      "/faculty-portal",
      "/student/requests",
      "/portal-login",
    ]) {
      expect(reason(nav(path))).toBe("protected-path");
    }
    expect(reason(req(`${SUPABASE}/rest/v1/x`))).toBe("supabase");
    expect(reason(req("/_serverFn/abc", { method: "POST" }))).toBe("non-get");
    expect(reason(nav("/mobile/student-login?code=abc"))).toBe("auth-callback");
    expect(reason(req("https://example.com/a.js"))).toBe("cross-origin");
  });

  test("auth/recovery callbacks reach the network even on a mobile path", () => {
    expect(kind(nav("/mobile/student-login?code=abc"))).toBe("bypass");
    expect(kind(nav("/mobile/student-login?type=recovery&token_hash=x"))).toBe("bypass");
    expect(kind(nav("/mobile/student#access_token=abc"))).toBe("bypass");
  });

  test("only the two web-font hosts are handled cross-origin, by exact shape", () => {
    expect(
      kind(
        req("https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap", {
          mode: "no-cors",
        }),
      ),
    ).toBe("font-css");
    expect(kind(req("https://fonts.gstatic.com/s/cairo/v28/abc.woff2"))).toBe("font-file");
    expect(kind(req("https://fonts.googleapis.com/icon?family=Material"))).toBe("bypass");
    expect(kind(req("https://fonts.gstatic.com/other/abc.js"))).toBe("bypass");
    expect(kind(req("http://fonts.gstatic.com/s/cairo/v28/abc.woff2"))).toBe("bypass");
  });
});

describe("navigation fallback is limited to the mobile app", () => {
  test("shell paths fall back to their own stored document", () => {
    for (const path of ["/mobile/student", "/mobile/student/", "/mobile/student-login"]) {
      const decision = policy.classifyRequest(nav(path), ORIGIN);
      expect(decision.kind).toBe("navigate");
      expect(decision.fallback?.mode).toBe("exact");
    }
    expect(policy.navigationFallback("/mobile/student-login")?.shellPath).toBe(
      "/mobile/student-login",
    );
  });

  test("deep app paths are redirected to the stored home shell, never served a mismatching document", () => {
    for (const path of [
      "/mobile/student/schedule",
      "/mobile/student/academic-record",
      "/mobile/student/documents/123",
    ]) {
      const decision = policy.classifyRequest(nav(path), ORIGIN);
      expect(decision.kind).toBe("navigate");
      expect(decision.fallback).toEqual({ mode: "redirect", shellPath: "/mobile/student" });
    }
  });

  test("the navigation timeout is short and the scope is /mobile/", () => {
    expect(policy.NAVIGATION_TIMEOUT_MS).toBe(2500);
    expect(policy.SCOPE_PATH).toBe("/mobile/");
    expect([...policy.SHELL_PATHS]).toEqual(["/mobile/student", "/mobile/student-login"]);
  });
});

describe("what may be written to the cache", () => {
  const ok = (type: string, headers: Record<string, string> = {}, status = 200) =>
    new Response("x", { status, headers: { "content-type": type, ...headers } });

  test("a hashed asset is stored only as a clean 200 of the matching type", () => {
    const js = "/assets/index-DXB_A-j9.js";
    expect(policy.canCacheAssetResponse(js, ok("text/javascript; charset=utf-8"))).toBe(true);
    expect(policy.canCacheAssetResponse("/assets/styles-C_Qymcr2.css", ok("text/css"))).toBe(true);
    // The classic stale-deploy trap: the server answers a missing chunk with an HTML page.
    expect(policy.canCacheAssetResponse(js, ok("text/html"))).toBe(false);
    expect(policy.canCacheAssetResponse(js, ok("text/javascript", {}, 404))).toBe(false);
    expect(policy.canCacheAssetResponse(js, ok("text/javascript", {}, 206))).toBe(false);
    expect(
      policy.canCacheAssetResponse(js, ok("text/javascript", { "cache-control": "private" })),
    ).toBe(false);
    expect(
      policy.canCacheAssetResponse(js, ok("text/javascript", { "cache-control": "no-store" })),
    ).toBe(false);
    expect(policy.canCacheAssetResponse(js, ok("text/javascript", { "set-cookie": "a=b" }))).toBe(
      false,
    );
    expect(policy.canCacheAssetResponse(js, ok("text/javascript", { vary: "Cookie" }))).toBe(false);
    expect(policy.canCacheAssetResponse("/assets/app.js", ok("text/javascript"))).toBe(false);
  });

  test("a shell is stored only as clean, non-private HTML", () => {
    expect(
      policy.canCacheShellResponse(
        ok("text/html; charset=utf-8", {
          "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
        }),
      ),
    ).toBe(true);
    expect(policy.canCacheShellResponse(ok("application/json"))).toBe(false);
    expect(policy.canCacheShellResponse(ok("text/html", {}, 500))).toBe(false);
    expect(policy.canCacheShellResponse(ok("text/html", { "set-cookie": "sid=1" }))).toBe(false);
    expect(
      policy.canCacheShellResponse(ok("text/html", { "cache-control": "private, max-age=0" })),
    ).toBe(false);
    expect(policy.canCacheShellResponse(ok("text/html", { vary: "Authorization" }))).toBe(false);
  });

  test("a missing hashed asset is recognised (404, 410 or an HTML body)", () => {
    const js = "/assets/index-DXB_A-j9.js";
    expect(policy.isMissingAssetResponse(js, ok("text/html", {}, 404))).toBe(true);
    expect(policy.isMissingAssetResponse(js, ok("text/html"))).toBe(true);
    expect(policy.isMissingAssetResponse(js, ok("text/javascript"))).toBe(false);
    expect(policy.isMissingAssetResponse(js, ok("text/html", {}, 503))).toBe(false);
  });
});

describe("build identity and cache generations", () => {
  const shell = (hash: string) => `<!doctype html><html><head>
    <link rel="stylesheet" href="/assets/styles-${hash}.css">
    <link rel="modulepreload" href="/assets/mobile.student-${hash}.js">
    <link rel="icon" href="/assets/college-logo-${hash}.jpg">
    <link rel="manifest" href="/manifest.webmanifest">
    <script type="module" src="/assets/index-${hash}.js"></script>
    <script>window.$_TSR={m:["/assets/index-${hash}.js","/_serverFn/x","https://x.supabase.co/a.js"]}</script>
    </head><body></body></html>`;

  test("only hashed build assets are extracted from a shell", () => {
    expect(policy.extractShellAssets(shell("AAAAAAAA"))).toEqual([
      "/assets/college-logo-AAAAAAAA.jpg",
      "/assets/index-AAAAAAAA.js",
      "/assets/mobile.student-AAAAAAAA.js",
      "/assets/styles-AAAAAAAA.css",
    ]);
  });

  test("the build id is derived from the shell and changes with every deploy", () => {
    const a = policy.buildIdFromAssets(policy.extractShellAssets(shell("AAAAAAAA")));
    const b = policy.buildIdFromAssets(policy.extractShellAssets(shell("BBBBBBBB")));
    expect(a).toMatch(/^[0-9a-f]{8}-4$/);
    expect(a).toBe(policy.buildIdFromAssets(policy.extractShellAssets(shell("AAAAAAAA"))));
    expect(b).not.toBe(a);
    // A document without build scripts (error page, offline page) is not an app shell.
    expect(policy.buildIdFromAssets([])).toBeNull();
    expect(policy.buildIdFromAssets(["/assets/styles-AAAAAAAA.css"])).toBeNull();
  });

  test("cleanup keeps the current + previous build and never touches foreign caches", () => {
    const names = [
      policy.buildCacheName("old"),
      policy.buildCacheName("prev"),
      policy.buildCacheName("cur"),
      policy.META_CACHE,
      policy.FONT_CACHE,
      "portal-pwa-v2",
      "workbox-precache",
    ];
    expect(policy.selectStaleCaches(names, ["cur", "prev"])).toEqual([
      policy.buildCacheName("old"),
    ]);
    expect(policy.buildCacheName("cur")).toBe("mobile-offline-v1-build-cur");
    expect(policy.isOwnedCacheName("portal-pwa-v2")).toBe(false);
  });
});
