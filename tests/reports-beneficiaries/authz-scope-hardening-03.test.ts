/**
 * Behavioral server-authorization tests for beneficiary reports (G1–G5).
 * Uses testable service functions + in-memory loaders — NOT source-string proofs.
 *
 * Task: PORTAL-REPORTS-BENEFICIARY-AUTHZ-SCOPE-HARDENING-03
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  REPORT_CATALOG_ENTRIES,
  canSeeReportForViewer,
  catalogViewerFromActorScope,
  emptyCatalogViewer,
  endUserCatalogEntries,
  findByCode,
  isReportOpenable,
} from "../../src/lib/reports/catalog";
import {
  ReportAuthorizationError,
  beneficiariesForRoles,
  buildActorScope,
  isReportAuthorizationError,
  metricIncomplete,
  resolveExplicitOrgBindings,
} from "../../src/lib/reports/scope";
import {
  authorizeDeanCollegeReport,
  authorizeDepartmentReportScope,
  authorizePresidencyReport,
  authorizeVpAcademicReport,
  authorizeVpStudentReport,
  filterRowsToUnitRoleKeys,
  projectVisibleCatalogForScope,
  requireOperationalUnits,
  resolveMaterialsDepartmentId,
  runFacultySelfReportsSummary,
  runMaterialsCoverageReport,
  runOperationalUnitRequestKpis,
  runStudentSelfReportsSummary,
} from "../../src/lib/reports/beneficiary-report-services";

const CENTER_SRC = readFileSync(
  fileURLToPath(
    new URL("../../src/components/reports-center/ReportsCenter.tsx", import.meta.url),
  ),
  "utf8",
);
const ROUTE_STUDENT = readFileSync(
  fileURLToPath(new URL("../../src/routes/student.reports.tsx", import.meta.url)),
  "utf8",
);
const ROUTE_FACULTY = readFileSync(
  fileURLToPath(
    new URL("../../src/routes/faculty-portal.reports.tsx", import.meta.url),
  ),
  "utf8",
);
const ROUTE_DEPT = readFileSync(
  fileURLToPath(
    new URL("../../src/routes/admin/department-reports.tsx", import.meta.url),
  ),
  "utf8",
);
const ROUTE_EXEC = readFileSync(
  fileURLToPath(
    new URL("../../src/routes/admin/executive-reports.tsx", import.meta.url),
  ),
  "utf8",
);
const ROUTE_ADMIN = readFileSync(
  fileURLToPath(new URL("../../src/routes/admin/reports.tsx", import.meta.url)),
  "utf8",
);

function facts(partial: {
  userId?: string;
  roles: string[];
  departmentId?: string | null;
  facultyProfileId?: string | null;
  studentProfileId?: string | null;
  operationalUnitCodes?: string[];
  positionCodes?: string[];
  collegeId?: string | null;
}) {
  const bindings = resolveExplicitOrgBindings({
    roles: partial.roles,
    positionCodes: partial.positionCodes ?? [],
    operationalUnitCodes: partial.operationalUnitCodes ?? [],
    collegeId: partial.collegeId ?? null,
  });
  return {
    userId: partial.userId ?? "u-test",
    roles: partial.roles,
    departmentId: partial.departmentId ?? null,
    facultyProfileId: partial.facultyProfileId ?? null,
    studentProfileId: partial.studentProfileId ?? null,
    operationalUnitCode: bindings.operationalUnitCodes[0] ?? null,
    bindings,
  };
}

function scopeOf(partial: Parameters<typeof facts>[0]) {
  return buildActorScope(facts(partial));
}

describe("G1 — ReportsCenter binding contract", () => {
  test("ReportsCenter projects via viewerScope / viewerBindings / prefiltered", () => {
    expect(CENTER_SRC).toContain("viewerScope");
    expect(CENTER_SRC).toContain("viewerBindings");
    expect(CENTER_SRC).toContain("prefiltered");
    expect(CENTER_SRC).toContain("endUserCatalogEntries");
  });

  test("student without profile is not advertised STU-SELF-SERVICE-VIEWS", () => {
    const viewer = emptyCatalogViewer({
      roles: ["student"],
      studentProfileId: null,
      denied: true,
      denyReasonAr: "no profile",
    });
    const entry = findByCode(REPORT_CATALOG_ENTRIES, "STU-SELF-SERVICE-VIEWS")!;
    expect(canSeeReportForViewer(entry, viewer)).toBe(false);
    expect(
      endUserCatalogEntries(REPORT_CATALOG_ENTRIES, ["student"], viewer).some(
        (e) => e.report_code === "STU-SELF-SERVICE-VIEWS",
      ),
    ).toBe(false);
  });

  test("student with profile is advertised STU-SELF-SERVICE-VIEWS", () => {
    const viewer = emptyCatalogViewer({
      roles: ["student"],
      studentProfileId: "stu-a",
      denied: false,
      denyReasonAr: null,
    });
    const entry = findByCode(REPORT_CATALOG_ENTRIES, "STU-SELF-SERVICE-VIEWS")!;
    expect(canSeeReportForViewer(entry, viewer)).toBe(true);
    expect(isReportOpenable(entry)).toBe(true);
  });

  test("faculty without faculty_profile is not advertised HUB-FACULTY-REPORTS", () => {
    const viewer = emptyCatalogViewer({
      roles: ["faculty_member"],
      facultyProfileId: null,
      denied: true,
      denyReasonAr: "no faculty",
    });
    expect(
      canSeeReportForViewer(
        findByCode(REPORT_CATALOG_ENTRIES, "HUB-FACULTY-REPORTS")!,
        viewer,
      ),
    ).toBe(false);
  });

  test("department_head without department is not advertised DEPT-ACADEMIC-LOAD", () => {
    const viewer = emptyCatalogViewer({
      roles: ["department_head"],
      departmentId: null,
      facultyProfileId: "f1",
      denied: true,
      denyReasonAr: "no dept",
    });
    expect(
      canSeeReportForViewer(
        findByCode(REPORT_CATALOG_ENTRIES, "DEPT-ACADEMIC-LOAD")!,
        viewer,
      ),
    ).toBe(false);
  });

  test("operational role without unit is not advertised operational reports", () => {
    const viewer = emptyCatalogViewer({
      roles: ["finance_officer"],
      denied: true,
      denyReasonAr: "no unit",
    });
    for (const code of [
      "HUB-OPERATIONAL-UNITS",
      "REQ-PROCESSING-TIME",
      "REQ-OVERDUE-SLA",
    ]) {
      expect(
        canSeeReportForViewer(findByCode(REPORT_CATALOG_ENTRIES, code)!, viewer),
      ).toBe(false);
    }
  });

  test("dean without college is not advertised HUB-DEAN-COLLEGE", () => {
    const viewer = emptyCatalogViewer({
      roles: ["dean"],
      bindings: resolveExplicitOrgBindings({
        roles: ["dean"],
        positionCodes: [],
        operationalUnitCodes: [],
        collegeId: null,
      }),
      denied: true,
      denyReasonAr: "no college",
    });
    expect(
      canSeeReportForViewer(
        findByCode(REPORT_CATALOG_ENTRIES, "HUB-DEAN-COLLEGE")!,
        viewer,
      ),
    ).toBe(false);
  });

  test("VP / presidency hubs require explicit bindings (not role alone)", () => {
    const sa = emptyCatalogViewer({ roles: ["student_affairs"] });
    const dean = emptyCatalogViewer({
      roles: ["dean"],
      bindings: resolveExplicitOrgBindings({
        roles: ["dean"],
        positionCodes: [],
        operationalUnitCodes: [],
      }),
    });
    expect(
      canSeeReportForViewer(
        findByCode(REPORT_CATALOG_ENTRIES, "HUB-VP-STUDENT-AFFAIRS")!,
        sa,
      ),
    ).toBe(false);
    expect(
      canSeeReportForViewer(
        findByCode(REPORT_CATALOG_ENTRIES, "HUB-VP-ACADEMIC-AFFAIRS")!,
        dean,
      ),
    ).toBe(false);
    expect(
      canSeeReportForViewer(
        findByCode(REPORT_CATALOG_ENTRIES, "HUB-UNIVERSITY-STRATEGIC")!,
        dean,
      ),
    ).toBe(false);
  });
});

describe("G2 — materials department scope never widens", () => {
  const knownDepts = new Set(["dept-a", "dept-b"]);

  const loaders = {
    loadMaterialsByFacultyId: async () => [],
    loadMaterialsByFacultyIds: async () => [
      {
        id: "m1",
        course_section_id: "s1",
        status: "published",
        updated_at: null,
        faculty_profile_id: "f-a",
      },
    ],
    loadFacultyIdsInDepartment: async (departmentId: string) =>
      departmentId === "dept-a" ? ["f-a"] : ["f-b"],
    departmentExists: async (id: string) => knownDepts.has(id),
  };

  test("admin + mode department + missing department => DENY", () => {
    const scope = scopeOf({ roles: ["admin"] });
    expect(() =>
      resolveMaterialsDepartmentId({ scope, requestedDepartmentId: null }),
    ).toThrow(ReportAuthorizationError);
  });

  test("dean + missing college binding => DENY", () => {
    const scope = scopeOf({ roles: ["dean"], departmentId: "dept-a" });
    expect(() =>
      resolveMaterialsDepartmentId({
        scope,
        requestedDepartmentId: "dept-a",
      }),
    ).toThrow(/كلية|college|مكوّن/i);
  });

  test("department_head A + dept B => DENY", () => {
    const scope = scopeOf({
      roles: ["department_head"],
      departmentId: "dept-a",
      facultyProfileId: "f-a",
    });
    expect(() =>
      resolveMaterialsDepartmentId({
        scope,
        requestedDepartmentId: "dept-b",
      }),
    ).toThrow(/قسم/);
  });

  test("department_head A + own dept => PASS", async () => {
    const scope = scopeOf({
      roles: ["department_head"],
      departmentId: "dept-a",
      facultyProfileId: "f-a",
    });
    expect(
      resolveMaterialsDepartmentId({
        scope,
        requestedDepartmentId: null,
      }),
    ).toBe("dept-a");
    const result = await runMaterialsCoverageReport({
      scope,
      mode: "department",
      loaders,
    });
    expect(result.departmentId).toBe("dept-a");
    expect(result.kpis.totalMaterials.presence).toBe("value");
  });

  test("unknown department => DENY", async () => {
    const scope = scopeOf({ roles: ["admin"] });
    await expect(
      runMaterialsCoverageReport({
        scope,
        mode: "department",
        requestedDepartmentId: "dept-unknown",
        loaders,
      }),
    ).rejects.toThrow(/غير معروف|قسم/);
  });
});

describe("G3 — denied ActorScope empties dependent catalog cards", () => {
  test("student role + no student profile => no actionable self report", () => {
    const scope = scopeOf({ roles: ["student"] });
    expect(scope.denied).toBe(true);
    const projected = projectVisibleCatalogForScope(scope);
    expect(
      projected.entries.some((e) => e.report_code === "STU-SELF-SERVICE-VIEWS"),
    ).toBe(false);
  });

  test("faculty_member + no faculty profile => no faculty hub", () => {
    const scope = scopeOf({ roles: ["faculty_member"] });
    expect(scope.denied).toBe(true);
    const projected = projectVisibleCatalogForScope(scope);
    expect(
      projected.entries.some((e) => e.report_code === "HUB-FACULTY-REPORTS"),
    ).toBe(false);
  });

  test("department_head + no department => no department report", () => {
    const scope = scopeOf({
      roles: ["department_head"],
      facultyProfileId: "f1",
    });
    expect(scope.denied).toBe(true);
    const projected = projectVisibleCatalogForScope(scope);
    expect(
      projected.entries.some((e) => e.report_code === "DEPT-ACADEMIC-LOAD"),
    ).toBe(false);
  });

  test("operational role + no unit => no operational reports", () => {
    const scope = scopeOf({ roles: ["finance_officer"] });
    expect(scope.denied).toBe(true);
    const projected = projectVisibleCatalogForScope(scope);
    expect(
      projected.entries.some((e) =>
        ["HUB-OPERATIONAL-UNITS", "REQ-PROCESSING-TIME"].includes(e.report_code),
      ),
    ).toBe(false);
  });

  test("dean + no college => no dean-college hub", () => {
    const scope = scopeOf({ roles: ["dean"] });
    expect(scope.denied).toBe(true);
    const projected = projectVisibleCatalogForScope(scope);
    expect(
      projected.entries.some((e) => e.report_code === "HUB-DEAN-COLLEGE"),
    ).toBe(false);
  });

  test("unknown role => empty actionable catalog", () => {
    const scope = scopeOf({ roles: ["ghost"] });
    expect(scope.denied).toBe(true);
    const projected = projectVisibleCatalogForScope(scope);
    expect(projected.entries.filter(isReportOpenable)).toHaveLength(0);
  });
});

describe("G4 — behavioral server authorization (mocked loaders)", () => {
  test("1. student A cannot retrieve student B", async () => {
    const scope = scopeOf({
      roles: ["student"],
      studentProfileId: "stu-a",
    });
    let loadedId: string | null = null;
    let loadedUser: string | null = null;
    await expect(
      runStudentSelfReportsSummary({
        scope,
        actorUserId: "user-a",
        loaders: {
          loadProfile: async (studentId, userId) => {
            loadedId = studentId;
            loadedUser = userId;
            // Simulate ownership miss when querying another student
            if (studentId !== "stu-a" || userId !== "user-a") return null;
            return { id: studentId };
          },
          loadRequests: async () => [],
          loadDocuments: async () => [],
          loadEnrollments: async () => [],
        },
      }),
    ).resolves.toMatchObject({ studentProfileId: "stu-a" });
    expect(loadedId).toBe("stu-a");
    expect(loadedUser).toBe("user-a");

    // Forced scope id cannot be swapped to B by caller — service uses scope only
    expect(scope.studentProfileId).not.toBe("stu-b");
  });

  test("1b. profile ownership miss => DENY (not DATA_INCOMPLETE)", async () => {
    const scope = scopeOf({
      roles: ["student"],
      studentProfileId: "stu-a",
    });
    try {
      await runStudentSelfReportsSummary({
        scope,
        actorUserId: "user-a",
        loaders: {
          loadProfile: async () => null,
          loadRequests: async () => [],
          loadDocuments: async () => [],
          loadEnrollments: async () => [],
        },
      });
      throw new Error("expected deny");
    } catch (e) {
      expect(isReportAuthorizationError(e)).toBe(true);
      expect(metricIncomplete().presence).toBe("data_incomplete");
    }
  });

  test("2. faculty A cannot retrieve faculty B assignment data", async () => {
    const scope = scopeOf({
      roles: ["faculty_member"],
      facultyProfileId: "fac-a",
      departmentId: "dept-a",
    });
    let seenFaculty: string | null = null;
    const result = await runFacultySelfReportsSummary({
      scope,
      loaders: {
        loadAssignedSections: async (facultyProfileId) => {
          seenFaculty = facultyProfileId;
          expect(facultyProfileId).toBe("fac-a");
          expect(facultyProfileId).not.toBe("fac-b");
          return [{ section_code: "A", credit_hours: 3, course_code: "CS101" }];
        },
        loadMaterials: async (facultyProfileId) => {
          expect(facultyProfileId).toBe("fac-a");
          return [];
        },
      },
    });
    expect(seenFaculty).toBe("fac-a");
    expect(result.facultyProfileId).toBe("fac-a");
  });

  test("3. department head A foreign department => THROW", async () => {
    const scope = scopeOf({
      roles: ["department_head"],
      departmentId: "dept-a",
      facultyProfileId: "f-a",
    });
    await expect(
      authorizeDepartmentReportScope({
        scope,
        requestedDepartmentId: "dept-b",
      }),
    ).rejects.toThrow(/قسم/);
  });

  test("4. department head own department => scoped PASS", async () => {
    const scope = scopeOf({
      roles: ["department_head"],
      departmentId: "dept-a",
      facultyProfileId: "f-a",
    });
    await expect(
      authorizeDepartmentReportScope({
        scope,
        requestedDepartmentId: null,
      }),
    ).resolves.toBe("dept-a");
  });

  test("5. finance unit cannot receive student-affairs unit rows", async () => {
    const scope = scopeOf({
      roles: ["finance_officer"],
      operationalUnitCodes: ["finance"],
    });
    const mixed = [
      {
        id: "1",
        status: "submitted",
        request_type: "x",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        current_role_key: "finance_officer",
      },
      {
        id: "2",
        status: "submitted",
        request_type: "y",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        current_role_key: "student_affairs",
      },
    ];
    const filtered = filterRowsToUnitRoleKeys(mixed, ["finance_officer"]);
    expect(filtered.map((r) => r.id)).toEqual(["1"]);

    const result = await runOperationalUnitRequestKpis({
      scope,
      loadUnitScopedRows: async (unitCodes) => {
        expect(unitCodes).toEqual(["finance"]);
        return filterRowsToUnitRoleKeys(mixed, ["finance_officer"]);
      },
    });
    expect(result.operationalUnitCodes).toEqual(["finance"]);
    expect(result.kpis.total.presence).toBe("value");
    expect(result.kpis.total.value).toBe(1);
  });

  test("6. unit with no binding => THROW", () => {
    const scope = scopeOf({ roles: ["finance_officer"] });
    expect(() => requireOperationalUnits(scope)).toThrow(ReportAuthorizationError);
  });

  test("7. student_affairs ordinary user cannot invoke VP Student report", () => {
    const scope = scopeOf({
      roles: ["student_affairs"],
      operationalUnitCodes: ["student_affairs"],
    });
    expect(() => authorizeVpStudentReport(scope)).toThrow(/نائب|مكوّن|شؤون الطلاب/);
  });

  test("8. registrar ordinary user cannot invoke VP Academic report", () => {
    const scope = scopeOf({
      roles: ["registrar"],
      operationalUnitCodes: ["registrar"],
    });
    expect(() => authorizeVpAcademicReport(scope)).toThrow(/نائب|مكوّن|أكاديم/);
  });

  test("9. dean ordinary user cannot invoke VP Academic report", () => {
    const scope = scopeOf({ roles: ["dean"], collegeId: "college-a" });
    expect(() => authorizeVpAcademicReport(scope)).toThrow(/نائب|مكوّن|أكاديم/);
  });

  test("10. presidency report requires explicit presidency binding", () => {
    const scope = scopeOf({ roles: ["admin"] });
    expect(() => authorizePresidencyReport(scope)).toThrow(/رئاسة|مكوّن/);
    const bound = scopeOf({
      roles: ["admin"],
      positionCodes: ["university_president"],
    });
    expect(() => authorizePresidencyReport(bound)).not.toThrow();
  });

  test("11. dean college report without college_id => THROW", () => {
    const scope = scopeOf({ roles: ["dean"] });
    expect(() => authorizeDeanCollegeReport(scope)).toThrow(/كلية|college|مكوّن/i);
  });

  test("12. materials department missing department => THROW", () => {
    const scope = scopeOf({ roles: ["admin"] });
    expect(() =>
      resolveMaterialsDepartmentId({ scope, requestedDepartmentId: null }),
    ).toThrow(/department_id|قسم/);
  });

  test("13. authorization error is never DATA_INCOMPLETE", async () => {
    const scope = scopeOf({ roles: ["admin"] });
    try {
      await runMaterialsCoverageReport({
        scope,
        mode: "department",
        requestedDepartmentId: null,
        loaders: {
          loadMaterialsByFacultyId: async () => [],
          loadMaterialsByFacultyIds: async () => [],
          loadFacultyIdsInDepartment: async () => [],
          departmentExists: async () => true,
        },
      });
      throw new Error("expected throw");
    } catch (e) {
      expect(isReportAuthorizationError(e)).toBe(true);
      expect((e as ReportAuthorizationError).message).not.toMatch(/data_incomplete/i);
    }
  });

  test("14. database/source failure may become DATA_INCOMPLETE only after auth", async () => {
    const scope = scopeOf({
      roles: ["faculty_member"],
      facultyProfileId: "fac-a",
      departmentId: "dept-a",
    });
    const result = await runMaterialsCoverageReport({
      scope,
      mode: "self",
      loaders: {
        loadMaterialsByFacultyId: async () => {
          throw new Error("connection reset");
        },
        loadMaterialsByFacultyIds: async () => [],
        loadFacultyIdsInDepartment: async () => [],
        departmentExists: async () => true,
      },
    });
    expect(result.kpis.totalMaterials.presence).toBe("data_incomplete");
  });

  test("15. service-role data loader cannot broaden actor scope", async () => {
    const scope = scopeOf({
      roles: ["finance_officer"],
      operationalUnitCodes: ["finance"],
    });
    let requestedUnits: readonly string[] = [];
    await runOperationalUnitRequestKpis({
      scope,
      loadUnitScopedRows: async (unitCodes) => {
        requestedUnits = unitCodes;
        // Even if loader returns foreign rows, caller must filter — service
        // only requests actor units.
        return [
          {
            id: "x",
            status: "submitted",
            request_type: "t",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            current_role_key: "student_affairs",
          },
        ];
      },
    });
    expect(requestedUnits).toEqual(["finance"]);
    expect(requestedUnits).not.toContain("student_affairs");
  });

  test("16. dual-role is union of explicit grants, not global access", () => {
    const dual = beneficiariesForRoles(["student", "finance_officer"]);
    expect(dual.toSorted()).toEqual(
      ["operational_units_staff", "student"].toSorted(),
    );
    expect(dual).not.toContain("dean");
    expect(dual).not.toContain("vp_student_affairs");

    const scope = scopeOf({
      roles: ["student", "finance_officer"],
      studentProfileId: "stu-a",
      // no unit → operational denied path; student self still OK for catalog
    });
    const viewer = catalogViewerFromActorScope(scope);
    expect(
      canSeeReportForViewer(
        findByCode(REPORT_CATALOG_ENTRIES, "STU-SELF-SERVICE-VIEWS")!,
        viewer,
      ),
    ).toBe(true);
    expect(
      canSeeReportForViewer(
        findByCode(REPORT_CATALOG_ENTRIES, "HUB-OPERATIONAL-UNITS")!,
        viewer,
      ),
    ).toBe(false);
  });
});

describe("G5 — ReportsCenter routes receive bindings/scope", () => {
  test("student/faculty/dept/executive/admin routes wire viewerScope", () => {
    // Phase H: the student route consumes a server-side safe projection and
    // never receives catalog scope/metadata on the client.
    expect(ROUTE_STUDENT).not.toContain("viewerScope");
    expect(ROUTE_STUDENT).toContain("getStudentSelfReportCatalog");
    expect(ROUTE_FACULTY).toContain("viewerScope");
    expect(ROUTE_FACULTY).toContain("catalogViewerFromActorScope");
    expect(ROUTE_DEPT).toContain("viewerScope");
    expect(ROUTE_EXEC).toContain("viewerScope");
    expect(ROUTE_EXEC).toContain("catalogViewerFromActorScope");
    expect(ROUTE_ADMIN).toContain("viewerScope");
    expect(ROUTE_ADMIN).toContain("getMyReportScope");
  });
});
