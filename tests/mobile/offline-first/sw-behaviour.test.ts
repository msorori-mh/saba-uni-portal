/**
 * OFFLINE-FIRST-01 — the real public/mobile-sw.js executed in a sandbox with
 * fake Cache Storage / fetch / clients. No browser is available in CI, so this
 * is where the worker's strategies are exercised end to end:
 * install → precache, cache-first assets, network-first navigations with the
 * offline fallback, deploy swap + cleanup, missing-asset recovery, kill switch.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const ORIGIN = "https://quboolye.com";
const PUBLIC = join(process.cwd(), "public");
const SW_SOURCE = readFileSync(join(PUBLIC, "mobile-sw.js"), "utf8");

type Handler = () => Response | Promise<Response>;

function shellHtml(build: string, extra = "") {
  return `<!doctype html><html><head><meta name="build-sha" content="x">
  <link rel="stylesheet" href="/assets/styles-${build}.css">
  <script type="module" src="/assets/index-${build}.js"></script>${extra}</head><body></body></html>`;
}

const html = (body: string) => () =>
  new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    },
  });
const js = (body: string) => () =>
  new Response(body, { headers: { "content-type": "text/javascript" } });
const css = (body: string) => () => new Response(body, { headers: { "content-type": "text/css" } });
const notFound = () =>
  new Response("<html>404</html>", { status: 404, headers: { "content-type": "text/html" } });

function createWorker(options: { source?: string } = {}) {
  const stores = new Map<string, Map<string, Response>>();
  const routes = new Map<string, Handler>();
  const fetchLog: Array<{ url: string; credentials?: string }> = [];
  const listeners = new Map<string, (event: unknown) => void>();
  const posted: unknown[] = [];
  const timers: Array<{ id: number; fn: () => void; ms: number }> = [];
  let timerId = 0;
  let online = true;
  let clockOffset = 0;
  const lifecycle = { skipWaiting: 0, claimed: 0, unregistered: 0 };

  const keyOf = (input: unknown) => {
    const raw = typeof input === "string" ? input : (input as { url: string }).url;
    const url = new URL(raw, ORIGIN);
    return url.origin === ORIGIN ? url.pathname + url.search : url.href;
  };

  class FakeRequest {
    url: string;
    method: string;
    mode: string;
    destination: string;
    credentials?: string;
    cache?: string;
    headers: Headers;
    constructor(input: string | { url: string }, init: Record<string, unknown> = {}) {
      this.url = new URL(typeof input === "string" ? input : input.url, ORIGIN).href;
      this.method = (init.method as string) ?? "GET";
      this.mode = (init.mode as string) ?? "cors";
      this.destination = (init.destination as string) ?? "";
      this.credentials = init.credentials as string | undefined;
      this.cache = init.cache as string | undefined;
      this.headers = new Headers(init.headers as Record<string, string> | undefined);
    }
  }

  const makeCache = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (input: unknown) => store.get(keyOf(input))?.clone(),
      put: async (input: unknown, response: Response) => void store.set(keyOf(input), response),
      delete: async (input: unknown) => store.delete(keyOf(input)),
      keys: async () => Array.from(store.keys()),
    };
  };

  const caches = {
    open: async (name: string) => makeCache(name),
    keys: async () => Array.from(stores.keys()),
    delete: async (name: string) => stores.delete(name),
    match: async (input: unknown, opts: { cacheName?: string } = {}) => {
      const names = opts.cacheName ? [opts.cacheName] : Array.from(stores.keys());
      for (const name of names) {
        const hit = stores.get(name)?.get(keyOf(input));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };

  const fetchImpl = async (input: string | FakeRequest) => {
    const request = typeof input === "string" ? new FakeRequest(input) : input;
    const key = keyOf(request);
    fetchLog.push({ url: key, credentials: request.credentials });
    if (!online) throw new TypeError("Failed to fetch");
    const handler = routes.get(key);
    if (!handler) return notFound();
    return handler();
  };

  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (event: unknown) => void) => void listeners.set(type, fn),
    skipWaiting: () => void (lifecycle.skipWaiting += 1),
    clients: {
      claim: async () => void (lifecycle.claimed += 1),
      matchAll: async () => [{ postMessage: (message: unknown) => void posted.push(message) }],
    },
    registration: { unregister: async () => void (lifecycle.unregistered += 1) },
  };

  const context = vm.createContext({
    self,
    caches,
    fetch: fetchImpl,
    Request: FakeRequest,
    Response,
    Headers,
    URL,
    console,
    Date: { now: () => Date.now() + clockOffset },
    setTimeout: (fn: () => void, ms: number) => {
      timerId += 1;
      timers.push({ id: timerId, fn, ms });
      return timerId;
    },
    clearTimeout: (id: number) => {
      const index = timers.findIndex((timer) => timer.id === id);
      if (index >= 0) timers.splice(index, 1);
    },
    importScripts: (path: string) => {
      vm.runInContext(readFileSync(join(PUBLIC, path), "utf8"), context);
    },
  });
  vm.runInContext(options.source ?? SW_SOURCE, context);

  const dispatch = async (type: string, init: Record<string, unknown> = {}) => {
    const pending: Array<Promise<unknown>> = [];
    let responded: Promise<Response> | undefined;
    const event = {
      ...init,
      waitUntil: (promise: Promise<unknown>) => void pending.push(Promise.resolve(promise)),
      respondWith: (promise: Promise<Response>) => {
        responded = Promise.resolve(promise);
      },
    };
    listeners.get(type)?.(event);
    return {
      intercepted: responded !== undefined,
      response: responded,
      settle: async () => {
        // waitUntil may be called again from inside async handlers.
        for (let index = 0; index < pending.length; index += 1)
          await pending[index].catch(() => undefined);
      },
    };
  };

  const boot = async () => {
    await (await dispatch("install")).settle();
    await (await dispatch("activate")).settle();
  };

  const fetchEvent = (path: string, init: Record<string, unknown> = {}) =>
    dispatch("fetch", { request: new FakeRequest(path, init) });
  const navigate = (path: string) =>
    fetchEvent(path, { mode: "navigate", destination: "document" });

  const message = async (data: unknown) => {
    const replies: unknown[] = [];
    const result = await dispatch("message", {
      data,
      ports: [{ postMessage: (payload: unknown) => void replies.push(payload) }],
    });
    await result.settle();
    return replies[0] as Record<string, unknown> | undefined;
  };

  return {
    stores,
    routes,
    fetchLog,
    posted,
    timers,
    lifecycle,
    boot,
    fetchEvent,
    navigate,
    message,
    setOnline: (value: boolean) => void (online = value),
    /** Moves the worker's clock forward (shell refreshes are throttled to one per minute). */
    advance: (ms: number) => void (clockOffset += ms),
    deploy(build: string) {
      for (const key of Array.from(routes.keys()))
        if (key.startsWith("/assets/")) routes.delete(key);
      routes.set("/mobile/student", html(shellHtml(build)));
      routes.set("/mobile/student-login", html(shellHtml(build)));
      routes.set(`/assets/index-${build}.js`, js(`index ${build}`));
      routes.set(`/assets/styles-${build}.css`, css(`styles ${build}`));
      routes.set(`/assets/mobile.student.schedule-${build}.js`, js(`schedule ${build}`));
    },
    buildCaches: () => Array.from(stores.keys()).filter((name) => name.includes("-build-")),
    cachedPaths: () => Array.from(stores.values()).flatMap((store) => Array.from(store.keys())),
  };
}

