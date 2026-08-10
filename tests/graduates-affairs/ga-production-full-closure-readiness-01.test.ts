import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("GA production full-closure readiness artifacts", () => {
  test("SELECT-only Lovable preflight is read-only and fail-closed", () => {
    const sql = read(
      "docs/migration-drafts/GA-PRODUCTION-PROMOTION-PREFLIGHT-READONLY-SELECT-01.sql",
    );
    expect(sql).toContain("READY_FOR_APPLY_FOUNDATION");
    expect(sql).toContain("HOLD_SPECIALIST_MISSING_DEPARTMENT_SCOPE");
    expect(sql).toContain("C9_NOT_VERIFIED");
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i);
    expect(sql).not.toMatch(/\bDO\s+\$\$/i);
  });

  test("specialist scope remediation stays dry-run by default", () => {
    const sql = read(
      "docs/migration-drafts/GA-PRODUCTION-SPECIALIST-SCOPE-REMEDIATION-DRY-RUN-01.sql",
    );
    expect(sql).toContain("SPECIALIST_SCOPE_REMEDIATION_DRY_RUN_ONLY");
    expect(sql).toContain("aa4f5c16-c993-4af6-a6d4-59d9542c1a7f");
    expect(sql).toContain("OWNER_DECISION_REQUIRED");
    expect(sql).toMatch(/--\s*INSERT INTO public\.staff_profile_departments/);
    expect(sql).not.toMatch(/^\s*INSERT\b/m);
  });

  test("GA1-GA3 apply-one packets pin canonical FULL hashes", () => {
    const ga1 = read("docs/go-live/operator-packets/GA1-LOVABLE-APPLY-ONE.txt");
    const ga2 = read("docs/go-live/operator-packets/GA2-LOVABLE-APPLY-ONE.txt");
    const ga3 = read("docs/go-live/operator-packets/GA3-LOVABLE-APPLY-ONE.txt");
    expect(ga1).toContain("3248cf641add2dde7f249eb366f5b7b9668ef028130d6f0caffb0936969e2f43");
    expect(ga2).toContain("3e37afbadd9b4c2ca4ec593ad47fae77b4333e62770f926598fcbf51336806fa");
    expect(ga3).toContain("212865fb7c4077ce313a9b4707700520be275360b54470fd62fc08edd539060c");
    expect(ga1).toContain("APPLY EXACTLY ONE");
    expect(ga2).toContain("APPLY EXACTLY ONE");
    expect(ga3).toContain("APPLY EXACTLY ONE");
  });

  test("mission report records HOLD and zero production writes", () => {
    const report = read(
      "docs/reviews/PORTAL-24H-GRADUATES-AFFAIRS-PRODUCTION-FULL-CLOSURE-01-REPORT.md",
    );
    expect(report).toContain(
      "HOLD_PORTAL_24H_GRADUATES_AFFAIRS_PRODUCTION_CLOSED_PENDING_C9_AND_SPECIALIST_SCOPE",
    );
    expect(report).toContain("PRODUCTION_WRITES=0");
    expect(report).toContain("HOLD_SPECIALIST_MISSING_DEPARTMENT_SCOPE");
    expect(report).toContain("is **not** emitted");
    expect(report).toMatch(/^## Decision[\s\S]*HOLD_PORTAL_24H_GRADUATES_AFFAIRS/m);
  });
});
