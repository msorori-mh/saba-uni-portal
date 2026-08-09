/**
 * VP Student Affairs — university student-affairs domain only.
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
  levelsGrantedByRoles,
} from "../../src/lib/reports/scope";
import { buildProcessingTimeKpis } from "../../src/lib/reports/processing-time";

const FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/beneficiary-reports.functions.ts", import.meta.url)),
  "utf8",
);
const ROUTE_SRC = readFileSync(
  fileURLToPath(new URL("../../src/routes/admin/executive-reports.tsx", import.meta.url)),
  "utf8",
);

const HUB = findByCode(REPORT_CATALOG_ENTRIES, "HUB-VP-STUDENT-AFFAIRS")!;
const ALLOWED = ["student_affairs", "admin", "system_admin"] as const;
const DENIED = ["student", "faculty_member", "department_head", "finance_officer", "registrar"] as const;

describe("vp student affairs — positive visibility", () => {
  test("hub matches student_affairs roles and university_student_affairs scope", () => {
    expect(HUB.beneficiaries).toContain("vp_student_affairs");
    expect(HUB.data_scope).toBe("university_student_affairs");
    expect(HUB.route).toBe("/admin/executive-reports");
    for (const role of ALLOWED) {
      expect(canSeeReport(HUB, [role])).toBe(true);
    }
    expect(beneficiariesForRoles(["student_affairs"])).toContain("vp_student_affairs");
    expect(levelsGrantedByRoles(["student_affairs"])).toContain("university_student_affairs");
    expect(beneficiaryMayAccessLevel("vp_student_affairs", "university_student_affairs")).toBe(true);
    expect(beneficiaryMayAccessLevel("vp_student_affairs", "university_academic")).toBe(false);
  });
});

describe("vp student affairs — negative / fail-closed", () => {
  test("denied roles cannot see VP student hub", () => {
    for (const role of DENIED) {
      expect(canSeeReport(HUB, [role])).toBe(false);
    }
  });

  test("empty / unknown roles fail closed", () => {
    expect(canSeeReport(HUB, [])).toBe(false);
    expect(canSeeReport(HUB, ["unknown_role_xyz"])).toBe(false);
  });
});

describe("vp student affairs — wrong scope / domain exclusion", () => {
  test("server excludes academic-only sensitive domains", () => {
    expect(FUNCTIONS_SRC).toContain("getVpStudentAffairsReportsSummary");
    expect(FUNCTIONS_SRC).toContain("نطاق جامعي — شؤون الطلاب فقط");
    expect(FUNCTIONS_SRC).toContain("excludedDomains");
    expect(FUNCTIONS_SRC).toContain("teaching_load_detail");
    expect(FUNCTIONS_SRC).toContain("grade_rosters");
  });
});

describe("vp student affairs — dual role union", () => {
  test("student_affairs + department_head sees VP student + dept hubs", () => {
    const visible = visibleReports(REPORT_CATALOG_ENTRIES, [
      "student_affairs",
      "department_head",
    ]).map((e) => e.report_code);
    expect(visible).toContain("HUB-VP-STUDENT-AFFAIRS");
    expect(visible).toContain("DEPT-ACADEMIC-LOAD");
    expect(visible).not.toContain("HUB-UNIVERSITY-STRATEGIC");
  });
});

describe("vp student affairs — empty/partial metrics", () => {
  test("processing-time empty ⇒ no_data", () => {
    expect(buildProcessingTimeKpis([]).overdue.presence).toBe("no_data");
    expect(FUNCTIONS_SRC).toContain("buildProcessingTimeKpis(facts, { treatEmptyAsZero: true })");
  });
});

describe("vp student affairs — server function + route", () => {
  test("getVpStudentAffairsReportsSummary uses createServerFn + auth + assertAnyRole", () => {
    expect(FUNCTIONS_SRC).toMatch(
      /export const getVpStudentAffairsReportsSummary = createServerFn\(\{ method: "POST" \}\)\s*\n\s*\.middleware\(\[requireSupabaseAuth\]\)/,
    );
    expect(FUNCTIONS_SRC).toMatch(/assertAnyRole\(\s*context\.userId,\s*VP_STUDENT_ROLES/);
  });

  test("executive reports route wires VP student summary", () => {
    expect(ROUTE_SRC).toContain('createFileRoute("/admin/executive-reports")');
    expect(ROUTE_SRC).toContain("getVpStudentAffairsReportsSummary");
  });
});
