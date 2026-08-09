/**
 * Academic affairs beneficiary — college/university academic aggregates.
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
  beneficiaryMayAccessLevel,
  buildActorScope,
  enforceDepartmentFilter,
} from "../../src/lib/reports/scope";
import { buildTeachingLoadKpis } from "../../src/lib/reports/teaching-load";

const FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/beneficiary-reports.functions.ts", import.meta.url)),
  "utf8",
);
const ROUTE_SRC = readFileSync(
  fileURLToPath(new URL("../../src/routes/admin/executive-reports.tsx", import.meta.url)),
  "utf8",
);

const HUB = findByCode(REPORT_CATALOG_ENTRIES, "HUB-VP-ACADEMIC-AFFAIRS")!;
const ACADEMIC = findByCode(REPORT_CATALOG_ENTRIES, "ADM-ACADEMIC-STRUCTURE")!;
const ALLOWED = ["dean", "registrar", "admin", "system_admin"] as const;
const DENIED = ["student", "faculty_member", "finance_officer", "hr_officer"] as const;

describe("academic affairs — positive visibility", () => {
  test("hub admits academic affairs roles and university_academic scope", () => {
    expect(HUB.beneficiaries).toContain("academic_affairs");
    expect(HUB.data_scope).toContain("university_academic");
    for (const role of ALLOWED) {
      expect(canSeeReport(HUB, [role])).toBe(true);
    }
    expect(beneficiariesForRoles(["registrar"])).toContain("academic_affairs");
    expect(beneficiariesForRoles(["dean"])).toContain("academic_affairs");
  });

  test("academic structure catalog remains visible to registrar", () => {
    expect(canSeeReport(ACADEMIC, ["registrar"])).toBe(true);
  });
});

describe("academic affairs — negative / fail-closed", () => {
  test("denied roles cannot see academic affairs hub", () => {
    for (const role of DENIED) {
      expect(canSeeReport(HUB, [role])).toBe(false);
    }
  });

  test("empty / unknown roles fail closed", () => {
    expect(canSeeReport(HUB, [])).toBe(false);
    expect(canSeeReport(HUB, ["unknown_role_xyz"])).toBe(false);
  });
});

describe("academic affairs — wrong scope (dept head stays department)", () => {
  test("department_head academic affairs call path uses department mode contract", () => {
    expect(FUNCTIONS_SRC).toContain("getAcademicAffairsReportsSummary");
    expect(FUNCTIONS_SRC).toContain('mode: "department"');
    expect(FUNCTIONS_SRC).toContain("assertScopeAllowed(scope)");
    expect(beneficiaryMayAccessLevel("academic_affairs", "department")).toBe(true);
    expect(beneficiaryMayAccessLevel("academic_affairs", "university_strategic")).toBe(false);
  });

  test("department_head cannot widen department via enforceDepartmentFilter", () => {
    const scope = buildActorScope({
      userId: "u1",
      roles: ["department_head"],
      departmentId: "dept-a",
      facultyProfileId: "f1",
      studentProfileId: null,
      operationalUnitCode: null,
    });
    expect(
      enforceDepartmentFilter({ scope, requestedDepartmentId: "dept-b" }).denied,
    ).toBe(true);
  });
});

describe("academic affairs — dual role union", () => {
  test("registrar + student sees academic hub and student self (union of grants)", () => {
    const visible = visibleReports(REPORT_CATALOG_ENTRIES, ["registrar", "student"]).map(
      (e) => e.report_code,
    );
    expect(visible).toContain("HUB-VP-ACADEMIC-AFFAIRS");
    expect(visible).toContain("STU-SELF-SERVICE-VIEWS");
    // registrar is in HUB-UNIVERSITY-STRATEGIC required_role — union includes it.
    expect(visible).toContain("HUB-UNIVERSITY-STRATEGIC");
    expect(visible).not.toContain("HUB-VP-STUDENT-AFFAIRS");
  });
});

describe("academic affairs — empty/partial metrics", () => {
  test("teaching-load empty ⇒ no_data", () => {
    expect(buildTeachingLoadKpis([]).facultyWithLoad.presence).toBe("no_data");
  });
});

describe("academic affairs — server function + route", () => {
  test("getAcademicAffairsReportsSummary uses createServerFn + auth + assertAnyRole", () => {
    expect(FUNCTIONS_SRC).toMatch(
      /export const getAcademicAffairsReportsSummary = createServerFn\(\{ method: "POST" \}\)\s*\n\s*\.middleware\(\[requireSupabaseAuth\]\)/,
    );
    expect(FUNCTIONS_SRC).toContain(
      '["system_admin", "admin", "dean", "registrar", "department_head"]',
    );
  });

  test("executive reports route wires academic affairs summary", () => {
    expect(ROUTE_SRC).toContain('createFileRoute("/admin/executive-reports")');
    expect(ROUTE_SRC).toContain("getAcademicAffairsReportsSummary");
  });
});
