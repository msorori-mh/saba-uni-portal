/**
 * PORTAL-PR240-BROWSER-VISUAL-INTERACTION-SMOKE-01
 *
 * Browser/DOM regression guards + Chrome headless smoke launcher.
 * Synthetic fixtures only — no production identities or network backends.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawn, type Subprocess } from "bun";

const root = join(import.meta.dir, "../..");
const smokeDir = join(import.meta.dir, "browser-smoke");
const pagesDir = join(smokeDir, "pages");
const artifactDir = join(root, ".tmp/pr240-browser-smoke");
const PORT = 4177;
const HARNESS_MARKER = "pr240-browser-smoke";

const readPage = (name: string) =>
  readFileSync(join(pagesDir, name), "utf8").replace(/\r\n/g, "\n");

const PRIVACY_FORBIDDEN =
  /user_id|profile_id|postgrest|permission denied for|stack trace|supabase\.co|\brpc\b|relation "|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

describe("PR240 browser visual interaction smoke — fixture contracts", () => {
  beforeAll(() => {
    mkdirSync(pagesDir, { recursive: true });
    const gen = Bun.spawnSync(["bun", "run", join(smokeDir, "generate-pages.ts")], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(gen.exitCode).toBe(0);
  });

  test("required fixture pages exist", () => {
    const required = [
      "student-loading.html",
      "student-error.html",
      "student-empty.html",
      "student-success.html",
      "faculty-error.html",
      "faculty-success.html",
      "admin-loading-metrics.html",
      "admin-partial-error.html",
      "admin-real-zero.html",
      "mobile-rtl.html",
    ];
    for (const name of required) {
      expect(existsSync(join(pagesDir, name))).toBe(true);
    }
  });

  test("loading does not render fabricated zero metrics", () => {
    const html = readPage("admin-loading-metrics.html");
    expect(html).toContain("—");
    expect(html).toContain('aria-label="القيمة غير متاحة"');
    expect(html).toContain("WARNING");
    expect(html).toContain("جارٍ التحقق");
    expect(html).not.toMatch(/data-testid="metric-students"[^>]*>[^<]*[0٠]/);
    expect(html).not.toContain(">FAIL<");
  });

  test("error does not render empty-success copy or zero metrics", () => {
    const student = readPage("student-error.html");
    expect(student).toContain('role="alert"');
    expect(student).toContain("تعذّر تحميل مقرراتك المسجلة");
    expect(student).not.toContain("لم يتم تسجيلك في أي مجموعة دراسية بعد");
    expect(student).not.toMatch(/error\.message|permission denied|postgrest/i);

    const admin = readPage("admin-partial-error.html");
    expect(admin).toContain("admin-dashboard-partial-error");
    expect(admin).toContain("—");
    expect(admin).toContain("WARNING");
    expect(admin).toContain("تعذّر التحقق");
    expect(admin).not.toContain(">FAIL<");
  });

  test("real zero renders as a numeric zero, not a dash", () => {
    const html = readPage("admin-real-zero.html");
    expect(html).toMatch(/data-testid="metric-zero"[\s\S]*?>[0٠]</);
    expect(html).not.toMatch(/data-testid="metric-zero"[\s\S]*?القيمة غير متاحة/);
  });

  test("logout/cache isolation controls exist for second synthetic identity", () => {
    const html = readPage("student-success.html");
    expect(html).toContain('data-testid="logout-btn"');
    expect(html).toContain('data-testid="login-b-btn"');
    expect(html).toContain("queryClient.clear()");
    expect(html).toContain("student-b");
  });

  test("RTL and alert semantics are present", () => {
    expect(readPage("faculty-error.html")).toContain('dir="rtl"');
    expect(readPage("faculty-success.html")).toContain('dir="rtl"');
    expect(readPage("student-error.html")).toContain('aria-live="assertive"');
    expect(readPage("student-error.html")).toContain('tabindex="-1"');
  });

  test("fixture pages never leak technical identifiers", () => {
    for (const name of readdirSync(pagesDir).filter((f) => f.endsWith(".html"))) {
      const html = readPage(name);
      expect(html).not.toMatch(PRIVACY_FORBIDDEN);
    }
  });

  test("harness is loopback-only and Chrome failures cannot produce a false PASS", () => {
    const runner = readFileSync(join(smokeDir, "run-smoke.ts"), "utf8");
    const server = readFileSync(join(smokeDir, "server.ts"), "utf8");
    expect(runner).toContain("http://127.0.0.1:");
    expect(runner).toContain("timeout: CHROME_TIMEOUT_MS");
    expect(runner).toContain("result.status !== 0");
    expect(runner).toContain('data-harness="${HARNESS_MARKER}"');
    expect(runner).toContain("Expected 26 independent named scenarios");
    expect(runner).toContain("--disable-background-networking");
    expect(runner).toContain("MAP * ~NOTFOUND, EXCLUDE 127.0.0.1");
    expect(server).toContain('"x-pr240-harness": HARNESS_MARKER');
  });

  test("360px contract page has overflow-safe layout styles", () => {
    const html = readPage("mobile-rtl.html");
    expect(html).toContain("overflow-x: hidden");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("max-width: 72rem");
  });
});

describe("PR240 browser visual interaction smoke — live Chrome headless", () => {
  let serverProc: Subprocess | null = null;
  let startedServer = false;

  beforeAll(async () => {
    mkdirSync(artifactDir, { recursive: true });
    Bun.spawnSync(["bun", "run", join(smokeDir, "generate-pages.ts")], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });

    // Reuse an already-running smoke server when present.
    let existing: Response | null = null;
    try {
      existing = await fetch(`http://127.0.0.1:${PORT}/index.html`);
    } catch {
      // Port is free; start below.
    }
    if (existing) {
      if (existing.ok && existing.headers.get("x-pr240-harness") === HARNESS_MARKER) {
        startedServer = false;
        return;
      }
      throw new Error(`Port ${PORT} is occupied by a non-PR240 server`);
    }

    serverProc = spawn({
      cmd: ["bun", "run", join(smokeDir, "server.ts")],
      cwd: root,
      env: { ...process.env, PR240_SMOKE_PORT: String(PORT) },
      stdout: "pipe",
      stderr: "pipe",
    });
    startedServer = true;

    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/index.html`);
        if (res.ok && res.headers.get("x-pr240-harness") === HARNESS_MARKER) {
          ready = true;
          break;
        }
      } catch {
        // retry
      }
      await Bun.sleep(150);
    }
    expect(ready).toBe(true);
  }, 60_000);

  afterAll(async () => {
    if (startedServer && serverProc) {
      serverProc.kill();
      await Promise.race([
        serverProc.exited,
        Bun.sleep(5_000).then(() => {
          throw new Error("PR240 smoke server did not exit within 5 seconds");
        }),
      ]);
    }
  });

  test("chrome headless smoke suite passes and writes screenshots", () => {
    const run = Bun.spawnSync(["bun", "run", join(smokeDir, "run-smoke.ts")], {
      cwd: root,
      env: {
        ...process.env,
        PR240_SMOKE_PORT: String(PORT),
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    if (run.exitCode !== 0) {
      throw new Error(
        `browser smoke failed\nSTDOUT:\n${run.stdout.toString()}\nSTDERR:\n${run.stderr.toString()}`,
      );
    }

    const resultsPath = join(artifactDir, "smoke-results.json");
    expect(existsSync(resultsPath)).toBe(true);
    const results = JSON.parse(readFileSync(resultsPath, "utf8")) as {
      passed: number;
      total: number;
      failed: string[];
      harness: string;
    };
    expect(results.harness).toContain("chrome-headless");
    expect(results.failed).toEqual([]);
    expect(results.total).toBe(26);
    expect(results.passed).toBe(26);

    const shots = [
      "student-loading.png",
      "student-error.png",
      "student-empty.png",
      "student-success.png",
      "faculty-error.png",
      "faculty-success.png",
      "admin-loading-metrics.png",
      "admin-partial-error.png",
      "admin-real-zero-metrics.png",
      "mobile-rtl.png",
    ];
    for (const shot of shots) {
      expect(existsSync(join(artifactDir, shot))).toBe(true);
    }
  }, 180_000);
});
