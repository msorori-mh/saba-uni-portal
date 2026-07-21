import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const root = process.cwd();
const SHA = "0e2d25c9a2d7923ce74cfae079b99691d61eb1b6";
const STALE_A = "427b7eb4";
const STALE_B = "8f229d09";

const report = readFileSync(
  join(root, "docs", "PORTAL-FRESH-RELEASE-BASELINE-AND-D02-REFRESH-01-REPORT.md"),
  "utf8",
);
const freshRc = readFileSync(
  join(root, "docs", "PORTAL-FRESH-RELEASE-CANDIDATE-01.md"),
  "utf8",
);
const d02 = readFileSync(
  join(root, "docs", "B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-01.md"),
  "utf8",
);
const preflight = readFileSync(
  join(root, "docs", "B1-PREFLIGHT-FRESH-BASELINE-01.md"),
  "utf8",
);
const preflight02 = readFileSync(
  join(root, "docs", "B1-FIVE-SERVICES-PRODUCTION-ACTIVATION-PREFLIGHT-02-REPORT.md"),
  "utf8",
);

describe("PORTAL-FRESH-RELEASE-BASELINE-AND-D02-REFRESH-01", () => {
  test("pins fresh SOURCE_SHA and does not claim production deploy", () => {
    expect(freshRc).toContain(SHA);
    expect(freshRc).toContain("expected_release_sha");
    expect(freshRc).toContain("SOURCE_ONLY — NOT PUBLISHED");
    expect(freshRc).toMatch(/DEPLOYED_SHA[\s\S]*UNKNOWN/);
    expect(freshRc).toContain("NOT_RUN");
    expect(freshRc).not.toMatch(/Production published:\s*YES/i);

    expect(preflight).toContain(`expected_release_sha`);
    expect(preflight).toContain(SHA);
    expect(preflight).toContain("NOT_RUN");
    expect(preflight).toContain(STALE_A);
    expect(preflight).toMatch(/not.*valid fresh release|no longer a valid|ملغي|cancelled|supersedes/i);

    expect(report).toContain("PASS_FRESH_RELEASE_BASELINE_AND_D02_PACKAGE_READY");
    expect(report).toContain("SOURCE_SHA");
    expect(report).toContain("DEPLOYED_SHA");
    expect(report).toContain("PRODUCTION_DB_STATE");
    expect(report).toContain("MIGRATION_READINESS");
    expect(report).toContain("USER_APPROVAL_REQUIRED");
    expect(report).toContain(SHA);
  });

  test("refreshed D-02 package covers required RO probes and forbids live account import", () => {
    expect(d02).toContain(SHA);
    expect(d02).toContain("schema_migrations");
    expect(d02).toContain("log_audit");
    expect(d02).toContain("DEPARTMENT-CHAIRS");
    expect(d02).toContain("student_visible");
    expect(d02).toContain("storage.buckets");
    expect(d02).toContain("USR-2026-000001");
    expect(d02).toContain("academic_clearance_cases");
    expect(d02).toContain("graduation_projects");
    expect(d02).toContain("lecture_execution_sessions");
    expect(d02).toContain("course_materials");
    expect(d02).toContain("student_accounts");
    expect(d02).toContain("STUDENT_ACCOUNTS_SOURCE_PRESENT");
    expect(d02).toMatch(/ممنوع.*إنشاء حسابات|بدون إنشاء حسابات|no account/i);
    expect(d02).toContain("GRADUATION-PROJECTS");
    expect(d02).toContain("GRADUATES-AFFAIRS");
    expect(d02).toContain("ambiguous");
    expect(d02).toContain("partial");
    expect(d02).toContain("D02_NOT_EXECUTED");
    // Must not still claim old pin as the package reference tip.
    expect(d02).not.toMatch(/المرجع:\s*`origin\/main@8f229d09`/);
  });

  test("historical preflight-02 is marked superseded as current baseline", () => {
    expect(preflight02).toContain("SUPERSEDED AS CURRENT BASELINE");
    expect(preflight02).toContain(SHA);
  });

  test("student_accounts importer source exists for SOURCE_SHA tree", () => {
    expect(existsSync(join(root, "src", "lib", "imports", "student-accounts.ts"))).toBe(true);
    expect(
      existsSync(join(root, "tests", "imports", "student-existing-accounts-importer.test.ts")),
    ).toBe(true);
    const types = readFileSync(join(root, "src", "lib", "imports", "types.ts"), "utf8");
    expect(types).toContain("student_accounts");
  });

  test("migration-drafts inventory is non-empty for D-02 matrix", () => {
    const drafts = readdirSync(join(root, "docs", "migration-drafts")).filter((f) =>
      f.endsWith(".sql"),
    );
    expect(drafts.length).toBeGreaterThanOrEqual(18);
    expect(drafts).toContain("REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql");
    expect(drafts).toContain("DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01.sql");
    expect(drafts).toContain("GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql");
  });

  test("stale SHA strings remain only as cancelled/historical context in fresh pack", () => {
    // Fresh pack must mention stale SHAs as cancelled, not as expected_release_sha.
    expect(freshRc).toContain(STALE_A);
    expect(freshRc).toContain(STALE_B);
    expect(freshRc).toMatch(/Supersedes as \*current\* RC pin/);
    const expectedLine = freshRc
      .split("\n")
      .find((l) => l.includes("expected_release_sha"));
    expect(expectedLine).toBeTruthy();
    expect(expectedLine).toContain(SHA);
    expect(expectedLine).not.toContain(STALE_A);
    expect(expectedLine).not.toContain(STALE_B);
  });
});
