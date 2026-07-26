/**
 * PORTAL-ADMIN-PORTAL-NAVIGATION-RTL-A11Y-CONSISTENCY-QA-01 — browser smoke.
 *
 * Chrome headless (local binary) + a mock Supabase HTTP server serving
 * SYNTHETIC data only. No production/staging/backend is ever contacted:
 * the dev server is started with SUPABASE_URL/VITE_SUPABASE_URL pointing at
 * the local mock on 127.0.0.1.
 *
 * The smoke FAILS (exit 1) when:
 *   - Chrome fails to launch or the CDP endpoint never appears,
 *   - the dev server or any page fails to load,
 *   - any check fails,
 *   - any wait exceeds its timeout (or the global watchdog fires).
 *
 * On exit (pass or fail) it kills Chrome, the dev server and the mock, and
 * verifies every port it used is free again.
 *
 * Run: bun scripts/admin-portal-navigation-smoke-01/run.ts
 */

import { spawn, spawnSync, type Subprocess } from "bun";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEV_PORT = 4390;
const MOCK_PORT = 4391;
const CDP_PORT = 4392;
const DEV_ORIGIN = `http://127.0.0.1:${DEV_PORT}`;
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;

const GLOBAL_TIMEOUT_MS = 600_000;
const NAV_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 250;

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
];

// Synthetic identities — no real data anywhere.
const ADMIN = {
  key: "admin",
  id: "00000000-0000-4000-8000-0000000000a1",
  email: "smoke.admin@synthetic.test",
  password: "synthetic-password-123",
  roles: ["admin"],
};
const FINANCE = {
  key: "finance",
  id: "00000000-0000-4000-8000-0000000000f1",
  email: "smoke.finance@synthetic.test",
  password: "synthetic-password-456",
  roles: ["finance_officer"],
};
const SYNTHETIC_USERS = [ADMIN, FINANCE];

const SYNTHETIC_NOTIFICATIONS = [
  {
    id: "00000000-0000-4000-8000-0000000000b1",
    title: "إشعار اصطناعي للاختبار",
    message: "محتوى اصطناعي لا يحتوي أي بيانات حقيقية.",
    notification_type: "system",
    reference_type: null,
    reference_id: null,
    is_read: false,
    created_at: "2026-01-01T10:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-0000000000b2",
    title: "إشعار مقروء اصطناعي",
    message: "محتوى اصطناعي ثانٍ.",
    notification_type: "system",
    reference_type: null,
    reference_id: null,
    is_read: true,
    created_at: "2026-01-01T09:00:00.000Z",
  },
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(
  label: string,
  fn: () => Promise<boolean>,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await fn().catch(() => false)) return;
    if (Date.now() - start > timeoutMs) throw new Error(`TIMEOUT waiting for: ${label}`);
    await sleep(POLL_INTERVAL_MS);
  }
}

async function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: "127.0.0.1" });
    sock.once("connect", () => {
      sock.end();
      resolve(false);
    });
    sock.once("error", () => resolve(true));
  });
}

function b64url(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64url");
}

function fakeJwt(user: (typeof SYNTHETIC_USERS)[number]): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: `${MOCK_URL}/auth/v1`,
      sub: user.id,
      aud: "authenticated",
      role: "authenticated",
      email: user.email,
      iat: now,
      exp: now + 3600,
    }),
  );
  // alg=HS256 without kid → supabase-js getClaims() falls back to getUser(),
  // which the mock answers. No signature verification is attempted.
  return `${header}.${payload}.c2lnbmVkdGVzdA`;
}

function userJson(user: (typeof SYNTHETIC_USERS)[number]) {
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// Mock Supabase (synthetic data only)
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, prefer, accept-profile, content-profile, x-supabase-api-version",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS",
  "Access-Control-Expose-Headers": "content-range",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extra },
  });
}

