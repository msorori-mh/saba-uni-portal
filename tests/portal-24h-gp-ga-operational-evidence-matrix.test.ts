import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PORTAL-24H-GP-GA-OPERATIONAL-E2E-FULL-CLOSURE-01
 *
 * Source contract that every mandatory operational evidence surface remains
 * present and wired. Disposable PG17 execution is covered by the dedicated
 * GP Package D / L4 / GA promotion harnesses.
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const gpPackageD = read("tests/graduation-projects/package-d-verifier.sql");
const gpL4 = read(
  "tests/graduation-projects/postgres-student-level4-eligibility-guard-verifier.sql",
);
const gpLifecycle = read("tests/graduation-projects/postgres-lifecycle-verifier.sql");
const gpFixturePkg = read(
  "tests/graduation-projects/postgres-gp-level4-production-fixture-package-verifier.sql",
);
const gaAuth = read("tests/graduates-affairs/graduates-affairs-authorization-04.pg-verify.sql");
const gaRuntime = read("tests/graduates-affairs/graduates-affairs-runtime-wire-01.test.ts");
const gaVisual = read("tests/graduates-affairs/graduates-affairs-visual-ux-qa-01.test.ts");
const gaCompletion = read("tests/graduates-affairs/graduates-affairs-completion-01.pg-verify.sql");
const ci = read(".github/workflows/ci.yml");

describe("GP mandatory operational evidence inventory", () => {
  it("covers non-L4, duplicate-current, dual-role, signed-download, archive", () => {
    for (const token of [
      "LEVEL1_NEGATIVE",
      "LEVEL2_NEGATIVE",
      "LEVEL3_NEGATIVE",
      "UNKNOWN_LEVEL_NEGATIVE",
      "DUPLICATE_L4_L4_TOP_ROWS_DENY_FAILED",
      "CONFLICTING_L4_L3_TOP_ROWS_DENY_FAILED",
      "DUAL_ROLE_CROSS_PROJECT_LEAK_A_IN_LIST",
      "SIGNED_DOWNLOAD_L4_POSITIVE_FAILED",
      "idempotent replay actor mismatch",
    ]) {
      expect(gpL4).toContain(token);
    }
    expect(gpFixturePkg).toContain("SIGNED_DOWNLOAD_CROSS_ACTOR_REPLAY");
    expect(gpFixturePkg).toContain("ARCHIVED_PROJECT_MUTATION");
    expect(gpPackageD).toContain("PACKAGE_D_BRANCH_A_PASS");
    expect(gpPackageD).toContain("PACKAGE_D_BRANCH_B_PASS");
    expect(gpPackageD).toContain("PACKAGE_D_BRANCH_C_PASS");
  });

  it("covers direct RPC matrix, dean/admin bypass denial, revisions loop", () => {
    expect(gpPackageD).toContain("PACKAGE_D_POSITIVE_RPC_CASES");
    expect(gpPackageD).toContain("PACKAGE_D_NEGATIVE_RPC_CASES");
    expect(gpPackageD).toContain("unauthorized dean");
    expect(gpPackageD).toContain("admin/dean/head/registrar");
    expect(gpLifecycle).toContain("PACKAGE_A_VERIFIER_PASS");
    expect(gpPackageD).toContain("revisions_required");
    expect(gpPackageD).toContain("PACKAGE_D_EXECUTABLE_SECURITY_VERIFIER_PASS");
  });

  it("registers Package D in CI pg-verifiers matrix", () => {
    expect(ci).toContain("graduation-projects-package-d");
    expect(ci).toContain("package-d-verifier.sql");
    expect(ci).toContain("GRADUATION-PROJECTS-PACKAGE-D-FIXTURES-AND-CLEANUP.sql");
  });
});

describe("GA mandatory operational evidence inventory", () => {
  it("covers lifecycle gates, self-only, specialist/manager, negatives", () => {
    for (const token of [
      "graduate_update_own_profile",
      "graduate_affairs_get_graduate_file",
      "graduate_affairs_search_records",
      "GRADUATE_RECORD_NOT_CURRENT",
    ]) {
      expect(gaAuth).toContain(token);
    }
    expect(gaRuntime).toContain("admin → denied");
    expect(gaRuntime).toContain("dean → denied");
    expect(gaRuntime).toContain("specialist correct department → allowed");
    expect(gaRuntime).toContain("wrong department → denied");
    expect(gaRuntime).toContain("manager correctly scoped → allowed");
  });

  it("covers privacy, continuity, reports, RTL, empty/loading/error", () => {
    expect(gaVisual).toContain('dir="rtl"');
    expect(gaVisual).toContain("محجوب");
    expect(gaVisual).toContain("loading / empty / error shells");
    expect(gaVisual).toContain("GaLoading");
    expect(gaVisual).toContain("GaEmpty");
    expect(gaVisual).toContain("GaError");
    expect(gaCompletion).toContain("undecided policy must deny every capability");
    expect(gaCompletion).toContain("revoked records must leave the report population");
    expect(read("src/components/graduates-affairs/GaStates.tsx")).toContain("GaLoading");
  });

  it("keeps operational E2E package prepared and flags OFF until promotion gate", () => {
    const e2ePkg = read("docs/PORTAL-GRADUATES-AFFAIRS-OPERATIONAL-E2E-PACKAGE-01.md");
    expect(e2ePkg).toContain("PREPARED_NOT_EXECUTED");
    expect(e2ePkg).toContain("Do not execute against production");
    const features = read("src/lib/portal-features.ts");
    expect(features).toMatch(/studentGraduatesAffairs:\s*false/);
    expect(features).toMatch(/staffGraduatesAffairs:\s*false/);
  });
});
