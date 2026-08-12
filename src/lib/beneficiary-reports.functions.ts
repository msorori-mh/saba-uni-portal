/**
 * Beneficiary-scoped report summaries — server functions.
 *
 * Scope is resolved actor-side and enforced before any aggregate query.
 * No mock production data. Missing sources return metric presence markers.
 * Authorization/scope denials THROW — never coerced to DATA_INCOMPLETE.
 *
 * Pattern: createServerFn → auth → testable service → scoped loader.
 * Task: PORTAL-REPORTS-BENEFICIARY-AUTHZ-SCOPE-HARDENING-03
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  assertAnyRole,
  hasAnyRole,
  REPORTS_ROLES,
  EXEC_ROLES,
} from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  assertScopeAllowed,
  resolveReportActorScope,
} from "@/lib/reports/scope/resolve-scope.server";
import {
  denyAuthz,
  denyNotConfigured,
  denyScope,
  enforceDepartmentFilter,
  metricIncomplete,
  metricNoAccess,
  metricNoData,
  metricValue,
  ORG_BINDING_DEPENDENCIES,
  type ReportActorScope,
  type ScopedMetric,
} from "@/lib/reports/scope";
import { loadProcessingRoleKeysForUnits } from "@/lib/reports/scope/org-identity.server";
import { buildTeachingLoadKpis } from "@/lib/reports/teaching-load";
import { buildProcessingTimeKpis } from "@/lib/reports/processing-time";
import { buildRequestsAggregateReport } from "@/lib/reports/request-reports";
import {
  assertDeanCollegeConfigured,
  assertPresidencyBinding,
  assertVpAcademicBinding,
  assertVpStudentBinding,
  authorizeDepartmentReportScope,
  projectVisibleCatalogForScope,
  requireOperationalUnits,
  runFacultySelfReportsSummary,
  runMaterialsCoverageReport,
  runStudentSelfReportsSummary,
} from "@/lib/reports/beneficiary-report-services";

const DEPT_REPORT_ROLES = [
  "system_admin",
  "admin",
  "dean",
  "department_head",
] as const;

const OPERATIONAL_ROLES = [
  "system_admin",
  "admin",
  "registrar",
  "student_affairs",
  "finance_officer",
] as const;

const ALUMNI_ROLES = ["system_admin", "admin", "dean", "registrar"] as const;

function isPrivilegedOperator(roles: readonly string[]): boolean {
  return roles.some((r) => r === "system_admin" || r === "admin");
}

async function loadUnitScopedRequestRows(unitCodes: readonly string[], limit = 1000) {
  const roleKeys = await loadProcessingRoleKeysForUnits(unitCodes);
  if (roleKeys.length === 0) {
    denyNotConfigured(
      `لا أدوار معالجة مكوّنة للوحدة [${unitCodes.join(", ")}] — يُرفض النطاق الجامعي`,
    );
  }

  const { data: reqRows, error } = await supabaseAdmin
    .from("student_requests")
    .select("id, status, request_type, created_at, updated_at, current_role_key")
    .in("current_role_key", roleKeys)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return reqRows ?? [];
}

function requestFactsFromRows(reqRows: readonly any[]) {
  const now = Date.now();
  return reqRows.map((r) => {
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
}

async function tableCount(
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply?: (q: any) => any,
): Promise<number | null> {
  try {
    let q = supabaseAdmin.from(table).select("id", { count: "exact", head: true });
    if (apply) q = apply(q);
    const { count, error } = await q;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

function countOrIncomplete(n: number | null, label?: string): ScopedMetric<number> {
  if (n === null) return metricIncomplete(label);
  return metricValue(n);
}

export const getMyReportScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return resolveReportActorScope(context.userId);
  });

export const getVisibleCatalogForViewer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await resolveReportActorScope(context.userId);
    const projected = projectVisibleCatalogForScope(scope);
    return {
      roles: projected.roles,
      bindings: projected.bindings,
      denied: projected.denied,
      entries: projected.entries.map((e) => ({
        report_code: e.report_code,
        name_ar: e.name_ar,
        description: e.description,
        status: e.status,
        route: e.route,
        beneficiaries: e.beneficiaries,
        sensitivity: e.sensitivity,
        output_types: e.output_types,
        data_scope: e.data_scope,
      })),
    };
  });

/** Student self hub — SELF ONLY. */
export const getStudentSelfReportsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await resolveReportActorScope(context.userId);
    const summary = await runStudentSelfReportsSummary({
      scope,
      actorUserId: context.userId,
      loaders: {
        loadProfile: async (studentId, userId) => {
          const { data, error } = await supabaseAdmin
            .from("student_profiles")
            .select(
              "id, academic_number, full_name_ar, status, program_id, department_id, study_system, department:departments(name_ar), program:programs(name_ar)",
            )
            .eq("id", studentId)
            .eq("user_id", userId)
            .maybeSingle();
          if (error) throw new Error(error.message);
          return data as Record<string, unknown> | null;
        },
        loadAcademicStatus: async (studentId) => {
          const { data } = await supabaseAdmin
            .from("student_academic_status")
            .select(
              "enrollment_status, level:academic_levels(name, level_number), academic_year:academic_years(name), semester:semesters(name)",
            )
            .eq("student_profile_id", studentId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          return data ?? null;
        },
        loadRequests: async (studentId) => {
          const { data } = await supabaseAdmin
            .from("student_requests")
            .select("id, status, request_type, current_step_name, updated_at, created_at")
            .eq("student_profile_id", studentId)
            .order("created_at", { ascending: false })
            .limit(50);
          return data ?? [];
        },
        loadDocuments: async (studentId) => {
          const { data } = await supabaseAdmin
            .from("official_documents")
            .select("id, document_type, status, issued_at")
            .eq("student_profile_id", studentId)
            .order("issued_at", { ascending: false })
            .limit(50);
          return data ?? [];
        },
        loadEnrollments: async (studentId) => {
          const { data } = await supabaseAdmin
            .from("student_enrollments")
            .select("id, enrollment_status")
            .eq("student_profile_id", studentId);
          return data ?? [];
        },
      },
    });

    const requests = await supabaseAdmin
      .from("student_requests")
      .select("id, status, request_type, current_step_name, updated_at, created_at")
      .eq("student_profile_id", summary.studentProfileId)
      .order("created_at", { ascending: false })
      .limit(10);
    const docs = await supabaseAdmin
      .from("official_documents")
      .select("id, document_type, status, issued_at")
      .eq("student_profile_id", summary.studentProfileId)
      .order("issued_at", { ascending: false })
      .limit(10);

    // مشروع التخرج: يُعرض فقط لطلاب المستوى الرابع الحاليين (نفس معيار حارس المسار).
    const gpStatuses = await supabaseAdmin
      .from("student_academic_status")
      .select("id, level_id, created_at, updated_at, level:academic_levels(level_number)")
      .eq("student_profile_id", summary.studentProfileId);
    const gpEligible = resolveCanonicalCurrentFourthLevelEligibility(
      (gpStatuses.data ?? []) as AcademicStatusTimestampRow[],
    ).eligible;

    return {
      ...summary,
      recentRequests: requests.data ?? [],
      recentDocuments: docs.data ?? [],
      links: [
        // «التقدم الأكاديمي» مخفي حالياً بناءً على طلب الإدارة.
        { to: "/student/study-plan", label: "الخطة الدراسية" },
        { to: "/student/schedule", label: "الجدول الأسبوعي" },
        { to: "/student/requests", label: "طلباتي" },
        { to: "/student/materials", label: "المواد التعليمية" },
        ...(gpEligible
          ? [{ to: "/student/graduation-projects", label: "مشروع التخرج" }]
          : []),
      ],
    };
  });


