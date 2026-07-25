import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, type Subprocess } from "bun";

const root = join(import.meta.dir, "../..");
const smokeDir = join(import.meta.dir, "nav-browser-smoke");
const artifactDir = join(root, ".tmp/pr249-nav-smoke");
const PORT = 4179;

describe("PR249 student navigation browser smoke", () => {
  let serverProc: Subprocess | null = null;
  let started = false;

  beforeAll(async () => {
    mkdirSync(artifactDir, { recursive: true });
    expect(
      Bun.spawnSync(["bun", "run", join(smokeDir, "generate-pages.ts")], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      }).exitCode,
    ).toBe(0);

    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/index.html`)).ok) return;
    } catch {
      // start
    }
    serverProc = spawn({
      cmd: ["bun", "run", join(smokeDir, "server.ts")],
      cwd: root,
      env: { ...process.env, PR249_SMOKE_PORT: String(PORT) },
      stdout: "pipe",
      stderr: "pipe",
    });
    started = true;
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${PORT}/index.html`)).ok) {
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
    if (started) serverProc?.kill();
  });

  test("source contracts include aria-controls on notifications bell", () => {
    const bell = readFileSync(join(root, "src/components/portal/NotificationsBell.tsx"), "utf8");
    expect(bell).toContain('aria-controls="notifications-panel"');
  });

  test("chrome headless nav smoke passes", () => {
    const run = Bun.spawnSync(["bun", "run", join(smokeDir, "run-smoke.ts")], {
      cwd: root,
      env: { ...process.env, PR249_SMOKE_PORT: String(PORT) },
      stdout: "pipe",
      stderr: "pipe",
    });
    if (run.exitCode !== 0) {
      throw new Error(`${run.stdout.toString()}\n${run.stderr.toString()}`);
    }
    const results = JSON.parse(readFileSync(join(artifactDir, "smoke-results.json"), "utf8")) as {
      passed: number;
      failed: string[];
    };
    expect(results.failed).toEqual([]);
    expect(results.passed).toBeGreaterThanOrEqual(12);
    expect(existsSync(join(artifactDir, "menu-keyboard.png"))).toBe(true);
    expect(existsSync(join(artifactDir, "notifications.png"))).toBe(true);
    expect(existsSync(join(artifactDir, "mobile-rtl.png"))).toBe(true);
  }, 180_000);
});
