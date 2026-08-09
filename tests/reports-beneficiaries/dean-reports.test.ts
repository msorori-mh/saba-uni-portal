/**
 * Dean beneficiary — college binding required; no university-wide "college only".
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
  emptyOrgBindings,
  levelsGrantedByRoles,
} from "../../src/lib/reports/scope";

const FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/beneficiary-reports.functions.ts", import.meta.url)),
  "utf8",
);
const ROUTE_SRC = readFileSync(
  fileURLToPath(new URL("../../src/routes/admin/executive-reports.tsx", import.meta.url)),
  "utf8",
);

const HUB = findByCode(REPORT_CATALOG_ENTRIES, "HUB-DEAN-COLLEGE")!;

describe("dean — college binding fail-closed", () => {
  test("hub is BLOCKED without college_id dependency", () => {
    expect(HUB.status).toBe("BLOCKED");
    expect(HUB.blocker ?? "").toMatch(/college_id|كلية/);
    expect(beneficiariesForRoles(["dean"])).toContain("dean");
    expect(levelsGrantedByRoles(["dean"])).not.toContain("college");
  });

  test("role match alone is insufficient without collegeScopeConfigured", () => {
    expect(canSeeReport(HUB, ["dean"])).toBe(true);
    expect(
      canSeeReportWithBindings(HUB, ["dean"], emptyOrgBindings({ deanIdentityBound: true })),
    ).toBe(false);
    expect(
      canSeeReportWithBindings(
        HUB,
        ["dean"],
        emptyOrgBindings({
          deanIdentityBound: true,
          collegeScopeConfigured: true,
          collegeId: "college-a",
        }),
      ),
    ).toBe(true);
  });
});

describe("dean — server contract", () => {
  test("getDeanCollegeReportsSummary asserts college configuration", () => {
    expect(FUNCTIONS_SRC).toContain("getDeanCollegeReportsSummary");
    expect(FUNCTIONS_SRC).toContain("assertDeanCollegeConfigured");
    const deanBlock = FUNCTIONS_SRC.slice(
      FUNCTIONS_SRC.indexOf("getDeanCollegeReportsSummary"),
      FUNCTIONS_SRC.indexOf("getVpStudentAffairsReportsSummary"),
    );
    for (const token of ["email", "phone", "national_id", "academic_number"]) {
      expect(deanBlock).not.toContain(token);
    }
  });

  test("executive reports route gates dean view on collegeScopeConfigured", () => {
    expect(ROUTE_SRC).toContain("getDeanCollegeReportsSummary");
    expect(ROUTE_SRC).toContain("collegeScopeConfigured");
  });
});