/** Faculty self + assigned courses/groups only. */
export const getFacultySelfReportsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await resolveReportActorScope(context.userId);
    const summary = await runFacultySelfReportsSummary({
      scope,
      loaders: {
        loadAssignedSections: async (facultyId) => {
          const { data: sections, error } = await supabaseAdmin
            .from("course_sections")
            .select(
              "id, section_code, status, faculty_profile_id, offering:course_offerings(course:courses(code, name_ar, credit_hours), department_id:programs(department_id))",
            )
            .eq("faculty_profile_id", facultyId)
            .eq("status", "active");
          if (error) throw new Error(error.message);
          return (sections ?? []).map((s: any) => ({
            section_code: s.section_code,
            credit_hours: s.offering?.course?.credit_hours ?? null,
            course_code: s.offering?.course?.code ?? null,
          }));
        },
        loadMaterials: async (facultyId) => {
          const { data: mats } = await (supabaseAdmin as any)
            .from("course_materials")
            .select("id, course_section_id, status, updated_at, faculty_profile_id")
            .eq("faculty_profile_id", facultyId)
            .limit(500);
          return mats ?? [];
        },
      },
    });

    return {
      ...summary,
      links: [
        { to: "/faculty-portal/schedule", label: "جدول التدريس" },
        { to: "/faculty-portal/materials", label: "المواد التعليمية" },
        { to: "/faculty-portal/graduation-projects", label: "مشاريع التخرج" },
        { to: "/faculty-portal/academic-councils", label: "المجالس الأكاديمية" },
      ],
    };
  });