const BUILD_A = "AAAAAAAA";
const BUILD_B = "BBBBBBBB";

describe("install and activation", () => {
  test("precaches both shells and their assets with credential-less requests, then takes control", async () => {
    const worker = createWorker();
    worker.deploy(BUILD_A);
    await worker.boot();

    expect(worker.lifecycle.skipWaiting).toBe(1);
    expect(worker.lifecycle.claimed).toBe(1);
    expect(worker.buildCaches()).toHaveLength(1);
    const stored = worker.cachedPaths();
    expect(stored).toContain("/mobile/student");
    expect(stored).toContain("/mobile/student-login");
    expect(stored).toContain(`/assets/index-${BUILD_A}.js`);
    expect(stored).toContain(`/assets/styles-${BUILD_A}.css`);
    // The stored shell can never be user-specific: it is fetched without credentials.
    for (const entry of worker.fetchLog) expect(entry.credentials).toBe("omit");
  });

  test("a failed first install (offline) is harmless and stores nothing", async () => {
    const worker = createWorker();
    worker.setOnline(false);
    await worker.boot();
    expect(worker.cachedPaths()).toEqual([]);
    expect(worker.lifecycle.claimed).toBe(1);
  });

  test("a shell that is not clean public HTML is refused and nothing is swapped", async () => {
    const worker = createWorker();
    worker.deploy(BUILD_A);
    worker.routes.set(
      "/mobile/student",
      () =>
        new Response(shellHtml(BUILD_A), {
          headers: { "content-type": "text/html", "set-cookie": "sid=1" },
        }),
    );
    await worker.boot();
    expect(worker.cachedPaths()).not.toContain("/mobile/student");
  });
});

