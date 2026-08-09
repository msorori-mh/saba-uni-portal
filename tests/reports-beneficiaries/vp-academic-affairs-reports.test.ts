/**
 * VP Academic Affairs — university academic domain aggregates.
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
const ALLOWED = ["dean", "registrar", "admin", "system_admin"] as const;
const DENIED = ["student", "faculty_member", "finance_officer", "student_affairs", "hr_officer"] as const;

describe("vp academic affairs — positive visibility", () => {
  test("hub matches academic roles and university_academic scope", () => {
    expect(HUB.beneficiaries).toContain("vp_academic_affairs");
    expect(HUB.data_scope).toBe("university_academic");
    expect(HUB.route).toBe("/admin/executive-reports");
    for (const role of ALLOWED) {
      expect(canSeeReport(HUB, [role])).toBe(true);
    }
    // Role→beneficiary facet: admin/system_admin grant vp_academic_affairs;
    // dean/registrar reach the hub via required_role, not necessarily the facet.
    expect(beneficiariesForRoles(["admin"])).toContain("vp_academic_affairs");
    expect(levelsGrantedByRoles(["registrar"])).toContain("university_academic");
    expect(beneficiaryMayAccessLevel("vp_academic_affairs", "university_academic")).toBe(true);
    expect(beneficiaryMayAccessLevel("vp_academic_affairs", "university_student_affairs")).toBe(
      false,
    );
  });
});

describe("vp academic affairs — negative / fail-closed", () => {
  test("denied roles cannot see VP academic hub", () => {
    for (const role of DENIED) {
      expect(canSeeReport(HUB, [role])).toBe(false);
    }
  });

  test("empty / unknown roles fail closed", () => {
    expect(canSeeReport(HUB, [])).toBe(false);
    expect(canSeeReport(HUB, ["unknown_role_xyz"])).toBe(false);
  });
});

describe("vp academic affairs — wrong scope / domain exclusion", () => {
  test("server excludes student request PII and finance ledgers", () => {
    expect(FUNCTIONS_SRC).toContain("getVpAcademicAffairsReportsSummary");
    expect(FUNCTIONS_SRC).toContain("نطاق جامعي — الشؤون الأكاديمية فقط");
    expect(FUNCTIONS_SRC).toContain("excludedDomains");
    expect(FUNCTIONS_SRC).toContain("student_request_pii");
    expect(FUNCTIONS_SRC).toContain("finance_ledgers");
    expect(FUNCTIONS_SRC).toContain("raw_student_directory");
  });
});

describe("vp academic affairs — dual role union", () => {
  test("registrar + faculty_member sees academic hub and faculty hub", () => {
    const visible = visibleReports(REPORT_CATALOG_ENTRIES, [
      "registrar",
      "faculty_member",
    ]).map((e) => e.report_code);
    expect(visible).toContain("HUB-VP-ACADEMIC-AFFAIRS");
    expect(visible).toContain("HUB-FACULTY-REPORTS");
    expect(visible).not.toContain("HUB-VP-STUDENT-AFFAIRS");
  });
});

describe("vp academic affairs — empty/partial metrics", () => {
  test("teaching-load empty ⇒ no_data", () => {
    expect(buildTeachingLoadKpis([]).totalCreditHours.presence).toBe("no_data");
  });
});

describe("vp academic affairs — server function + route", () => {
  test("getVpAcademicAffairsReportsSummary uses createServerFn + auth + assertAnyRole", () => {
    expect(FUNCTIONS_SRC).toMatch(
      /export const getVpAcademicAffairsReportsSummary = createServerFn\(\{ method: "POST" \}\)\s*\n\s*\.middleware\(\[requireSupabaseAuth\]\)/,
    );
    expect(FUNCTIONS_SRC).toMatch(/assertAnyRole\(\s*context\.userId,\s*VP_ACADEMIC_ROLES/);
  });

  test("executive reports route wires VP academic summary", () => {
    expect(ROUTE_SRC).toContain('createFileRoute("/admin/executive-reports")');
    expect(ROUTE_SRC).toContain("getVpAcademicAffairsReportsSummary");
  });
});