async function loadDepartmentScopedCounts(departmentId: string) {
  const [students, faculty, programs, courses] = await Promise.all([
    tableCount("student_profiles", (q) => q.eq("department_id", departmentId)),
    tableCount("faculty_profiles", (q) => q.eq("department_id", departmentId).eq("status", "active")),
    tableCount("programs", (q) => q.eq("department_id", departmentId)),
    tableCount("courses", (q) => q.eq("department_id", departmentId)),
  ]);

  // Teaching load within department via offerings→courses.department_id
  const { data: offerings } = await supabaseAdmin
    .from("course_offerings")
    .select("id, course_id, courses(department_id, credit_hours, code)")
    .limit(5000);
  const deptOfferingIds = new Set(
    ((offerings ?? []) as any[])
      .filter((o) => o.courses?.department_id === departmentId)
      .map((o) => o.id),
  );
  const { data: sections } = await supabaseAdmin
    .from("course_sections")
    .select("id, course_offering_id, faculty_profile_id, section_code, status")
    .eq("status", "active")
    .limit(5000);
  const scopedSections = ((sections ?? []) as any[]).filter((s) =>
    deptOfferingIds.has(s.course_offering_id),
  );
  const assignmentRows = scopedSections.map((s) => {
    const offering = ((offerings ?? []) as any[]).find((o) => o.id === s.course_offering_id);
    return {
      facultyProfileId: s.faculty_profile_id,
      facultyNameAr: null,
      departmentId,
      courseCode: offering?.courses?.code ?? null,
      sectionCode: s.section_code,
      creditHours: offering?.courses?.credit_hours ?? null,
      assigned: Boolean(s.faculty_profile_id),
    };
  });
  const teachingLoad = buildTeachingLoadKpis(assignmentRows, {
    treatEmptyAsZero: true,
  });

  return {
    students: countOrIncomplete(students),
    faculty: countOrIncomplete(faculty),
    programs: countOrIncomplete(programs),
    courses: countOrIncomplete(courses),
    teachingLoad,
    unassignedSections: teachingLoad.unassignedSections,
  };
}

