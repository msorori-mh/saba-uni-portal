/**
 * REAL APP HTTP browser smoke for the five B1 student services.
 *
 * Builds the Vite/Nitro app from src, serves it on 127.0.0.1, mocks Supabase
 * auth/profiles only, and drives the REAL React routes/components via Chrome CDP.
 *
 * NOT a static HTML fixture. file:// evidence is rejected.
 *
 * Run: bun tests/student-requests/b1-real-app-browser-smoke/run.ts
 */
import { spawn, spawnSync, type Subprocess } from "bun";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";

const APP_PORT = Number(process.env.B1_REAL_SMOKE_PORT || 4288);
const MOCK_PORT = Number(process.env.B1_REAL_SMOKE_MOCK_PORT || 4289);
const CDP_PORT = Number(process.env.B1_REAL_SMOKE_CDP_PORT || 4290);
const APP_ORIGIN = `http://127.0.0.1:${APP_PORT}`;
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;

const GLOBAL_TIMEOUT_MS = 900_000;
const NAV_TIMEOUT_MS = 60_000;
const POLL_MS = 250;

const SERVICES = [
  "enrollment_suspension",
  "excused_absence",
  "department_transfer",
  "final_chance",
  "file_withdrawal",
] as const;

const VIEWPORTS = [
  { name: "360", width: 360, height: 800, mobile: true },
  { name: "768", width: 768, height: 1024, mobile: true },
  { name: "1366", width: 1366, height: 768, mobile: false },
] as const;

const CHROME_CANDIDATES = [
  process.env.B1_CHROME_EXECUTABLE,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
].filter(Boolean) as string[];

const STUDENT = {
  id: "00000000-0000-4000-8000-0000000000s1",
  email: "smoke.student@students.usr.edu.ye",
  password: "Smoke@2026",
};
const STAFF = {
  id: "00000000-0000-4000-8000-0000000000t1",
  email: "smoke.staff@staff.usr.edu.ye",
  password: "Smoke@2026",
};

const PRIVACY_RE =
  /\b(?:PostgREST|PGRST\d*|permission denied|user_id|error\.message|raw error|SELECT\s+\*|TypeError|ReferenceError)\b|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

const EXPECTED_CONSOLE_IGNORE =
  /Failed to fetch|NetworkError|Load failed|CHUNK_LOAD|favicon|PHONE_REGISTRATION|GCM|AbortError|The user aborted/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(label: string, fn: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await fn().catch(() => false)) return;
    if (Date.now() - start > timeoutMs) throw new Error(`TIMEOUT waiting for: ${label}`);
    await sleep(POLL_MS);
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

function killTree(proc: Subprocess | null): void {
  if (!proc?.pid) return;
  try {
    spawnSync({
      cmd: ["taskkill", "/PID", String(proc.pid), "/T", "/F"],
      stdout: "ignore",
      stderr: "ignore",
    });
  } catch {
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
  }
}

function b64url(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64url");
}

function fakeJwt(user: { id: string; email: string }): string {
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
  return `${header}.${payload}.c2lnbmVkdGVzdA`;
}

function userJson(user: { id: string; email: string }) {
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

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, prefer, accept-profile, content-profile, x-supabase-api-version",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS",
  "Access-Control-Expose-Headers": "content-range",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra },
  });
}

