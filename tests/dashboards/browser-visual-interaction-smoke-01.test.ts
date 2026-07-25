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
    try {
      const existing = await fetch(`http://127.0.0.1:${PORT}/index.html`);
      if (existing.ok) {
        startedServer = false;
        return;
      }
    } catch {
      // start below
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
        if (res.ok) {
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

  afterAll(() => {
    if (startedServer) serverProc?.kill();
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
    expect(results.passed).toBeGreaterThanOrEqual(20);

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