/** Department head dashboard — HARD: cannot see another department. */
export const getDepartmentReportsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ department_id: z.string().uuid().optional().nullable() })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(
      context.userId,
      DEPT_REPORT_ROLES,
      "ليس لديك صلاحية تقارير القسم",
    );
    const scope = await resolveReportActorScope(context.userId);
    const departmentId = await authorizeDepartmentReportScope({
      scope,
      requestedDepartmentId: data.department_id ?? null,
    });

    const { data: dept } = await supabaseAdmin
      .from("departments")
      .select("id, name_ar, code")
      .eq("id", departmentId)
      .maybeSingle();

    const counts = await loadDepartmentScopedCounts(departmentId);

    return {
      scopeLabelAr: `قسم: ${dept?.name_ar ?? departmentId}`,
      department: dept,
      departmentId,
      ...counts,
      weeklyIssues: [
        counts.teachingLoad.unassignedSections.presence === "value" &&
        (counts.teachingLoad.unassignedSections.value ?? 0) > 0
          ? {
              code: "unassigned_sections",
              label_ar: "المجموعات الدراسية غير المسندة تحتاج تدخلاً",
              count: counts.teachingLoad.unassignedSections.value,
            }
          : null,
      ].filter(Boolean),
      links: [
        { to: "/admin/reports?tab=schedules", label: "تقارير الجداول والإسناد" },
        { to: "/admin/course-offerings", label: "عروض المقررات" },
        { to: "/admin/schedules", label: "الجداول" },
      ],
    };
  });

/** Dean college dashboard — COLLEGE ONLY; requires configured college binding. */
export const getDeanCollegeReportsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(
      context.userId,
      ["system_admin", "admin", "dean"],
      "ليس لديك صلاحية تقارير الكلية",
    );
    const scope = await resolveReportActorScope(context.userId);
    // Fail-closed: current schema has no college_id. Never run university-wide
    // aggregates and label them "الكلية فقط".
    assertDeanCollegeConfigured(scope);
    // Unreachable until college binding exists — keeps return type stable.
    return {
      scopeLabelAr: `الكلية فقط (${scope.bindings.collegeId})`,
      collegeId: scope.bindings.collegeId,
      kpis: {
        students: metricNoAccess("college binding pending"),
        activeStudents: metricNoAccess("college binding pending"),
        faculty: metricNoAccess("college binding pending"),
        programs: metricNoAccess("college binding pending"),
        staff: metricNoAccess("college binding pending"),
        pendingRequests: metricNoAccess("college binding pending"),
        documentsToday: metricNoAccess("college binding pending"),
        activeSections: metricNoAccess("college binding pending"),
      },
      departmentComparison: [] as {
        departmentId: string;
        name_ar: string;
        students: number | null;
      }[],
      links: [
        { to: "/admin/reports", label: "مركز تقارير الكلية" },
        { to: "/admin/executive-dashboard", label: "لوحة المؤشرات التنفيذية" },
        { to: "/admin/department-reports", label: "تقارير الأقسام" },
      ],
    };
  });

/** VP Student Affairs — requires explicit university VP binding (not student_affairs). */
export const getVpStudentAffairsReportsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await resolveReportActorScope(context.userId);
    assertVpStudentBinding(scope);

    const [students, active, suspended, noProgram, pendingReq, issuedDocs] =
      await Promise.all([
        tableCount("student_profiles"),
        tableCount("student_profiles", (q) => q.eq("status", "active")),
        tableCount("student_profiles", (q) => q.eq("status", "suspended")),
        tableCount("student_profiles", (q) => q.is("program_id", null)),
        tableCount("student_requests", (q) =>
          q.in("status", ["submitted", "pending", "in_progress"]),
        ),
        tableCount("official_documents", (q) =>
          q.in("status", ["issued", "archived"]),
        ),
      ]);

    const { data: reqRows } = await supabaseAdmin
      .from("student_requests")
      .select("id, status, request_type, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(500);
    const processing = buildProcessingTimeKpis(requestFactsFromRows(reqRows ?? []), {
      treatEmptyAsZero: true,
    });

    return {
      scopeLabelAr: "نطاق جامعي — شؤون الطلاب فقط",
      kpis: {
        students: countOrIncomplete(students),
        activeStudents: countOrIncomplete(active),
        suspendedStudents: countOrIncomplete(suspended),
        studentsNoProgram: countOrIncomplete(noProgram),
        pendingRequests: countOrIncomplete(pendingReq),
        issuedDocuments: countOrIncomplete(issuedDocs),
      },
      processing,
      excludedDomains: ["teaching_load_detail", "faculty_evaluations", "grade_rosters"],
      links: [
        { to: "/admin/reports?tab=requests", label: "تقرير الطلبات" },
        { to: "/admin/reports?tab=students", label: "دليل الطلاب" },
        { to: "/admin/documents", label: "الوثائق الرسمية" },
      ],
    };
  });

