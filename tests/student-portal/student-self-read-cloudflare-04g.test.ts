import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BENEFICIARY_REPORTS = readFileSync(
  fileURLToPath(
    new URL("../../src/lib/beneficiary-reports.functions.ts", import.meta.url),
  ),
  "utf8",
);
const REPORT_SCOPE = readFileSync(
  fileURLToPath(
    new URL("../../src/lib/reports/scope/resolve-scope.server.ts", import.meta.url),
  ),
  "utf8",
);
const STUDENT_AFFAIRS = readFileSync(
  fileURLToPath(
    new URL("../../src/lib/student-affairs.functions.ts", import.meta.url),
  ),
  "utf8",
);
const ACADEMIC_STATUS = readFileSync(
  fileURLToPath(
    new URL("../../src/lib/academic-status.functions.ts", import.meta.url),
  ),
  "utf8",
);

function sourceBlock(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("04G student portal self reads", () => {
  test("student report scope is resolved with the authenticated RLS client", () => {
    expect(REPORT_SCOPE).toContain("resolveStudentSelfReportActorScope");
    expect(REPORT_SCOPE).toContain('supabase.from("user_roles")');
    expect(REPORT_SCOPE).toContain('.from("user_role_assignments")');
    expect(REPORT_SCOPE).toContain('.from("student_profiles")');
    expect(REPORT_SCOPE).toContain("bindings: emptyOrgBindings()");
  });

  test("student summary and catalog blocks do not use the service-role client", () => {
    const summaryBlock = sourceBlock(
      BENEFICIARY_REPORTS,
      "export const getStudentSelfReportsSummary",
      "export const getStudentSelfReportCatalog",
    );
    const catalogBlock = sourceBlock(
      BENEFICIARY_REPORTS,
      "export const getStudentSelfReportCatalog",
      "/** Faculty self + assigned courses/groups only. */",
    );

    expect(summaryBlock).toContain("context.supabase");
    expect(summaryBlock).not.toContain("supabaseAdmin");
    expect(catalogBlock).toContain("context.supabase");
    expect(catalogBlock).not.toContain("supabaseAdmin");
  });

  test("student service eligibility resolves level through the authenticated client", () => {
    const levelBlock = sourceBlock(
      STUDENT_AFFAIRS,
      "async function currentStudentLevelNumber",
      "async function loadRequestType",
    );
    expect(levelBlock).toContain("SupabaseClient<Database>");
    expect(levelBlock).toContain('supabase\n    .from("student_profiles")');
    expect(levelBlock).toContain('.from("student_academic_status")');
    expect(levelBlock).not.toContain("supabaseAdmin");
    expect(STUDENT_AFFAIRS).toContain(
      "currentStudentLevelNumber(context.supabase, context.userId)",
    );
  });

  test("student academic progress uses the authenticated client for every self read", () => {
    const computeBlock = sourceBlock(
      ACADEMIC_STATUS,
      "async function computeStudentProgress",
      "/* ----------------------- exported server functions ----------------------- */",
    );
    const selfBlock = sourceBlock(
      ACADEMIC_STATUS,
      "export const getMyProgress",
      "export const searchStudents",
    );

    expect(computeBlock).toContain("supabase: SupabaseClient<Database>");
    expect(computeBlock).not.toContain("supabaseAdmin");
    expect(selfBlock).toContain("const { userId, supabase } = context");
    expect(selfBlock).toContain("computeStudentProgress(supabase,");
    expect(selfBlock).not.toContain("supabaseAdmin");
  });
});
