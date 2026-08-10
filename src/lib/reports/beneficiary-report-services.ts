/**
 * Testable authorization + loaders for beneficiary reports.
 * createServerFn wrappers call these with live DB adapters; tests inject mocks.
 *
 * Task: PORTAL-REPORTS-BENEFICIARY-AUTHZ-SCOPE-HARDENING-03
 */

import {
  denyAuthz,
  denyNotConfigured,
  denyScope,
  enforceDepartmentFilter,
  metricIncomplete,
  metricNoAccess,
  metricValue,
  rethrowIfAuthorizationDenial,
  ORG_BINDING_DEPENDENCIES,
  type ReportActorScope,
  type ScopedMetric,
} from "@/lib/reports/scope";
import {
  endUserCatalogEntries,
  catalogViewerFromActorScope,
  REPORT_CATALOG_ENTRIES,
  type ReportEntry,
} from "@/lib/reports/catalog";
import { buildMaterialsCoverageKpis } from "@/lib/reports/materials-coverage";
import { buildTeachingLoadKpis } from "@/lib/reports/teaching-load";
import { buildProcessingTimeKpis } from "@/lib/reports/processing-time";

function isPrivilegedOperator(roles: readonly string[]): boolean {
  return roles.some((r) => r === "system_admin" || r === "admin");
}

function isDeptHeadOnly(roles: readonly string[]): boolean {
  return (
    roles.includes("department_head") &&
    !isPrivilegedOperator(roles) &&
    !roles.includes("dean") &&
    !roles.includes("registrar")
  );
}

export function assertVpStudentBinding(scope: ReportActorScope): void {
  if (!scope.bindings.vpStudentAffairsBound) {
    denyNotConfigured(
      `مركز نائب شؤون الطلاب غير مكوّن — ${ORG_BINDING_DEPENDENCIES.vp_student_affairs}`,
    );
  }
}

export function assertVpAcademicBinding(scope: ReportActorScope): void {
  if (!scope.bindings.vpAcademicAffairsBound) {
    denyNotConfigured(
      `مركز نائب الشؤون الأكاديمية غير مكوّن — ${ORG_BINDING_DEPENDENCIES.vp_academic_affairs}`,
    );
  }
}

export function assertPresidencyBinding(scope: ReportActorScope): void {
  if (!scope.bindings.universityPresidencyBound) {
    denyNotConfigured(
      `مركز رئاسة/مجلس الجامعة غير مكوّن — ${ORG_BINDING_DEPENDENCIES.university_presidency_council}`,
    );
  }
}

export function assertDeanCollegeConfigured(scope: ReportActorScope): void {
  if (!scope.bindings.deanIdentityBound && !isPrivilegedOperator(scope.roles)) {
    denyAuthz("ليس لديك صلاحية تقارير الكلية — هوية العميد غير مثبتة");
  }
  if (!scope.bindings.collegeScopeConfigured) {
    denyNotConfigured(
      `تقارير كلية العميد غير مكوّنة — ${ORG_BINDING_DEPENDENCIES.dean_college}`,
    );
  }
}

export function requireOperationalUnits(scope: ReportActorScope): string[] {
  const units = [...scope.bindings.operationalUnitCodes];
  if (units.length > 0) return units;
  if (isPrivilegedOperator(scope.roles)) {
    denyNotConfigured(
      "يجب تحديد وحدة تشغيلية صريحة — لا توسيع تلقائي لنطاق جامعي لتقارير الوحدات",
    );
  }
  denyNotConfigured(
    `ربط الوحدة التشغيلية مفقود — ${ORG_BINDING_DEPENDENCIES.operational_unit}`,
  );
}

/**
 * Resolve department id for materials coverage mode=department.
 * NEVER returns null — missing filter ⇒ THROW (no university-wide query).
 */