/** VP Academic Affairs — requires explicit university VP binding (not dean/registrar). */
export const getVpAcademicAffairsReportsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await resolveReportActorScope(context.userId);
    assertVpAcademicBinding(scope);

    const [programs, plans, courses, sections, faculty] = await Promise.all([
      tableCount("programs"),
      tableCount("study_plans"),
      tableCount("courses"),
      tableCount("course_sections", (q) => q.eq("status", "active")),
      tableCount("faculty_profiles", (q) => q.eq("status", "active")),
    ]);

    const { data: sectionRows } = await supabaseAdmin
      .from("course_sections")
      .select("id, faculty_profile_id, status")
      .eq("status", "active")
      .limit(5000);
    const assignmentRows = ((sectionRows ?? []) as any[]).map((s) => ({
      facultyProfileId: s.faculty_profile_id,
      facultyNameAr: null,
      departmentId: null,
      courseCode: null,
      sectionCode: null,
      creditHours: null,
      assigned: Boolean(s.faculty_profile_id),
    }));
    const teachingLoad = buildTeachingLoadKpis(assignmentRows, {
      treatEmptyAsZero: true,
    });

    return {
      scopeLabelAr: "نطاق جامعي — الشؤون الأكاديمية فقط",
      kpis: {
        programs: countOrIncomplete(programs),
        studyPlans: countOrIncomplete(plans),
        courses: countOrIncomplete(courses),
        activeSections: countOrIncomplete(sections),
        faculty: countOrIncomplete(faculty),
      },
      teachingLoad,
      excludedDomains: ["student_request_pii", "finance_ledgers", "raw_student_directory"],
      links: [
        { to: "/admin/reports?tab=academic", label: "التقارير الأكاديمية" },
        { to: "/admin/reports?tab=schedules", label: "الجداول والإسناد" },
        { to: "/admin/academic-councils", label: "المجالس الأكاديمية" },
      ],
    };
  });

/** University presidency — requires explicit presidency/council binding. */
export const getUniversityStrategicReportsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await resolveReportActorScope(context.userId);
    assertPresidencyBinding(scope);

    const [students, faculty, programs, courses, plans, pendingReq] = await Promise.all([
      tableCount("student_profiles"),
      tableCount("faculty_profiles", (q) => q.eq("status", "active")),
      tableCount("programs"),
      tableCount("courses"),
      tableCount("study_plans"),
      tableCount("student_requests", (q) =>
        q.in("status", ["submitted", "pending", "in_progress"]),
      ),
    ]);

    const { data: depts } = await supabaseAdmin
      .from("departments")
      .select("id, name_ar")
      .limit(100);
    const collegeCompare = [];
    for (const d of depts ?? []) {
      const n = await tableCount("student_profiles", (q) => q.eq("department_id", d.id));
      const f = await tableCount("faculty_profiles", (q) =>
        q.eq("department_id", d.id).eq("status", "active"),
      );
      collegeCompare.push({
        unitId: d.id,
        name_ar: d.name_ar,
        students: n,
        faculty: f,
      });
    }

    return {
      scopeLabelAr: "مؤشرات استراتيجية مجمعة — بلا بيانات شخصية",
      kpis: {
        students: countOrIncomplete(students),
        faculty: countOrIncomplete(faculty),
        programs: countOrIncomplete(programs),
        courses: countOrIncomplete(courses),
        studyPlans: countOrIncomplete(plans),
        pendingStudentServices: countOrIncomplete(pendingReq),
      },
      unitComparison: collegeCompare,
      privacy: {
        includesPii: false,
        exportMode: "aggregate_only",
      },
      links: [
        { to: "/admin/executive-dashboard", label: "لوحة القيادة التنفيذية" },
        { to: "/admin/executive-reports", label: "التقارير والمؤشرات الاستراتيجية" },
      ],
    };
  });

