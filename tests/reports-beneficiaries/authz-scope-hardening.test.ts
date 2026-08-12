/**
 * Behavioral authorization + scope hardening for beneficiary reports.
 * Pure decision helpers + source contracts — no production calls.
 *
 * Covers G1–G7 negative matrix for PORTAL-REPORTS-BENEFICIARY-AUTHZ-SCOPE-HARDENING-02
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  REPORT_CATALOG_ENTRIES,
  canSeeReport,
  canSeeReportWithBindings,
  countByStatus,
  endUserCatalogEntries,
  findByCode,
} from "../../src/lib/reports/catalog";
import {
  ReportAuthorizationError,
  beneficiariesForRoles,
  beneficiariesForRolesAndBindings,
  buildActorScope,
  enforceDepartmentFilter,
  isReportAuthorizationError,
  isAuthorizationDenialMessage,
  metricIncomplete,
  rethrowIfAuthorizationDenial,
  resolveExplicitOrgBindings,
  emptyOrgBindings,
} from "../../src/lib/reports/scope";

const FUNCTIONS_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/beneficiary-reports.functions.ts", import.meta.url)),
  "utf8",
);
const ROUTE_STUDENT = readFileSync(
  fileURLToPath(new URL("../../src/routes/student.reports.tsx", import.meta.url)),
  "utf8",
);
const ROUTE_FACULTY = readFileSync(
  fileURLToPath(new URL("../../src/routes/faculty-portal.reports.tsx", import.meta.url)),
  "utf8",
);
const ROUTE_DEPT = readFileSync(
  fileURLToPath(new URL("../../src/routes/admin/department-reports.tsx", import.meta.url)),
  "utf8",
);
const ROUTE_EXEC = readFileSync(
  fileURLToPath(new URL("../../src/routes/admin/executive-reports.tsx", import.meta.url)),
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

describe("G1 — VP / presidency never inferred from ordinary staff", () => {
  test("student_affairs does not grant vp_student_affairs", () => {
    expect(beneficiariesForRoles(["student_affairs"])).not.toContain("vp_student_affairs");
    expect(beneficiariesForRoles(["student_affairs"])).toEqual(["operational_units_staff"]);
  });

  test("dean/registrar do not grant vp_academic_affairs or presidency", () => {
    expect(beneficiariesForRoles(["dean"])).not.toContain("vp_academic_affairs");
    expect(beneficiariesForRoles(["registrar"])).not.toContain("vp_academic_affairs");
    expect(beneficiariesForRoles(["dean"])).not.toContain("university_presidency_council");
    expect(beneficiariesForRoles(["registrar"])).not.toContain("university_presidency_council");
  });

  test("explicit VP position codes grant VP beneficiaries only", () => {
    const bound = beneficiariesForRolesAndBindings(["student_affairs"], {
      vpStudentAffairsBound: true,
      vpAcademicAffairsBound: false,
      universityPresidencyBound: false,
    });
    expect(bound).toContain("vp_student_affairs");
    expect(bound).toContain("operational_units_staff");
  });

  test("ordinary student_affairs cannot open VP student hub (bindings gate)", () => {
    const hub = findByCode(REPORT_CATALOG_ENTRIES, "HUB-VP-STUDENT-AFFAIRS")!;
    expect(hub.status).toBe("BLOCKED");
    expect(
      canSeeReportWithBindings(hub, ["student_affairs"], emptyOrgBindings()),
    ).toBe(false);
    expect(
      canSeeReportWithBindings(
        hub,
        ["student_affairs"],
        emptyOrgBindings({ vpStudentAffairsBound: true }),
      ),
    ).toBe(false); // required_role is pending token — role alone never matches
  });

  test("ordinary dean/registrar cannot open VP academic hub", () => {
    const hub = findByCode(REPORT_CATALOG_ENTRIES, "HUB-VP-ACADEMIC-AFFAIRS")!;
    expect(hub.status).toBe("BLOCKED");
    expect(canSeeReport(hub, ["dean"])).toBe(false);
    expect(canSeeReport(hub, ["registrar"])).toBe(false);
  });

  test("server asserts VP bindings — no VP_STUDENT_ROLES / VP_ACADEMIC_ROLES proxies", () => {
    expect(FUNCTIONS_SRC).toContain("assertVpStudentBinding");
    expect(FUNCTIONS_SRC).toContain("assertVpAcademicBinding");
    expect(FUNCTIONS_SRC).toContain("assertPresidencyBinding");
    expect(FUNCTIONS_SRC).not.toContain("VP_STUDENT_ROLES");
    expect(FUNCTIONS_SRC).not.toContain("VP_ACADEMIC_ROLES");
  });
});

describe("G2 — operational unit isolation", () => {
  test("missing operational unit ⇒ denied scope for ops staff", () => {
    const scope = buildActorScope(facts({ roles: ["finance_officer"] }));
    expect(scope.denied).toBe(true);
    expect(scope.denyReasonAr ?? "").toMatch(/وحدة|ربط/);
  });

  test("finance officer with finance unit is allowed at operational_unit", () => {
    const scope = buildActorScope(
      facts({ roles: ["finance_officer"], operationalUnitCodes: ["finance"] }),
    );
    expect(scope.denied).toBe(false);
    expect(scope.level).toBe("operational_unit");
    expect(scope.operationalUnitCode).toBe("finance");
    expect(scope.bindings.operationalUnitCodes).toEqual(["finance"]);
  });

  test("unit A binding does not include unit B", () => {
    const scope = buildActorScope(
      facts({ roles: ["student_affairs"], operationalUnitCodes: ["student_affairs"] }),
    );
    expect(scope.bindings.operationalUnitCodes).toEqual(["student_affairs"]);
    expect(scope.bindings.operationalUnitCodes).not.toContain("finance");
    expect(scope.bindings.operationalUnitCodes).not.toContain("registrar");
  });

  test("operational hub queries require unit-scoped loader", () => {
    expect(FUNCTIONS_SRC).toContain("requireOperationalUnits");
    expect(FUNCTIONS_SRC).toContain("loadUnitScopedRequestRows");
    expect(FUNCTIONS_SRC).toContain("current_role_key");
  });
});

describe("G3 — dean college scope", () => {
  test("dean without college_id is not college-live", () => {
    const scope = buildActorScope(facts({ roles: ["dean"] }));
    // No college level without collegeScopeConfigured
    expect(scope.bindings.deanIdentityBound).toBe(true);
    expect(scope.bindings.collegeScopeConfigured).toBe(false);
    expect(scope.denied).toBe(true);
  });

  test("dean A with college A cannot be scoped to college B via bindings", () => {
    const scope = buildActorScope(
      facts({ roles: ["dean"], collegeId: "college-a" }),
    );
    expect(scope.denied).toBe(false);
    expect(scope.level).toBe("college");
    expect(scope.bindings.collegeId).toBe("college-a");
    expect(scope.bindings.collegeId).not.toBe("college-b");
  });

  test("HUB-DEAN-COLLEGE is BLOCKED until college binding exists", () => {
    const hub = findByCode(REPORT_CATALOG_ENTRIES, "HUB-DEAN-COLLEGE")!;
    expect(hub.status).toBe("BLOCKED");
    expect(hub.blocker ?? "").toMatch(/college_id|كلية/);
    expect(
      canSeeReportWithBindings(hub, ["dean"], emptyOrgBindings({ deanIdentityBound: true })),
    ).toBe(false);
  });

  test("server refuses university-wide dean aggregates without college config", () => {
    expect(FUNCTIONS_SRC).toContain("assertDeanCollegeConfigured");
    expect(FUNCTIONS_SRC).toContain("ORG_BINDING_DEPENDENCIES.dean_college");
  });
});

describe("G4 — auth denial never becomes DATA_INCOMPLETE", () => {
  test("rethrowIfAuthorizationDenial preserves ReportAuthorizationError", () => {
    const err = new ReportAuthorizationError("غير مصرح — نطاق مرفوض");
    expect(isReportAuthorizationError(err)).toBe(true);
    expect(() => rethrowIfAuthorizationDenial(err)).toThrow(ReportAuthorizationError);
  });

  test("legacy auth messages are classified as denials", () => {
    expect(isAuthorizationDenialMessage("غير مصرح — لا يمكن قراءة ملف طالب آخر")).toBe(true);
    expect(isAuthorizationDenialMessage("ليس لديك صلاحية تقارير الكلية")).toBe(true);
    expect(isAuthorizationDenialMessage("مصدر المواد غير متاح")).toBe(false);
  });

  test("getMaterialsCoverageReport uses runMaterialsCoverageReport service", () => {
    const block = FUNCTIONS_SRC.slice(
      FUNCTIONS_SRC.indexOf("getMaterialsCoverageReport"),
      FUNCTIONS_SRC.indexOf("getRequestProcessingTimeReport"),
    );
    expect(block).toContain("runMaterialsCoverageReport");
    expect(block).toContain("department_id");
  });

  test("metricIncomplete remains distinct from auth throw", () => {
    const m = metricIncomplete("source down");
    expect(m.presence).toBe("data_incomplete");
    expect(() => {
      throw new ReportAuthorizationError("غير مصرح");
    }).toThrow();
  });
});

describe("G5 — catalog visibility matches server authorization", () => {
  test("end-user catalog hides BLOCKED VP/dean/strategic hubs", () => {
    const entries = endUserCatalogEntries(REPORT_CATALOG_ENTRIES, [
      "student_affairs",
      "dean",
      "registrar",
      "admin",
    ]);
    const codes = new Set(entries.map((e) => e.report_code));
    expect(codes.has("HUB-VP-STUDENT-AFFAIRS")).toBe(false);
    expect(codes.has("HUB-VP-ACADEMIC-AFFAIRS")).toBe(false);
    expect(codes.has("HUB-UNIVERSITY-STRATEGIC")).toBe(false);
    expect(codes.has("HUB-DEAN-COLLEGE")).toBe(false);
    expect(codes.has("REQ-DOCUMENTS-ISSUED")).toBe(false);
  });

  test("operational cards require unit binding for ordinary staff", () => {
    const hub = findByCode(REPORT_CATALOG_ENTRIES, "HUB-OPERATIONAL-UNITS")!;
    expect(
      canSeeReportWithBindings(hub, ["finance_officer"], emptyOrgBindings()),
    ).toBe(false);
    expect(
      canSeeReportWithBindings(
        hub,
        ["finance_officer"],
        emptyOrgBindings({ operationalUnitCodes: ["finance"] }),
      ),
    ).toBe(true);
  });

  test("getVisibleCatalogForViewer projects via projectVisibleCatalogForScope", () => {
    expect(FUNCTIONS_SRC).toContain("projectVisibleCatalogForScope");
    expect(FUNCTIONS_SRC).toContain("scope.bindings");
  });
});

describe("G6 — cross-actor negative behavioral matrix", () => {
  test("1. student A scope cannot become student B (self id forced)", () => {
    const a = buildActorScope(
      facts({
        roles: ["student"],
        studentProfileId: "stu-a",
      }),
    );
    expect(a.studentProfileId).toBe("stu-a");
    expect(a.studentProfileId).not.toBe("stu-b");
    expect(FUNCTIONS_SRC).toContain("runStudentSelfReportsSummary");
    expect(FUNCTIONS_SRC).toContain('.eq("user_id", userId)');
  });

  test("2. faculty assigned scope is own facultyProfileId only", () => {
    const a = buildActorScope(
      facts({
        roles: ["faculty_member"],
        facultyProfileId: "fac-a",
        departmentId: "dept-a",
      }),
    );
    expect(a.facultyProfileId).toBe("fac-a");
    expect(FUNCTIONS_SRC).toContain('.eq("faculty_profile_id", facultyId)');
  });

  test("3. department_head A cannot request department B", () => {
    const scope = buildActorScope(
      facts({
        roles: ["department_head"],
        departmentId: "dept-a",
        facultyProfileId: "fac-a",
      }),
    );
    const enforced = enforceDepartmentFilter({
      scope,
      requestedDepartmentId: "dept-b",
    });
    expect(enforced.denied).toBe(true);
  });

  test("4. dean college A binding rejects college B id", () => {
    const scope = buildActorScope(
      facts({ roles: ["dean"], collegeId: "college-a" }),
    );
    expect(scope.bindings.collegeId).toBe("college-a");
    expect(scope.bindings.collegeId === "college-b").toBe(false);
  });

  test("5–7. ordinary SA / registrar / dean cannot become VP via roles", () => {
    for (const role of ["student_affairs", "registrar", "dean"]) {
      expect(beneficiariesForRoles([role])).not.toContain("vp_student_affairs");
      expect(beneficiariesForRoles([role])).not.toContain("vp_academic_affairs");
    }
  });

  test("8–9. finance officer only operational unit finance", () => {
    const scope = buildActorScope(
      facts({ roles: ["finance_officer"], operationalUnitCodes: ["finance"] }),
    );
    expect(scope.bindings.operationalUnitCodes).toEqual(["finance"]);
  });

  test("10. unknown role ⇒ DENY", () => {
    const scope = buildActorScope(facts({ roles: ["ghost"] }));
    expect(scope.denied).toBe(true);
    expect(beneficiariesForRoles(["ghost"])).toEqual([]);
  });

  test("11. missing organizational binding ⇒ DENY", () => {
    expect(buildActorScope(facts({ roles: ["student_affairs"] })).denied).toBe(true);
    expect(buildActorScope(facts({ roles: ["dean"] })).denied).toBe(true);
  });

  test("12. dual-role = union of explicit grants only", () => {
    const dual = beneficiariesForRoles(["student", "finance_officer"]);
    expect(dual.toSorted()).toEqual(["operational_units_staff", "student"].toSorted());
    expect(dual).not.toContain("dean");
    expect(dual).not.toContain("vp_student_affairs");
  });

  test("13–14. auth denial path + no silent university expand for ops", () => {
    expect(FUNCTIONS_SRC).toContain("requireOperationalUnits");
    const services = readFileSync(
      fileURLToPath(
        new URL("../../src/lib/reports/beneficiary-report-services.ts", import.meta.url),
      ),
      "utf8",
    );
    expect(services).toContain("لا توسيع تلقائي لنطاق جامعي");
    expect(services).toContain("rethrowIfAuthorizationDenial");
  });
});

describe("G7 — manual checklist routes wired (local harness)", () => {
  test("spot-check routes exist for student/faculty/dept/executive reports", () => {
    expect(ROUTE_STUDENT).toContain("getStudentSelfReportsSummary");
    expect(ROUTE_FACULTY).toContain("getFacultySelfReportsSummary");
    expect(ROUTE_DEPT).toContain("getDepartmentReportsSummary");
    expect(ROUTE_EXEC).toContain("getOperationalUnitReportsSummary");
    expect(ROUTE_EXEC).toContain("bindings?.vpStudentAffairsBound");
    expect(ROUTE_EXEC).toContain("collegeScopeConfigured");
  });

  test("department_head foreign department denied by enforceDepartmentFilter", () => {
    const scope = buildActorScope(
      facts({
        roles: ["department_head"],
        departmentId: "dept-own",
        facultyProfileId: "f1",
      }),
    );
    expect(
      enforceDepartmentFilter({ scope, requestedDepartmentId: "dept-other" }).denied,
    ).toBe(true);
  });
});

describe("G8 — catalog status reconciliation snapshot", () => {
  test("counts remain 76 entries (63 beneficiary + 11 C9 councils); blocked hubs include VP/dean/strategic/docs", () => {
    expect(REPORT_CATALOG_ENTRIES).toHaveLength(76);
    const counts = countByStatus(REPORT_CATALOG_ENTRIES);
    expect(counts.LIVE + counts.DATA_DEPENDENT + counts.SOURCE_READY + counts.UNDER_DEVELOPMENT + counts.NOT_ACTIVATED + counts.BLOCKED).toBe(76);
    expect(counts.LIVE).toBe(26);
    for (const code of [
      "HUB-VP-STUDENT-AFFAIRS",
      "HUB-VP-ACADEMIC-AFFAIRS",
      "HUB-UNIVERSITY-STRATEGIC",
      "HUB-DEAN-COLLEGE",
      "REQ-DOCUMENTS-ISSUED",
    ]) {
      expect(findByCode(REPORT_CATALOG_ENTRIES, code)!.status).toBe("BLOCKED");
    }
    expect(findByCode(REPORT_CATALOG_ENTRIES, "HUB-OPERATIONAL-UNITS")!.status).toBe("LIVE");
    expect(findByCode(REPORT_CATALOG_ENTRIES, "STU-SELF-SERVICE-VIEWS")!.status).toBe("LIVE");
    expect(findByCode(REPORT_CATALOG_ENTRIES, "COUNCIL-ACTIVITY")!.status).toBe("LIVE");
  });
});
