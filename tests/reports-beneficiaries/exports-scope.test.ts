/**
 * Export audit + aggregate privacy contracts for beneficiary reports.
 * Source-contract style — no DB mocking.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const EXPORT_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/reports/export.ts", import.meta.url)),
  "utf8",
);
const FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/beneficiary-reports.functions.ts", import.meta.url)),
  "utf8",
);
const REQUEST_REPORTS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/reports/request-reports.ts", import.meta.url)),
  "utf8",
);
const FINANCE_REPORTS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/reports/finance-reports.ts", import.meta.url)),
  "utf8",
);
const STAFF_ACTIVITY_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/reports/staff-activity-reports.ts", import.meta.url)),
  "utf8",
);
const PROCESSING_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/reports/processing-time.ts", import.meta.url)),
  "utf8",
);

const PII_COLUMN_TOKENS = [
  "email",
  "phone",
  "national_id",
  "full_name",
  "academic_number",
  "student_profile_id",
  "birth_date",
  "address",
] as const;

describe("export utility audits exports", () => {
  test("export.ts audits csv/xlsx via logReportEvent with rowCount", () => {
    expect(EXPORT_SRC).toContain('action: "report_exported"');
    expect(EXPORT_SRC).toContain("logReportEvent");
    expect(EXPORT_SRC).toContain("rowCount: rows.length");
    expect(EXPORT_SRC).toContain("exportCsv");
    expect(EXPORT_SRC).toContain("exportXlsx");
  });
});

describe("aggregate builders do not invent PII columns", () => {
  test("request-reports facts exclude person identifiers by contract text + source", () => {
    expect(REQUEST_REPORTS_SRC).toContain("no request id, no student id, no");
    expect(REQUEST_REPORTS_SRC).toContain("export interface RequestFactRow");
    for (const token of PII_COLUMN_TOKENS) {
      expect(REQUEST_REPORTS_SRC).not.toContain(token);
    }
  });

  test("finance and staff-activity builders omit PII column tokens", () => {
    for (const token of ["email", "phone", "national_id", "academic_number"]) {
      expect(FINANCE_REPORTS_SRC).not.toContain(token);
      expect(STAFF_ACTIVITY_SRC).not.toContain(token);
    }
  });

  test("processing-time facts are anonymized status/type/age only", () => {
    expect(PROCESSING_SRC).toContain("export interface ProcessingTimeFact");
    expect(PROCESSING_SRC).toContain("requestType");
    expect(PROCESSING_SRC).toContain("ageDays");
    for (const token of ["email", "phone", "national_id", "full_name", "academic_number"]) {
      expect(PROCESSING_SRC).not.toContain(token);
    }
  });
});

describe("beneficiary server reports mark includesPii:false where applicable", () => {
  test("university strategic summary sets includesPii:false", () => {
    expect(FUNCTIONS_SRC).toContain("getUniversityStrategicReportsSummary");
    expect(FUNCTIONS_SRC).toContain("includesPii: false");
    expect(FUNCTIONS_SRC).toContain('exportMode: "aggregate_only"');
  });

  test("documents issued aggregate sets includesPii:false", () => {
    expect(FUNCTIONS_SRC).toContain("getDocumentsIssuedReport");
    const docsBlock = FUNCTIONS_SRC.slice(
      FUNCTIONS_SRC.indexOf("getDocumentsIssuedReport"),
      FUNCTIONS_SRC.indexOf("denyIfWrongScope"),
    );
    expect(docsBlock).toContain("includesPii: false");
    expect(docsBlock).toContain('select("id, document_type, status, issued_at")');
    for (const token of ["email", "phone", "national_id", "full_name", "academic_number"]) {
      expect(docsBlock).not.toContain(token);
    }
  });

  test("request processing-time report selects anonymized request fields only", () => {
    const procBlock = FUNCTIONS_SRC.slice(
      FUNCTIONS_SRC.indexOf("getRequestProcessingTimeReport"),
      FUNCTIONS_SRC.indexOf("getDocumentsIssuedReport"),
    );
    expect(procBlock).toContain('select("id, status, request_type, created_at, updated_at")');
    for (const token of ["email", "phone", "national_id", "full_name_ar", "academic_number"]) {
      expect(procBlock).not.toContain(token);
    }
  });
});
