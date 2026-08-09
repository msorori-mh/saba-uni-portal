/**
 * University presidency / council — strategic aggregates, no PII by default.
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
const AUTHZ_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/authz.server.ts", import.meta.url)),
  "utf8",
);
const ROUTE_SRC = readFileSync(
  fileURLToPath(new URL("../../src/routes/admin/executive-reports.tsx", import.meta.url)),
  "utf8",
);

const HUB = findByCode(REPORT_CATALOG_ENTRIES, "HUB-UNIVERSITY-STRATEGIC")!;
const EXEC = findByCode(REPORT_CATALOG_ENTRIES, "EXEC-CORE-KPIS")!;
const ALLOWED = ["admin", "system_admin", "dean", "registrar"] as const;
const DENIED = ["student", "faculty_member", "department_head", "finance_officer", "student_affairs", "hr_officer"] as const;

describe("university leadership — positive visibility", () => {
  test("strategic hub + EXEC KPIs admit EXEC_ROLES", () => {
    expect(HUB.beneficiaries).toContain("university_presidency_council");
    expect(HUB.data_scope).toBe("university_strategic");
    expect(HUB.route).toBe("/admin/executive-reports");
    expect(EXEC.route).toBe("/admin/executive-dashboard");
    for (const role of ALLOWED) {
      expect(canSeeReport(HUB, [role])).toBe(true);
      expect(canSeeReport(EXEC, [role])).toBe(true);
    }
    expect(beneficiariesForRoles(["admin"])).toContain("university_presidency_council");
    expect(levelsGrantedByRoles(["admin"])).toContain("university_strategic");
    expect(
      beneficiaryMayAccessLevel("university_presidency_council", "university_strategic"),
    ).toBe(true);
  });
});

describe("university leadership — negative / fail-closed", () => {
  test("non-exec roles cannot see strategic hub", () => {
    for (const role of DENIED) {
      expect(canSeeReport(HUB, [role])).toBe(false);
    }
  });

  test("empty / unknown roles fail closed", () => {
    expect(canSeeReport(HUB, [])).toBe(false);
    expect(canSeeReport(HUB, ["unknown_role_xyz"])).toBe(false);
  });
});

describe("university leadership — wrong scope / privacy", () => {
  test("strategic summary declares includesPii:false and aggregate_only export", () => {
    expect(FUNCTIONS_SRC).toContain("getUniversityStrategicReportsSummary");
    expect(FUNCTIONS_SRC).toContain("مؤشرات استراتيجية مجمعة — بلا بيانات شخصية");
    expect(FUNCTIONS_SRC).toContain("includesPii: false");
    expect(FUNCTIONS_SRC).toContain('exportMode: "aggregate_only"');
    const block = FUNCTIONS_SRC.slice(
      FUNCTIONS_SRC.indexOf("getUniversityStrategicReportsSummary"),
      FUNCTIONS_SRC.indexOf("getOperationalUnitReportsSummary"),
    );
    for (const token of ["email", "phone", "national_id", "academic_number", "full_name_ar"]) {
      expect(block).not.toContain(token);
    }
  });
});

describe("university leadership — dual role union", () => {
  test("admin alone receives strategic facet; faculty alone does not", () => {
    expect(visibleReports(REPORT_CATALOG_ENTRIES, ["admin"]).map((e) => e.report_code)).toContain(
      "HUB-UNIVERSITY-STRATEGIC",
    );
    expect(
      visibleReports(REPORT_CATALOG_ENTRIES, ["faculty_member"]).map((e) => e.report_code),
    ).not.toContain("HUB-UNIVERSITY-STRATEGIC");
  });
});

describe("university leadership — empty/partial metrics", () => {
  test("server uses countOrIncomplete for strategic KPI counters", () => {
    expect(FUNCTIONS_SRC).toContain("pendingStudentServices: countOrIncomplete");
  });
});

describe("university leadership — server function + route", () => {
  test("getUniversityStrategicReportsSummary uses createServerFn + auth + assertExecRole", () => {
    expect(FUNCTIONS_SRC).toMatch(
      /export const getUniversityStrategicReportsSummary = createServerFn\(\{ method: "POST" \}\)\s*\n\s*\.middleware\(\[requireSupabaseAuth\]\)/,
    );
    expect(FUNCTIONS_SRC).toContain("await assertExecRole(context.userId)");
    expect(AUTHZ_SRC).toContain('export const EXEC_ROLES = ["admin", "system_admin", "dean", "registrar"]');
    expect(FUNCTIONS_SRC).toContain("assertAnyRole");
  });

  test("executive reports route wires strategic summary", () => {
    expect(ROUTE_SRC).toContain('createFileRoute("/admin/executive-reports")');
    expect(ROUTE_SRC).toContain("getUniversityStrategicReportsSummary");
  });
});
