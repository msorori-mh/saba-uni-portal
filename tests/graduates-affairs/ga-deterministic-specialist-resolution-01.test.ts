import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("GA deterministic specialist resolution + GA3-present status", () => {
  test("marks aa4f5c16 as AMBIGUOUS_SPECIALIST_DO_NOT_SCOPE and plans TEST_ONLY candidate", () => {
    const decision = read(
      "docs/migration-drafts/GA-PRODUCTION-SPECIALIST-SCOPE-OWNER-DECISION-01.md",
    );
    expect(decision).toContain("AMBIGUOUS_SPECIALIST_DO_NOT_SCOPE");
    expect(decision).toContain("aa4f5c16-c993-4af6-a6d4-59d9542c1a7f");
    expect(decision).toContain("SAFE_REAL_STAFF_CANDIDATE=NONE");
    expect(decision).toContain("a6e30100-0000-4000-a300-000000000001");
    expect(decision).toContain("11111111-1111-4111-8111-111111111111");
    expect(decision).toContain("TEST_ONLY_GA_SPECIALIST_E2E_01");
    expect(decision).toContain("Production writes this package:** `0`");
    expect(decision).not.toContain("<OWNER_CHOSEN_DEPARTMENT_UUID>");
  });

  test("TEST_ONLY fixture is single-department and never scopes ambiguous specialist", () => {
    const fixture = read(
      "docs/production-test-fixtures/GA-SPECIALIST-SINGLE-DEPT-TESTONLY-FIXTURE-01.sql",
    );
    expect(fixture).toContain("TEST_ONLY_GA_SPECIALIST_E2E_01");
    expect(fixture).toContain("11111111-1111-4111-8111-111111111111");
    expect(fixture).toContain("a6e30100-0000-4000-a300-000000000001");
    expect(fixture).toContain("GA_SPECIALIST_FIXTURE_SPD_NOT_EXACTLY_ONE");
    expect(fixture).toContain("GA_SPECIALIST_FIXTURE_REFUSES_AMBIGUOUS_SPECIALIST");
    expect(fixture).toContain("aa4f5c16-c993-4af6-a6d4-59d9542c1a7f");
    expect(fixture).toContain("department_scope");
    expect(fixture).toContain("'departments'");
    expect(fixture).toContain("ROLLBACK");
    expect(fixture).toMatch(/c_execute/);
    expect(fixture).not.toMatch(/^\s*COMMIT\s*;/m);
  });

  test("operator packets set GA3 VERIFIED_PRESENT and no schema re-apply", () => {
    const status = read("docs/go-live/operator-packets/GA-PRODUCTION-STATUS.txt");
    expect(status).toContain("NEXT_WRITE=NONE_SCHEMA");
    expect(status).toContain("GA1_CURRENT=VERIFIED_PRESENT");
    expect(status).toContain("GA2_CURRENT=VERIFIED_PRESENT");
    expect(status).toContain("GA3_CURRENT=VERIFIED_PRESENT");
    expect(status).toContain("GA3_READY=YES");
    expect(status).toContain("DO_NOT_REAPPLY_GA3=YES");
    expect(status).toContain("AMBIGUOUS_SPECIALIST=aa4f5c16-c993-4af6-a6d4-59d9542c1a7f");
    expect(status).toContain("SAFE_SPECIALIST_CANDIDATE=a6e30100-0000-4000-a300-000000000001");
    expect(status).toContain("SAFE_SPECIALIST_DEPARTMENT=11111111-1111-4111-8111-111111111111");
    expect(status).toContain("AUTH04_MATRIX=");
    expect(status).toContain("manager_assigned=ALLOW_manager_scope");
    expect(status).toContain("outside_scope=DENY");

    const ga3 = read("docs/go-live/operator-packets/GA3-LOVABLE-APPLY-ONE.txt");
    expect(ga3).toContain("NEXT_WRITE=NONE_SCHEMA");
    expect(ga3).toContain("GA3_CURRENT=VERIFIED_PRESENT");
    expect(ga3).toContain("DO NOT RE-APPLY");
    expect(ga3).toContain("20260810162735");

    const master = read(
      "docs/go-live/operator-packets/LOVABLE-C5V2-THROUGH-GA3-MASTER-SEQUENTIAL-EXECUTION.txt",
    );
    expect(master).toContain("NEXT_WRITE=NONE_SCHEMA");
    expect(master).toContain("GA3_CURRENT=VERIFIED_PRESENT");
  });

  test("mission report emits final pass token with zero critical/high", () => {
    const report = read(
      "docs/reviews/PORTAL-PR338-GA-FINAL-RC-AND-DETERMINISTIC-SPECIALIST-RESOLUTION-01.md",
    );
    expect(report).toContain("PASS_PORTAL_PR338_GA_FINAL_RC_AND_SPECIALIST_PLAN_CLOSED");
    expect(report).toContain("CRITICAL | 0");
    expect(report).toContain("HIGH | 0");
    expect(report).toContain("NEXT_WRITE | `NONE_SCHEMA`");
    expect(report).toContain("GA3_CURRENT | `VERIFIED_PRESENT`");
    expect(report).toContain("AMBIGUOUS_SPECIALIST_DO_NOT_SCOPE");
  });

  test("dry-run SQL no longer offers INSERT for aa4f5c16", () => {
    const dryRun = read(
      "docs/migration-drafts/GA-PRODUCTION-SPECIALIST-SCOPE-REMEDIATION-DRY-RUN-01.sql",
    );
    expect(dryRun).toContain("AMBIGUOUS_SPECIALIST_DO_NOT_SCOPE");
    expect(dryRun).toContain("a6e30100-0000-4000-a300-000000000001");
    expect(dryRun).not.toMatch(/INSERT INTO public\.staff_profile_departments/);
  });
});