describe("requests the worker never touches", () => {
  test.each([
    ["server function POST", "/_serverFn/abc", { method: "POST" }],
    ["server function GET", "/_serverFn/abc", {}],
    ["Supabase REST", "https://wpmicqriltrowwonknox.supabase.co/rest/v1/student_profiles", {}],
    ["Supabase auth", "https://wpmicqriltrowwonknox.supabase.co/auth/v1/token", { method: "POST" }],
    ["API route", "/api/public/file-redirect", {}],
    ["version probe", "/version.json?probe=1", {}],
    ["admin navigation", "/admin", { mode: "navigate", destination: "document" }],
    ["staff navigation", "/staff/requests", { mode: "navigate", destination: "document" }],
    ["public site navigation", "/", { mode: "navigate", destination: "document" }],
    ["un-hashed script", "/assets/app.js", {}],
  ])("%s is not intercepted and never cached", async (_name, url, init) => {
    const worker = createWorker();
    worker.deploy(BUILD_A);
    await worker.boot();
    const before = worker.cachedPaths().length;
    const fetches = worker.fetchLog.length;
    const event = await worker.fetchEvent(url as string, init as Record<string, unknown>);
    await event.settle();
    expect(event.intercepted).toBe(false);
    expect(worker.fetchLog.length).toBe(fetches);
    expect(worker.cachedPaths().length).toBe(before);
  });
});

describe("hashed assets: cache-first", () => {
  test("a stored asset is served without any network request", async () => {
    const worker = createWorker();
    worker.deploy(BUILD_A);
    await worker.boot();
    worker.setOnline(false);
    const fetches = worker.fetchLog.length;
    const event = await worker.fetchEvent(`/assets/index-${BUILD_A}.js`);
    expect(event.intercepted).toBe(true);
    expect(await (await event.response)!.text()).toBe(`index ${BUILD_A}`);
    expect(worker.fetchLog.length).toBe(fetches);
  });

  test("a lazily loaded chunk is fetched once, stored, then served offline", async () => {
    const worker = createWorker();
    worker.deploy(BUILD_A);
    await worker.boot();
    const chunk = `/assets/mobile.student.schedule-${BUILD_A}.js`;
    expect(worker.cachedPaths()).not.toContain(chunk);
    const first = await worker.fetchEvent(chunk);
    expect(await (await first.response)!.text()).toBe(`schedule ${BUILD_A}`);
    await first.settle();
    worker.setOnline(false);
    const second = await worker.fetchEvent(chunk);
    expect(await (await second.response)!.text()).toBe(`schedule ${BUILD_A}`);
  });

  test("an HTML answer for a script URL is passed through but never stored", async () => {
    const worker = createWorker();
    worker.deploy(BUILD_A);
    await worker.boot();
    const ghost = "/assets/gone-ZZZZZZZZ.js";
    worker.routes.set(
      ghost,
      () => new Response("<html>spa</html>", { headers: { "content-type": "text/html" } }),
    );
    const event = await worker.fetchEvent(ghost);
    await event.response;
    await event.settle();
    expect(worker.cachedPaths()).not.toContain(ghost);
  });

  test("assets loaded before the worker took control can be added by the page — allow-listed only", async () => {
    const worker = createWorker();
    worker.deploy(BUILD_A);
    await worker.boot();
    worker.routes.set("/_serverFn/secret", js("private"));
    await worker.message({
      type: "MOBILE_OFFLINE_PRECACHE",
      urls: [
        `${ORIGIN}/assets/mobile.student.schedule-${BUILD_A}.js`,
        `${ORIGIN}/_serverFn/secret`,
        "https://wpmicqriltrowwonknox.supabase.co/storage/v1/object/assets/x-AAAAAAAA.js",
        `${ORIGIN}/mobile/student/documents`,
      ],
    });
    const stored = worker.cachedPaths();
    expect(stored).toContain(`/assets/mobile.student.schedule-${BUILD_A}.js`);
    expect(
      stored.some(
        (path) =>
          path.includes("_serverFn") || path.includes("supabase") || path.includes("documents"),
      ),
    ).toBe(false);
  });
});

