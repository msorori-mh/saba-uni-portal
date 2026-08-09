/**
 * Operational units staff — requests/documents workload hub.
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
import { beneficiariesForRoles } from "../../src/lib/reports/scope";
import { buildProcessingTimeKpis } from "../../src/lib/reports/processing-time";

const FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/beneficiary-reports.functions.ts", import.meta.url)),
  "utf8",
);
const ROUTE_SRC = readFileSync(
  fileURLToPath(new URL("../../src/routes/admin/executive-reports.tsx", import.meta.url)),
  "utf8",
);

const HUB = findByCode(REPORT_CATALOG_ENTRIES, "HUB-OPERATIONAL-UNITS")!;
const PROC = findByCode(REPORT_CATALOG_ENTRIES, "REQ-PROCESSING-TIME")!;
const DOCS = findByCode(REPORT_CATALOG_ENTRIES, "REQ-DOCUMENTS-ISSUED")!;
const OVERDUE = findByCode(REPORT_CATALOG_ENTRIES, "REQ-OVERDUE-SLA")!;
const ALLOWED = ["registrar", "student_affairs", "finance_officer", "admin", "system_admin"] as const;
const DENIED = ["student", "faculty_member", "department_head", "hr_officer"] as const;

describe("operational unit — positive visibility", () => {
  test("hub + processing + documents codes require operational roles", () => {
    expect(HUB.beneficiaries).toContain("operational_units_staff");
    expect(HUB.route).toBe("/admin/executive-reports");
    for (const role of ALLOWED) {
      expect(canSeeReport(HUB, [role])).toBe(true);
      expect(canSeeReport(PROC, [role])).toBe(true);
      expect(canSeeReport(DOCS, [role])).toBe(true);
      expect(canSeeReport(OVERDUE, [role])).toBe(true);
    }
    expect(beneficiariesForRoles(["registrar"])).toContain("operational_units_staff");
  });
});

describe("operational unit — negative / fail-closed", () => {
  test("non-operational roles cannot see operational hub", () => {
    for (const role of DENIED) {
      expect(canSeeReport(HUB, [role])).toBe(false);
    }
  });

  test("empty / unknown roles fail closed", () => {
    expect(canSeeReport(HUB, [])).toBe(false);
    expect(canSeeReport(HUB, ["unknown_role_xyz"])).toBe(false);
  });
});

describe("operational unit — wrong scope / no unit leakage markers", () => {
  test("server summary labels operational unit domain and uses processing builder", () => {
    expect(FUNCTIONS_SRC).toContain("getOperationalUnitReportsSummary");
    expect(FUNCTIONS_SRC).toContain("وحدة تشغيلية — اختصاص الطلبات/الوثائق");
    expect(FUNCTIONS_SRC).toContain("buildProcessingTimeKpis");
    expect(FUNCTIONS_SRC).toContain("buildRequestsAggregateReport");
  });
});

describe("operational unit — dual role union", () => {
  test("finance_officer + faculty_member sees operational hub and faculty hub only", () => {
    const visible = visibleReports(REPORT_CATALOG_ENTRIES, [
      "finance_officer",
      "faculty_member",
    ]).map((e) => e.report_code);
    expect(visible).toContain("HUB-OPERATIONAL-UNITS");
    expect(visible).toContain("HUB-FACULTY-REPORTS");
    expect(visible).not.toContain("HUB-DEAN-COLLEGE");
    expect(visible).not.toContain("STU-SELF-SERVICE-VIEWS");
  });
});

describe("operational unit — empty/partial metrics", () => {
  test("processing-time empty ⇒ no_data; zero pending is a real value", () => {
    expect(buildProcessingTimeKpis([]).pending.presence).toBe("no_data");
    const kpis = buildProcessingTimeKpis([
      { requestType: "t", status: "approved", ageDays: 1, resolutionDays: 2 },
    ]);
    expect(kpis.pending.presence).toBe("value");
    expect(kpis.pending.value).toBe(0);
  });
});

describe("operational unit — server function + route", () => {
  test("getOperationalUnitReportsSummary uses createServerFn + auth + assertAnyRole", () => {
    expect(FUNCTIONS_SRC).toMatch(
      /export const getOperationalUnitReportsSummary = createServerFn\(\{ method: "POST" \}\)\s*\n\s*\.middleware\(\[requireSupabaseAuth\]\)/,
    );
    expect(FUNCTIONS_SRC).toMatch(/assertAnyRole\(\s*context\.userId,\s*OPERATIONAL_ROLES/);
    expect(FUNCTIONS_SRC).toContain("getRequestProcessingTimeReport");
    expect(FUNCTIONS_SRC).toContain("getDocumentsIssuedReport");
  });

  test("executive reports route hosts operational view", () => {
    expect(ROUTE_SRC).toContain('createFileRoute("/admin/executive-reports")');
    expect(ROUTE_SRC).toContain("getOperationalUnitReportsSummary");
  });
});