/** Operational units — workload scoped to the actor's bound unit(s) only. */
export const getOperationalUnitReportsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(
      context.userId,
      OPERATIONAL_ROLES,
      "ليس لديك صلاحية تقارير الوحدات التشغيلية",
    );
    const scope = await resolveReportActorScope(context.userId);
    const unitCodes = requireOperationalUnits(scope);
    const reqRows = await loadUnitScopedRequestRows(unitCodes, 1000);
    const facts = requestFactsFromRows(reqRows);
    const processing = buildProcessingTimeKpis(facts, { treatEmptyAsZero: true });
    const aggregate = buildRequestsAggregateReport({
      beneficiary: "operational_units_staff",
      rows: facts.map((f) => ({
        requestType: f.requestType,
        status: f.status,
        ageDays: f.ageDays,
      })),
    });

    return {
      scopeLabelAr: `وحدة تشغيلية — ${unitCodes.join(", ")}`,
      operationalUnitCodes: unitCodes,
      processing,
      aggregateReportId: aggregate.reportId,
      aggregateKpis: aggregate.kpis,
      // Documents lack a reliable unit FK — do not invent university-wide counts.
      issuedDocuments: metricNoAccess(
        "تجميع الوثائق حسب الوحدة غير مكوّن — لا عمود وحدة على official_documents",
      ),
      links: [
        { to: "/admin/reports?tab=requests", label: "طلبات الطلاب" },
        { to: "/admin/student-requests", label: "صندوق الطلبات" },
        { to: "/admin/documents", label: "الوثائق" },
      ],
    };
  });

/** Academic affairs readiness aggregates. */
export const getAcademicAffairsReportsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(
      context.userId,
      ["system_admin", "admin", "dean", "registrar", "department_head"],
      "ليس لديك صلاحية تقارير الشؤون الأكاديمية",
    );

    const scope = await resolveReportActorScope(context.userId);
    const isDeptOnly =
      scope.roles.includes("department_head") &&
      !scope.roles.some((r) =>
        ["system_admin", "admin", "dean", "registrar"].includes(r),
      );

    if (isDeptOnly) {
      assertScopeAllowed(scope);
      if (!scope.departmentId) denyScope("نطاق القسم مفقود");
      const counts = await loadDepartmentScopedCounts(scope.departmentId);
      return {
        scopeLabelAr: "الشؤون الأكاديمية — نطاق القسم",
        mode: "department" as const,
        ...counts,
      };
    }

    // Dean without college binding must not receive university-wide academic dumps.
    if (
      scope.roles.includes("dean") &&
      !isPrivilegedOperator(scope.roles) &&
      !scope.bindings.collegeScopeConfigured &&
      !scope.roles.includes("registrar")
    ) {
      denyNotConfigured(
        `تقارير الشؤون الأكاديمية للكلية غير مكوّنة — ${ORG_BINDING_DEPENDENCIES.dean_college}`,
      );
    }

    // Registrar: operational academic view is allowed at admin reports level;
    // this hub stays aggregate for registrar/admin only (not VP).
    if (
      !isPrivilegedOperator(scope.roles) &&
      !scope.roles.includes("registrar") &&
      !scope.bindings.vpAcademicAffairsBound
    ) {
      denyAuthz("غير مصرح — الشؤون الأكاديمية تتطلب مسجّلاً أو ربط نائب أكاديمي صريح");
    }

    const [programs, plans, courses, sections, faculty] = await Promise.all([
      tableCount("programs"),
      tableCount("study_plans"),
      tableCount("courses"),
      tableCount("course_sections", (q) => q.eq("status", "active")),
      tableCount("faculty_profiles", (q) => q.eq("status", "active")),
    ]);

    const { data: sectionRows } = await supabaseAdmin
      .from("course_sections")
      .select("id, faculty_profile_id, status")
      .eq("status", "active")
      .limit(5000);
    const assignmentRows = ((sectionRows ?? []) as any[]).map((s) => ({
      facultyProfileId: s.faculty_profile_id,
      facultyNameAr: null,
      departmentId: null,
      courseCode: null,
      sectionCode: null,
      creditHours: null,
      assigned: Boolean(s.faculty_profile_id),
    }));
    const teachingLoad = buildTeachingLoadKpis(assignmentRows, {
      treatEmptyAsZero: true,
    });

    return {
      scopeLabelAr: "الشؤون الأكاديمية — نطاق تشغيلي للمسجّل/الإدارة",
      mode: "university" as const,
      kpis: {
        programs: countOrIncomplete(programs),
        studyPlans: countOrIncomplete(plans),
        courses: countOrIncomplete(courses),
        activeSections: countOrIncomplete(sections),
        faculty: countOrIncomplete(faculty),
      },
      teachingLoad,
    };
  });

