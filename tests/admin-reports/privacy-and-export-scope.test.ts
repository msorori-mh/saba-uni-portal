/**
 * ADMIN-REPORTS-TEST-HARDENING-AND-CATALOG-RECONCILIATION-01
 *
 * Privacy + export-scope contract tests for the six wired /admin/reports
 * sections (source-contract style).
 *
 * Behaviors covered: no PII overexposure, export scope.
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
const EXPORT_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/reports/export.ts", import.meta.url)),
  "utf8",
);

/** Fields that must never appear in a report select or export projection. */
const PII_TOKENS = ["email", "phone", "national_id", "address", "birth_date", "gender"];

/** All template-literal .select(`...`) projections in the server functions. */
function selectBlocks(): string[] {
  return [...FUNCTIONS_SRC.matchAll(/\.select\(`([^`]+)`\)/g)].map((m) => m[1]!);
}

describe("no PII overexposure (server projections)", () => {
  test("person-level report selects exist (students + accounts)", () => {
    const personBlocks = selectBlocks().filter((block) => block.includes("academic_number"));
    expect(personBlocks.length).toBeGreaterThanOrEqual(2);
  });

  test("person-level selects carry only minimal identification and no contact/identity PII", () => {
    const personBlocks = selectBlocks().filter((block) => block.includes("academic_number"));
    for (const block of personBlocks) {
      expect(block).toContain("academic_number");
      expect(block).toContain("full_name_ar");
      for (const token of PII_TOKENS) {
        expect(block).not.toContain(token);
      }
    }
  });

  test("the reports route source contains no PII field tokens at all", () => {
    for (const token of ["email", "phone", "national_id"]) {
      expect(ROUTE_SRC).not.toContain(token);
    }
  });
});

describe("export scope", () => {
  test("CSV export serializes the rows of the already-guarded screen query", () => {
    // exportRows is derived from report?.rows for each section — the export
    // can never be wider than the on-screen (server-guarded) result.
    const count = ROUTE_SRC.split("(report?.rows ?? []).map((row) => ({").length - 1;
    expect(count).toBeGreaterThanOrEqual(3);
    const downloads = ROUTE_SRC.split("downloadCsv(").length - 1;
    expect(downloads).toBeGreaterThanOrEqual(6);
  });

  test("the requests section audits every export with the row count", () => {
    expect(ROUTE_SRC).toContain('"report_exported"');
    expect(ROUTE_SRC).toContain("rowCount");
  });

  test("the shared export utility audits exports best-effort via the guarded logReportEvent", () => {
    expect(EXPORT_SRC).toContain('action: "report_exported"');
    expect(EXPORT_SRC).toContain("logReportEvent");
    expect(EXPORT_SRC).toContain("rowCount: rows.length");
  });

  test("export adds no extra fields: export rows are built from displayed row objects", () => {
    // The route has no server-side export endpoint and no independent data
    // fetch for exports; exportRows maps over report?.rows only.
    expect(ROUTE_SRC).not.toContain("exportRowsFn");
    expect(ROUTE_SRC).not.toContain("getExportRows");
  });
});
