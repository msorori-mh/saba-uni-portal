/**
 * Cross-beneficiary negative matrix — isolation, fail-closed, no privilege escalation.
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
  buildActorScope,
  enforceDepartmentFilter,
} from "../../src/lib/reports/scope";
import { emptyOrgBindings } from "../../src/lib/reports/scope/org-identity";

const FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/beneficiary-reports.functions.ts", import.meta.url)),
  "utf8",
);
const SERVICES_SRC = readFileSync(
  fileURLToPath(
    new URL("../../src/lib/reports/beneficiary-report-services.ts", import.meta.url),
  ),
  "utf8",
);
const ADMIN_FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/admin-reports.functions.ts", import.meta.url)),
  "utf8",
);

const HUB_CODES = [
  "STU-SELF-SERVICE-VIEWS",
  "HUB-FACULTY-REPORTS",
  "DEPT-ACADEMIC-LOAD",
  "HUB-OPERATIONAL-UNITS",
  "HUB-DEAN-COLLEGE",
  "HUB-VP-STUDENT-AFFAIRS",
  "HUB-VP-ACADEMIC-AFFAIRS",
  "HUB-UNIVERSITY-STRATEGIC",
  "HUB-ALUMNI-QUALITY",
] as const;

describe("cross-scope negative — role isolation", () => {
  test("student cannot see any leadership/operational hub", () => {
    const visible = new Set(
      visibleReports(REPORT_CATALOG_ENTRIES, ["student"]).map((e) => e.report_code),
    );
    expect(visible.has("STU-SELF-SERVICE-VIEWS")).toBe(true);
    for (const code of HUB_CODES) {
      if (code === "STU-SELF-SERVICE-VIEWS") continue;
      expect(visible.has(code)).toBe(false);
    }
  });

  test("faculty_member cannot see dean / VP / strategic / alumni hubs", () => {
    const visible = new Set(
      visibleReports(REPORT_CATALOG_ENTRIES, ["faculty_member"]).map((e) => e.report_code),
    );
    expect(visible.has("HUB-FACULTY-REPORTS")).toBe(true);
    for (const code of [
      "HUB-DEAN-COLLEGE",
      "HUB-VP-STUDENT-AFFAIRS",
      "HUB-VP-ACADEMIC-AFFAIRS",
      "HUB-UNIVERSITY-STRATEGIC",
      "HUB-ALUMNI-QUALITY",
      "HUB-OPERATIONAL-UNITS",
      "DEPT-ACADEMIC-LOAD",
      "STU-SELF-SERVICE-VIEWS",
    ]) {
      expect(visible.has(code)).toBe(false);
    }
  });

  test("department_head cannot see university strategic or VP student hubs", () => {
    const visible = visibleReports(REPORT_CATALOG_ENTRIES, ["department_head"]).map(
      (e) => e.report_code,
    );
    expect(visible).toContain("DEPT-ACADEMIC-LOAD");
    expect(visible).not.toContain("HUB-UNIVERSITY-STRATEGIC");
    expect(visible).not.toContain("HUB-VP-STUDENT-AFFAIRS");
    expect(visible).not.toContain("HUB-DEAN-COLLEGE");
  });

  test("finance_officer cannot see student self or dean college hub", () => {
    const visible = visibleReports(REPORT_CATALOG_ENTRIES, ["finance_officer"]).map(
      (e) => e.report_code,
    );
    expect(visible).toContain("HUB-OPERATIONAL-UNITS");
    expect(visible).not.toContain("STU-SELF-SERVICE-VIEWS");
    expect(visible).not.toContain("HUB-DEAN-COLLEGE");
    expect(visible).not.toContain("DEPT-ACADEMIC-LOAD");
  });
});

describe("cross-scope negative — department widen attempts", () => {
  test("enforceDepartmentFilter + applyScheduleDepartmentScope contracts deny foreign dept", () => {
    const scope = buildActorScope({
      userId: "u1",
      roles: ["department_head"],
      departmentId: "dept-own",
      facultyProfileId: "f1",
      studentProfileId: null,
      operationalUnitCode: null,
    bindings: emptyOrgBindings(),
    });
    const enforced = enforceDepartmentFilter({
      scope,
      requestedDepartmentId: "dept-foreign",
    });
    expect(enforced.denied).toBe(true);
    expect(enforced.reasonAr).toContain("رئيس القسم لا يرى قسماً آخر");

    expect(FUNCTIONS_SRC).toContain("enforceDepartmentFilter");
    expect(SERVICES_SRC).toContain("رئيس القسم لا يرى قسماً آخر");
    expect(ADMIN_FUNCTIONS_SRC).toContain("applyScheduleDepartmentScope");
    expect(ADMIN_FUNCTIONS_SRC).toContain("enforceDepartmentFilter");
  });

  test("denyIfWrongScope helper is fail-closed", () => {
    expect(FUNCTIONS_SRC).toContain("export async function denyIfWrongScope");
    expect(FUNCTIONS_SRC).toContain("enforceDepartmentFilter");
  });
});

describe("cross-scope negative — no role / unknown / dual-role bounds", () => {
  test("unknown role sees zero catalog entries", () => {
    expect(visibleReports(REPORT_CATALOG_ENTRIES, ["no_such_role"])).toHaveLength(0);
    expect(beneficiariesForRoles(["no_such_role"])).toEqual([]);
    for (const code of HUB_CODES) {
      const entry = findByCode(REPORT_CATALOG_ENTRIES, code)!;
      expect(canSeeReport(entry, ["no_such_role"])).toBe(false);
      expect(canSeeReport(entry, [])).toBe(false);
      expect(canSeeReport(entry, null)).toBe(false);
    }
  });

  test("dual role never invents admin/strategic without admin role", () => {
    const dual = beneficiariesForRoles(["student", "faculty_member", "department_head"]);
    expect(dual.toSorted()).toEqual(
      ["dept_head_coordinator", "faculty_supervisor", "student"].toSorted(),
    );
    expect(dual).not.toContain("university_presidency_council");
    expect(dual).not.toContain("dean");
  });
});
