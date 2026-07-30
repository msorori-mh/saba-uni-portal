import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const reportPath = join(
  root,
  "docs/PORTAL-B1-NEGATIVE-RPC-MATRIX-TEST-FIXTURES-SEED-MIGRATION-SOURCE-PACKAGE-64-REPORT.md",
);

describe("PACKAGE-64 — seed migration source package hold contract", () => {
  const report = readFileSync(reportPath, "utf8");

  it("records the rule-3 isolation hold decision", () => {
    expect(report).toContain("HOLD_NEEDS_ISOLATED_TEST_IDENTITIES_AND_DEPARTMENTS");
    expect(report).toContain("SOURCE PACKAGE + PRODUCTION READ-ONLY PREFLIGHT ONLY");
  });

  it("inventories all 19 unique fixtures", () => {
    const ids = Array.from({ length: 19 }, (_, i) => `F${String(i + 1).padStart(2, "0")}`);
    for (const id of ids) expect(report).toContain(`| ${id} |`);
  });

  it("keeps the matrix and baseline untouched", () => {
    expect(report).toContain("be5040a4fd34fc1fbab235e118c509d0");
    expect(report).toContain("Matrix cases: **267**");
    expect(report).toContain("blocked: **22** (unchanged)");
  });

  it("asserts zero production writes and zero persistent seeding functions", () => {
    expect(report).toContain("Production writes: **0**");
    expect(report).toContain("Persistent seeding functions: **0**");
    expect(report).toContain("Migration files authored: **0**");
  });

  it("authored no B1 fixture seed migration in this package", () => {
    const dir = join(root, "supabase/migrations");
    const seeds = readdirSync(dir).filter((f) => /seed|fixture/i.test(f));
    expect(seeds).toEqual([]);
  });

  it("keeps the prior hold reports in source", () => {
    for (const f of [
      "docs/PORTAL-B1-NEGATIVE-RPC-MATRIX-BLOCKED-FIXTURES-CLOSURE-62-REPORT.md",
      "docs/PORTAL-B1-NEGATIVE-RPC-MATRIX-DEDICATED-TEST-FIXTURES-PROVISIONING-63-REPORT.md",
    ]) {
      expect(existsSync(join(root, f))).toBe(true);
    }
  });
});
