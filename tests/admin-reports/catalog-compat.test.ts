/**
 * ADMIN-REPORTS-TEST-HARDENING-AND-CATALOG-RECONCILIATION-01
 *
 * PR #199 catalog compatibility tests for the six wired /admin/reports
 * sections: catalog entries, the 5-proof LIVE rule, and wiring parity
 * between the catalog and the actual route/components.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  REPORT_CATALOG_ENTRIES,
  findByCode,
  validateCatalog,
} from "../../src/lib/reports/catalog";

const ROUTE_SRC = readFileSync(
  fileURLToPath(new URL("../../src/routes/admin/reports.tsx", import.meta.url)),
  "utf8",
);
const MATRIX_SRC = readFileSync(
  fileURLToPath(new URL("../../docs/PORTAL-REPORTS-TRACEABILITY-MATRIX-01.md", import.meta.url)),
  "utf8",
);

const SECTION_COMPONENTS: ReadonlyArray<readonly [string, string]> = [
  ["ADM-STUDENTS-DIRECTORY", "StudentsReport"],
  ["ADM-IMPORT-JOBS", "ImportJobsReport"],
  ["ADM-STUDENT-ACCOUNTS", "StudentAccountsReport"],
  ["ADM-ACADEMIC-STRUCTURE", "AcademicReports"],
  ["ADM-SCHEDULE-SUITE", "ScheduleReports"],
  ["ADM-STUDENT-REQUESTS", "RequestsReport"],
];

const SECTION_CODES = SECTION_COMPONENTS.map(([code]) => code);

describe("PR #199 catalog compatibility", () => {
  test("the catalog itself is invariant-clean", () => {
    expect(validateCatalog(REPORT_CATALOG_ENTRIES)).toEqual([]);
  });

  test("all six wired sections are catalogued at /admin/reports", () => {
    for (const code of SECTION_CODES) {
      const entry = findByCode(REPORT_CATALOG_ENTRIES, code);
      expect(entry).toBeDefined();
      expect(entry!.route).toBe("/admin/reports");
      expect(entry!.output_types).toContain("screen");
      expect(entry!.output_types).toContain("excel");
    }
  });

  test("the traceability matrix indexes each section exactly once", () => {
    for (const code of SECTION_CODES) {
      expect(MATRIX_SRC.split(code).length - 1).toBe(1);
    }
  });
});

describe("5-proof LIVE rule for the six sections", () => {
  test("each promoted section proves route + permission + source + tests + wiring", () => {
    for (const [code, component] of SECTION_COMPONENTS) {
      const entry = findByCode(REPORT_CATALOG_ENTRIES, code)!;
      expect(entry.status).toBe("LIVE");
      // route proof
      expect(entry.route).toBe("/admin/reports");
      // permission proof (non-empty guard roles, mirrored from server code)
      expect(entry.required_role.length).toBeGreaterThan(0);
      // source proof (real table/RPC anchor)
      expect(entry.source.trim().length).toBeGreaterThan(0);
      // tests proof (this hardening slice)
      expect(entry.tests.length).toBeGreaterThan(0);
      expect(entry.tests.some((path) => path.startsWith("tests/admin-reports/"))).toBe(true);
      // wiring proof (the route actually renders the section component)
      expect(ROUTE_SRC).toContain(`<${component} />`);
      // evidence paths recorded
      expect(entry.evidence.length).toBeGreaterThan(0);
    }
  });

  test("EXEC-CORE-KPIS is LIVE with executive dashboard route + beneficiary tests", () => {
    const entry = findByCode(REPORT_CATALOG_ENTRIES, "EXEC-CORE-KPIS")!;
    expect(entry.status).toBe("LIVE");
    expect(entry.route).toBe("/admin/executive-dashboard");
    expect(entry.tests.some((t) => t.includes("university-leadership-reports"))).toBe(true);
  });
});
