import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ERROR_LABELS } from "../../src/lib/graduation-projects/rpc";

const portalFunctions = readFileSync("src/lib/graduation-projects/portal.functions.ts", "utf8");
const auditSql = readFileSync("tests/graduation-projects/postgres-security-audit-verifier.sql", "utf8");
const components = [
  "src/components/graduation-projects/AssignmentsPanel.tsx",
  "src/components/graduation-projects/GraduationProjectAdmin.tsx",
  "src/components/graduation-projects/GraduationProjectPortalWorkspace.tsx",
  "src/components/graduation-projects/MilestonesPanel.tsx",
  "src/components/graduation-projects/EvaluationPanel.tsx",
  "src/components/graduation-projects/ResultCorrectionsArchivePanel.tsx",
  "src/components/graduation-projects/DiscussionPanel.tsx",
  "src/components/graduation-projects/GraduationProjectReports.tsx",
].map((path) => [path, readFileSync(path, "utf8")] as const);

describe("GP-09 error-message data leakage", () => {
  test("SQL denial messages are literal constants — no interpolated ids or data", () => {
    for (const message of Object.keys(ERROR_LABELS)) {
      expect(message).not.toMatch(/%[sdil]/);
      expect(message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
      expect(message).not.toMatch(/\$\d/);
    }
  });
});

describe("GP-09 secret and privilege hygiene (source)", () => {
  test("no service-role keys, JWTs or storage secrets in the GP source surface", () => {
    const sources = portalFunctions + components.map(([, src]) => src).join("\n");
    expect(sources).not.toMatch(/service_role[_-]?key/i);
    expect(sources).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
    expect(sources).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(sources).not.toMatch(/\.storage\.from\(/);
  });

  test("assignment candidates are manager-gated (no department roster for students)", () => {
    const candidates = portalFunctions.slice(
      portalFunctions.indexOf("listGraduationProjectAssignmentCandidates"),
    );
    expect(candidates).toContain('MANAGER_ROLES = new Set(["coordinator", "department_head", "dean"])');
    expect(candidates).toContain("detail.viewer_roles.some((role) => MANAGER_ROLES.has(role))");
  });

  test("components construct no public URLs and never list storage", () => {
    for (const [path, src] of components) {
      expect(src, path).not.toMatch(/getPublicUrl|createSignedUrl|\.storage\.from\(/);
    }
  });
});

describe("GP-09 audit verifier coverage", () => {
  test("catalog audit asserts the security-critical invariants", () => {
    for (const check of [
      "rls-enabled-all", "rls-zero-policies", "tables-revoked", "definer-search-path",
      "anon-zero-execute", "authenticated-exec-whitelist", "service-path-closed",
      "append-only-events", "notify-trigger", "unique-indexes", "no-buckets",
      "co-supervisor-read-only",
    ]) {
      expect(auditSql, check).toContain(`'${check}'`);
    }
    expect(auditSql).toContain("SECURITY AUDIT FAILED");
  });
});