/** Alumni/quality — only what live sources allow (candidates pipeline). */
export const getAlumniQualityReportsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(
      context.userId,
      ALUMNI_ROLES,
      "ليس لديك صلاحية تقارير الخريجين والجودة",
    );

    const pendingCandidates = await tableCount("student_requests", (q) =>
      q.eq("status", "submitted"),
    );

    return {
      scopeLabelAr: "شؤون الخريجين والجودة — المصادر المتاحة فقط",
      kpis: {
        pendingGraduationCandidates: countOrIncomplete(pendingCandidates),
        employmentAggregates: metricNoAccess(
          "يتطلب RPC توظيف الخريجين غير المطبّق + حزمة تفويض G4",
        ),
        surveyAggregates: metricNoAccess("تقارير الاستبيانات محجوبة — مسودة SQL/تفويض"),
        consentCompliance: metricIncomplete("لا تقرير امتثال موافقات منشأ بعد"),
      },
      links: [
        { to: "/admin/graduation-candidates", label: "مرشحو التخرج" },
      ],
      blockedFamilies: ["ALU-COHORT-EMPLOYMENT", "ALU-SURVEY-AGGREGATES"],
    };
  });

/** Materials coverage report — faculty self or academic roles with scope. */
export const getMaterialsCoverageReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        mode: z.enum(["self", "department", "college"]).default("self"),
        department_id: z.string().uuid().optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const scope = await resolveReportActorScope(context.userId);

    if (data.mode === "department") {
      await assertAnyRole(context.userId, DEPT_REPORT_ROLES, "غير مصرح");
    } else if (data.mode === "college") {
      await assertAnyRole(
        context.userId,
        ["system_admin", "admin", "dean", "registrar"],
        "غير مصرح",
      );
    }

    return runMaterialsCoverageReport({
      scope,
      mode: data.mode,
      requestedDepartmentId: data.department_id ?? null,
      loaders: {
        loadMaterialsByFacultyId: async (facultyId) => {
          const { data: mats, error } = await (supabaseAdmin as any)
            .from("course_materials")
            .select("id, course_section_id, status, updated_at, faculty_profile_id")
            .eq("faculty_profile_id", facultyId)
            .limit(2000);
          if (error) throw new Error(error.message);
          return mats ?? [];
        },
        loadMaterialsByFacultyIds: async (facultyIds) => {
          const { data: mats, error } = await (supabaseAdmin as any)
            .from("course_materials")
            .select("id, course_section_id, status, updated_at, faculty_profile_id")
            .in("faculty_profile_id", facultyIds)
            .limit(2000);
          if (error) throw new Error(error.message);
          return mats ?? [];
        },
        loadFacultyIdsInDepartment: async (departmentId) => {
          const { data: fac } = await supabaseAdmin
            .from("faculty_profiles")
            .select("id")
            .eq("department_id", departmentId);
          return (fac ?? []).map((f) => f.id);
        },
        departmentExists: async (departmentId) => {
          const { data: dept } = await supabaseAdmin
            .from("departments")
            .select("id")
            .eq("id", departmentId)
            .maybeSingle();
          return Boolean(dept?.id);
        },
        loadAllMaterialsInCollege: async () => {
          // College-wide load only after authorize path in service.
          const { data: mats, error } = await (supabaseAdmin as any)
            .from("course_materials")
            .select("id, course_section_id, status, updated_at, faculty_profile_id")
            .limit(2000);
          if (error) throw new Error(error.message);
          return mats ?? [];
        },
      },
    });
  });

