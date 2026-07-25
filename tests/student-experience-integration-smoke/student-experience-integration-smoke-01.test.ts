/**
 * PORTAL-PR246-PR249 student experience integration preflight — Chrome smoke launcher.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, type Subprocess } from "bun";

const root = join(import.meta.dir, "../..");
const smokeDir = import.meta.dir;
const artifactDir = join(root, ".tmp/pr246-pr249-integration-smoke");
const PORT = 4180;

describe("PR246+PR249 student experience integration smoke", () => {
  let serverProc: Subprocess | null = null;
  let started = false;

  beforeAll(async () => {
    mkdirSync(artifactDir, { recursive: true });
    const gen = Bun.spawnSync(["bun", "run", join(smokeDir, "generate-pages.ts")], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(gen.exitCode).toBe(0);
    expect(existsSync(join(smokeDir, "pages/portal-home.html"))).toBe(true);
    expect(existsSync(join(smokeDir, "pages/violation-true.html"))).toBe(true);
    expect(existsSync(join(smokeDir, "pages/menu-keyboard.html"))).toBe(true);

    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return;
    } catch {
      // start below
    }

    serverProc = spawn({
      cmd: ["bun", "run", join(smokeDir, "server.ts")],
      cwd: root,
      env: { ...process.env, PR246_PR249_SMOKE_PORT: String(PORT) },
      stdout: "pipe",
      stderr: "pipe",
    });
    started = true;

    let ready = false;
    for (let i = 0; i < 50; i++) {
      if (serverProc.exitCode !== null) {
        throw new Error(`smoke server exited early: code=${serverProc.exitCode}`);
      }
      try {
        if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) {
          ready = true;
          break;
        }
      } catch {
        // retry
      }
      await Bun.sleep(150);
    }
    expect(ready).toBe(true);
  }, 90_000);

  afterAll(() => {
    if (started) serverProc?.kill();
  });

  test("source contracts from both Final RCs remain present", () => {
    const bell = readFileSync(join(root, "src/components/portal/NotificationsBell.tsx"), "utf8");
    const rootRoute = readFileSync(join(root, "src/routes/__root.tsx"), "utf8");
    const newReq = readFileSync(join(root, "src/routes/student.requests.new.tsx"), "utf8");
    const study = readFileSync(join(root, "src/routes/student.study-plan.tsx"), "utf8");
    expect(bell).toContain('aria-controls="notifications-panel"');
    expect(rootRoute).toContain("isMobileAppShell");
    expect(newReq.indexOf("typesError ? (")).toBeLessThan(
      newReq.indexOf("typedTypes.length === 0 ? ("),
    );
    expect(study).toContain("onLogout={handleLogout}");
  });

  test("chrome headless integration smoke passes", () => {
    if (serverProc && serverProc.exitCode !== null) {
      throw new Error(`server exited before smoke: ${serverProc.exitCode}`);
    }
    const run = Bun.spawnSync(["bun", "run", join(smokeDir, "run-smoke.ts")], {
      cwd: root,
      env: { ...process.env, PR246_PR249_SMOKE_PORT: String(PORT) },
      stdout: "pipe",
      stderr: "pipe",
    });
    if (run.exitCode !== 0) {
      throw new Error(`${run.stdout.toString()}\n${run.stderr.toString()}`);
    }
    const results = JSON.parse(readFileSync(join(artifactDir, "smoke-results.json"), "utf8")) as {
      passed: number;
      failed: string[];
      total: number;
    };
    expect(results.failed).toEqual([]);
    expect(results.passed).toBeGreaterThanOrEqual(17);
    expect(existsSync(join(artifactDir, "portal-home.png"))).toBe(true);
    expect(existsSync(join(artifactDir, "violation-true.png"))).toBe(true);
    expect(existsSync(join(artifactDir, "menu-keyboard.png"))).toBe(true);
    expect(existsSync(join(artifactDir, "mobile-rtl.png"))).toBe(true);
    if (serverProc && serverProc.exitCode !== null) {
      throw new Error(`server exited during smoke: ${serverProc.exitCode}`);
    }
  }, 240_000);
});
