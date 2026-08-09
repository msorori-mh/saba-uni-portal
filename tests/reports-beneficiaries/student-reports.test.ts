/**
 * Student beneficiary — catalog visibility, route, and server-fn contracts.
 * Fail-closed; self-only scope. Source-contract + pure catalog checks.
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
import { beneficiariesForRoles, metricNoData, metricValue } from "../../src/lib/reports/scope";

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
const ROUTE_SRC = readFileSync(
  fileURLToPath(new URL("../../src/routes/student.reports.tsx", import.meta.url)),
  "utf8",
);

const CODE = "STU-SELF-SERVICE-VIEWS";
const ENTRY = findByCode(REPORT_CATALOG_ENTRIES, CODE)!;
const DENIED = ["faculty_member", "department_head", "dean", "registrar", "hr_officer"] as const;

describe("student reports — positive visibility", () => {
  test("catalog entry exists with student beneficiary and self route", () => {
    expect(ENTRY).toBeDefined();
    expect(ENTRY.beneficiaries).toContain("student");
    expect(ENTRY.required_role).toContain("student");
    expect(ENTRY.route).toBe("/student/reports");
    expect(ENTRY.data_scope).toContain("self");
  });

  test("student role can see STU-SELF-SERVICE-VIEWS", () => {
    expect(canSeeReport(ENTRY, ["student"])).toBe(true);
    expect(visibleReports(REPORT_CATALOG_ENTRIES, ["student"]).map((e) => e.report_code)).toContain(
      CODE,
    );
  });

  test("beneficiary mapping grants student facet only", () => {
    expect(beneficiariesForRoles(["student"])).toEqual(["student"]);
    expect(beneficiariesForRoles(["graduate"])).toEqual(["student"]);
  });
});

describe("student reports — negative / fail-closed", () => {
  test("non-student roles cannot see the self-service report", () => {
    for (const role of DENIED) {
      expect(canSeeReport(ENTRY, [role])).toBe(false);
    }
  });

  test("empty / unknown roles are denied (fail-closed)", () => {
    expect(canSeeReport(ENTRY, [])).toBe(false);
    expect(canSeeReport(ENTRY, null)).toBe(false);
    expect(canSeeReport(ENTRY, ["unknown_role_xyz"])).toBe(false);
    expect(visibleReports(REPORT_CATALOG_ENTRIES, ["unknown_role_xyz"])).toHaveLength(0);
  });
});

describe("student reports — dual role (union of grants only)", () => {
  test("student + faculty_member sees student report and faculty hub, not dean hub", () => {
    const roles = ["student", "faculty_member"] as const;
    const visible = visibleReports(REPORT_CATALOG_ENTRIES, roles).map((e) => e.report_code);
    expect(visible).toContain(CODE);
    expect(visible).toContain("HUB-FACULTY-REPORTS");
    expect(visible).not.toContain("HUB-DEAN-COLLEGE");
    expect(beneficiariesForRoles(roles).toSorted()).toEqual(
      ["faculty_supervisor", "student"].toSorted(),
    );
  });
});

describe("student reports — empty/partial metric markers", () => {
  test("no_data is not coerced to numeric zero", () => {
    expect(metricNoData().presence).toBe("no_data");
    expect(metricNoData().value).toBeNull();
    expect(metricValue(0).presence).toBe("value");
    expect(metricValue(0).value).toBe(0);
  });

  test("student summary server source uses metricValue for KPI counters", () => {
    expect(FUNCTIONS_SRC).toContain("getStudentSelfReportsSummary");
    expect(FUNCTIONS_SRC).toContain("runStudentSelfReportsSummary");
    expect(SERVICES_SRC).toContain("activeEnrollments: metricValue");
    expect(SERVICES_SRC).toContain("openRequests: metricValue");
    expect(SERVICES_SRC).toContain("issuedDocuments: metricValue");
  });
});

describe("student reports — server function + route contracts", () => {
  test("getStudentSelfReportsSummary is a createServerFn with requireSupabaseAuth", () => {
    expect(FUNCTIONS_SRC).toMatch(
      /export const getStudentSelfReportsSummary = createServerFn\(\{ method: "POST" \}\)\s*\n\s*\.middleware\(\[requireSupabaseAuth\]\)/,
    );
    expect(SERVICES_SRC).toContain("غير مصرح — تقارير الطالب ذاتية فقط");
    expect(FUNCTIONS_SRC).toContain('.eq("user_id", userId)');
  });

  test("beneficiary-reports.functions.ts uses assertAnyRole for guarded hubs", () => {
    expect(FUNCTIONS_SRC).toContain("assertAnyRole");
    expect(FUNCTIONS_SRC.split("createServerFn({").length - 1).toBeGreaterThanOrEqual(10);
    expect(FUNCTIONS_SRC.split(".middleware([requireSupabaseAuth])").length - 1).toBeGreaterThanOrEqual(
      10,
    );
  });

  test("route exists at /student/reports", () => {
    expect(ROUTE_SRC).toContain('createFileRoute("/student/reports")');
    expect(ROUTE_SRC).toContain("getStudentSelfReportsSummary");
  });
});
