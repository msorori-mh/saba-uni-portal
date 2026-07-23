/**
 * ADMIN-REPORTS-TEST-HARDENING-AND-CATALOG-RECONCILIATION-01
 *
 * UI state + filter contract tests for the six wired /admin/reports
 * sections (source-contract style; the repo has no React rendering harness).
 *
 * Behaviors covered: empty state, loading state, error state, filter
 * behavior, date range, program scope, department scope.
 *
 * Pure ASCII: Arabic literals are written as unicode escapes.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROUTE_SRC = readFileSync(
  fileURLToPath(new URL("../../src/routes/admin/reports.tsx", import.meta.url)),
  "utf8",
);
const FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/admin-reports.functions.ts", import.meta.url)),
  "utf8",
);

/** "لا توجد بيانات." - no-data empty-state message. */
const EMPTY_MSG = "لا توجد بيانات.";
/** "no matching data" empty-state message (Arabic, escaped). */
const EMPTY_MATCH_MSG = "لا توجد بيانات مطابقة.";

describe("loading state", () => {
  test("every section header reflects the fetching state", () => {
    const count = ROUTE_SRC.split("loading={isFetching}").length - 1;
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test("a spinner is rendered while loading", () => {
    expect(ROUTE_SRC).toContain("Loader2");
    expect(ROUTE_SRC).toContain("animate-spin");
  });
});

describe("error state", () => {
  test("query errors render the shared ErrorBox with the error message", () => {
    const count = ROUTE_SRC.split("<ErrorBox message={(error as Error).message} />").length - 1;
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test("server query errors propagate as thrown Errors in the data path", () => {
    const count = FUNCTIONS_SRC.split("if (error) throw new Error(error.message)").length - 1;
    expect(count).toBeGreaterThanOrEqual(10);
  });
});

describe("empty state", () => {
  test("sections render explicit no-data empty states", () => {
    expect(ROUTE_SRC).toContain(EMPTY_MSG);
    expect(ROUTE_SRC).toContain(EMPTY_MATCH_MSG);
  });

  test("filter-required sections return a guided empty payload without querying", () => {
    // students + accounts + import jobs fail soft into a guided empty state.
    const count = FUNCTIONS_SRC.split("if (!hasFilter) {").length - 1;
    expect(count).toBeGreaterThanOrEqual(3);
    expect(FUNCTIONS_SRC).toContain("rows: [],");
  });
});

describe("filter behavior", () => {
  test("filters apply only after the apply action (appliedFilters pattern)", () => {
    expect(ROUTE_SRC).toContain("setAppliedFilters(filters)");
    expect(ROUTE_SRC).toContain("EMPTY_FILTERS");
    // clearing resets the applied filter set for every section.
    const clearCount = ROUTE_SRC.split("setAppliedFilters(EMPTY_").length - 1;
    expect(clearCount).toBeGreaterThanOrEqual(5);
  });

  test("each filter-required section gates its query on a has*Filter helper", () => {
    expect(ROUTE_SRC).toContain("const reportEnabled = hasAnyFilter(appliedFilters)");
    expect(ROUTE_SRC).toContain("const enabled = hasImportFilter(appliedFilters)");
    expect(ROUTE_SRC).toContain("const enabled = hasAccountFilter(appliedFilters)");
    expect(ROUTE_SRC).toContain("const enabled = hasAcademicReportFilter(reportId, appliedFilters)");
    expect(ROUTE_SRC).toContain("const enabled = hasScheduleReportFilter(appliedFilters, reportId)");
    const enabledQueries = ROUTE_SRC.split("enabled,").length - 1;
    expect(enabledQueries).toBeGreaterThanOrEqual(4);
  });
});

describe("date range", () => {
  test("the requests report applies an inclusive created_at range", () => {
    expect(FUNCTIONS_SRC).toContain('s.gte("created_at", filters.from_date)');
    expect(FUNCTIONS_SRC).toContain('s.lte("created_at", `${filters.to_date}T23:59:59.999Z`)');
  });

  test("the requests UI exposes from/to date inputs", () => {
    expect(ROUTE_SRC).toContain('type="date"');
    expect(ROUTE_SRC).toContain("from_date");
    expect(ROUTE_SRC).toContain("to_date");
  });
});

describe("department + program scope", () => {
  test("department filter is applied server-side when supplied", () => {
    expect(FUNCTIONS_SRC).toContain('if (data.department_id) query = query.eq("department_id", data.department_id)');
  });

  test("program filter is applied server-side when supplied", () => {
    expect(FUNCTIONS_SRC).toContain('if (data.program_id) query = query.eq("program_id", data.program_id)');
  });

  test("program options cascade from the selected department in the UI", () => {
    const cascadeCount = ROUTE_SRC.split("filteredPrograms").length - 1;
    expect(cascadeCount).toBeGreaterThanOrEqual(4);
    // changing the department resets the selected program.
    const resetCount = ROUTE_SRC.split('program_id: ""').length - 1;
    expect(resetCount).toBeGreaterThanOrEqual(3);
  });

  test("report queries read production tables through the guarded server functions", () => {
    expect(FUNCTIONS_SRC).toContain('supabaseAdmin.from("student_profiles")');
    expect(FUNCTIONS_SRC).toContain('"student_requests", (q) => {');
    expect(FUNCTIONS_SRC).toContain('supabaseAdmin.from("programs")');
  });
});