export function resolveMaterialsDepartmentId(args: {
  readonly scope: ReportActorScope;
  readonly requestedDepartmentId?: string | null;
}): string {
  const { scope, requestedDepartmentId } = args;

  if (scope.denied && isDeptHeadOnly(scope.roles)) {
    denyScope(scope.denyReasonAr ?? "نطاق القسم مرفوض");
  }

  const isDeptOnly = isDeptHeadOnly(scope.roles);
  const isDeanOnly =
    scope.roles.includes("dean") && !isPrivilegedOperator(scope.roles);
  const isAdmin = isPrivilegedOperator(scope.roles);

  if (isDeptOnly) {
    if (!scope.departmentId) {
      denyScope("رئيس القسم بلا قسم مرتبط — يُرفض النطاق");
    }
    if (
      requestedDepartmentId &&
      requestedDepartmentId !== scope.departmentId
    ) {
      denyScope("رئيس القسم لا يرى قسماً آخر");
    }
    return scope.departmentId;
  }

  if (isDeanOnly) {
    // College binding unavailable ⇒ fail closed (cannot prove dept∈college).
    if (!scope.bindings.collegeScopeConfigured) {
      denyNotConfigured(
        `تغطية مواد القسم للعميد غير مكوّنة — ${ORG_BINDING_DEPENDENCIES.dean_college}`,
      );
    }
    const deptId = requestedDepartmentId ?? scope.departmentId;
    if (!deptId) {
      denyScope("يجب تحديد قسم ضمن كلية العميد");
    }
    return deptId;
  }

  if (isAdmin) {
    if (!requestedDepartmentId) {
      denyScope(
        "وضع القسم يتطلب department_id صريحاً للمشغّل — لا استعلام جامعي بلا فلتر",
      );
    }
    return requestedDepartmentId;
  }

  // Faculty with authorized department scope (dept from faculty profile).
  if (scope.roles.includes("faculty_member") && scope.departmentId) {
    if (
      requestedDepartmentId &&
      requestedDepartmentId !== scope.departmentId
    ) {
      denyScope("عضو هيئة التدريس لا يرى قسماً آخر");
    }
    return scope.departmentId;
  }

  denyAuthz("غير مصرح — وضع تغطية المواد على مستوى القسم");
}

/** Project end-user catalog for an already-resolved actor scope (G1/G3). */
export function projectVisibleCatalogForScope(
  scope: ReportActorScope,
  catalog: readonly ReportEntry[] = REPORT_CATALOG_ENTRIES,
): {
  readonly roles: readonly string[];
  readonly bindings: ReportActorScope["bindings"];
  readonly denied: boolean;
  readonly entries: ReportEntry[];
} {
  const viewer = catalogViewerFromActorScope(scope);
  const entries = endUserCatalogEntries(catalog, scope.roles, viewer);
  return {
    roles: scope.roles,
    bindings: scope.bindings,
    denied: scope.denied,
    entries,
  };
}

// ─── Student self ───────────────────────────────────────────────────────────

export type StudentSelfLoaders = {
  loadProfile: (
    studentId: string,
    userId: string,
  ) => Promise<Record<string, unknown> | null>;
  loadRequests: (studentId: string) => Promise<readonly { status: string }[]>;
  loadDocuments: (studentId: string) => Promise<readonly { status: string }[]>;
  loadEnrollments: (
    studentId: string,
  ) => Promise<readonly { enrollment_status: string }[]>;
  loadAcademicStatus?: (studentId: string) => Promise<unknown>;
};

/**
 * Student A cannot retrieve student B: studentId is forced from scope and
 * loaders must be queried with actor userId ownership.
 */