function decodeSub(auth: string | null): string | null {
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function startMockSupabase() {
  // Test-only switch: when true, the notifications endpoint returns a
  // malformed payload that crashes the bell's render — the deterministic
  // trigger for the error-boundary smoke scenario.
  let brokenNotifications = false;

  return Bun.serve({
    port: MOCK_PORT,
    hostname: "127.0.0.1",
    fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method.toUpperCase();

      if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

      // Smoke control channel (not a Supabase endpoint).
      if (path === "/__control" && method === "POST") {
        return req.json().then((body: { brokenNotifications?: boolean }) => {
          brokenNotifications = body?.brokenNotifications === true;
          return json({ ok: true, brokenNotifications });
        });
      }

      // ---- Auth ----
      if (path === "/auth/v1/token" && method === "POST") {
        return req.json().then((body: { email?: string }) => {
          const user = SYNTHETIC_USERS.find((u) => u.email === body?.email);
          if (!user) {
            return json(
              { error: "invalid_grant", error_description: "Invalid login credentials" },
              400,
            );
          }
          return json({
            access_token: fakeJwt(user),
            token_type: "bearer",
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            refresh_token: `synthetic-refresh-${user.key}`,
            user: userJson(user),
          });
        });
      }
      if (path === "/auth/v1/user" && method === "GET") {
        const sub = decodeSub(req.headers.get("authorization"));
        const user = SYNTHETIC_USERS.find((u) => u.id === sub);
        if (!user) return json({ message: "invalid token" }, 401);
        return json(userJson(user));
      }
      if (path === "/auth/v1/logout" && method === "POST") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (path.startsWith("/auth/v1/")) return json({ message: "not found" }, 404);

      // ---- REST ----
      if (path.startsWith("/rest/v1/")) {
        const table = path.slice("/rest/v1/".length).split("?")[0];

        if (method === "HEAD") {
          const count = table === "contact_messages" ? 3 : 0;
          return new Response(null, {
            status: 200,
            headers: { ...CORS_HEADERS, "Content-Range": `0-0/${count}` },
          });
        }
        if (method === "PATCH" || method === "PUT" || method === "DELETE") {
          return json([]);
        }
        if (method === "POST" && table === "rpc/check_and_record_rate_limit") {
          return json({ allowed: true, remaining: 5, blocked_until: null });
        }
        if (method === "POST" && table.startsWith("rpc/")) return json({});
        if (method === "POST") return json([]);

        // GET
        if (table === "user_roles") {
          const match = /user_id=eq\.([^&]+)/.exec(url.search);
          const user = SYNTHETIC_USERS.find((u) => u.id === match?.[1]);
          return json((user?.roles ?? []).map((role) => ({ role })));
        }
        if (table === "user_role_assignments") return json([]);
        if (table === "notifications") {
          // Malformed on demand: a string instead of the expected array —
          // deterministic render crash for the error-boundary scenario.
          if (brokenNotifications) return json("not-an-array");
          return json(SYNTHETIC_NOTIFICATIONS);
        }
        return json([]);
      }

      return json({ message: "not found" }, 404);
    },
  });
}

// ---------------------------------------------------------------------------
// Minimal Chrome DevTools Protocol client (no external deps)
// ---------------------------------------------------------------------------

class Cdp {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private listeners = new Map<string, ((params: Record<string, unknown>) => void)[]>();
  sessionId = "";

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`CDP error: ${msg.error.message}`));
        else p.resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) ?? []) fn(msg.params ?? {});
      }
    };
  }

  static connect(browserWsUrl: string): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(browserWsUrl);
      ws.onopen = () => resolve(new Cdp(ws));
      ws.onerror = () => reject(new Error("CDP WebSocket connection failed"));
    });
  }

  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId: this.sessionId || undefined }));
    });
  }

  on(method: string, fn: (params: Record<string, unknown>) => void) {
    this.listeners.set(method, [...(this.listeners.get(method) ?? []), fn]);
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const res = await this.send<{
      result?: { value?: T };
      exceptionDetails?: { exception?: { description?: string }; text?: string };
    }>("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error(
        `Page evaluation failed: ${res.exceptionDetails.exception?.description ?? res.exceptionDetails.text}`,
      );
    }
    return res.result?.value as T;
  }

  async poll(label: string, expression: string, timeoutMs = NAV_TIMEOUT_MS): Promise<void> {
    await waitFor(
      label,
      async () => !!(await this.evaluate(expression).catch(() => false)),
      timeoutMs,
    );
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* already closed */
    }
  }
}

