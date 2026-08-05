/**
 * Optional disposable PostgreSQL 17 smoke for Package 97.
 * Skips immediately when Docker is unavailable or when the image is not local
 * (avoids multi-minute pulls in CI/source packages).
 */
import { afterAll, describe, expect, it } from "bun:test";
import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PREFLIGHT = join(
  ROOT,
  "docs/production-preflight/B1-E2E-88-PRODUCTION-READONLY-PREFLIGHT-97.sql",
);

const dockerReady = (() => {
  try {
    execSync("docker --version", { stdio: "ignore" });
    const images = execSync("docker images -q postgres:17", { encoding: "utf8" }).trim();
    return images.length > 0;
  } catch {
    return false;
  }
})();

const container = `pkg97-pg17-${Date.now()}`;

describe("Package 97 — optional PG17 read-only harness", () => {
  afterAll(() => {
    if (!dockerReady) return;
    try {
      execSync(`docker rm -f ${container}`, { stdio: "ignore" });
    } catch {
      /* ignore */
    }
  });

  it("proves READ ONLY probe + preflight ends with ROLLBACK when postgres:17 is local", () => {
    const sql = readFileSync(PREFLIGHT, "utf8");
    expect(sql).toMatch(/BEGIN\s+TRANSACTION\s+ISOLATION\s+LEVEL\s+SERIALIZABLE\s+READ\s+ONLY/i);
    expect(sql.replace(/\s+$/g, "").endsWith("ROLLBACK;")).toBe(true);

    if (!dockerReady) {
      // Source package remains valid without Docker; contract covers read-only shape.
      expect(dockerReady).toBe(false);
      return;
    }

    execSync(
      `docker run -d --name ${container} -e POSTGRES_PASSWORD=postgres postgres:17`,
      { stdio: "ignore" },
    );

    let ready = false;
    for (let i = 0; i < 40; i++) {
      const r = spawnSync(
        "docker",
        ["exec", container, "pg_isready", "-U", "postgres"],
        { encoding: "utf8" },
      );
      if (r.status === 0) {
        ready = true;
        break;
      }
      execSync("powershell -Command \"Start-Sleep -Milliseconds 500\"", { stdio: "ignore" });
    }
    expect(ready).toBe(true);

    const probe = `
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SELECT current_setting('transaction_read_only') AS txn_ro;
ROLLBACK;
`;
    const probeRun = spawnSync(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
      { input: probe, encoding: "utf8" },
    );
    expect(probeRun.status).toBe(0);
    expect(probeRun.stdout).toMatch(/on/i);
  }, 20000);
});
