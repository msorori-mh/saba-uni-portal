/**
 * VP Student Affairs — requires explicit university VP binding (not student_affairs).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  REPORT_CATALOG_ENTRIES,
  canSeeReport,
  canSeeReportWithBindings,
  findByCode,
} from "../../src/lib/reports/catalog";
import {
  beneficiariesForRoles,
  beneficiariesForRolesAndBindings,
  emptyOrgBindings,
} from "../../src/lib/reports/scope";

const FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/beneficiary-reports.functions.ts", import.meta.url)),
  "utf8",
);
const ROUTE_SRC = readFileSync(
  fileURLToPath(new URL("../../src/routes/admin/executive-reports.tsx", import.meta.url)),
  "utf8",
);

const HUB = findByCode(REPORT_CATALOG_ENTRIES, "HUB-VP-STUDENT-AFFAIRS")!;

describe("vp student affairs — fail-closed identity", () => {
  test("hub is BLOCKED; ordinary student_affairs never matches required_role", () => {
    expect(HUB.status).toBe("BLOCKED");
    expect(HUB.blocker ?? "").toMatch(/نائب|student_affairs/);
    expect(canSeeReport(HUB, ["student_affairs"])).toBe(false);
    expect(canSeeReport(HUB, ["admin"])).toBe(false);
    expect(beneficiariesForRoles(["student_affairs"])).not.toContain("vp_student_affairs");
  });

  test("explicit binding grants beneficiary facet but catalog stays BLOCKED without position role token", () => {
    expect(
      beneficiariesForRolesAndBindings(["student_affairs"], {
        vpStudentAffairsBound: true,
        vpAcademicAffairsBound: false,
        universityPresidencyBound: false,
      }),
    ).toContain("vp_student_affairs");
    expect(
      canSeeReportWithBindings(
        HUB,
        ["student_affairs"],
        emptyOrgBindings({ vpStudentAffairsBound: true }),
      ),
    ).toBe(false);
  });
});

describe("vp student affairs — server contract", () => {
  test("server requires assertVpStudentBinding and excludes academic dumps", () => {
    expect(FUNCTIONS_SRC).toContain("getVpStudentAffairsReportsSummary");
    expect(FUNCTIONS_SRC).toContain("assertVpStudentBinding");
    expect(FUNCTIONS_SRC).toContain("excludedDomains");
    expect(FUNCTIONS_SRC).not.toContain("VP_STUDENT_ROLES");
  });

  test("executive reports route gates VP student on binding flag", () => {
    expect(ROUTE_SRC).toContain("getVpStudentAffairsReportsSummary");
    expect(ROUTE_SRC).toContain("vpStudentAffairsBound");
  });
});
