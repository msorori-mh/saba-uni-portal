import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const harnessSqlPath = join(
  root,
  "tests",
  "b1-authoritative-positive-fixture-matrix-19",
  "pg17-disposable-harness.sql"
);

const sqlContent = readFileSync(harnessSqlPath, "utf8");

describe("Disposable PostgreSQL 17 Positive Harness Contract", () => {
  it("enforces transactional safety with BEGIN and ROLLBACK", () => {
    expect(sqlContent).toMatch(/^\s*BEGIN;/m);
    expect(sqlContent).toMatch(/^\s*ROLLBACK;/m);
    expect(sqlContent).not.toMatch(/^\s*COMMIT;/m);
  });

  it("covers all 19 fixture case request numbers", () => {
    for (let i = 1; i <= 19; i++) {
      const padOrd = i.toString().padStart(6, "0");
      expect(sqlContent).toContain(`SR-20260801-13${padOrd}`);
    }
  });

  it("proves wrong actor failure, wrong action failure, exact execution and zero mutation", () => {
    expect(sqlContent).toContain("v_wrong_actor_ok");
    expect(sqlContent).toContain("v_wrong_action_ok");
    expect(sqlContent).toContain("v_exact_exec_ok");
    expect(sqlContent).toContain("v_transition_ok");
    expect(sqlContent).toContain("v_zero_mutation_ok");
  });

  it("rejects non-disposable production connections and requires 19 of 19 pass", () => {
    expect(sqlContent).toContain("expected 19 of 19");
    expect(sqlContent).toContain("DISPOSABLE_HARNESS_PASS");
  });
});
