/**
 * Dean beneficiary — college-only aggregates, no default PII lists.
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

const FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/beneficiary-reports.functions.ts", import.meta.url)),
  "utf8",
);
const ROUTE_SRC = readFileSync(
  fileURLToPath(new URL("../../src/routes/admin/executive-reports.tsx", import.meta.url)),
  "utf8",
);

const HUB = findByCode(REPORT_CATALOG_ENTRIES, "HUB-DEAN-COLLEGE")!;
const ALLOWED = ["dean", "admin", "system_admin"] as const;
const DENIED = ["student", "faculty_member", "department_head", "finance_officer", "student_affairs"] as const;

describe("dean — positive visibility", () => {
  test("hub is college-scoped for dean roles", () => {
    expect(HUB.beneficiaries).toContain("dean");
    expect(HUB.data_scope).toBe("college");
    expect(HUB.route).toBe("/admin/executive-reports");
    for (const role of ALLOWED) {
      expect(canSeeReport(HUB, [role])).toBe(true);
    }
    expect(beneficiariesForRoles(["dean"])).toContain("dean");
    expect(levelsGrantedByRoles(["dean"])).toContain("college");
    expect(beneficiaryMayAccessLevel("dean", "college")).toBe(true);
    expect(beneficiaryMayAccessLevel("dean", "university_strategic")).toBe(false);
  });
});

describe("dean — negative / fail-closed", () => {
  test("non-dean roles cannot see dean hub", () => {
    for (const role of DENIED) {
      expect(canSeeReport(HUB, [role])).toBe(false);
    }
  });

  test("empty / unknown roles fail closed", () => {
    expect(canSeeReport(HUB, [])).toBe(false);
    expect(canSeeReport(HUB, ["unknown_role_xyz"])).toBe(false);
  });
});

describe("dean — wrong scope / privacy contract", () => {
  test("dean summary is college aggregates without raw PII list projection", () => {
    expect(FUNCTIONS_SRC).toContain("getDeanCollegeReportsSummary");
    expect(FUNCTIONS_SRC).toContain('scopeLabelAr: "الكلية فقط"');
    expect(FUNCTIONS_SRC).toContain("departmentComparison");
    // Aggregate path selects department id/name counts — not student contact PII.
    const deanBlock = FUNCTIONS_SRC.slice(
      FUNCTIONS_SRC.indexOf("getDeanCollegeReportsSummary"),
      FUNCTIONS_SRC.indexOf("getVpStudentAffairsReportsSummary"),
    );
    for (const token of ["email", "phone", "national_id", "academic_number"]) {
      expect(deanBlock).not.toContain(token);
    }
  });
});

describe("dean — dual role union", () => {
  test("dean + student_affairs sees dean hub and VP student hub", () => {
    const visible = visibleReports(REPORT_CATALOG_ENTRIES, [
      "dean",
      "student_affairs",
    ]).map((e) => e.report_code);
    expect(visible).toContain("HUB-DEAN-COLLEGE");
    expect(visible).toContain("HUB-VP-STUDENT-AFFAIRS");
    expect(visible).not.toContain("STU-SELF-SERVICE-VIEWS");
  });
});

describe("dean — empty/partial metrics", () => {
  test("server uses countOrIncomplete / metric incomplete path for null counts", () => {
    expect(FUNCTIONS_SRC).toContain("countOrIncomplete");
    expect(FUNCTIONS_SRC).toContain("metricIncomplete");
  });
});

describe("dean — server function + route", () => {
  test("getDeanCollegeReportsSummary uses createServerFn + auth + assertAnyRole", () => {
    expect(FUNCTIONS_SRC).toMatch(
      /export const getDeanCollegeReportsSummary = createServerFn\(\{ method: "POST" \}\)\s*\n\s*\.middleware\(\[requireSupabaseAuth\]\)/,
    );
    expect(FUNCTIONS_SRC).toContain('["system_admin", "admin", "dean"]');
    expect(FUNCTIONS_SRC).toContain("ليس لديك صلاحية تقارير الكلية");
  });

  test("executive reports route wires dean summary", () => {
    expect(ROUTE_SRC).toContain('createFileRoute("/admin/executive-reports")');
    expect(ROUTE_SRC).toContain("getDeanCollegeReportsSummary");
  });
});
