/**
 * Pure unit tests for report scope helpers + KPI builders.
 * Task: PORTAL-REPORTS-BY-BENEFICIARY-FULL-CLOSURE-01
 */

import { describe, expect, test } from "bun:test";

import {
  beneficiariesForRoles,
  beneficiaryMayAccessLevel,
  buildActorScope,
  enforceDepartmentFilter,
  hasAnyBeneficiary,
  levelsGrantedByRoles,
  metricNoData,
  metricValue,
  ROLE_TO_BENEFICIARIES,
} from "../../src/lib/reports/scope";
import { buildTeachingLoadKpis } from "../../src/lib/reports/teaching-load";
import { buildProcessingTimeKpis } from "../../src/lib/reports/processing-time";
import { buildMaterialsCoverageKpis } from "../../src/lib/reports/materials-coverage";

describe("beneficiariesForRoles (fail-closed + dual-role union)", () => {
  test("empty / unknown roles map to nothing", () => {
    expect(beneficiariesForRoles([])).toEqual([]);
    expect(beneficiariesForRoles(null)).toEqual([]);
    expect(beneficiariesForRoles(undefined)).toEqual([]);
    expect(beneficiariesForRoles(["unknown_role_xyz"])).toEqual([]);
  });

  test("known roles map to documented beneficiaries", () => {
    expect(beneficiariesForRoles(["student"])).toEqual(["student"]);
    expect(beneficiariesForRoles(["faculty_member"])).toEqual(["faculty_supervisor"]);
    expect(beneficiariesForRoles(["department_head"]).toSorted()).toEqual(
      ["dept_head_coordinator", "faculty_supervisor"].toSorted(),
    );
    expect(beneficiariesForRoles(["dean"]).toSorted()).toEqual(
      ["academic_affairs", "dean"].toSorted(),
    );
  });

  test("dual role yields the union of grants only (never universal bypass)", () => {
    const dual = beneficiariesForRoles(["student", "faculty_member"]).toSorted();
    expect(dual).toEqual(["faculty_supervisor", "student"]);
    expect(dual).not.toContain("dean");
    expect(dual).not.toContain("university_presidency_council");

    const staffDual = beneficiariesForRoles(["registrar", "student_affairs"]).toSorted();
    expect(staffDual).toContain("operational_units_staff");
    expect(staffDual).toContain("academic_affairs");
    expect(staffDual).toContain("vp_student_affairs");
    expect(staffDual).not.toContain("university_presidency_council");
  });

  test("hasAnyBeneficiary is fail-closed on empty sides", () => {
    expect(hasAnyBeneficiary([], ["student"])).toBe(false);
    expect(hasAnyBeneficiary(["student"], [])).toBe(false);
    expect(hasAnyBeneficiary(["student"], ["student"])).toBe(true);
    expect(hasAnyBeneficiary(["dean"], ["student"])).toBe(false);
  });

  test("ROLE_TO_BENEFICIARIES never grants universal bypass via a single role except admin family", () => {
    for (const [role, facets] of Object.entries(ROLE_TO_BENEFICIARIES)) {
      if (role === "admin" || role === "system_admin") continue;
      expect(facets.length).toBeLessThan(7);
      expect(facets).not.toContain("university_presidency_council");
    }
  });
});

describe("levelsGrantedByRoles + buildActorScope", () => {
  test("department_head is department-scoped; student is self", () => {
    expect(levelsGrantedByRoles(["department_head"])).toContain("department");
    expect(levelsGrantedByRoles(["student"])).toEqual(["self"]);
    expect(levelsGrantedByRoles(["dean"])).toEqual(["college"]);
    expect(levelsGrantedByRoles(["unknown"])).toEqual([]);
  });

  test("missing department id for department_head ⇒ denied", () => {
    const scope = buildActorScope({
      userId: "u1",
      roles: ["department_head"],
      departmentId: null,
      facultyProfileId: "f1",
      studentProfileId: null,
      operationalUnitCode: null,
    });
    expect(scope.denied).toBe(true);
    expect(scope.denyReasonAr).toContain("بلا قسم");
  });

  test("department_head with department id is allowed at department level", () => {
    const scope = buildActorScope({
      userId: "u1",
      roles: ["department_head"],
      departmentId: "dept-a",
      facultyProfileId: "f1",
      studentProfileId: null,
      operationalUnitCode: null,
    });
    expect(scope.denied).toBe(false);
    expect(scope.level).toBe("department");
    expect(scope.departmentId).toBe("dept-a");
  });

  test("unknown role ⇒ denied fail-closed", () => {
    const scope = buildActorScope({
      userId: "u1",
      roles: ["ghost_role"],
      departmentId: null,
      facultyProfileId: null,
      studentProfileId: null,
      operationalUnitCode: null,
    });
    expect(scope.denied).toBe(true);
    expect(scope.beneficiaries).toEqual([]);
  });
});

