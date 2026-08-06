import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const verifier = readFileSync("tests/graduation-projects/package-d-verifier.sql", "utf8");
const cleanup = readFileSync(
  "docs/migration-drafts/GRADUATION-PROJECTS-PACKAGE-D-FIXTURES-AND-CLEANUP.sql",
  "utf8",
);

describe("Package D executable security verifier SQL", () => {
  test("is no longer a hard-coded ACL/cleanup stub", () => {
    expect(verifier).not.toContain("true AS anon_revoked");
    expect(verifier).not.toContain("true AS authenticated_granted");
    expect(verifier).not.toContain("cleanup_gp_test_artifacts");
    expect(verifier).toContain("has_function_privilege('anon'");
    expect(verifier).toContain("has_function_privilege('authenticated'");
    expect(verifier).toContain("aclexplode");
    expect(verifier).toContain("PACKAGE_D_EXECUTABLE_SECURITY_VERIFIER_PASS");
    expect(verifier).toMatch(/rollback\s*;/i);
  });

  test("executes authorization matrix, branches, replay, and real cleanup RPC", () => {
    for (const fragment of [
      "expect_fail_zs",
      "idempotent replay payload mismatch",
      "project version precondition failed",
      "student already has an active graduation project team",
      "evaluation already submitted",
      "project not archive-ready",
      "PACKAGE_D_BRANCH_A_PASS",
      "PACKAGE_D_BRANCH_B_PASS",
      "PACKAGE_D_BRANCH_C_PASS",
      "cleanup_graduation_project_test_artifacts",
      "PACKAGE_D_CLEANUP_PASS",
      "PACKAGE_D_ACL_ASSERTIONS=",
      "PACKAGE_D_POSITIVE_RPC_CASES=",
      "PACKAGE_D_NEGATIVE_RPC_CASES=",
    ]) {
      expect(verifier).toContain(fragment);
    }
  });

  test("cleanup draft uses exact-ID allowlist without broad TEST pattern matching", () => {
    const executable = cleanup
      .replace(/--[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(cleanup).toContain("cleanup_graduation_project_test_artifacts");
    expect(cleanup).toContain("p_temp_project_ids");
    expect(cleanup).toContain("p_preserve_project_id");
    expect(executable).not.toMatch(/LIKE\s+'%TEST%'/i);
    expect(executable).not.toMatch(/title\s+LIKE/i);
    expect(cleanup).toContain("TEST_ONLY_GP_MVP_E2E_01");
  });
});
