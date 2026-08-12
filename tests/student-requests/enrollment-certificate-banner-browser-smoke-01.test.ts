/**
 * PORTAL-PR246 banner browser/DOM smoke launcher (Chrome headless).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, type Subprocess } from "bun";

const root = join(import.meta.dir, "../..");
const smokeDir = join(import.meta.dir, "banner-browser-smoke");
const pagesDir = join(smokeDir, "pages");
const artifactDir = join(root, ".tmp/pr246-banner-smoke");
const PORT = 4178;

describe("PR246 enrollment-certificate banner browser smoke", () => {
  let serverProc: Subprocess | null = null;
  let startedServer = false;

  beforeAll(async () => {
    mkdirSync(artifactDir, { recursive: true });
    const gen = Bun.spawnSync(["bun", "run", join(smokeDir, "generate-pages.ts")], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(gen.exitCode).toBe(0);
    expect(existsSync(join(pagesDir, "violation-true.html"))).toBe(true);

    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/index.html`)).ok) {
        startedServer = false;
        return;
      }
    } catch {
      // start below
    }

    serverProc = spawn({
      cmd: ["bun", "run", join(smokeDir, "server.ts")],
      cwd: root,
      env: { ...process.env, PR246_SMOKE_PORT: String(PORT) },
      stdout: "pipe",
      stderr: "pipe",
    });
    startedServer = true;

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
    if (startedServer) serverProc?.kill();
  });

  test("fixture contracts: permission failure precedes empty state in source", () => {
    const newRoute = readFileSync(join(root, "src/routes/student.requests.new.tsx"), "utf8");
    expect(newRoute.indexOf("typesError ? (")).toBeLessThan(
      newRoute.indexOf("typedTypes.length === 0 ? ("),
    );
  });

  test("chrome headless banner smoke passes", () => {
    const run = Bun.spawnSync(["bun", "run", join(smokeDir, "run-smoke.ts")], {
      cwd: root,
      env: { ...process.env, PR246_SMOKE_PORT: String(PORT) },
      stdout: "pipe",
      stderr: "pipe",
    });
    if (run.exitCode !== 0) {
      throw new Error(
        `banner smoke failed\nSTDOUT:\n${run.stdout.toString()}\nSTDERR:\n${run.stderr.toString()}`,
      );
    }
    const results = JSON.parse(readFileSync(join(artifactDir, "smoke-results.json"), "utf8")) as {
      passed: number;
      failed: string[];
      total: number;
    };
    expect(results.failed).toEqual([]);
    expect(results.passed).toBeGreaterThanOrEqual(20);
    expect(existsSync(join(artifactDir, "violation-true.png"))).toBe(true);
    expect(existsSync(join(artifactDir, "types-load-failure.png"))).toBe(true);
    expect(existsSync(join(artifactDir, "mobile-rtl.png"))).toBe(true);
  }, 180_000);
});