describe("navigations: network-first with an offline fallback", () => {
  test("online: the fresh document wins and is not written to the cache by the navigation", async () => {
    const worker = createWorker();
    worker.deploy(BUILD_A);
    await worker.boot();
    worker.routes.set("/mobile/student", html("<html>FRESH" + shellHtml(BUILD_A) + "</html>"));
    const event = await worker.navigate("/mobile/student");
    expect(event.intercepted).toBe(true);
    expect(await (await event.response)!.text()).toContain("FRESH");
    const status = await worker.message({ type: "MOBILE_OFFLINE_STATUS" });
    expect((status!.lastNavigation as { source: string }).source).toBe("network");
  });

  test("offline: the stored shell opens the app, and the page is told it was an offline launch", async () => {
    const worker = createWorker();
    worker.deploy(BUILD_A);
    await worker.boot();
    worker.setOnline(false);
    for (const path of ["/mobile/student-login", "/mobile/student"]) {
      const event = await worker.navigate(path);
      const response = (await event.response)!;
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(`/assets/index-${BUILD_A}.js`);
    }
    const status = await worker.message({ type: "MOBILE_OFFLINE_STATUS" });
    expect(status!.lastNavigation).toMatchObject({ source: "cache", reason: "network-error" });
  });

  test("offline deep link: redirected to the stored home shell", async () => {
    const worker = createWorker();
    worker.deploy(BUILD_A);
    await worker.boot();
    worker.setOnline(false);
    const event = await worker.navigate("/mobile/student/schedule");
    const response = (await event.response)!;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/mobile/student`);
  });

  test("slow network: the stored shell is used after the timeout, flagged as a timeout (not offline)", async () => {
    const worker = createWorker();
    worker.deploy(BUILD_A);
    await worker.boot();
    let release: (response: Response) => void = () => undefined;
    worker.routes.set(
      "/mobile/student",
      () => new Promise<Response>((resolve) => (release = resolve)),
    );
    const event = await worker.navigate("/mobile/student");
    // Let the handler reach the race, then fire the 2.5 s timer.
    for (let spin = 0; spin < 20 && worker.timers.length === 0; spin += 1) await Promise.resolve();
    expect(worker.timers).toHaveLength(1);
    expect(worker.timers[0].ms).toBe(2500);
    worker.timers[0].fn();
    const response = (await event.response)!;
    expect(await response.text()).toContain(`/assets/index-${BUILD_A}.js`);
    const status = await worker.message({ type: "MOBILE_OFFLINE_STATUS" });
    expect(status!.lastNavigation).toMatchObject({ source: "cache", reason: "timeout" });
    release(new Response("late", { headers: { "content-type": "text/html" } }));
  });

  test("server error (5xx): the stored shell is preferred", async () => {
    const worker = createWorker();
    worker.deploy(BUILD_A);
    await worker.boot();
    worker.routes.set("/mobile/student", () => new Response("boom", { status: 503 }));
    const event = await worker.navigate("/mobile/student");
    expect(await (await event.response)!.text()).toContain(`/assets/index-${BUILD_A}.js`);
  });

  test("offline with nothing stored: a harmless offline document, never a crash", async () => {
    const worker = createWorker();
    worker.setOnline(false);
    await worker.boot();
    const event = await worker.navigate("/mobile/student-login");
    const response = (await event.response)!;
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("لا يوجد اتصال بالإنترنت");
  });
});

describe("deploys", () => {
  test("an online launch after a deploy gets the new shell, new assets and a new versioned cache", async () => {
    const worker = createWorker();
    worker.deploy(BUILD_A);
    await worker.boot();
    const [cacheA] = worker.buildCaches();

    worker.deploy(BUILD_B);
    worker.advance(5 * 60_000); // the next launch, some minutes later
    const launch = await worker.navigate("/mobile/student-login");
    expect(await (await launch.response)!.text()).toContain(`/assets/index-${BUILD_B}.js`);
    await launch.settle();

    const caches = worker.buildCaches();
    expect(caches).toHaveLength(2); // current + previous generation
    const cacheB = caches.find((name) => name !== cacheA)!;
    expect(Array.from(worker.stores.get(cacheB)!.keys())).toEqual(
      expect.arrayContaining([
        "/mobile/student",
        `/assets/index-${BUILD_B}.js`,
        `/assets/styles-${BUILD_B}.css`,
      ]),
    );
    expect(worker.posted).toContainEqual({
      type: "MOBILE_OFFLINE_SHELL_UPDATED",
      buildId: cacheB.split("-build-")[1],
    });

    // Offline now opens the NEW build.
    worker.setOnline(false);
    const offline = await worker.navigate("/mobile/student");
    expect(await (await offline.response)!.text()).toContain(`/assets/index-${BUILD_B}.js`);
    // A page still running the previous build keeps its assets for one generation.
    const old = await worker.fetchEvent(`/assets/index-${BUILD_A}.js`);
    expect(await (await old.response)!.text()).toBe(`index ${BUILD_A}`);
  });

  test("a new build is not adopted when one of its assets cannot be stored", async () => {
    const worker = createWorker();
    worker.deploy(BUILD_A);
    await worker.boot();
    worker.deploy(BUILD_B);
    worker.routes.delete(`/assets/styles-${BUILD_B}.css`); // half-finished deploy
    await worker.message({ type: "MOBILE_OFFLINE_REFRESH" });
    worker.setOnline(false);
    const offline = await worker.navigate("/mobile/student");
    expect(await (await offline.response)!.text()).toContain(`/assets/index-${BUILD_A}.js`);
  });

  test("caches older than the previous generation are deleted; foreign caches survive", async () => {
    const worker = createWorker();
    worker.stores.set("portal-pwa-v2", new Map());
    worker.stores.set("some-other-cache", new Map());
    worker.deploy(BUILD_A);
    await worker.boot();
    for (const build of [BUILD_B, "CCCCCCCC", "DDDDDDDD"]) {
      worker.deploy(build);
      await worker.message({ type: "MOBILE_OFFLINE_REFRESH" });
    }
    expect(worker.buildCaches()).toHaveLength(2);
    expect(worker.cachedPaths()).not.toContain(`/assets/index-${BUILD_A}.js`);
    expect(worker.cachedPaths()).toContain("/assets/index-DDDDDDDD.js");
    expect(worker.stores.has("portal-pwa-v2")).toBe(true);
    expect(worker.stores.has("some-other-cache")).toBe(true);
  });

  test("stale shell + missing asset: the shell is refreshed and the page is told to recover", async () => {
    const worker = createWorker();
    worker.deploy(BUILD_A);
    await worker.boot();
    worker.deploy(BUILD_B); // the server no longer has build A's lazy chunks
    const event = await worker.fetchEvent(`/assets/mobile.student.schedule-${BUILD_A}.js`);
    expect((await event.response)!.status).toBe(404);
    await event.settle();
    expect(worker.posted).toContainEqual({ type: "MOBILE_OFFLINE_ASSET_MISSING", refreshed: true });
    expect(worker.cachedPaths()).toContain(`/assets/index-${BUILD_B}.js`);
    expect(worker.cachedPaths()).not.toContain(`/assets/mobile.student.schedule-${BUILD_A}.js`);
  });

  test("purge (recovery path) removes every owned cache and only those", async () => {
    const worker = createWorker();
    worker.stores.set("portal-pwa-v2", new Map());
    worker.deploy(BUILD_A);
    await worker.boot();
    const reply = await worker.message({ type: "MOBILE_OFFLINE_PURGE" });
    expect(reply).toEqual({ ok: true });
    expect(Array.from(worker.stores.keys())).toEqual(["portal-pwa-v2"]);
  });
});

describe("kill switch", () => {
  const disabled = SW_SOURCE.replace(
    "const MOBILE_OFFLINE_ENABLED = true;",
    "const MOBILE_OFFLINE_ENABLED = false;",
  );

  test("the switch is a single literal in the worker file", () => {
    expect(SW_SOURCE.match(/const MOBILE_OFFLINE_ENABLED = true;/g)).toHaveLength(1);
    expect(disabled).not.toBe(SW_SOURCE);
  });

  test("a disabled worker deletes its caches, unregisters itself and intercepts nothing", async () => {
    const worker = createWorker({ source: disabled });
    worker.stores.set(
      "mobile-offline-v1-build-old",
      new Map([["/mobile/student", new Response("old")]]),
    );
    worker.stores.set("mobile-offline-v1-meta", new Map());
    worker.stores.set("portal-pwa-v2", new Map());
    worker.deploy(BUILD_A);
    await worker.boot();

    expect(worker.lifecycle.skipWaiting).toBe(1);
    expect(worker.lifecycle.unregistered).toBe(1);
    expect(worker.lifecycle.claimed).toBe(0);
    expect(Array.from(worker.stores.keys())).toEqual(["portal-pwa-v2"]);
    expect(worker.fetchLog).toEqual([]);
    expect(worker.posted).toContainEqual({ type: "MOBILE_OFFLINE_DISABLED" });

    for (const event of [
      await worker.navigate("/mobile/student"),
      await worker.fetchEvent(`/assets/index-${BUILD_A}.js`),
    ]) {
      expect(event.intercepted).toBe(false);
    }
  });
});
