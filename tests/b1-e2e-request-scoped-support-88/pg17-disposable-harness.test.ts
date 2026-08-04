import { describe, expect, it, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();
const dir = join(root, "tests", "b1-e2e-request-scoped-support-88");
const harnessSqlPath = join(dir, "pg17-disposable-harness.sql");
const schemaPath = join(dir, "pg", "10-minimal-schema.sql");
const migrationPath = join(
  root,
  "supabase",
  "migrations",
  "20260804120000_b1_88_request_scoped_e2e_support.sql",
);

const sqlContent = readFileSync(harnessSqlPath, "utf8");
const container = `test-pg17-b1-e2e-88-${Date.now()}`;

function teardownContainer() {
  try {
    execSync(`docker stop ${container}`, { stdio: "ignore" });
  } catch {}
  try {
    execSync(`docker rm -f ${container}`, { stdio: "ignore" });
  } catch {}
}

function psql(sql: string) {
  const res = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  if (res.status !== 0) {
    throw new Error(`PSQL Error:\n${res.stderr || res.stdout}`);
  }
  return `${res.stdout || ""}\n${res.stderr || ""}`;
}

function psqlFile(filePath: string) {
  psql(readFileSync(filePath, "utf8"));
}

afterAll(() => {
  teardownContainer();
});

describe("B1 E2E 88 PG17 disposable harness", () => {
  it("is transactional and covers the required proof surfaces", () => {
    expect(sqlContent).toMatch(/^\s*BEGIN;/m);
    expect(sqlContent).toMatch(/^\s*ROLLBACK;/m);
    expect(sqlContent).not.toMatch(/^\s*COMMIT;/m);
    expect(sqlContent).toContain("PASS_B1_E2E_88_PG17_DISPOSABLE_HARNESS");
    expect(sqlContent).toContain("A_REAL_ASSIGNMENT_SHOULD_PASS");
    expect(sqlContent).toContain("B_BOUND_ACTOR_SHOULD_PASS");
    expect(sqlContent).toContain("C_E2E_CREATE_SHOULD_PASS");
    expect(sqlContent).toContain("D_RPA_FINGERPRINT_DRIFT");
    expect(sqlContent).toContain("SR-20260801-13");
    expect(sqlContent).toContain("B1_E2E_88_HARNESS_UNEXPECTED_SUCCESS");
    expect(sqlContent).toContain("B1_E2E_88_CLEANUP_ASSIGNEE_DRIFT");
    expect(sqlContent).toContain("D_CAS_LATER_ASSIGNMENT_NOT_PRESERVED");
    expect(sqlContent).not.toMatch(
      /RAISE EXCEPTION '[A-Z0-9_]*SHOULD_DENY'[\s\S]{0,80}EXCEPTION WHEN others THEN\s*NULL;/i,
    );
  });

  it("launches PostgreSQL 17 and proves A/B/C/D locally", async () => {
    try {
      execSync(
        `docker run --rm --detach --name ${container} -e POSTGRES_PASSWORD=local_only postgres:17-alpine`,
      );

      let ready = false;
      for (let i = 0; i < 40; i++) {
        try {
          const logs = execSync(`docker logs ${container}`).toString("utf8");
          if (logs.includes("PostgreSQL init process complete")) {
            execSync(`docker exec ${container} pg_isready -U postgres`);
            ready = true;
            break;
          }
        } catch {
          // not ready
        }
        await Bun.sleep(500);
      }
      expect(ready).toBe(true);

      psqlFile(schemaPath);
      psqlFile(migrationPath);
      const out = psql(readFileSync(harnessSqlPath, "utf8"));
      expect(out).toContain("PASS_B1_E2E_88_PG17_DISPOSABLE_HARNESS");
    } finally {
      teardownContainer();
    }
  }, 180_000);
});