export async function runStudentSelfReportsSummary(args: {
  readonly scope: ReportActorScope;
  readonly actorUserId: string;
  readonly loaders: StudentSelfLoaders;
}) {
  const { scope, actorUserId, loaders } = args;
  if (!scope.roles.includes("student") && !scope.roles.includes("graduate")) {
    if (!scope.studentProfileId) {
      denyAuthz("غير مصرح — تقارير الطالب ذاتية فقط");
    }
  }
  if (!scope.studentProfileId) {
    denyAuthz("لا يوجد ملف طالب مرتبط");
  }
  const studentId = scope.studentProfileId;

  const [profile, requests, docs, enrollments, academicStatus] =
    await Promise.all([
      loaders.loadProfile(studentId, actorUserId),
      loaders.loadRequests(studentId),
      loaders.loadDocuments(studentId),
      loaders.loadEnrollments(studentId),
      loaders.loadAcademicStatus?.(studentId) ?? Promise.resolve(null),
    ]);

  if (!profile) {
    denyAuthz("غير مصرح — لا يمكن قراءة ملف طالب آخر");
  }

  const returnedStatuses = new Set([
    "returned",
    "returned_for_completion",
    "needs_correction",
    "resubmission_required",
  ]);
  const returnedForCompletion = requests.filter((r) =>
    returnedStatuses.has(r.status),
  ).length;

  return {
    scopeLabelAr: "ذاتي فقط",
    profile,
    academicStatus,
    studentProfileId: studentId,
    /** Proven action-required count — open requests alone are not attention. */
    returnedForCompletion,
    kpis: {
      activeEnrollments: metricValue(
        enrollments.filter(
          (e) =>
            e.enrollment_status === "enrolled" ||
            e.enrollment_status === "active",
        ).length,
      ),
      openRequests: metricValue(
        requests.filter((r) =>
          [
            "submitted",
            "pending",
            "in_progress",
            "under_review",
            "returned",
            "returned_for_completion",
            "needs_correction",
            "resubmission_required",
          ].includes(r.status),
        ).length,
      ),
      issuedDocuments: metricValue(
        docs.filter((d) => d.status === "issued" || d.status === "archived")
          .length,
      ),
    },
  };
}

// ─── Faculty self ───────────────────────────────────────────────────────────

export type FacultySelfLoaders = {
  loadAssignedSections: (
    facultyProfileId: string,
  ) => Promise<
    readonly {
      section_code: string | null;
      credit_hours: number | null;
      course_code: string | null;
    }[]
  >;
  loadMaterials: (
    facultyProfileId: string,
  ) => Promise<
    readonly {
      id: string;
      course_section_id: string;
      status: string;
      updated_at: string | null;
      faculty_profile_id: string;
    }[]
  >;
};

export async function runFacultySelfReportsSummary(args: {
  readonly scope: ReportActorScope;
  readonly loaders: FacultySelfLoaders;
}) {
  const { scope, loaders } = args;
  if (!scope.facultyProfileId) {
    denyAuthz("لا يوجد ملف هيئة تدريس مرتبط");
  }
  const facultyId = scope.facultyProfileId;

  const sections = await loaders.loadAssignedSections(facultyId);
  const rows = sections.map((s) => ({
    facultyProfileId: facultyId,
    facultyNameAr: null,
    departmentId: null,
    courseCode: s.course_code,
    sectionCode: s.section_code,
    creditHours: s.credit_hours,
    assigned: true,
  }));
  const teachingLoad = buildTeachingLoadKpis(rows, { treatEmptyAsZero: true });

  let materials;
  try {
    const mats = await loaders.loadMaterials(facultyId);
    materials = buildMaterialsCoverageKpis(
      mats.map((m) => ({
        materialId: m.id,
        sectionId: m.course_section_id,
        courseCode: null,
        published: m.status === "published",
        updatedAt: m.updated_at,
        facultyProfileId: m.faculty_profile_id,
      })),
      { treatEmptyAsZero: true },
    );
  } catch (e) {
    rethrowIfAuthorizationDenial(e);
    materials = {
      totalMaterials: metricIncomplete("مصدر المواد غير متاح"),
      published: metricIncomplete(),
      draft: metricIncomplete(),
      sectionsWithMaterials: metricIncomplete(),
      staleMaterials: metricIncomplete(),
    };
  }

  return {
    scopeLabelAr: "المقررات والمجموعات الدراسية المسندة فقط",
    facultyProfileId: facultyId,
    teachingLoad,
    materials,
    sectionCount: rows.length,
  };
}

// ─── Department summary ─────────────────────────────────────────────────────

