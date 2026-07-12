import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ENROLLMENT_CERTIFICATE_PROTECTED_ROLE_CODES } from "../../src/lib/admin-staff-deletion.core";

const ROOT = join(import.meta.dir, "../..");

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("admin staff management UI 01O source regressions", () => {
  const page = readSrc("src/routes/admin/staff-management.tsx");
  const deleteDialog = readSrc("src/components/admin/staff-management/StaffDeleteDialog.tsx");
  const rolesTab = readSrc("src/components/admin/staff-management/ProcessingRolesTab.tsx");
  const wired = [page, deleteDialog, rolesTab].join("\n");

  it("27 — renders staff and processing role tabs", () => {
    expect(page).toContain("الموظفون");
    expect(page).toContain("الأدوار الوظيفية");
    expect(page).toContain("TabsTrigger");
    expect(page).toContain("ProcessingRolesTab");
    expect(page).toContain("StaffDeleteDialog");
  });

  it("28 — staff delete dialog wires preflight and safe delete", () => {
    expect(deleteDialog).toContain("getStaffDeletionPreflight");
    expect(deleteDialog).toContain("deleteStaffProfileSafely");
    expect(deleteDialog).toContain("deactivateStaffProfile");
    expect(deleteDialog).toContain("@/lib/admin-staff-deletion.functions");
    expect(page).toContain("deactivateStaffProfile");
    expect(deleteDialog).toContain("حذف الموظف وحساب الدخول");
    expect(deleteDialog).toContain("confirmationText");
  });

  it("29 — processing roles tab imports CRUD server functions", () => {
    const expectedFunctions = [
      "listRequestProcessingRolesForAdmin",
      "getRequestProcessingRoleUsage",
      "createRequestProcessingRole",
      "updateRequestProcessingRole",
      "setRequestProcessingRoleActive",
      "deleteRequestProcessingRoleSafely",
    ];
    for (const fn of expectedFunctions) {
      expect(rolesTab).toContain(fn);
    }
    expect(rolesTab).toContain("@/lib/admin-processing-roles.functions");
    expect(rolesTab).toContain("Tooltip");
    expect(rolesTab).toMatch(/workflowStepsCount|assignmentsCount/);
  });

  it("30 — hard delete path avoids window.confirm; unlink may still use confirm", () => {
    expect(deleteDialog).not.toContain("window.confirm");
    expect(deleteDialog).not.toMatch(/\bconfirm\(/);
    expect(page).not.toContain("window.confirm");
    expect(page).toContain("UNLINK_LOGIN_CONFIRM");
    expect(page).toMatch(/confirm\([^)]*UNLINK_LOGIN_CONFIRM/s);
  });

  it("31 — enrollment certificate role constants protected; workflow id untouched by feature", () => {
    expect([...ENROLLMENT_CERTIFICATE_PROTECTED_ROLE_CODES].sort()).toEqual(
      [
        "archive_officer",
        "dean",
        "registrar_general",
        "revenue_finance_officer",
        "student_affairs_manager",
        "student_affairs_specialist",
      ].sort(),
    );
    expect(ENROLLMENT_CERTIFICATE_PROTECTED_ROLE_CODES).toHaveLength(6);

    const foundation = readSrc(
      "tests/student-requests/enrollment-certificate-workflow-foundation.test.ts",
    );
    expect(foundation).toContain("enrollment_certificate");

    const roleCatalog = readSrc("src/lib/student-requests/request-workflow-save-contract.ts");
    for (const code of ENROLLMENT_CERTIFICATE_PROTECTED_ROLE_CODES) {
      expect(roleCatalog).toContain(`"${code}"`);
    }

    const featureSources = [
      wired,
      readSrc("src/lib/admin-staff-deletion.core.ts"),
      readSrc("src/lib/admin-staff-deletion.functions.ts"),
      readSrc("src/lib/admin-processing-roles.core.ts"),
      readSrc("src/lib/admin-processing-roles.functions.ts"),
    ].join("\n");
    // Feature must not hardcode or mutate the production draft workflow id.
    expect(featureSources).not.toContain("8a0ef6b8-5f51-4d3e-9f25-3b2ba51b74e1");
  });
});