describe("enforceDepartmentFilter (wrong-scope deny)", () => {
  const deptScope = buildActorScope({
    userId: "u1",
    roles: ["department_head"],
    departmentId: "dept-a",
    facultyProfileId: "f1",
    studentProfileId: null,
    operationalUnitCode: null,
  });

  test("department_head cannot request another department", () => {
    const result = enforceDepartmentFilter({
      scope: deptScope,
      requestedDepartmentId: "dept-other",
    });
    expect(result.denied).toBe(true);
    expect(result.reasonAr).toContain("رئيس القسم لا يرى قسماً آخر");
    expect(result.departmentId).toBeNull();
  });

  test("department_head is forced to own department when request is null/own", () => {
    expect(
      enforceDepartmentFilter({ scope: deptScope, requestedDepartmentId: null }).departmentId,
    ).toBe("dept-a");
    expect(
      enforceDepartmentFilter({ scope: deptScope, requestedDepartmentId: "dept-a" }).denied,
    ).toBe(false);
  });

  test("dean may request any department filter", () => {
    const deanScope = buildActorScope({
      userId: "u2",
      roles: ["dean"],
      departmentId: null,
      facultyProfileId: null,
      studentProfileId: null,
      operationalUnitCode: null,
    });
    const result = enforceDepartmentFilter({
      scope: deanScope,
      requestedDepartmentId: "dept-other",
    });
    expect(result.denied).toBe(false);
    expect(result.departmentId).toBe("dept-other");
  });
});

describe("beneficiaryMayAccessLevel", () => {
  test("student only self; dean only college; presidency only strategic", () => {
    expect(beneficiaryMayAccessLevel("student", "self")).toBe(true);
    expect(beneficiaryMayAccessLevel("student", "department")).toBe(false);
    expect(beneficiaryMayAccessLevel("dean", "college")).toBe(true);
    expect(beneficiaryMayAccessLevel("dean", "university_strategic")).toBe(false);
    expect(beneficiaryMayAccessLevel("university_presidency_council", "university_strategic")).toBe(
      true,
    );
    expect(beneficiaryMayAccessLevel("faculty_supervisor", "assigned")).toBe(true);
    expect(beneficiaryMayAccessLevel("faculty_supervisor", "college")).toBe(false);
  });
});

describe("metric presence markers (no_data ≠ 0)", () => {
  test("metricValue(0) is distinct from metricNoData()", () => {
    const zero = metricValue(0);
    const missing = metricNoData("لا بيانات");
    expect(zero.presence).toBe("value");
    expect(zero.value).toBe(0);
    expect(missing.presence).toBe("no_data");
    expect(missing.value).toBeNull();
  });

  test("teaching-load empty ⇒ no_data (not zero) unless treatEmptyAsZero", () => {
    const empty = buildTeachingLoadKpis([]);
    expect(empty.assignedSections.presence).toBe("no_data");
    expect(empty.assignedSections.value).toBeNull();

    const zeroed = buildTeachingLoadKpis([], { treatEmptyAsZero: true });
    expect(zeroed.assignedSections.presence).toBe("value");
    expect(zeroed.assignedSections.value).toBe(0);
  });

  test("teaching-load counts assigned vs unassigned", () => {
    const kpis = buildTeachingLoadKpis([
      {
        facultyProfileId: "f1",
        facultyNameAr: "أ",
        departmentId: "d1",
        courseCode: "C1",
        sectionCode: "A",
        creditHours: 3,
        assigned: true,
      },
      {
        facultyProfileId: null,
        facultyNameAr: null,
        departmentId: "d1",
        courseCode: "C2",
        sectionCode: "B",
        creditHours: 2,
        assigned: false,
      },
    ]);
    expect(kpis.assignedSections.value).toBe(1);
    expect(kpis.unassignedSections.value).toBe(1);
    expect(kpis.totalCreditHours.value).toBe(3);
    expect(kpis.facultyWithLoad.value).toBe(1);
  });

  test("processing-time empty ⇒ no_data; partial ages ⇒ incomplete averages", () => {
    const empty = buildProcessingTimeKpis([]);
    expect(empty.total.presence).toBe("no_data");

    const partial = buildProcessingTimeKpis([
      { requestType: "x", status: "pending", ageDays: null, resolutionDays: null },
    ]);
    expect(partial.total.presence).toBe("value");
    expect(partial.total.value).toBe(1);
    expect(partial.avgResolutionDays.presence).toBe("data_incomplete");
    expect(partial.avgPendingAgeDays.presence).toBe("data_incomplete");
  });

  test("materials coverage empty ⇒ no_data; published/draft split on data", () => {
    expect(buildMaterialsCoverageKpis([]).totalMaterials.presence).toBe("no_data");
    const kpis = buildMaterialsCoverageKpis([
      {
        materialId: "m1",
        sectionId: "s1",
        courseCode: "C1",
        published: true,
        updatedAt: new Date().toISOString(),
        facultyProfileId: "f1",
      },
      {
        materialId: "m2",
        sectionId: "s1",
        courseCode: "C1",
        published: false,
        updatedAt: "2000-01-01T00:00:00.000Z",
        facultyProfileId: "f1",
      },
    ]);
    expect(kpis.totalMaterials.value).toBe(2);
    expect(kpis.published.value).toBe(1);
    expect(kpis.draft.value).toBe(1);
    expect(kpis.sectionsWithMaterials.value).toBe(1);
    expect(kpis.staleMaterials.value).toBe(1);
  });
});
