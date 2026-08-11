/**
 * Disposable PostgreSQL 17 rehearsal for mobile push token registration migration.
 * No production apply.
 */
import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();
const migrationPath = join(
  root,
  "supabase/migrations/20260812010000_mobile_push_token_registration_01.sql",
);
const harnessPath = join(root, "tests/mobile-api/pg17-push-token-harness.sql");
const verifierPath = join(root, "tests/mobile-api/pg17-push-token-verifier.sql");

const container = `mobile-push-pg17-${Date.now()}`;

const dockerReady = (() => {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function teardownContainer() {
  try {
    execSync(`docker rm -f ${container}`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

function psql(sql: string): { ok: boolean; out: string } {
  const res = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  const out = `${res.stdout || ""}\n${res.stderr || ""}`;
  return { ok: res.status === 0, out };
}

async function waitReady(): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    const r = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], {
      encoding: "utf8",
    });
    if (r.status === 0) return true;
    await Bun.sleep(500);
  }
  return false;
}

describe("mobile push token PG17 disposable harness", () => {
  afterAll(() => {
    teardownContainer();
  });

  it("applies migration + proves authz positives/negatives", async () => {
    if (!dockerReady) {
      console.warn(
        "[SKIP] Docker daemon not available — PG17 push-token harness deferred (migration source still validated by contract tests)",
      );
      return;
    }

    teardownContainer();
    execSync(
      `docker run -d --name ${container} -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17`,
      { stdio: "ignore" },
    );
    const ready = await waitReady();
    expect(ready).toBe(true);

    const harness = readFileSync(harnessPath, "utf8");
    const migration = readFileSync(migrationPath, "utf8");
    const verifier = readFileSync(verifierPath, "utf8");

    const h = psql(harness);
    expect(h.ok).toBe(true);

    const m = psql(migration);
    if (!m.ok) {
      console.error(m.out);
    }
    expect(m.ok).toBe(true);

    const v = psql(verifier);
    if (!v.ok) {
      console.error(v.out);
    }
    expect(v.ok).toBe(true);
    expect(v.out).toContain("PASS_MOBILE_PUSH_TOKEN_PG17");
  }, 180_000);
});
