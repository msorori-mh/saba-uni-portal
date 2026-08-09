/**
 * VP Academic Affairs — requires explicit university VP binding (not dean/registrar).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  REPORT_CATALOG_ENTRIES,
  canSeeReport,
  findByCode,
} from "../../src/lib/reports/catalog";
import { beneficiariesForRoles } from "../../src/lib/reports/scope";

const FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/beneficiary-reports.functions.ts", import.meta.url)),
  "utf8",
);
const ROUTE_SRC = readFileSync(
  fileURLToPath(new URL("../../src/routes/admin/executive-reports.tsx", import.meta.url)),
  "utf8",
);

const HUB = findByCode(REPORT_CATALOG_ENTRIES, "HUB-VP-ACADEMIC-AFFAIRS")!;

describe("vp academic affairs — fail-closed identity", () => {
  test("hub is BLOCKED; dean/registrar never become VP by role alone", () => {
    expect(HUB.status).toBe("BLOCKED");
    expect(canSeeReport(HUB, ["dean"])).toBe(false);
    expect(canSeeReport(HUB, ["registrar"])).toBe(false);
    expect(canSeeReport(HUB, ["admin"])).toBe(false);
    expect(beneficiariesForRoles(["dean"])).not.toContain("vp_academic_affairs");
    expect(beneficiariesForRoles(["registrar"])).not.toContain("vp_academic_affairs");
  });
});

describe("vp academic affairs — server contract", () => {
  test("server requires assertVpAcademicBinding", () => {
    expect(FUNCTIONS_SRC).toContain("getVpAcademicAffairsReportsSummary");
    expect(FUNCTIONS_SRC).toContain("assertVpAcademicBinding");
    expect(FUNCTIONS_SRC).not.toContain("VP_ACADEMIC_ROLES");
    expect(FUNCTIONS_SRC).toContain("excludedDomains");
  });

  test("executive reports route gates VP academic on binding flag", () => {
    expect(ROUTE_SRC).toContain("getVpAcademicAffairsReportsSummary");
    expect(ROUTE_SRC).toContain("vpAcademicAffairsBound");
  });
});
