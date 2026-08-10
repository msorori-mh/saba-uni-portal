/**
 * Dean department-report scope containment remediation.
 * Mission: PORTAL-PR324-DEAN-DEPARTMENT-REPORT-SCOPE-CONTAINMENT-REMEDIATION-01
 *
 * Negatives:
 * - DEPARTMENT_HEAD_OTHER_DEPARTMENT=DENY
 * - DEAN_OUTSIDE_BOUND_COLLEGE=DENY
 * - DEAN_ARBITRARY_DEPARTMENT_ID=DENY
 * - ADMIN_EXPLICIT_DEPARTMENT=authorized
 * - NO_UNIVERSITY_WIDE_SILENT_SCOPE=PASS
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  ReportAuthorizationError,
  buildActorScope,
  provenDepartmentIdsForCollege,
  resolveExplicitOrgBindings,
} from "../../src/lib/reports/scope";
import { authorizeDepartmentReportScope } from "../../src/lib/reports/beneficiary-report-services";

const ROUTE_DEPT = readFileSync(
  fileURLToPath(
    new URL("../../src/routes/admin/department-reports.tsx", import.meta.url),
  ),
  "utf8",
);

function facts(partial: {
  userId?: string;
  roles: string[];
  departmentId?: string | null;
  facultyProfileId?: string | null;
  studentProfileId?: string | null;
  operationalUnitCodes?: string[];
  positionCodes?: string[];
  collegeId?: string | null;
}) {
  const bindings = resolveExplicitOrgBindings({
    roles: partial.roles,
    positionCodes: partial.positionCodes ?? [],
    operationalUnitCodes: partial.operationalUnitCodes ?? [],
    collegeId: partial.collegeId ?? null,
  });
  return {
    userId: partial.userId ?? "u-test",
    roles: partial.roles,
    departmentId: partial.departmentId ?? null,
    facultyProfileId: partial.facultyProfileId ?? null,
    studentProfileId: partial.studentProfileId ?? null,
    operationalUnitCode: bindings.operationalUnitCodes[0] ?? null,
    bindings,
  };
}

function scopeOf(partial: Parameters<typeof facts>[0]) {
  return buildActorScope(facts(partial));
}

describe("PORTAL-PR324 dean department report scope containment", () => {
  test("schema has no proven college→department containment mapping", () => {
    expect(provenDepartmentIdsForCollege(null)).toBeNull();
    expect(provenDepartmentIdsForCollege("college-a")).toBeNull();
  });

  test("DEPARTMENT_HEAD_OTHER_DEPARTMENT=DENY", async () => {
    const scope = scopeOf({
      roles: ["department_head"],
      departmentId: "dept-a",
      facultyProfileId: "f-a",
    });
    await expect(
      authorizeDepartmentReportScope({
        scope,
        requestedDepartmentId: "dept-b",
      }),
    ).rejects.toThrow(/قسم/);
  });

  test("DEPARTMENT_HEAD own department preserved", async () => {
    const scope = scopeOf({
      roles: ["department_head"],
      departmentId: "dept-a",
      facultyProfileId: "f-a",
    });
    await expect(
      authorizeDepartmentReportScope({
        scope,
        requestedDepartmentId: null,
      }),
    ).resolves.toBe("dept-a");
    await expect(
      authorizeDepartmentReportScope({
        scope,
        requestedDepartmentId: "dept-a",
      }),
    ).resolves.toBe("dept-a");
  });

  test("DEAN_ARBITRARY_DEPARTMENT_ID=DENY without college binding", async () => {
    const scope = scopeOf({ roles: ["dean"] });
    await expect(
      authorizeDepartmentReportScope({
        scope,
        requestedDepartmentId: "dept-arbitrary",
      }),
    ).rejects.toThrow(ReportAuthorizationError);
  });

  test("DEAN_OUTSIDE_BOUND_COLLEGE=DENY even when collegeScopeConfigured", async () => {
    // collegeId present ⇒ collegeScopeConfigured, but no dept containment map.
    const scope = scopeOf({
      roles: ["dean"],
      collegeId: "college-a",
    });
    expect(scope.bindings.collegeScopeConfigured).toBe(true);
    await expect(
      authorizeDepartmentReportScope({
        scope,
        requestedDepartmentId: "dept-outside-college",
      }),
    ).rejects.toThrow(/كلية|أقسام|موثوق|مكوّن/);
  });

  test("DEAN_ARBITRARY_DEPARTMENT_ID=DENY with college key alone", async () => {
    const scope = scopeOf({
      roles: ["dean"],
      collegeId: "college-a",
      departmentId: "dept-a",
    });
    await expect(
      authorizeDepartmentReportScope({
        scope,
        requestedDepartmentId: "dept-a",
      }),
    ).rejects.toThrow(/كلية|أقسام|موثوق|مكوّن/);
  });

  test("ADMIN_EXPLICIT_DEPARTMENT=authorized existing behavior", async () => {
    const admin = scopeOf({ roles: ["admin"] });
    await expect(
      authorizeDepartmentReportScope({
        scope: admin,
        requestedDepartmentId: "dept-admin-pick",
      }),
    ).resolves.toBe("dept-admin-pick");

    const sysAdmin = scopeOf({ roles: ["system_admin"] });
    await expect(
      authorizeDepartmentReportScope({
        scope: sysAdmin,
        requestedDepartmentId: "dept-sys-pick",
      }),
    ).resolves.toBe("dept-sys-pick");
  });

  test("NO_UNIVERSITY_WIDE_SILENT_SCOPE=PASS for admin without department_id", async () => {
    const scope = scopeOf({ roles: ["admin"] });
    await expect(
      authorizeDepartmentReportScope({
        scope,
        requestedDepartmentId: null,
      }),
    ).rejects.toThrow(/قسم|جامعي|صامت/);
  });

  test("UI: dean is not treated as selectable-department actor", () => {
    expect(ROUTE_DEPT).toContain("isPrivilegedAdmin");
    expect(ROUTE_DEPT).toContain("isDeanWithoutAdmin");
    expect(ROUTE_DEPT).not.toContain("isPrivilegedOrDean");
    // Department list query must not enable for dean.
    expect(ROUTE_DEPT).toContain("enabled: isPrivilegedAdmin");
    // Dean directed to College / Reports Center.
    expect(ROUTE_DEPT).toContain("/admin/executive-reports");
    expect(ROUTE_DEPT).toContain("/admin/reports");
    expect(ROUTE_DEPT).toContain("ربط كلية→أقسام موثوق");
    // Dean must not auto-pick first department from a global list.
    expect(ROUTE_DEPT).not.toMatch(
      /isPrivilegedOrDean && departments\.length > 0 && !selectedDepartmentId/,
    );
  });

  test("AUTHORIZATION_BROADENED=NO — dean still in DEPT roles but scope fail-closed", () => {
    // Role gate may still list dean (route access), but authorize denies selection.
    expect(ROUTE_DEPT).toContain("getDepartmentReportsSummary");
    expect(ROUTE_DEPT).toContain("targetDeptId = isDeanWithoutAdmin");
  });
});