// ---------------------------------------------------------------------------
// Process management
// ---------------------------------------------------------------------------

function killTree(proc: Subprocess | null): void {
  if (!proc?.pid) return;
  try {
    // Windows: kill the whole process tree (bunx → vite, chrome → children).
    // spawnSync so the kill actually completes before we probe the ports.
    spawnSync({
      cmd: ["taskkill", "/PID", String(proc.pid), "/T", "/F"],
      stdout: "ignore",
      stderr: "ignore",
    });
  } catch {
    try {
      proc.kill();
    } catch {
      /* already dead */
    }
  }
}

// ---------------------------------------------------------------------------
// Smoke runner
// ---------------------------------------------------------------------------

type CheckResult = { name: string; ok: boolean; error?: string };
const results: CheckResult[] = [];

/** Set by main() once CDP is attached; enriches failures with page context. */
let debugContext: (() => Promise<string>) | null = null;

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (e) {
    let error = e instanceof Error ? e.message : String(e);
    if (debugContext) {
      try {
        error += ` | context: ${await debugContext()}`;
      } catch {
        /* page gone */
      }
    }
    results.push({ name, ok: false, error });
    console.log(`  FAIL  ${name} — ${error}`);
  }
}

async function main(): Promise<number> {
  const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
  const profileDir = mkdtempSync(join(tmpdir(), "admin-smoke-chrome-"));
  let mock: ReturnType<typeof startMockSupabase> | null = null;
  let devServer: Subprocess | null = null;
  let chrome: Subprocess | null = null;
  let cdp: Cdp | null = null;
  let browserWsUrl = "";

  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    console.log("\n[cleanup] stopping browser, dev server and mock…");
    try {
      // Graceful browser shutdown first (frees the CDP port cleanly)…
      if (cdp) {
        const browser = await Cdp.connect(browserWsUrl).catch(() => null);
        if (browser) {
          await browser.send("Browser.close").catch(() => undefined);
          browser.close();
        }
      }
    } catch {
      /* ignore */
    }
    try {
      cdp?.close();
    } catch {
      /* ignore */
    }
    // …then force-kill whatever survives.
    killTree(chrome);
    killTree(devServer);
    try {
      mock?.stop(true);
    } catch {
      /* ignore */
    }
    await sleep(2500);
    for (const [label, port] of [
      ["dev server", DEV_PORT],
      ["mock supabase", MOCK_PORT],
      ["chrome cdp", CDP_PORT],
    ] as const) {
      let free = false;
      for (let attempt = 0; attempt < 5 && !free; attempt++) {
        free = await portFree(port);
        if (!free) await sleep(1000);
      }
      results.push({
        name: `port ${port} (${label}) free after cleanup`,
        ok: free,
        error: free ? undefined : "port still occupied",
      });
      console.log(
        free
          ? `  PASS  port ${port} (${label}) free`
          : `  FAIL  port ${port} (${label}) still occupied`,
      );
    }
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  const watchdog = setTimeout(() => {
    console.error("GLOBAL TIMEOUT — smoke exceeded its budget");
    void cleanup().finally(() => process.exit(1));
  }, GLOBAL_TIMEOUT_MS);

  try {
    if (!chromePath) throw new Error("Chrome binary not found in any candidate path");

    // 1. Mock Supabase + production build + preview (all pointed at the local
    // mock only). A real build is used instead of the dev server because dev
    // mode eagerly imports the whole route module graph — failing a lazy
    // chunk there blanks the page instead of hitting the route error
    // boundary, which is the behavior this smoke verifies.
    mock = startMockSupabase();
    console.log(`[setup] mock Supabase on ${MOCK_URL}`);

    const mockEnv = {
      ...process.env,
      VITE_SUPABASE_URL: MOCK_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
      SUPABASE_URL: MOCK_URL,
      SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
      SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role-key",
      // The repo's default build target is cloudflare-module (wrangler-only
      // preview). For the local smoke we override the nitro preset so the
      // output runs as a plain node server.
      NITRO_PRESET: "node-server",
    };
    const worktreeRoot = join(import.meta.dir, "../..");

    console.log("[setup] building app with synthetic Supabase env (nitro node-server)…");
    const build = spawn({
      cmd: ["bunx", "vite", "build"],
      cwd: worktreeRoot,
      env: mockEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const buildExit = await build.exited;
    if (buildExit !== 0) {
      const out = await new Response(build.stdout).text();
      const err = await new Response(build.stderr).text();
      throw new Error(`vite build failed (exit ${buildExit}): ${(out + err).slice(-2000)}`);
    }
    console.log("[setup] build done");

    devServer = spawn({
      cmd: ["node", join(worktreeRoot, ".output", "server", "index.mjs")],
      cwd: worktreeRoot,
      env: { ...mockEnv, PORT: String(DEV_PORT), NITRO_PORT: String(DEV_PORT), HOST: "127.0.0.1" },
      stdout: "ignore",
      stderr: "ignore",
    });
    await waitFor(
      "preview server to respond",
      async () => (await fetch(`${DEV_ORIGIN}/admin/login`).catch(() => null))?.ok === true,
      120_000,
    );
    console.log(`[setup] preview server on ${DEV_ORIGIN}`);

    // 2. Chrome headless via CDP.
    chrome = spawn({
      cmd: [
        chromePath,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        `--user-data-dir=${profileDir}`,
        `--remote-debugging-port=${CDP_PORT}`,
        "--window-size=1280,800",
        "about:blank",
      ],
      stdout: "ignore",
      stderr: "ignore",
    });
    let browserWsUrlFound = "";
    await waitFor(
      "Chrome CDP endpoint",
      async () => {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).catch(() => null);
        if (!res?.ok) return false;
        browserWsUrlFound = (await res.json()).webSocketDebuggerUrl ?? "";
        return !!browserWsUrlFound;
      },
      30_000,
    );
    browserWsUrl = browserWsUrlFound;
    cdp = await Cdp.connect(browserWsUrl);
    debugContext = async () => {
      const href = await cdp!.evaluate<string>("location.href").catch(() => "?");
      const text = await cdp!
        .evaluate<string>("(document.body?.innerText ?? '').slice(0, 300)")
        .catch(() => "?");
      return `${href} :: ${text}`;
    };
    const { targetId } = await cdp.send<{ targetId: string }>("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    cdp.sessionId = sessionId;
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    console.log("[setup] chrome headless attached");

    const goto = async (url: string) => {
      await cdp!.send("Page.navigate", { url });
      await cdp!.poll(`document load ${url}`, `document.readyState === "complete"`, 30_000);
    };
    const setViewport = async (width: number, height: number, mobile: boolean) => {
      await cdp!.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: mobile ? 2 : 1,
        mobile,
      });
    };
    const escapeKey = () =>
      cdp!.evaluate(
        `document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })), true`,
      );
    const clickSel = (sel: string) =>
      cdp!.evaluate<boolean>(
        `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`,
      );
    const loginAs = async (user: (typeof SYNTHETIC_USERS)[number]) => {
      await goto(`${DEV_ORIGIN}/admin/login`);
      await cdp!.poll(
        "login form rendered",
        `!!document.querySelector("#email") && !!document.querySelector("#password")`,
      );
      await cdp!.evaluate(`(() => {
        const setVal = (el, v) => {
          const proto = HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        };
        setVal(document.querySelector("#email"), ${JSON.stringify(user.email)});
        setVal(document.querySelector("#password"), ${JSON.stringify(user.password)});
        return true;
      })()`);
      await clickSel('form button[type="submit"]');
      await cdp!.poll(
        `login as ${user.key} lands inside /admin`,
        `location.pathname.startsWith("/admin") && location.pathname !== "/admin/login"`,
      );
      await cdp!.poll("admin shell rendered", `!!document.querySelector("#admin-sidebar")`);
    };
    const logout = async () => {
      await clickSel('button[aria-label="تسجيل الخروج"]');
      await cdp!.poll("logout lands on /admin/login", `location.pathname === "/admin/login"`);
    };
    const privacyScan = async (where: string) => {
      await cdp!.poll(
        `privacy scan (${where})`,
        `(() => {
          const text = document.body?.innerText ?? "";
          const bad = [
            /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
            /PostgREST|PGRST\\d*/i,
            /\\bRLS\\b|\\bSQL\\b/i,
            /TypeError|ReferenceError|SyntaxError/,
            /\\bat\\s+\\S+\\s+\\([^()]*:\\d+:\\d+\\)/,
          ];
          return !bad.some((re) => re.test(text));
        })()`,
        10_000,
      );
    };

    // ============================ DESKTOP ============================
    console.log("\n[desktop 1280px]");
    await setViewport(1280, 800, false);
    await loginAs(ADMIN);

    await check("page loads and sidebar is visible on desktop", async () => {
      await cdp!.poll(
        "sidebar on-screen",
        `(() => { const r = document.querySelector("#admin-sidebar").getBoundingClientRect(); return r.width > 100 && r.right <= innerWidth + 1 && r.left >= -1; })()`,
        10_000,
      );
    });

    await check("document direction is RTL", async () => {
      await cdp!.poll("rtl", `getComputedStyle(document.body).direction === "rtl"`, 10_000);
    });

    await check("active route has aria-current after navigation", async () => {
      // The reports link lives inside a collapsible group — expand it first.
      await cdp!.evaluate(`(() => {
        const btn = [...document.querySelectorAll("#admin-sidebar button")].find((b) => b.innerText.includes("التقارير والتحليلات"));
        if (!btn) return false;
        if (btn.getAttribute("aria-expanded") !== "true") btn.click();
        return true;
      })()`);
      await cdp!.poll(
        "reports link visible after expanding its group",
        `!!document.querySelector('#admin-sidebar a[href="/admin/reports"]')`,
        10_000,
      );
      await clickSel('#admin-sidebar a[href="/admin/reports"]');
      await cdp!.poll("navigated to /admin/reports", `location.pathname === "/admin/reports"`);
      await cdp!.poll(
        "shell settled on /admin/reports",
        `!!document.querySelector('nav[aria-label="مسار التنقل"]')`,
        15_000,
      );
      const diag = await cdp!.evaluate<string>(`(() => {
        const links = [...document.querySelectorAll("#admin-sidebar a")].map((a) => ({
          href: a.getAttribute("href"),
          ac: a.getAttribute("aria-current"),
        }));
        return JSON.stringify({ target: links.find((l) => l.href === "/admin/reports"), flagged: links.filter((l) => l.ac) });
      })()`);
      const parsed = JSON.parse(diag) as {
        target?: { href: string; ac: string | null };
        flagged: { href: string | null }[];
      };
      if (parsed.target?.ac !== "page") {
        throw new Error(`aria-current missing on active reports link: ${diag}`);
      }
    });

    await check("breadcrumbs render semantically for the current page", async () => {
      await cdp!.poll(
        "breadcrumb trail",
        `(() => {
          const nav = document.querySelector('nav[aria-label="مسار التنقل"]');
          if (!nav) return false;
          const text = nav.innerText;
          return text.includes("لوحة الإدارة") && text.includes("التقارير") &&
            !!nav.querySelector('[aria-current="page"]');
        })()`,
        10_000,
      );
    });

    await check("notifications panel opens with synthetic data (keyboard accessible)", async () => {
      await clickSel('button[aria-label="الإشعارات"]');
      await cdp!.poll(
        "bell expanded + dialog with synthetic notification",
        `document.querySelector('button[aria-label="الإشعارات"]')?.getAttribute("aria-expanded") === "true" &&
         !!document.querySelector("#notifications-bell-dropdown") &&
         (document.querySelector("#notifications-bell-dropdown")?.innerText.includes("إشعار اصطناعي للاختبار") ?? false)`,
        15_000,
      );
    });

    await check("Escape closes notifications and returns focus to the bell", async () => {
      await escapeKey();
      await cdp!.poll(
        "bell closed + focus restored",
        `!document.querySelector("#notifications-bell-dropdown") &&
         document.activeElement?.getAttribute("aria-label") === "الإشعارات"`,
        10_000,
      );
    });

    await check("privacy: no UUID/SQL/PostgREST/stack leak on desktop pages", () =>
      privacyScan("reports page"),
    );

    // ============================ MOBILE 360px ============================
    console.log("\n[mobile 360px]");
    await setViewport(360, 800, true);
    await sleep(400);

    await check("no horizontal overflow at 360px", async () => {
      await cdp!.poll("no overflow", `document.documentElement.scrollWidth <= 361`, 10_000);
    });

    await check("hamburger button is visible at 360px", async () => {
      await cdp!.poll(
        "hamburger visible",
        `(() => { const b = document.querySelector('button[aria-label="فتح القائمة"]'); if (!b) return false; const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`,
        10_000,
      );
    });

    await check("menu opens: aria-expanded flips and focus moves into the sidebar", async () => {
      await clickSel('button[aria-label="فتح القائمة"]');
      await cdp!.poll(
        "menu open",
        `document.querySelector('button[aria-label="فتح القائمة"]')?.getAttribute("aria-expanded") === "true" &&
         document.activeElement?.getAttribute("aria-label") === "إغلاق القائمة"`,
        10_000,
      );
    });

    await check("navigating from the sidebar auto-closes the menu", async () => {
      await clickSel('#admin-sidebar a[href="/admin"]');
      await cdp!.poll(
        "menu auto-closed after navigation",
        `location.pathname === "/admin" &&
         document.querySelector('button[aria-label="فتح القائمة"]')?.getAttribute("aria-expanded") === "false"`,
        15_000,
      );
    });

    await check("Escape closes the menu and returns focus to the hamburger", async () => {
      await clickSel('button[aria-label="فتح القائمة"]');
      await cdp!.poll(
        "menu reopened",
        `document.querySelector('button[aria-label="فتح القائمة"]')?.getAttribute("aria-expanded") === "true"`,
        10_000,
      );
      await escapeKey();
      await cdp!.poll(
        "menu closed + focus on hamburger",
        `document.querySelector('button[aria-label="فتح القائمة"]')?.getAttribute("aria-expanded") === "false" &&
         document.activeElement?.getAttribute("aria-label") === "فتح القائمة"`,
        10_000,
      );
    });

    await check("no horizontal overflow after mobile interactions", async () => {
      await cdp!.poll("no overflow", `document.documentElement.scrollWidth <= 361`, 10_000);
    });

    // ============================ LOGOUT ============================
    console.log("\n[logout]");
    await setViewport(1280, 800, false);

    await check("logout navigates to /admin/login and clears the stored session", async () => {
      await logout();
      await cdp!.poll(
        "no supabase auth token left in localStorage",
        `!Object.keys(localStorage).some((k) => /auth-token/i.test(k))`,
        10_000,
      );
    });

    await check("previous identity cannot reopen /admin (redirects to login)", async () => {
      await goto(`${DEV_ORIGIN}/admin`);
      await cdp!.poll("still on login", `location.pathname === "/admin/login"`, 15_000);
    });

    // ============================ PERMISSION DENIED ============================
    console.log("\n[permission denied]");
    await loginAs(FINANCE);

    await check(
      "denied route redirects to an allowed page inside /admin with a banner",
      async () => {
        await goto(`${DEV_ORIGIN}/admin/users`);
        await cdp!.poll(
          "access-denied redirect",
          `location.pathname.startsWith("/admin") && location.pathname !== "/admin/users" &&
         (location.search.includes("accessDenied=1") || decodeURIComponent(location.search).includes('accessDenied="1"')) &&
         (document.body.innerText.includes("ليس لديك صلاحية الوصول") ?? false)`,
          45_000,
        );
      },
    );

    // ============================ NOT FOUND ============================
    console.log("\n[not found]");
    await logout();
    await loginAs(ADMIN);

    await check("unknown /admin/* path shows the admin-scoped not-found", async () => {
      await goto(`${DEV_ORIGIN}/admin/definitely-not-a-real-page`);
      await cdp!.poll(
        "admin not-found rendered",
        `document.body.innerText.includes("الصفحة غير موجودة") &&
         document.body.innerText.includes("العودة إلى لوحة الإدارة")`,
        20_000,
      );
    });

    await check("not-found recovery link returns to /admin", async () => {
      await cdp!.evaluate(`(() => {
        const link = [...document.querySelectorAll("a")].find((a) => a.innerText.includes("العودة إلى لوحة الإدارة"));
        if (!link) return false; link.click(); return true;
      })()`);
      await cdp!.poll("back at /admin", `location.pathname === "/admin"`, 15_000);
      await cdp!.poll("shell rendered again", `!!document.querySelector("#admin-sidebar")`, 15_000);
    });

    // ============================ ERROR RECOVERY ============================
    console.log("\n[error recovery]");
    await check(
      "an unexpected render error triggers a generic error boundary (no technical leak)",
      async () => {
        // Deterministic trigger: the mock starts returning a malformed
        // notifications payload; the next full load crashes the bell's render
        // inside the shell. (A lazy-chunk failure was tried first — it is an
        // upstream router-core bug that unmounts the whole app and cannot be
        // caught by any route boundary; documented in the report.)
        await fetch(`${MOCK_URL}/__control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brokenNotifications: true }),
        });
        await goto(`${DEV_ORIGIN}/admin`);
        await cdp!.poll(
          "admin error boundary rendered",
          `document.body.innerText.includes("تعذّر تحميل صفحة الإدارة") &&
         document.body.innerText.includes("العودة إلى لوحة الإدارة")`,
          30_000,
        );
        await fetch(`${MOCK_URL}/__control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brokenNotifications: false }),
        });
      },
    );

    await check("error recovery points at /admin and a reload restores the shell", async () => {
      // The boundary's recovery affordance must target /admin (never a wider
      // or external page). A same-route link click cannot reset an active
      // boundary, so assert the target, then recover the realistic way:
      // the artificial condition is cleared above and a full reload (fresh
      // query cache) must bring the shell back.
      await cdp!.poll(
        "recovery link targets /admin",
        `(() => {
          const link = [...document.querySelectorAll("a")].find((a) => a.innerText.includes("العودة إلى لوحة الإدارة"));
          const href = link?.getAttribute("href") ?? "";
          return href === "/admin" || href.endsWith(":4390/admin");
        })()`,
        10_000,
      );
      await cdp!.send("Page.reload");
      await cdp!.poll(
        "shell rendered after reload",
        `location.pathname === "/admin" && !!document.querySelector("#admin-sidebar")`,
        30_000,
      );
    });

    await check("privacy: error page leaks no UUID/SQL/stack", () => privacyScan("error boundary"));
  } catch (e) {
    results.push({
      name: "smoke harness completed",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
    console.error(`\nHARNESS ERROR: ${results[results.length - 1].error}`);
  } finally {
    clearTimeout(watchdog);
    await cleanup();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n========================================`);
  console.log(`smoke results: ${results.length - failed.length} pass / ${failed.length} fail`);
  for (const f of failed) console.log(`  FAILED: ${f.name} — ${f.error}`);
  return failed.length > 0 ? 1 : 0;
}

process.exit(await main());
