/**
 * University presidency / council — explicit binding only (not EXEC_ROLES).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  REPORT_CATALOG_ENTRIES,
  canSeeReport,
  findByCode,
} from "../../src/lib/reports/catalog";
import {
  beneficiariesForRoles,
  beneficiariesForRolesAndBindings,
  levelsGrantedByRoles,
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

const HUB = findByCode(REPORT_CATALOG_ENTRIES, "HUB-UNIVERSITY-STRATEGIC")!;
const EXEC = findByCode(REPORT_CATALOG_ENTRIES, "EXEC-CORE-KPIS")!;

describe("university leadership — fail-closed identity", () => {
  test("strategic hub is BLOCKED; dean/registrar/admin roles do not match pending token", () => {
    expect(HUB.status).toBe("BLOCKED");
    expect(canSeeReport(HUB, ["admin"])).toBe(false);
    expect(canSeeReport(HUB, ["dean"])).toBe(false);
    expect(canSeeReport(HUB, ["registrar"])).toBe(false);
    expect(beneficiariesForRoles(["admin"])).not.toContain("university_presidency_council");
    expect(levelsGrantedByRoles(["admin"], emptyOrgBindings())).not.toContain(
      "university_strategic",
    );
  });

  test("explicit presidency binding grants facet", () => {
    expect(
      beneficiariesForRolesAndBindings(["admin"], {
        vpStudentAffairsBound: false,
        vpAcademicAffairsBound: false,
        universityPresidencyBound: true,
      }),
    ).toContain("university_presidency_council");
  });

  test("EXEC-CORE-KPIS remains separately gated (not this hub)", () => {
    expect(EXEC.route).toBe("/admin/executive-dashboard");
  });
});

describe("university leadership — server contract", () => {
  test("strategic summary requires assertPresidencyBinding", () => {
    expect(FUNCTIONS_SRC).toContain("getUniversityStrategicReportsSummary");
    expect(FUNCTIONS_SRC).toContain("assertPresidencyBinding");
    expect(FUNCTIONS_SRC).not.toContain("await assertExecRole(context.userId)");
    expect(FUNCTIONS_SRC).toContain("includesPii: false");
  });

  test("executive reports route gates strategic view on presidency binding", () => {
    expect(ROUTE_SRC).toContain("getUniversityStrategicReportsSummary");
    expect(ROUTE_SRC).toContain("universityPresidencyBound");
  });
});
