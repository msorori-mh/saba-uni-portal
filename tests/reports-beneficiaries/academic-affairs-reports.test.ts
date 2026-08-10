/**
 * Academic affairs — registrar/admin operational path; VP hub is separate & BLOCKED.
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
import {
  beneficiariesForRoles,
  beneficiaryMayAccessLevel,
  buildActorScope,
  emptyOrgBindings,
  enforceDepartmentFilter,
} from "../../src/lib/reports/scope";
import { buildTeachingLoadKpis } from "../../src/lib/reports/teaching-load";

const FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/beneficiary-reports.functions.ts", import.meta.url)),
  "utf8",
);
const ROUTE_SRC = readFileSync(
  fileURLToPath(new URL("../../src/routes/admin/executive-reports.tsx", import.meta.url)),
  "utf8",
);

const VP_HUB = findByCode(REPORT_CATALOG_ENTRIES, "HUB-VP-ACADEMIC-AFFAIRS")!;
const ACADEMIC = findByCode(REPORT_CATALOG_ENTRIES, "ADM-ACADEMIC-STRUCTURE")!;

describe("academic affairs — catalog", () => {
  test("VP academic hub is BLOCKED; ADM academic structure remains for registrar", () => {
    expect(VP_HUB.status).toBe("BLOCKED");
    expect(canSeeReport(VP_HUB, ["registrar"])).toBe(false);
    expect(canSeeReport(ACADEMIC, ["registrar"])).toBe(true);
    expect(beneficiariesForRoles(["registrar"])).toContain("academic_affairs");
    expect(beneficiariesForRoles(["dean"])).toContain("academic_affairs");
  });
});

describe("academic affairs — department isolation", () => {
  test("department_head academic path uses department mode", () => {
    expect(FUNCTIONS_SRC).toContain("getAcademicAffairsReportsSummary");
    expect(FUNCTIONS_SRC).toContain('mode: "department"');
    expect(beneficiaryMayAccessLevel("academic_affairs", "department")).toBe(true);
  });

  test("department_head cannot widen department", () => {
    const scope = buildActorScope({
      userId: "u1",
      roles: ["department_head"],
      departmentId: "dept-a",
      facultyProfileId: "f1",
      studentProfileId: null,
      operationalUnitCode: null,
      bindings: emptyOrgBindings(),
    });
    expect(
      enforceDepartmentFilter({ scope, requestedDepartmentId: "dept-b" }).denied,
    ).toBe(true);
  });
});

describe("academic affairs — dual role", () => {
  test("registrar + student sees academic structure and student self — not VP/strategic hubs", () => {
    const visible = visibleReports(REPORT_CATALOG_ENTRIES, ["registrar", "student"]).map(
      (e) => e.report_code,
    );
    expect(visible).toContain("ADM-ACADEMIC-STRUCTURE");
    expect(visible).toContain("STU-SELF-SERVICE-VIEWS");
    expect(visible).not.toContain("HUB-VP-ACADEMIC-AFFAIRS");
    expect(visible).not.toContain("HUB-UNIVERSITY-STRATEGIC");
    expect(visible).not.toContain("HUB-VP-STUDENT-AFFAIRS");
  });
});

describe("academic affairs — server + route", () => {
  test("getAcademicAffairsReportsSummary is wired", () => {
    expect(FUNCTIONS_SRC).toMatch(
      /export const getAcademicAffairsReportsSummary = createServerFn\(\{ method: "POST" \}\)\s*\n\s*\.middleware\(\[requireSupabaseAuth\]\)/,
    );
    expect(ROUTE_SRC).toContain("getAcademicAffairsReportsSummary");
    expect(buildTeachingLoadKpis([]).facultyWithLoad.presence).toBe("no_data");
  });
});