export async function authorizeDepartmentReportScope(args: {
  readonly scope: ReportActorScope;
  readonly requestedDepartmentId?: string | null;
}): Promise<string> {
  const { scope, requestedDepartmentId } = args;
  const enforced = enforceDepartmentFilter({
    scope,
    requestedDepartmentId: requestedDepartmentId ?? null,
  });

  if (isDeptHeadOnly(scope.roles)) {
    if (scope.denied || !scope.departmentId) {
      denyScope(scope.denyReasonAr ?? "نطاق القسم مفقود");
    }
    if (
      requestedDepartmentId &&
      requestedDepartmentId !== scope.departmentId
    ) {
      denyScope("رئيس القسم لا يرى قسماً آخر");
    }
    return scope.departmentId;
  }

  if (isPrivilegedOperator(scope.roles) || scope.roles.includes("dean")) {
    if (scope.roles.includes("dean") && !isPrivilegedOperator(scope.roles)) {
      if (!scope.bindings.collegeScopeConfigured) {
        denyNotConfigured(
          `تقارير قسم العميد غير مكوّنة — ${ORG_BINDING_DEPENDENCIES.dean_college}`,
        );
      }
    }
    const deptId =
      enforced.departmentId ?? requestedDepartmentId ?? scope.departmentId;
    if (!deptId) {
      denyScope("يجب تحديد القسم — لا نطاق جامعي صامت");
    }
    return deptId;
  }

  if (enforced.denied || !enforced.departmentId) {
    denyScope(enforced.reasonAr ?? "نطاق القسم مفقود");
  }
  return enforced.departmentId;
}

// ─── Materials coverage ─────────────────────────────────────────────────────

export type MaterialsCoverageLoaders = {
  loadMaterialsByFacultyIds: (
    facultyProfileIds: readonly string[],
  ) => Promise<
    readonly {
      id: string;
      course_section_id: string;
      status: string;
      updated_at: string | null;
      faculty_profile_id: string;
    }[]
  >;
  loadMaterialsByFacultyId: (
    facultyProfileId: string,
  ) => Promise<
    readonly {
      id: string;
      course_section_id: string;
      status: string;
      updated_at: string | null;
      faculty_profile_id: string;
    }[]
  >;
  loadFacultyIdsInDepartment: (departmentId: string) => Promise<string[]>;
  departmentExists: (departmentId: string) => Promise<boolean>;
  /** College mode — only after college binding proven; admin may call. */
  loadAllMaterialsInCollege?: () => Promise<
    readonly {
      id: string;
      course_section_id: string;
      status: string;
      updated_at: string | null;
      faculty_profile_id: string;
    }[]
  >;
};

export async function runMaterialsCoverageReport(args: {
  readonly scope: ReportActorScope;
  readonly mode: "self" | "department" | "college";
  readonly requestedDepartmentId?: string | null;
  readonly loaders: MaterialsCoverageLoaders;
}) {
  const { scope, mode, requestedDepartmentId, loaders } = args;

  try {
    let mats: readonly {
      id: string;
      course_section_id: string;
      status: string;
      updated_at: string | null;
      faculty_profile_id: string;
    }[] = [];

    if (mode === "self") {
      if (!scope.facultyProfileId) denyAuthz("لا ملف هيئة تدريس");
      mats = await loaders.loadMaterialsByFacultyId(scope.facultyProfileId);
    } else if (mode === "department") {
      const departmentId = resolveMaterialsDepartmentId({
        scope,
        requestedDepartmentId,
      });
      const exists = await loaders.departmentExists(departmentId);
      if (!exists) {
        denyScope("قسم غير معروف");
      }
      const facultyIds = await loaders.loadFacultyIdsInDepartment(departmentId);
      if (facultyIds.length === 0) {
        return {
          kpis: buildMaterialsCoverageKpis([], { treatEmptyAsZero: true }),
          scopeLabelAr: "قسم",
          departmentId,
        };
      }
      mats = await loaders.loadMaterialsByFacultyIds(facultyIds);
      return {
        kpis: buildMaterialsCoverageKpis(
          mats.map((m) => ({
            materialId: m.id,
            sectionId: m.course_section_id,
            courseCode: null,
            published: m.status === "published",
            updatedAt: m.updated_at,
            facultyProfileId: m.faculty_profile_id,
          })),
          { treatEmptyAsZero: true },
        ),
        scopeLabelAr: "قسم",
        departmentId,
      };
    } else {
      if (
        scope.roles.includes("dean") &&
        !isPrivilegedOperator(scope.roles) &&
        !scope.bindings.collegeScopeConfigured
      ) {
        denyNotConfigured(
          `تغطية مواد الكلية غير مكوّنة — ${ORG_BINDING_DEPENDENCIES.dean_college}`,
        );
      }
      if (
        !isPrivilegedOperator(scope.roles) &&
        !scope.roles.includes("dean") &&
        !scope.roles.includes("registrar")
      ) {
        denyAuthz("غير مصرح");
      }
      if (!loaders.loadAllMaterialsInCollege) {
        denyNotConfigured("محمّل نطاق الكلية غير مكوّن");
      }
      mats = await loaders.loadAllMaterialsInCollege();
    }

    return {
      kpis: buildMaterialsCoverageKpis(
        mats.map((m) => ({
          materialId: m.id,
          sectionId: m.course_section_id,
          courseCode: null,
          published: m.status === "published",
          updatedAt: m.updated_at,
          facultyProfileId: m.faculty_profile_id,
        })),
        { treatEmptyAsZero: true },
      ),
      scopeLabelAr:
        mode === "self" ? "ذاتي" : mode === "department" ? "قسم" : "كلية",
    };
  } catch (e) {
    rethrowIfAuthorizationDenial(e);
    return {
      kpis: {
        totalMaterials: metricIncomplete((e as Error).message),
        published: metricIncomplete(),
        draft: metricIncomplete(),
        sectionsWithMaterials: metricIncomplete(),
        staleMaterials: metricIncomplete(),
      },
      scopeLabelAr: mode,
    };
  }
}

