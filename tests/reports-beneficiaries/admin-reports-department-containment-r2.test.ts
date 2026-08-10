/**
 * Independent R2 HIGH — REPORTS_DEPARTMENT_CONTAINMENT_HOLD closure.
 * University-wide silent aggregates denied for non-admin; dean fail-closed
 * without proven college→department containment.
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

const ADMIN_FN = readFileSync(
  fileURLToPath(new URL("../../src/lib/admin-reports.functions.ts", import.meta.url)),
  "utf8",
);

describe("admin reports department containment (Independent R2 HIGH)", () => {
  test("university-wide aggregate dumps are admin-family only", () => {
    expect(ADMIN_FN).toContain("UNIVERSITY_WIDE_AGGREGATE_ROLES");
    expect(ADMIN_FN).toContain("assertUniversityWideAggregateAccess");
    expect(ADMIN_FN).toMatch(
      /assertAnyRole\(\s*userId,\s*UNIVERSITY_WIDE_AGGREGATE_ROLES/,
    );
    expect(ADMIN_FN).toContain('"system_admin", "admin"');
    // Legacy reportsHandler must not use broad REPORTS_ROLES for unscoped dumps.
    expect(ADMIN_FN).toMatch(
      /reportsHandler[\s\S]*?assertUniversityWideAggregateAccess\(context\.userId\)/,
    );
  });

  test("wired admin report handlers apply department containment", () => {
    expect(ADMIN_FN).toContain("applyAdminReportsDepartmentContainment");
    for (const marker of [
      "getStudentsReportForAdmin",
      "getStudentAccountsReportForAdmin",
      "getReportsRequests",
      "getAcademicProgramsReportForAdmin",
      "getStudyPlansReportForAdmin",
      "getCoursesReportForAdmin",
      "getStudyPlanCoverageReportForAdmin",
      "getAcademicReportLookupsForAdmin",
      "applyScheduleDepartmentScope",
    ]) {
      expect(ADMIN_FN).toContain(marker);
    }
    expect(ADMIN_FN.split("applyAdminReportsDepartmentContainment(").length - 1).toBeGreaterThanOrEqual(10);
  });

  test("dean remains fail-closed without college→department map", async () => {
    expect(provenDepartmentIdsForCollege("college-a")).toBeNull();
    const bindings = resolveExplicitOrgBindings({
      roles: ["dean"],
      positionCodes: ["dean"],
      operationalUnitCodes: [],
      collegeId: "college-a",
    });
    const scope = buildActorScope({
      userId: "dean-1",
      roles: ["dean"],
      departmentId: null,
      facultyProfileId: null,
      studentProfileId: null,
      operationalUnitCode: null,
      bindings,
    });
    await expect(
      authorizeDepartmentReportScope({
        scope,
        requestedDepartmentId: "dept-arbitrary",
      }),
    ).rejects.toThrow(ReportAuthorizationError);
    expect(ADMIN_FN).toContain("لا يوجد ربط كلية→أقسام موثوق لعزل نطاق العميد");
    expect(ADMIN_FN).toContain("لا نطاق جامعي صامت");
  });

  test("operational residual roles fail closed (no silent university fallthrough)", () => {
    expect(ADMIN_FN).toContain(
      "نطاق التقارير غير معزول لهذا الدور — يُرفض العرض الجامعي الصامت بدون قسم محدد",
    );
    // Containment helper must not end with a permissive null fallthrough.
    expect(ADMIN_FN).not.toMatch(
      /if \(scope\.roles\.includes\("dean"\)\) \{[\s\S]*?return deptId;\s*\}\s*return requestedDepartmentId \?\? null;/,
    );
  });
});
