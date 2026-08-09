import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sim = join(root, "scripts/b1-rpc-principal-harness-01/local-operator-simulation");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/gu, "\n");

describe("PORTAL-B1-NEGATIVE-RPC-MATRIX-LOCAL-OPERATOR-SIMULATION-13", () => {
  it("simulation package files exist", () => {
    for (const f of [
      "README.md",
      "10-schema-stubs.sql",
      "15-case-functions.sql",
      "20-focused-cases.sql",
      "run-local-simulation.ps1",
    ]) {
      expect(existsSync(join(sim, f))).toBe(true);
    }
  });

  it("runner rejects SkipRender and production override channels", () => {
    const runner = read(join(sim, "run-local-simulation.ps1"));
    expect(runner).not.toMatch(/SkipRender/u);
    expect(runner).toContain("FORBIDDEN_ENV");
    expect(runner).toContain("PGHOSTADDR");
    expect(runner).toContain("DATABASE_URL");
    expect(runner).toContain("postgres:17");
    expect(runner).not.toMatch(/wpmicqriltrowwonknox/u);
    expect(runner).not.toMatch(/pooler\.supabase\.com/u);
  });

  it("focused cases use SERIALIZABLE + ROLLBACK and never COMMIT", () => {
    const sql = read(join(sim, "20-focused-cases.sql"));
    const fns = read(join(sim, "15-case-functions.sql"));
    expect((sql.match(/BEGIN ISOLATION LEVEL SERIALIZABLE/gu) ?? []).length).toBeGreaterThanOrEqual(5);
    expect((sql.match(/^ROLLBACK;/gmu) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(sql.replace(/--.*$/gmu, "")).not.toMatch(/\bCOMMIT\b/iu);
    expect(fns).toContain("B1_ACTION_TYPE_MISMATCH");
    expect(fns).toContain("record_external_university_payment_confirmation");
    expect(fns).toContain("cccccccc-cccc-cccc-cccc-cccccccccccc");
  });

  it("schema creates a SELECT-only operator without FOR SHARE requirement", () => {
    const schema = read(join(sim, "10-schema-stubs.sql"));
    expect(schema).toContain("b1_matrix_operator");
    expect(schema).toContain("NOSUPERUSER NOBYPASSRLS");
    expect(schema).toContain("GRANT SELECT");
    expect(schema.replace(/--.*$/gmu, "")).not.toMatch(/\bFOR\s+SHARE\b/iu);
  });
});