/** Request processing-time report — unit-scoped for operational staff. */
export const getRequestProcessingTimeReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(
      context.userId,
      [...OPERATIONAL_ROLES, "dean"] as const,
      "ليس لديك صلاحية تقرير زمن المعالجة",
    );
    const scope = await resolveReportActorScope(context.userId);

    if (scope.roles.includes("dean") && !isPrivilegedOperator(scope.roles)) {
      if (!scope.bindings.collegeScopeConfigured) {
        denyNotConfigured(
          `تقرير زمن المعالجة للكلية غير مكوّن — ${ORG_BINDING_DEPENDENCIES.dean_college}`,
        );
      }
    }

    const unitCodes = scope.bindings.operationalUnitCodes;
    if (!isPrivilegedOperator(scope.roles) && unitCodes.length === 0) {
      if (!scope.roles.includes("dean")) {
        denyNotConfigured(
          `ربط الوحدة التشغيلية مفقود — ${ORG_BINDING_DEPENDENCIES.operational_unit}`,
        );
      }
    }

    let reqRows: any[];
    if (unitCodes.length > 0) {
      reqRows = await loadUnitScopedRequestRows(unitCodes, 2000);
    } else if (isPrivilegedOperator(scope.roles)) {
      denyNotConfigured(
        "تقارير زمن المعالجة للمشغّل تتطلب وحدة صريحة — لا نطاق جامعي صامت",
      );
    } else {
      denyNotConfigured(ORG_BINDING_DEPENDENCIES.operational_unit);
    }

    return {
      scopeLabelAr: `اختصاص الطلبات — وحدات: ${unitCodes.join(", ")}`,
      operationalUnitCodes: unitCodes,
      kpis: buildProcessingTimeKpis(requestFactsFromRows(reqRows), {
        treatEmptyAsZero: true,
      }),
    };
  });

/** Documents issued report — fail-closed without unit/document binding. */
export const getDocumentsIssuedReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(
      context.userId,
      [...OPERATIONAL_ROLES, "dean"] as const,
      "ليس لديك صلاحية تقرير الوثائق الصادرة",
    );
    const scope = await resolveReportActorScope(context.userId);
    const unitCodes = scope.bindings.operationalUnitCodes;

    if (!isPrivilegedOperator(scope.roles) && unitCodes.length === 0) {
      if (scope.roles.includes("dean") && !scope.bindings.collegeScopeConfigured) {
        denyNotConfigured(
          `تقرير الوثائق للكلية غير مكوّن — ${ORG_BINDING_DEPENDENCIES.dean_college}`,
        );
      }
      denyNotConfigured(
        `ربط الوحدة التشغيلية مفقود — ${ORG_BINDING_DEPENDENCIES.operational_unit}`,
      );
    }

    // official_documents has no processing_unit_id — do not return university-wide
    // counts under an operational-unit label.
    denyNotConfigured(
      "تجميع الوثائق حسب الوحدة غير مكوّن — لا عمود وحدة موثوق على official_documents",
    );
  });

/** Negative auth helper for tests / diagnostics — never grants access. */
export async function denyIfWrongScope(
  scope: ReportActorScope,
  expectedDepartmentId: string,
): Promise<void> {
  const enforced = enforceDepartmentFilter({
    scope,
    requestedDepartmentId: expectedDepartmentId,
  });
  if (enforced.denied) {
    throw new Error(enforced.reasonAr ?? "نطاق مرفوض");
  }
}

// Silence unused import warnings for hasAnyRole in some builds
void hasAnyRole;
void REPORTS_ROLES;
void EXEC_ROLES;
void metricNoData;
