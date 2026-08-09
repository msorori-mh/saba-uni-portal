/**
 * Faculty supervisor beneficiary — assigned-scope teaching load + hub.
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
import { beneficiariesForRoles, buildActorScope } from "../../src/lib/reports/scope";
import { emptyOrgBindings } from "../../src/lib/reports/scope/org-identity";
import { buildTeachingLoadKpis } from "../../src/lib/reports/teaching-load";
import { buildMaterialsCoverageKpis } from "../../src/lib/reports/materials-coverage";

const FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/beneficiary-reports.functions.ts", import.meta.url)),
  "utf8",
);
const ROUTE_SRC = readFileSync(
  fileURLToPath(new URL("../../src/routes/faculty-portal.reports.tsx", import.meta.url)),
  "utf8",
);

const HUB = findByCode(REPORT_CATALOG_ENTRIES, "HUB-FACULTY-REPORTS")!;
const LOAD = findByCode(REPORT_CATALOG_ENTRIES, "FAC-TEACHING-LOAD")!;
const DENIED = ["student", "finance_officer", "hr_officer", "graduate"] as const;

describe("faculty reports — positive visibility", () => {
  test("hub + teaching-load catalog entries match faculty roles and assigned route", () => {
    expect(HUB.beneficiaries).toContain("faculty_supervisor");
    expect(HUB.required_role).toEqual(
      expect.arrayContaining(["faculty_member", "department_head"]),
    );
    expect(HUB.route).toBe("/faculty-portal/reports");
    expect(LOAD.required_role).toContain("faculty_member");
    expect(canSeeReport(HUB, ["faculty_member"])).toBe(true);
    expect(canSeeReport(LOAD, ["faculty_member"])).toBe(true);
  });

  test("department_head also sees faculty hub (dual beneficiary facet)", () => {
    expect(canSeeReport(HUB, ["department_head"])).toBe(true);
    expect(beneficiariesForRoles(["department_head"])).toContain("faculty_supervisor");
  });
});

describe("faculty reports — negative / fail-closed", () => {
  test("denied roles cannot see faculty hub", () => {
    for (const role of DENIED) {
      expect(canSeeReport(HUB, [role])).toBe(false);
    }
  });

  test("empty / unknown roles fail closed", () => {
    expect(canSeeReport(HUB, [])).toBe(false);
    expect(canSeeReport(HUB, ["unknown_role_xyz"])).toBe(false);
  });
});

describe("faculty reports — wrong scope (assigned only)", () => {
  test("faculty without profile is denied by buildActorScope", () => {
    const scope = buildActorScope({
      userId: "u1",
      roles: ["faculty_member"],
      departmentId: null,
      facultyProfileId: null,
      studentProfileId: null,
      operationalUnitCode: null,
    bindings: emptyOrgBindings(),
    });
    expect(scope.denied).toBe(true);
  });

  test("server function filters course_sections by faculty_profile_id", () => {
    expect(FUNCTIONS_SRC).toContain("getFacultySelfReportsSummary");
    expect(FUNCTIONS_SRC).toContain('.eq("faculty_profile_id", facultyId)');
    expect(FUNCTIONS_SRC).toContain("المقررات والمجموعات المسندة فقط");
  });
});

describe("faculty reports — dual role union", () => {
  test("faculty + registrar sees faculty hub and operational hub, not student self", () => {
    const visible = visibleReports(REPORT_CATALOG_ENTRIES, [
      "faculty_member",
      "registrar",
    ]).map((e) => e.report_code);
    expect(visible).toContain("HUB-FACULTY-REPORTS");
    expect(visible).toContain("HUB-OPERATIONAL-UNITS");
    expect(visible).not.toContain("STU-SELF-SERVICE-VIEWS");
  });
});

describe("faculty reports — empty/partial metrics", () => {
  test("empty teaching load / materials ⇒ no_data", () => {
    expect(buildTeachingLoadKpis([]).assignedSections.presence).toBe("no_data");
    expect(buildMaterialsCoverageKpis([]).totalMaterials.presence).toBe("no_data");
  });

  test("treatEmptyAsZero yields value 0 after successful empty query", () => {
    expect(
      buildTeachingLoadKpis([], { treatEmptyAsZero: true }).assignedSections.value,
    ).toBe(0);
  });
});

describe("faculty reports — server function + route", () => {
  test("getFacultySelfReportsSummary uses createServerFn + requireSupabaseAuth", () => {
    expect(FUNCTIONS_SRC).toMatch(
      /export const getFacultySelfReportsSummary = createServerFn\(\{ method: "POST" \}\)\s*\n\s*\.middleware\(\[requireSupabaseAuth\]\)/,
    );
    expect(FUNCTIONS_SRC).toContain("assertAnyRole");
  });

  test("route exists at /faculty-portal/reports", () => {
    expect(ROUTE_SRC).toContain('createFileRoute("/faculty-portal/reports")');
    expect(ROUTE_SRC).toContain("getFacultySelfReportsSummary");
  });
});