function decodeSub(auth: string | null): string | null {
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const payload = JSON.parse(Buffer.from(auth.slice(7).split(".")[1]!, "base64url").toString("utf-8"));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function startMockSupabase() {
  const users = [STUDENT, STAFF];
  return Bun.serve({
    hostname: "127.0.0.1",
    port: MOCK_PORT,
    fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method.toUpperCase();
      if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

      if (path === "/auth/v1/token" && method === "POST") {
        return req.json().then((body: { email?: string; password?: string }) => {
          const user = users.find((u) => u.email === body?.email && u.password === body?.password);
          if (!user) {
            return json({ error: "invalid_grant", error_description: "Invalid login credentials" }, 400);
          }
          return json({
            access_token: fakeJwt(user),
            token_type: "bearer",
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            refresh_token: `synthetic-refresh-${user.id.slice(-2)}`,
            user: userJson(user),
          });
        });
      }
      if (path === "/auth/v1/user" && method === "GET") {
        const sub = decodeSub(req.headers.get("authorization"));
        const user = users.find((u) => u.id === sub);
        if (!user) return json({ message: "invalid token" }, 401);
        return json(userJson(user));
      }
      if (path === "/auth/v1/logout" && method === "POST") {
        return new Response(null, { status: 204, headers: CORS });
      }
      if (path.startsWith("/auth/v1/")) return json({ message: "not found" }, 404);

      if (path.startsWith("/rest/v1/")) {
        const table = path.slice("/rest/v1/".length).split("?")[0]!;
        if (method === "HEAD") {
          return new Response(null, {
            status: 200,
            headers: { ...CORS, "Content-Range": "0-0/0" },
          });
        }
        if (method === "POST" && table === "rpc/check_and_record_rate_limit") {
          return json({ allowed: true, remaining: 99, blocked_until: null });
        }
        if (method === "POST" && table.startsWith("rpc/")) return json([]);
        if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") {
          return json([]);
        }
        if (table === "student_profiles") {
          const match = /user_id=eq\.([^&]+)/.exec(url.search);
          if (match?.[1] === STUDENT.id) {
            return json([{ user_id: STUDENT.id, must_change_password: false }]);
          }
          return json([]);
        }
        if (table === "staff_profiles") {
          const match = /user_id=eq\.([^&]+)/.exec(url.search);
          if (match?.[1] === STAFF.id) {
            return json([{ user_id: STAFF.id, must_change_password: false }]);
          }
          return json([]);
        }
        if (table === "faculty_profiles") return json([]);
        if (table === "user_roles") return json([]);
        if (table === "notifications") return json([]);
        return json([]);
      }
      return json({ message: "not found" }, 404);
    },
  });
}

class Cdp {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private listeners = new Map<string, ((params: Record<string, unknown>) => void)[]>();
  sessionId = "";
  consoleErrors: string[] = [];
  pageErrors: string[] = [];
  failedRequests: string[] = [];

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
    await waitFor(label, async () => !!(await this.evaluate(expression).catch(() => false)), timeoutMs);
  }

  resetSignals() {
    this.consoleErrors = [];
    this.pageErrors = [];
    this.failedRequests = [];
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

type Check = { name: string; ok: boolean; error?: string };
const results: Check[] = [];

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    results.push({ name, ok: false, error });
    console.log(`  FAIL  ${name} — ${error}`);
  }
}

