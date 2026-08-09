/**
 * Alumni / quality beneficiary — available sources only; blocked families marked.
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
import { beneficiariesForRoles, metricNoAccess, metricNoData } from "../../src/lib/reports/scope";

const FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/beneficiary-reports.functions.ts", import.meta.url)),
  "utf8",
);
const ROUTE_SRC = readFileSync(
  fileURLToPath(new URL("../../src/routes/admin/executive-reports.tsx", import.meta.url)),
  "utf8",
);

const HUB = findByCode(REPORT_CATALOG_ENTRIES, "HUB-ALUMNI-QUALITY")!;
const EMPLOYMENT = findByCode(REPORT_CATALOG_ENTRIES, "ALU-COHORT-EMPLOYMENT")!;
const ALLOWED = ["admin", "system_admin", "dean", "registrar"] as const;
const DENIED = ["student", "faculty_member", "department_head", "finance_officer", "hr_officer"] as const;

describe("alumni quality — positive visibility", () => {
  test("hub admits alumni_quality roles and live candidates path", () => {
    expect(HUB.beneficiaries).toContain("alumni_quality");
    expect(HUB.route).toBe("/admin/executive-reports");
    expect(HUB.source).toContain("getAlumniQualityReportsSummary");
    for (const role of ALLOWED) {
      expect(canSeeReport(HUB, [role])).toBe(true);
    }
  });

  test("admin maps to alumni_quality beneficiary facet", () => {
    expect(beneficiariesForRoles(["admin"])).toContain("alumni_quality");
    expect(beneficiariesForRoles(["dean"])).not.toContain("alumni_quality");
  });
});

describe("alumni quality — negative / fail-closed", () => {
  test("denied roles cannot see alumni hub", () => {
    for (const role of DENIED) {
      expect(canSeeReport(HUB, [role])).toBe(false);
    }
  });

  test("empty / unknown roles fail closed", () => {
    expect(canSeeReport(HUB, [])).toBe(false);
    expect(canSeeReport(HUB, ["unknown_role_xyz"])).toBe(false);
  });

  test("blocked employment aggregates stay non-openable / role-gated", () => {
    expect(EMPLOYMENT.status).toBe("BLOCKED");
    expect(canSeeReport(EMPLOYMENT, ["admin"])).toBe(false);
  });
});

describe("alumni quality — wrong scope / no invented access", () => {
  test("server marks unavailable families as no_access / blockedFamilies", () => {
    expect(FUNCTIONS_SRC).toContain("getAlumniQualityReportsSummary");
    expect(FUNCTIONS_SRC).toContain("metricNoAccess");
    expect(FUNCTIONS_SRC).toContain("blockedFamilies");
    expect(FUNCTIONS_SRC).toContain("ALU-COHORT-EMPLOYMENT");
    expect(FUNCTIONS_SRC).toContain("ALU-SURVEY-AGGREGATES");
  });
});

describe("alumni quality — dual role union", () => {
  test("dean + faculty sees alumni hub via required_role and faculty hub", () => {
    const visible = visibleReports(REPORT_CATALOG_ENTRIES, ["dean", "faculty_member"]).map(
      (e) => e.report_code,
    );
    expect(visible).toContain("HUB-ALUMNI-QUALITY");
    expect(visible).toContain("HUB-FACULTY-REPORTS");
    expect(visible).not.toContain("STU-SELF-SERVICE-VIEWS");
  });
});

describe("alumni quality — empty/partial metrics", () => {
  test("no_access and no_data are not numeric zeros", () => {
    expect(metricNoAccess("x").presence).toBe("no_access");
    expect(metricNoAccess("x").value).toBeNull();
    expect(metricNoData().presence).toBe("no_data");
    expect(FUNCTIONS_SRC).toContain("employmentAggregates: metricNoAccess");
    expect(FUNCTIONS_SRC).toContain("surveyAggregates: metricNoAccess");
    expect(FUNCTIONS_SRC).toContain("consentCompliance: metricIncomplete");
  });
});

describe("alumni quality — server function + route", () => {
  test("getAlumniQualityReportsSummary uses createServerFn + auth + assertAnyRole", () => {
    expect(FUNCTIONS_SRC).toMatch(
      /export const getAlumniQualityReportsSummary = createServerFn\(\{ method: "POST" \}\)\s*\n\s*\.middleware\(\[requireSupabaseAuth\]\)/,
    );
    expect(FUNCTIONS_SRC).toMatch(/assertAnyRole\(\s*context\.userId,\s*ALUMNI_ROLES/);
  });

  test("executive reports route wires alumni summary", () => {
    expect(ROUTE_SRC).toContain('createFileRoute("/admin/executive-reports")');
    expect(ROUTE_SRC).toContain("getAlumniQualityReportsSummary");
  });
});
