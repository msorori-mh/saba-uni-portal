/**
 * ADMIN-REPORTS-TEST-HARDENING-AND-CATALOG-RECONCILIATION-01
 *
 * Guard / visibility contract tests for the six wired /admin/reports
 * sections. Source-contract + catalog-behavior tests (repo convention: no DB
 * mocking, no React rendering); every assertion is anchored to a real path.
 *
 * Behaviors covered: authorized visibility, unauthorized denied, unknown
 * role fail-closed, wrong-unit isolation, export permission, no cross-unit
 * leakage, plus the general dashboard (route + nav) test.
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

const FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/admin-reports.functions.ts", import.meta.url)),
  "utf8",
);
const AUTHZ_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/authz.server.ts", import.meta.url)),
  "utf8",
);
const NAV_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/admin-nav.ts", import.meta.url)),
  "utf8",
);
const ROUTE_SRC = readFileSync(
  fileURLToPath(new URL("../../src/routes/admin/reports.tsx", import.meta.url)),
  "utf8",
);
const AUDIT_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/reports/report-audit.functions.ts", import.meta.url)),
  "utf8",
);

/** Extract a role-array constant from source and parse its string literals. */
function roleArrayOf(source: string, constName: string): string[] {
  const match = source.match(new RegExp(`const ${constName}[^=]*=\\s*\\[([^\\]]*)\\]`));
  if (!match) throw new Error(`constant not found: ${constName}`);
  return [...match[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

const REPORTS_ROLES = roleArrayOf(AUTHZ_SRC, "REPORTS_ROLES");
const STUDENT_READ_ROLES = roleArrayOf(AUTHZ_SRC, "STUDENT_READ_ROLES");
const IMPORT_REPORT_ROLES = roleArrayOf(FUNCTIONS_SRC, "IMPORT_REPORT_ROLES");
const SCHEDULE_REPORT_ROLES = roleArrayOf(FUNCTIONS_SRC, "SCHEDULE_REPORT_ROLES");

/** The six in-scope wired sections and the guard role-set each one uses. */
const SECTION_GUARDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["ADM-STUDENTS-DIRECTORY", STUDENT_READ_ROLES],
  ["ADM-IMPORT-JOBS", IMPORT_REPORT_ROLES],
  ["ADM-STUDENT-ACCOUNTS", STUDENT_READ_ROLES],
  ["ADM-ACADEMIC-STRUCTURE", REPORTS_ROLES],
  ["ADM-SCHEDULE-SUITE", SCHEDULE_REPORT_ROLES],
  ["ADM-STUDENT-REQUESTS", REPORTS_ROLES],
];

const SECTION_CODES = SECTION_GUARDS.map(([code]) => code);

/** Roles that must never see any admin report section. */
const ALWAYS_DENIED_ROLES = ["student", "faculty_member", "hr_officer", "graduate"];

describe("route + server guard presence (permission pillar)", () => {
  test("the reports route exists at /admin/reports", () => {
    expect(ROUTE_SRC).toContain('createFileRoute("/admin/reports")');
  });

  test("every exported server function requires authentication", () => {
    const serverFns = FUNCTIONS_SRC.split("createServerFn({").length - 1;
    const middleware = FUNCTIONS_SRC.split(".middleware([requireSupabaseAuth])").length - 1;
    expect(serverFns).toBeGreaterThanOrEqual(19);
    expect(middleware).toBe(serverFns);
  });

  test("server guards are the documented role sets", () => {
    // authz.server.ts is the single source of truth for REPORTS_ROLES.
    expect(REPORTS_ROLES).toEqual([
      "system_admin",
      "admin",
      "dean",
      "registrar",
      "finance_officer",
      "student_affairs",
    ]);
    // STUDENT_READ_ROLES deliberately excludes finance_officer (no dean changes).
    expect(STUDENT_READ_ROLES).toEqual([
      "admin",
      "system_admin",
      "dean",
      "registrar",
      "student_affairs",
    ]);
    // Import reports admit student_affairs AND finance_officer (code is truth).
    expect(IMPORT_REPORT_ROLES).toEqual([
      "admin",
      "system_admin",
      "registrar",
      "student_affairs",
      "finance_officer",
    ]);
    expect(SCHEDULE_REPORT_ROLES).toEqual([
      "system_admin",
      "admin",
      "dean",
      "registrar",
      "department_head",
    ]);
  });

  test("each section function calls its guard before querying", () => {
    expect(FUNCTIONS_SRC).toContain("await assertStudentRead(context.userId);");
    expect(FUNCTIONS_SRC).toContain("await assertReportsAccess(context.userId);");
    expect(FUNCTIONS_SRC).toContain("await assertAnyRole(context.userId, IMPORT_REPORT_ROLES");
    // 1 definition + 7 schedule-suite call sites.
    expect(FUNCTIONS_SRC.split("assertScheduleReportsAccess(").length - 1).toBe(9);
    // assertReportsAccess delegates to REPORTS_ROLES.
    expect(/assertAnyRole\(\s*userId,\s*REPORTS_ROLES/.test(FUNCTIONS_SRC)).toBe(true);
  });
});

describe("authorized visibility (catalog behavior)", () => {
  test("each section is visible to every role its server guard admits", () => {
    for (const [code, roles] of SECTION_GUARDS) {
      const entry = findByCode(REPORT_CATALOG_ENTRIES, code)!;
      for (const role of roles) {
        expect(canSeeReport(entry, [role])).toBe(true);
      }
    }
  });

  test("catalog required_role matches the server guard role set exactly", () => {
    // This test locks the two catalog corrections (code is truth):
    // - ADM-IMPORT-JOBS admits student_affairs + finance_officer.
    // - ADM-STUDENT-ACCOUNTS does NOT admit finance_officer.
    for (const [code, roles] of SECTION_GUARDS) {
      const entry = findByCode(REPORT_CATALOG_ENTRIES, code)!;
      expect([...entry.required_role].toSorted()).toEqual([...roles].toSorted());
    }
  });
});

describe("unauthorized denied + unknown role fail-closed", () => {
  test("non-administrative roles see no admin report section", () => {
    for (const code of SECTION_CODES) {
      const entry = findByCode(REPORT_CATALOG_ENTRIES, code)!;
      for (const role of ALWAYS_DENIED_ROLES) {
        expect(canSeeReport(entry, [role])).toBe(false);
      }
    }
  });

  test("unknown roles are denied for every section (fail-closed)", () => {
    for (const code of SECTION_CODES) {
      const entry = findByCode(REPORT_CATALOG_ENTRIES, code)!;
      expect(canSeeReport(entry, ["unknown_role_xyz"])).toBe(false);
      expect(canSeeReport(entry, [])).toBe(false);
      expect(canSeeReport(entry, null)).toBe(false);
    }
    const visible = visibleReports(REPORT_CATALOG_ENTRIES, ["unknown_role_xyz"]);
    for (const code of SECTION_CODES) {
      expect(visible.map((entry) => entry.report_code)).not.toContain(code);
    }
  });
});

describe("wrong-unit isolation + no cross-unit leakage", () => {
  test("department_head sees only the schedule suite among the six sections", () => {
    const visible = visibleReports(REPORT_CATALOG_ENTRIES, ["department_head"]).map(
      (entry) => entry.report_code,
    );
    expect(visible).toContain("ADM-SCHEDULE-SUITE");
    for (const code of SECTION_CODES) {
      if (code !== "ADM-SCHEDULE-SUITE") {
        expect(visible).not.toContain(code);
      }
    }
  });

  test("finance_officer cannot read student directory or student accounts sections", () => {
    const visible = visibleReports(REPORT_CATALOG_ENTRIES, ["finance_officer"]).map(
      (entry) => entry.report_code,
    );
    expect(visible).not.toContain("ADM-STUDENTS-DIRECTORY");
    expect(visible).not.toContain("ADM-STUDENT-ACCOUNTS");
    expect(visible).toContain("ADM-IMPORT-JOBS");
    expect(visible).toContain("ADM-ACADEMIC-STRUCTURE");
    expect(visible).toContain("ADM-STUDENT-REQUESTS");
  });

  test("server forces actor-derived department scope for department_head schedule reports", () => {
    // P0 beneficiary closure: department heads cannot widen/cross department
    // via client-supplied department_id. Scope is resolved from the actor.
    expect(FUNCTIONS_SRC).toContain("applyScheduleDepartmentScope");
    expect(FUNCTIONS_SRC).toContain("resolveReportActorScope");
    expect(FUNCTIONS_SRC).toContain("enforceDepartmentFilter");
    expect(FUNCTIONS_SRC).toContain("رئيس القسم بلا قسم مرتبط — يُرفض النطاق");
    expect(FUNCTIONS_SRC).toContain("forcedDepartmentId");
    expect(FUNCTIONS_SRC).toContain("department_id: enforced.departmentId");
  });
});

describe("export permission", () => {
  test("report audit logging is guarded by REPORTS_ROLES and uses the log_audit RPC", () => {
    expect(/assertAnyRole\(\s*context\.userId,\s*REPORTS_ROLES/.test(AUDIT_SRC)).toBe(true);
    expect(AUDIT_SRC).toContain('.rpc("log_audit"');
  });

  test("export rows come from the same guarded server query (no separate export path)", () => {
    // CSV/XLSX export serializes the rows of the already-guarded screen query.
    expect(ROUTE_SRC).toContain('downloadCsv("students_report.csv", exportRows)');
    expect(ROUTE_SRC).toContain('downloadCsv("student_requests_report.csv", exportRows)');
    expect(ROUTE_SRC).not.toContain("createServerFn");
  });
});

describe("general dashboard test (route + nav wiring)", () => {
  test("the reports center nav admits REPORTS_ROLES plus department_head for scoped schedule access", () => {
    expect(NAV_SRC).toContain('"/admin/reports"');
    const navMatch = NAV_SRC.match(/"\/admin\/reports":\s*\[([^\]]*)\]/);
    expect(navMatch).not.toBeNull();
    const navRoles = [...navMatch![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    expect(navRoles.toSorted()).toEqual(
      [...REPORTS_ROLES, "department_head"].toSorted(),
    );
  });

  test("all six wired section components are rendered by the route", () => {
    for (const component of [
      "StudentsReport",
      "ImportJobsReport",
      "StudentAccountsReport",
      "AcademicReports",
      "ScheduleReports",
      "RequestsReport",
    ]) {
      expect(ROUTE_SRC).toContain(`<${component} />`);
    }
  });
});
