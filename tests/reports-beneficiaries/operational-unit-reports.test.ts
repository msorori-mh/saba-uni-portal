/**
 * Operational units staff — unit-scoped requests workload hub.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  REPORT_CATALOG_ENTRIES,
  canSeeReport,
  canSeeReportWithBindings,
  findByCode,
  visibleReports,
} from "../../src/lib/reports/catalog";
import {
  beneficiariesForRoles,
  emptyOrgBindings,
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

const HUB = findByCode(REPORT_CATALOG_ENTRIES, "HUB-OPERATIONAL-UNITS")!;
const PROC = findByCode(REPORT_CATALOG_ENTRIES, "REQ-PROCESSING-TIME")!;
const DOCS = findByCode(REPORT_CATALOG_ENTRIES, "REQ-DOCUMENTS-ISSUED")!;
const OVERDUE = findByCode(REPORT_CATALOG_ENTRIES, "REQ-OVERDUE-SLA")!;
const ALLOWED = ["registrar", "student_affairs", "finance_officer", "admin", "system_admin"] as const;
const DENIED = ["student", "faculty_member", "department_head", "hr_officer"] as const;

describe("operational unit — positive visibility", () => {
  test("hub + processing require operational roles; docs are BLOCKED pending unit FK", () => {
    expect(HUB.beneficiaries).toContain("operational_units_staff");
    expect(HUB.route).toBe("/admin/executive-reports");
    expect(DOCS.status).toBe("BLOCKED");
    for (const role of ALLOWED) {
      expect(canSeeReport(HUB, [role])).toBe(true);
      expect(canSeeReport(PROC, [role])).toBe(true);
      expect(canSeeReport(OVERDUE, [role])).toBe(true);
      expect(canSeeReport(DOCS, [role])).toBe(false);
    }
    expect(beneficiariesForRoles(["registrar"])).toContain("operational_units_staff");
  });

  test("ordinary finance_officer needs unit binding for catalog card", () => {
    expect(
      canSeeReportWithBindings(HUB, ["finance_officer"], emptyOrgBindings()),
    ).toBe(false);
    expect(
      canSeeReportWithBindings(
        HUB,
        ["finance_officer"],
        emptyOrgBindings({ operationalUnitCodes: ["finance"] }),
      ),
    ).toBe(true);
  });
});

describe("operational unit — negative / fail-closed", () => {
  test("non-operational roles cannot see operational hub", () => {
    for (const role of DENIED) {
      expect(canSeeReport(HUB, [role])).toBe(false);
    }
  });
});

describe("operational unit — server scope contract", () => {
  test("server scopes by unit and never invents university-wide docs", () => {
    expect(FUNCTIONS_SRC).toContain("getOperationalUnitReportsSummary");
    expect(FUNCTIONS_SRC).toContain("requireOperationalUnits");
    expect(FUNCTIONS_SRC).toContain("loadUnitScopedRequestRows");
    expect(FUNCTIONS_SRC).toContain("buildProcessingTimeKpis");
    expect(FUNCTIONS_SRC).toContain("لا عمود وحدة على official_documents");
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
  test("processing-time empty ⇒ no_data", () => {
    expect(buildProcessingTimeKpis([]).pending.presence).toBe("no_data");
  });
});

describe("operational unit — server function + route", () => {
  test("getOperationalUnitReportsSummary uses createServerFn + OPERATIONAL_ROLES", () => {
    expect(FUNCTIONS_SRC).toMatch(
      /export const getOperationalUnitReportsSummary = createServerFn\(\{ method: "POST" \}\)\s*\n\s*\.middleware\(\[requireSupabaseAuth\]\)/,
    );
    expect(FUNCTIONS_SRC).toMatch(/assertAnyRole\(\s*context\.userId,\s*OPERATIONAL_ROLES/);
    expect(ROUTE_SRC).toContain("getOperationalUnitReportsSummary");
  });
});