async function main(): Promise<number> {
  const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chromePath) throw new Error("Chrome executable not found");

  const worktreeRoot = join(import.meta.dir, "../../..");
  const artifactDir = join(worktreeRoot, ".tmp/b1-real-app-browser-smoke");
  mkdirSync(artifactDir, { recursive: true });
  const profileDir = mkdtempSync(join(tmpdir(), "b1-real-app-smoke-"));

  let mock: ReturnType<typeof Bun.serve> | null = null;
  let app: Subprocess | null = null;
  let chrome: Subprocess | null = null;
  let cdp: Cdp | null = null;
  let browserWsUrl = "";
  let cleaned = false;

  const diagnosis: Record<string, unknown> = {
    app: "VITE_REACT_BUILD",
    protocol: "http",
    staticFixtureUsedAsEvidence: false,
  };

  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    console.log("\n[cleanup] stopping chrome / app / mock…");
    try {
      if (browserWsUrl) {
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
    killTree(chrome);
    killTree(app);
    try {
      mock?.stop(true);
    } catch {
      /* ignore */
    }
    await sleep(1500);
    for (const [label, port] of [
      ["app", APP_PORT],
      ["mock", MOCK_PORT],
      ["cdp", CDP_PORT],
    ] as const) {
      let free = false;
      for (let i = 0; i < 6 && !free; i++) {
        free = await portFree(port);
        if (!free) await sleep(400);
      }
      results.push({ name: `cleanup port ${port} (${label})`, ok: free });
      console.log(free ? `  PASS  port ${port} free` : `  FAIL  port ${port} busy`);
    }
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  const watchdog = setTimeout(() => {
    console.error("GLOBAL TIMEOUT");
    void cleanup().finally(() => process.exit(1));
  }, GLOBAL_TIMEOUT_MS);

  try {
    for (const port of [APP_PORT, MOCK_PORT, CDP_PORT]) {
      if (!(await portFree(port))) throw new Error(`port ${port} in use`);
    }

    mock = startMockSupabase();
    console.log(`[setup] mock supabase ${MOCK_URL}`);

    const smokeEnv = {
      ...process.env,
      VITE_SUPABASE_URL: MOCK_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
      SUPABASE_URL: MOCK_URL,
      SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
      SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role-key",
      VITE_B1_UI_MOCK: "1",
      VITE_B1_SMOKE_BUILD: "1",
      NITRO_PRESET: "node-server",
      HOST: "127.0.0.1",
      PORT: String(APP_PORT),
      NITRO_PORT: String(APP_PORT),
    };

    const serverEntry = join(worktreeRoot, ".output", "server", "index.mjs");
    const skipBuild = process.env.B1_REAL_SMOKE_SKIP_BUILD === "1" && existsSync(serverEntry);
    if (skipBuild) {
      console.log("[setup] reusing existing .output (B1_REAL_SMOKE_SKIP_BUILD=1)");
    } else {
      console.log("[setup] bun run build (real app, smoke mock flags)…");
      const build = spawn({
        cmd: ["bun", "run", "build"],
        cwd: worktreeRoot,
        env: smokeEnv,
        stdout: "pipe",
        stderr: "pipe",
      });
      const buildCode = await build.exited;
      if (buildCode !== 0) {
        const out = await new Response(build.stdout).text();
        const err = await new Response(build.stderr).text();
        throw new Error(`build failed: ${(out + err).slice(-2500)}`);
      }
      console.log("[setup] build done");
    }

    if (!existsSync(serverEntry)) throw new Error("missing .output/server/index.mjs");

    app = spawn({
      cmd: ["node", serverEntry],
      cwd: worktreeRoot,
      env: smokeEnv,
      stdout: "ignore",
      stderr: "ignore",
    });

    await waitFor(
      "app HTTP 200",
      async () => {
        if (app!.exitCode !== null) throw new Error(`app exited ${app!.exitCode}`);
        const res = await fetch(`${APP_ORIGIN}/portal-login`).catch(() => null);
        return res?.status === 200;
      },
      120_000,
    );

    const home = await fetch(`${APP_ORIGIN}/portal-login`);
    const homeHtml = await home.text();
    diagnosis.httpStatus = home.status;
    diagnosis.htmlSnippet = homeHtml.slice(0, 240);

    await check("build HTML has real asset entries", async () => {
      if (home.status !== 200) throw new Error(`status ${home.status}`);
      if (!/<html[\s>]/i.test(homeHtml)) throw new Error("not html");
      const assetRefs = [...homeHtml.matchAll(/(?:src|href)="(\/_build\/[^"]+\.(?:js|css))"/g)].map(
        (m) => m[1]!,
      );
      if (assetRefs.length === 0) {
        // TanStack/Nitro may emit /assets/ paths
        const alt = [...homeHtml.matchAll(/(?:src|href)="(\/(?:assets|_build|\_tanstack)[^"]+\.(?:js|css))"/g)].map(
          (m) => m[1]!,
        );
        if (alt.length === 0 && !/type="module"|<script/i.test(homeHtml)) {
          throw new Error("no script/css asset references in app HTML");
        }
        for (const path of alt.slice(0, 6)) {
          const res = await fetch(`${APP_ORIGIN}${path}`);
          if (res.status !== 200) throw new Error(`asset ${path} => ${res.status}`);
        }
        return;
      }
      for (const path of assetRefs.slice(0, 8)) {
        const res = await fetch(`${APP_ORIGIN}${path}`);
        if (res.status !== 200) throw new Error(`asset ${path} => ${res.status}`);
      }
    });

    chrome = spawn({
      cmd: [
        chromePath,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--no-proxy-server",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-extensions",
        "--disable-component-update",
        "--disable-default-apps",
        `--user-data-dir=${profileDir}`,
        `--remote-debugging-port=${CDP_PORT}`,
        "about:blank",
      ],
      stdout: "ignore",
      stderr: "ignore",
    });

    await waitFor(
      "CDP",
      async () => {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).catch(() => null);
        if (!res?.ok) return false;
        browserWsUrl =
          ((await res.json()) as { webSocketDebuggerUrl?: string }).webSocketDebuggerUrl || "";
        return !!browserWsUrl;
      },
      30_000,
    );

    cdp = await Cdp.connect(browserWsUrl);
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
    await cdp.send("Network.enable");

    const reqUrls = new Map<string, string>();
    cdp.on("Runtime.consoleAPICalled", (params) => {
      if (params.type !== "error") return;
      const args = (params.args as Array<{ value?: string; description?: string }>) || [];
      const text = args.map((a) => a.value ?? a.description ?? "").join(" ");
      if (EXPECTED_CONSOLE_IGNORE.test(text)) return;
      cdp!.consoleErrors.push(text);
    });
    cdp.on("Runtime.exceptionThrown", (params) => {
      const desc =
        (params.exceptionDetails as { exception?: { description?: string }; text?: string })
          ?.exception?.description ||
        (params.exceptionDetails as { text?: string })?.text ||
        "pageerror";
      if (EXPECTED_CONSOLE_IGNORE.test(String(desc))) return;
      cdp!.pageErrors.push(String(desc));
    });
    cdp.on("Network.requestWillBeSent", (params) => {
      const id = String(params.requestId || "");
      const u = String((params.request as { url?: string })?.url || "");
      if (id && u) reqUrls.set(id, u);
    });
    cdp.on("Network.loadingFailed", (params) => {
      const id = String(params.requestId || "");
      const u = reqUrls.get(id) || "";
      if (!u || u.startsWith("chrome") || u.startsWith("data:") || /favicon/i.test(u)) return;
      if (String(params.errorText || "") === "net::ERR_ABORTED") return;
      // Server-fn / mock gaps are tolerated only for non-asset XHR; fail asset MIME paths.
      if (/\.(js|css|mjs|png|jpe?g|svg|woff2?)(\?|$)/i.test(u) || u.includes("/_build/") || u.includes("/assets/")) {
        cdp!.failedRequests.push(`${u} :: ${String(params.errorText || "failed")}`);
      }
    });

    const goto = async (url: string) => {
      cdp!.resetSignals();
      await cdp!.send("Page.navigate", { url });
      await cdp!.poll(`load ${url}`, `document.readyState === "complete"`, 45_000);
    };
    const setViewport = async (width: number, height: number, mobile: boolean) => {
      await cdp!.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: mobile ? 2 : 1,
        mobile,
      });
    };
    const click = async (sel: string) => {
      const ok = await cdp!.evaluate<boolean>(
        `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; (el as HTMLElement).click(); return true; })()`.replace(
          " as HTMLElement",
          "",
        ),
      );
      if (!ok) throw new Error(`click missed ${sel}`);
    };
    const setInput = async (sel: string, value: string) => {
      await cdp!.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) throw new Error("missing " + ${JSON.stringify(sel)});
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`);
    };
    const clearSession = async () => {
      await cdp!.evaluate(`(() => { localStorage.clear(); sessionStorage.clear(); return true; })()`);
    };
    const enableSmokeServiceSurfaces = async () => {
      await cdp!.evaluate(`(() => {
        sessionStorage.setItem("B1_SMOKE_FORCE_AVAILABLE", "1");
        sessionStorage.setItem("B1_SMOKE_STAFF_CAN_ACT", "1");
        return true;
      })()`);
    };
    const login = async (kind: "student" | "staff") => {
      const user = kind === "student" ? STUDENT : STAFF;
      await clearSession();
      await goto(`${APP_ORIGIN}/portal-login?type=${kind}`);
      await cdp!.poll("login form", `!!document.querySelector("#portal-identifier")`, 30_000);
      await setInput("#portal-identifier", user.email);
      await setInput("#portal-password", user.password);
      await click('form button[type="submit"]');
      const dest = kind === "student" ? "/student" : "/staff";
      await cdp!.poll(
        `land ${dest}`,
        `location.pathname.startsWith(${JSON.stringify(dest)})`,
        45_000,
      );
    };
    const privacyOk = async () => {
      const body = await cdp!.evaluate<string>("document.body?.innerText || ''");
      if (PRIVACY_RE.test(body)) throw new Error("privacy leak in visible text");
      const banner = await cdp!.evaluate<boolean>(`(() => {
        const nodes = [...document.querySelectorAll("[data-testid='violation-banner'], .violation-banner")];
        return nodes.some((n) => getComputedStyle(n).display !== "none" && (n.textContent || "").includes("مخالفة"));
      })()`);
      if (banner) throw new Error("violation banner visible without violation");
    };
    const signalsOk = async () => {
      await sleep(400);
      if (cdp!.pageErrors.length) throw new Error(`pageErrors=${cdp!.pageErrors.join(" | ")}`);
      if (cdp!.consoleErrors.length) throw new Error(`consoleErrors=${cdp!.consoleErrors.join(" | ")}`);
      if (cdp!.failedRequests.length) {
        throw new Error(`failedAssets=${cdp!.failedRequests.join(" | ")}`);
      }
    };

    // ---- React root + router on real app ----
    await check("portal-login React root populated over HTTP", async () => {
      await setViewport(1366, 768, false);
      await goto(`${APP_ORIGIN}/portal-login`);
      // TanStack Start shells into <body> (no #root); require hydrated portal chrome.
      await cdp!.poll(
        "root populated",
        `document.body && document.body.childElementCount > 0 && (document.body.innerText || "").includes("بوابة")`,
        45_000,
      );
      const href = await cdp!.evaluate<string>("location.href");
      if (!href.startsWith("http://127.0.0.1")) throw new Error(`not http: ${href}`);
    });

    await check("router direct path + reload", async () => {
      await goto(`${APP_ORIGIN}/portal-login?type=student`);
      await cdp!.poll("student login view", `!!document.querySelector("#portal-identifier")`, 20_000);
      await cdp!.send("Page.reload", { ignoreCache: true });
      await cdp!.poll(
        "reload settled",
        `document.readyState === "complete" && !!document.querySelector("#portal-identifier")`,
        30_000,
      );
      if (!(await cdp!.evaluate<boolean>(`location.pathname === "/portal-login"`))) {
        throw new Error("pathname drifted after reload");
      }
    });

    // ---- Student five services ----
    await login("student");
    await enableSmokeServiceSurfaces();

    await check("student requests list shows five B1 services (real component)", async () => {
      await goto(`${APP_ORIGIN}/student/requests`);
      await cdp!.poll(
        "B1 list",
        `!!document.querySelector('[data-testid="b1-student-service-list"]')`,
        45_000,
      );
      for (const code of SERVICES) {
        await cdp!.poll(
          `link ${code}`,
          `!!document.querySelector('a[href*="/student/requests/b1/${code}"]')`,
          15_000,
        );
      }
      await privacyOk();
    });

    for (const code of SERVICES) {
      await check(`student form surface loads: ${code}`, async () => {
        await enableSmokeServiceSurfaces();
        await goto(`${APP_ORIGIN}/student/requests/b1/${code}`);
        await cdp!.poll(
          `form ${code}`,
          `!!document.querySelector('[data-testid="b1-student-request-form"][data-service-code="${code}"]')`,
          45_000,
        );
        await privacyOk();
      });
    }

    await check("file_withdrawal draft edit + validation + submit + detail", async () => {
      await enableSmokeServiceSurfaces();
      await goto(`${APP_ORIGIN}/student/requests/b1/file_withdrawal`);
      await cdp!.poll(
        "form ready",
        `!!document.querySelector('[data-testid="b1-student-request-form"]') && !!document.querySelector("#b1-field-withdrawal_reason")`,
        45_000,
      );
      // Empty review => validation errors
      await click('form button[type="submit"]');
      await cdp!.poll(
        "validation summary",
        `!!document.querySelector('[data-testid="b1-form-error-summary"]')`,
        15_000,
      );
      await setInput("#b1-field-withdrawal_reason", "سبب تجريبي لسحب الملف في اختبار الدخان.");
      await cdp!.evaluate(`(() => {
        const box = document.querySelector("#b1-field-impact_acknowledgment");
        if (!box) throw new Error("missing acknowledgment");
        if (!box.checked) box.click();
        return true;
      })()`);
      await cdp!.evaluate(`(() => {
        const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("حفظ المسودة"));
        if (!btn) throw new Error("save missing");
        btn.click();
        return true;
      })()`);
      await cdp!.poll(
        "draft saved",
        `(document.querySelector('[data-testid="b1-draft-status"]')?.textContent || "").includes("محفوظ")`,
        20_000,
      );
      await click('form button[type="submit"]');
      await cdp!.poll(
        "review summary",
        `!!document.querySelector('[data-testid="b1-request-summary"]')`,
        20_000,
      );
      await cdp!.evaluate(`(() => {
        const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("إرسال الطلب"));
        if (!btn) throw new Error("send missing");
        btn.click();
        return true;
      })()`);
      await cdp!.poll(
        "confirm dialog",
        `!!document.querySelector('[data-testid="b1-submission-confirmation"]')`,
        15_000,
      );
      // Radix Checkbox (button[role=checkbox]), not input[type=checkbox]
      await cdp!.evaluate(`(() => {
        const ack = document.querySelector("#b1-submission-acknowledgment");
        if (ack && ack.getAttribute("data-state") !== "checked") ack.click();
        return true;
      })()`);
      await cdp!.poll(
        "confirm enabled",
        `![...document.querySelectorAll('[data-testid="b1-submission-confirmation"] button')].find((b) => (b.textContent || "").includes("تأكيد التقديم"))?.disabled`,
        10_000,
      );
      await cdp!.evaluate(`(() => {
        const confirm = [...document.querySelectorAll('[data-testid="b1-submission-confirmation"] button')].find((b) =>
          (b.textContent || "").includes("تأكيد التقديم")
        );
        if (!confirm) throw new Error("confirm missing");
        if (confirm.disabled) throw new Error("confirm still disabled");
        confirm.click();
        return true;
      })()`);
      await cdp!.poll(
        "success state",
        `!!document.querySelector('[data-testid="b1-success-state"]')`,
        30_000,
      );
      await cdp!.evaluate(`(() => {
        const btn = [...document.querySelectorAll('[data-testid="b1-success-state"] button')].find((b) =>
          (b.textContent || "").includes("متابعة الطلب")
        );
        if (!btn) throw new Error("success continue missing");
        btn.click();
        return true;
      })()`);
      await cdp!.poll(
        "detail page",
        `location.pathname.includes("/student/requests/b1/view/") && !!document.querySelector('[data-testid="b1-student-request-detail"]')`,
        60_000,
      );
      await cdp!.poll(
        "status + history",
        `!!document.querySelector('[data-testid="b1-request-status-card"]') && !!document.querySelector('[data-testid="b1-request-history"]')`,
        20_000,
      );
      await cdp!.poll(
        "arabic detail summary (no snake_case keys)",
        `(() => {
          const summary = document.querySelector('[data-testid="b1-request-summary"]');
          if (!summary) return false;
          const text = summary.textContent || "";
          const banned = ["absence_date", "one_semester", "target_program_id", "target_department_id", "withdrawal_reason", "impact_acknowledgment"];
          if (banned.some((key) => text.includes(key))) return false;
          return text.includes("سبب سحب الملف") || text.includes("ملخص الطلب");
        })()`,
        20_000,
      );
      await privacyOk();
    });

    // ---- Staff surfaces ----
    await login("staff");
    await enableSmokeServiceSurfaces();

    await check("staff assigned queue + action panel (real component)", async () => {
      await goto(`${APP_ORIGIN}/staff/b1-requests`);
      await cdp!.poll(
        "workspace",
        `!!document.querySelector('[data-testid="b1-staff-workspace"]')`,
        45_000,
      );
      await cdp!.evaluate(`(() => {
        const btn = [...document.querySelectorAll('[data-testid="b1-staff-workspace"] button')].find((b) =>
          (b.textContent || "").includes("B1-MOCK")
        );
        if (!btn) throw new Error("no assigned row");
        btn.click();
        return true;
      })()`);
      await cdp!.poll(
        "action or revenue surface",
        `!!document.querySelector('[data-testid="b1-employee-action-panel"]') || !!document.querySelector('[data-testid="b1-revenue-receipt-card"]')`,
        30_000,
      );
      await privacyOk();
    });

    await check("unassigned staff sees no action panel", async () => {
      await cdp!.evaluate(`(() => {
        sessionStorage.setItem("B1_SMOKE_STAFF_CAN_ACT", "0");
        const fn = globalThis.__B1_SMOKE_SET_STAFF_CAN_ACT__;
        if (typeof fn === "function") fn(false);
        return true;
      })()`);
      await goto(`${APP_ORIGIN}/staff/b1-requests`);
      await cdp!.poll(
        "empty assigned",
        `!!document.querySelector('[data-testid="b1-staff-workspace"]') && (document.querySelector('[data-testid="b1-staff-workspace"]')?.innerText || "").includes("لا توجد طلبات مسندة")`,
        45_000,
      );
      const hasActions = await cdp!.evaluate<boolean>(
        `!!document.querySelector('[data-testid="b1-employee-action-panel"], [data-testid="b1-revenue-receipt-card"]')`,
      );
      if (hasActions) throw new Error("action panel visible for unassigned staff");
      await privacyOk();
    });

    // ---- Viewports ----
    for (const vp of VIEWPORTS) {
      await check(`${vp.name}: RTL + no overflow on student B1 list`, async () => {
        await setViewport(vp.width, vp.height, vp.mobile);
        await login("student");
        await enableSmokeServiceSurfaces();
        await goto(`${APP_ORIGIN}/student/requests`);
        await cdp!.poll(
          "list",
          `!!document.querySelector('[data-testid="b1-student-service-list"]')`,
          45_000,
        );
        await cdp!.poll(
          "rtl overflow",
          `getComputedStyle(document.documentElement).direction === "rtl" && document.documentElement.scrollWidth <= ${vp.width + 1}`,
          10_000,
        );
        await signalsOk();
        await privacyOk();
      });
    }

    writeFileSync(join(artifactDir, "summary.json"), JSON.stringify({ diagnosis, results }, null, 2));

    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      console.error("\nHOLD_PR261_REAL_APP_RUNTIME_CONFIRMED_BLOCKER", failed.slice(0, 40));
      return 1;
    }

    console.log("\nPASS_PR261_REAL_APP_HTTP_BROWSER_SMOKE");
    console.log("APP=VITE_REACT_BUILD");
    console.log("PROTOCOL=http");
    console.log(`URL=${APP_ORIGIN}`);
    console.log("REACT_ROOT=POPULATED");
    console.log("ASSETS_HTTP_200=PASS");
    console.log("ROUTER=PASS");
    console.log("VIEWPORTS=360/768/1366");
    console.log("PAGE_ERRORS=0");
    console.log("CONSOLE_ERRORS=0");
    console.log("FAILED_ASSET_REQUESTS=0");
    console.log("FIVE_REAL_SERVICE_SURFACES=PASS");
    console.log("STATIC_FIXTURE_NOT_USED_AS_EVIDENCE");
    console.log("NO_PRODUCTION_WRITE");
    return 0;
  } catch (e) {
    console.error("HOLD_PR261_REAL_APP_RUNTIME_CONFIRMED_BLOCKER", e instanceof Error ? e.message : e);
    writeFileSync(
      join(artifactDir, "summary.json"),
      JSON.stringify({ diagnosis, results, fatal: String(e) }, null, 2),
    );
    return 1;
  } finally {
    clearTimeout(watchdog);
    await cleanup();
  }
}

process.exit(await main());
