/**
 * Department head beneficiary — department-forced scope, no cross-dept.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  REPORT_CATALOG_ENTRIES,
  canSeeReport,
  findByCode,
  visibleReports,
} from "../../src/lib/reports/catalog";
import {
  beneficiariesForRoles,
  buildActorScope,
  enforceDepartmentFilter,
} from "../../src/lib/reports/scope";
import { emptyOrgBindings } from "../../src/lib/reports/scope/org-identity";
import { buildTeachingLoadKpis } from "../../src/lib/reports/teaching-load";

const FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/beneficiary-reports.functions.ts", import.meta.url)),
  "utf8",
);
const SERVICES_SRC = readFileSync(
  fileURLToPath(
    new URL("../../src/lib/reports/beneficiary-report-services.ts", import.meta.url),
  ),
  "utf8",
);
const ADMIN_FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/admin-reports.functions.ts", import.meta.url)),
  "utf8",
);
const ROUTE_SRC = readFileSync(
  fileURLToPath(new URL("../../src/routes/admin/department-reports.tsx", import.meta.url)),
  "utf8",
);

const DEPT = findByCode(REPORT_CATALOG_ENTRIES, "DEPT-ACADEMIC-LOAD")!;
const SCHEDULE = findByCode(REPORT_CATALOG_ENTRIES, "ADM-SCHEDULE-SUITE")!;
const DENIED = ["student", "faculty_member", "finance_officer", "hr_officer"] as const;

describe("department head — positive visibility", () => {
  test("sees department academic load and schedule suite", () => {
    expect(DEPT.beneficiaries).toContain("dept_head_coordinator");
    expect(DEPT.required_role).toContain("department_head");
    expect(DEPT.route).toContain("/admin/department-reports");
    // FIX_05: a department head opens the faculty-portal destination, never /admin.
    expect(DEPT.route).toContain("/faculty-portal/department-reports");
    expect(canSeeReport(DEPT, ["department_head"])).toBe(true);
    expect(canSeeReport(SCHEDULE, ["department_head"])).toBe(true);
    expect(beneficiariesForRoles(["department_head"])).toContain("dept_head_coordinator");
  });
});

describe("department head — negative / fail-closed", () => {
  test("denied roles cannot see DEPT-ACADEMIC-LOAD", () => {
    for (const role of DENIED) {
      expect(canSeeReport(DEPT, [role])).toBe(false);
    }
  });

  test("empty / unknown roles fail closed", () => {
    expect(canSeeReport(DEPT, [])).toBe(false);
    expect(canSeeReport(DEPT, ["unknown_role_xyz"])).toBe(false);
  });
});

describe("department head — wrong scope (cannot request other department)", () => {
  test("enforceDepartmentFilter denies foreign department_id", () => {
    const scope = buildActorScope({
      userId: "u1",
      roles: ["department_head"],
      departmentId: "dept-a",
      facultyProfileId: "f1",
      studentProfileId: null,
      operationalUnitCode: null,
    bindings: emptyOrgBindings(),
    });
    const enforced = enforceDepartmentFilter({
      scope,
      requestedDepartmentId: "dept-b",
    });
    expect(enforced.denied).toBe(true);
    expect(enforced.reasonAr).toBe("رئيس القسم لا يرى قسماً آخر");
  });

  test("beneficiary + admin schedule sources force actor department scope", () => {
    expect(FUNCTIONS_SRC).toContain("authorizeDepartmentReportScope");
    expect(SERVICES_SRC).toContain("رئيس القسم لا يرى قسماً آخر");
    expect(FUNCTIONS_SRC).toContain("getDepartmentReportsSummary");
    expect(ADMIN_FUNCTIONS_SRC).toContain("applyScheduleDepartmentScope");
    expect(ADMIN_FUNCTIONS_SRC).toContain("enforceDepartmentFilter");
    expect(ADMIN_FUNCTIONS_SRC).toContain("resolveReportActorScope");
  });
});

describe("department head — dual role union", () => {
  test("department_head + student sees dept + student reports only (union)", () => {
    const visible = visibleReports(REPORT_CATALOG_ENTRIES, [
      "department_head",
      "student",
    ]).map((e) => e.report_code);
    expect(visible).toContain("DEPT-ACADEMIC-LOAD");
    expect(visible).toContain("STU-SELF-SERVICE-VIEWS");
    expect(visible).not.toContain("HUB-UNIVERSITY-STRATEGIC");
  });
});

describe("department head — empty/partial metrics", () => {
  test("empty teaching-load rows ⇒ no_data presence", () => {
    expect(buildTeachingLoadKpis([]).unassignedSections.presence).toBe("no_data");
    expect(buildTeachingLoadKpis([], { treatEmptyAsZero: true }).unassignedSections.value).toBe(0);
  });
});

describe("department head — server function + route", () => {
  test("getDepartmentReportsSummary uses createServerFn + requireSupabaseAuth + assertAnyRole", () => {
    expect(FUNCTIONS_SRC).toMatch(
      /export const getDepartmentReportsSummary = createServerFn\(\{ method: "POST" \}\)\s*\n\s*\.middleware\(\[requireSupabaseAuth\]\)/,
    );
    expect(FUNCTIONS_SRC).toMatch(/assertAnyRole\(\s*context\.userId,\s*DEPT_REPORT_ROLES/);
  });

  test("route exists at /admin/department-reports", () => {
    expect(ROUTE_SRC).toContain('createFileRoute("/admin/department-reports")');
    expect(ROUTE_SRC).toContain("getDepartmentReportsSummary");
    expect(ROUTE_SRC).toContain("رئيس القسم يرى قسمه فقط");
  });
});