// ─── Operational unit rows ──────────────────────────────────────────────────

export type OperationalRequestRow = {
  readonly id: string;
  readonly status: string;
  readonly request_type: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly current_role_key: string | null;
};

/**
 * Unit-scoped request loader gate: service-role data must already be filtered
 * to the actor's unit codes — this function never broadens to university-wide.
 */
export async function runOperationalUnitRequestKpis(args: {
  readonly scope: ReportActorScope;
  readonly loadUnitScopedRows: (
    unitCodes: readonly string[],
  ) => Promise<readonly OperationalRequestRow[]>;
}) {
  const unitCodes = requireOperationalUnits(args.scope);
  const reqRows = await args.loadUnitScopedRows(unitCodes);

  const now = Date.now();
  const facts = reqRows.map((r) => {
    const created = Date.parse(r.created_at);
    const ageDays = Number.isNaN(created)
      ? null
      : Math.floor((now - created) / (24 * 60 * 60 * 1000));
    return {
      requestType: r.request_type ?? "unknown",
      status: r.status ?? "other",
      ageDays,
      resolutionDays: null as number | null,
    };
  });

  return {
    scopeLabelAr: `اختصاص الطلبات — وحدات: ${unitCodes.join(", ")}`,
    operationalUnitCodes: unitCodes,
    kpis: buildProcessingTimeKpis(facts, { treatEmptyAsZero: true }),
  };
}

/** Finance unit must not receive student_affairs-labelled rows. */
export function filterRowsToUnitRoleKeys(
  rows: readonly OperationalRequestRow[],
  allowedRoleKeys: readonly string[],
): OperationalRequestRow[] {
  const allowed = new Set(allowedRoleKeys);
  return rows.filter(
    (r) => r.current_role_key != null && allowed.has(r.current_role_key),
  );
}

// ─── Leadership / VP / dean entry points ────────────────────────────────────

export function authorizeVpStudentReport(scope: ReportActorScope): void {
  assertVpStudentBinding(scope);
}

export function authorizeVpAcademicReport(scope: ReportActorScope): void {
  assertVpAcademicBinding(scope);
}

export function authorizePresidencyReport(scope: ReportActorScope): void {
  assertPresidencyBinding(scope);
}

export function authorizeDeanCollegeReport(scope: ReportActorScope): void {
  assertDeanCollegeConfigured(scope);
}

export type { ScopedMetric };
void metricNoAccess;
