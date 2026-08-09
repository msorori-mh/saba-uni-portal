/**
 * Beneficiary-scoped report summaries — server functions.
 *
 * Scope is resolved actor-side and enforced before any aggregate query.
 * No mock production data. Missing sources return metric presence markers.
 *
 * Task: PORTAL-REPORTS-BY-BENEFICIARY-FULL-CLOSURE-01
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  assertAnyRole,
  assertExecRole,
  hasAnyRole,
  REPORTS_ROLES,
  EXEC_ROLES,
  userRoles,
} from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  assertScopeAllowed,
  resolveReportActorScope,
} from "@/lib/reports/scope/resolve-scope.server";
import {
  enforceDepartmentFilter,
  metricIncomplete,
  metricNoAccess,
  metricNoData,
  metricValue,
  type ReportActorScope,
  type ScopedMetric,
} from "@/lib/reports/scope";
import { buildTeachingLoadKpis } from "@/lib/reports/teaching-load";
import { buildProcessingTimeKpis } from "@/lib/reports/processing-time";
import { buildMaterialsCoverageKpis } from "@/lib/reports/materials-coverage";
import { buildRequestsAggregateReport } from "@/lib/reports/request-reports";
import { endUserCatalogEntries } from "@/lib/reports/catalog";
import { REPORT_CATALOG_ENTRIES } from "@/lib/reports/catalog/entries";

const DEPT_REPORT_ROLES = [
  "system_admin",
  "admin",
  "dean",
  "department_head",
] as const;

const VP_STUDENT_ROLES = [
  "system_admin",
  "admin",
  "student_affairs",
] as const;

const VP_ACADEMIC_ROLES = [
  "system_admin",
  "admin",
  "dean",
  "registrar",
] as const;

const OPERATIONAL_ROLES = [
  "system_admin",
  "admin",
  "registrar",
  "student_affairs",
  "finance_officer",
] as const;

const ALUMNI_ROLES = ["system_admin", "admin", "dean", "registrar"] as const;

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
    const roles = await userRoles(context.userId);
    const entries = endUserCatalogEntries(REPORT_CATALOG_ENTRIES, roles);
    return {
      roles,
      entries: entries.map((e) => ({
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
    if (!scope.roles.includes("student") && !scope.roles.includes("graduate")) {
      // Students may only have student_profiles without user_roles.role=student
      // in some deployments — fall back to profile ownership.
      if (!scope.studentProfileId) {
        throw new Error("غير مصرح — تقارير الطالب ذاتية فقط");
      }
    }
    if (!scope.studentProfileId) {
      throw new Error("لا يوجد ملف طالب مرتبط");
    }
    const studentId = scope.studentProfileId;

    const [profileRes, statusRes, requestsRes, docsRes, enrollRes] = await Promise.all([
      supabaseAdmin
        .from("student_profiles")
        .select(
          "id, academic_number, full_name_ar, status, program_id, department_id, study_system, department:departments(name_ar), program:programs(name_ar)",
        )
        .eq("id", studentId)
        .eq("user_id", context.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("student_academic_status")
        .select(
          "enrollment_status, level:academic_levels(name, level_number), academic_year:academic_years(name), semester:semesters(name)",
        )
        .eq("student_profile_id", studentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("student_requests")
        .select("id, status, request_type, current_step_name, updated_at, created_at")
        .eq("student_profile_id", studentId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("official_documents")
        .select("id, document_type, status, issued_at")
        .eq("student_profile_id", studentId)
        .order("issued_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("student_enrollments")
        .select("id, enrollment_status")
        .eq("student_profile_id", studentId),
    ]);

    if (profileRes.error) throw new Error(profileRes.error.message);
    if (!profileRes.data) throw new Error("غير مصرح — لا يمكن قراءة ملف طالب آخر");

    const requests = requestsRes.data ?? [];
    const docs = docsRes.data ?? [];
    const enrollments = enrollRes.data ?? [];

    return {
      scopeLabelAr: "ذاتي فقط",
      profile: profileRes.data,
      academicStatus: statusRes.data ?? null,
      kpis: {
        activeEnrollments: metricValue(
          enrollments.filter((e) => e.enrollment_status === "enrolled" || e.enrollment_status === "active").length,
        ),
        openRequests: metricValue(
          requests.filter((r) =>
            ["submitted", "pending", "in_progress", "under_review", "returned"].includes(r.status),
          ).length,
        ),
        issuedDocuments: metricValue(
          docs.filter((d) => d.status === "issued" || d.status === "archived").length,
        ),
      },
      recentRequests: requests.slice(0, 10),
      recentDocuments: docs.slice(0, 10),
      links: [
        { to: "/student/progress", label: "التقدم الأكاديمي" },
        { to: "/student/study-plan", label: "الخطة الدراسية" },
        { to: "/student/schedule", label: "الجدول الأسبوعي" },
        { to: "/student/requests", label: "طلباتي" },
        { to: "/student/materials", label: "المواد التعليمية" },
        { to: "/student/graduation-projects", label: "مشروع التخرج" },
      ],
    };
  });

/** Faculty self + assigned courses/groups only. */
export const getFacultySelfReportsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await resolveReportActorScope(context.userId);
    if (!scope.facultyProfileId) {
      throw new Error("لا يوجد ملف هيئة تدريس مرتبط");
    }
    if (
      !scope.roles.some((r) =>
        ["faculty_member", "department_head", "dean", "admin", "system_admin"].includes(r),
      )
    ) {
      // Profile ownership is the hard gate.
    }

    const facultyId = scope.facultyProfileId;
    const { data: sections, error } = await supabaseAdmin
      .from("course_sections")
      .select(
        "id, section_code, status, faculty_profile_id, offering:course_offerings(course:courses(code, name_ar, credit_hours), department_id:programs(department_id))",
      )
      .eq("faculty_profile_id", facultyId)
      .eq("status", "active");
    if (error) throw new Error(error.message);

    const rows = (sections ?? []).map((s: any) => ({
      facultyProfileId: facultyId,
      facultyNameAr: null,
      departmentId: null,
      courseCode: s.offering?.course?.code ?? null,
      sectionCode: s.section_code,
      creditHours: s.offering?.course?.credit_hours ?? null,
      assigned: true,
    }));

    const load = buildTeachingLoadKpis(rows, { treatEmptyAsZero: true });

    let materialsKpis = null;
    try {
      const { data: mats } = await (supabaseAdmin as any)
        .from("course_materials")
        .select("id, course_section_id, status, updated_at, faculty_profile_id")
        .eq("faculty_profile_id", facultyId)
        .limit(500);
      materialsKpis = buildMaterialsCoverageKpis(
        (mats ?? []).map((m: any) => ({
          materialId: m.id,
          sectionId: m.course_section_id,
          courseCode: null,
          published: m.status === "published",
          updatedAt: m.updated_at,
          facultyProfileId: m.faculty_profile_id,
        })),
        { treatEmptyAsZero: true },
      );
    } catch {
      materialsKpis = {
        totalMaterials: metricIncomplete("مصدر المواد غير متاح"),
        published: metricIncomplete(),
        draft: metricIncomplete(),
        sectionsWithMaterials: metricIncomplete(),
        staleMaterials: metricIncomplete(),
      };
    }

    return {
      scopeLabelAr: "المقررات والمجموعات المسندة فقط",
      facultyProfileId: facultyId,
      teachingLoad: load,
      materials: materialsKpis,
      sectionCount: rows.length,
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
    const enforced = enforceDepartmentFilter({
      scope,
      requestedDepartmentId: data.department_id ?? null,
    });
    if (enforced.denied || !enforced.departmentId) {
      // Dean/admin without requested dept: require explicit department_id
      const isWide = scope.roles.some((r) =>
        ["system_admin", "admin", "dean"].includes(r),
      );
      if (isWide && data.department_id) {
        // allowed above via enforce when not dept-only
      } else if (isWide && !data.department_id && scope.departmentId) {
        // use own faculty dept if present
      } else if (!enforced.departmentId) {
        throw new Error(
          enforced.reasonAr ?? "يجب تحديد القسم — رئيس القسم لا يرى قسماً آخر",
        );
      }
    }

    let departmentId = enforced.departmentId;
    if (!departmentId) {
      throw new Error("نطاق القسم مفقود");
    }

    // Extra hard check for pure department_head
    const isDeptOnly =
      scope.roles.includes("department_head") &&
      !scope.roles.some((r) => ["system_admin", "admin", "dean"].includes(r));
    if (isDeptOnly && scope.departmentId && departmentId !== scope.departmentId) {
      throw new Error("رئيس القسم لا يرى قسماً آخر");
    }
    if (isDeptOnly) {
      assertScopeAllowed(scope);
      departmentId = scope.departmentId!;
    }

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
              label_ar: "مقررات/شعب غير مسندة تحتاج تدخلاً",
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

/** Dean college dashboard — COLLEGE ONLY aggregates (no raw PII lists). */
export const getDeanCollegeReportsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(
      context.userId,
      ["system_admin", "admin", "dean"],
      "ليس لديك صلاحية تقارير الكلية",
    );

    const [
      students,
      activeStudents,
      faculty,
      programs,
      staff,
      pendingRequests,
      docsToday,
      sections,
    ] = await Promise.all([
      tableCount("student_profiles"),
      tableCount("student_profiles", (q) => q.eq("status", "active")),
      tableCount("faculty_profiles", (q) => q.eq("status", "active")),
      tableCount("programs"),
      tableCount("staff_profiles"),
      tableCount("student_requests", (q) =>
        q.in("status", ["submitted", "pending", "in_progress", "under_review"]),
      ),
      tableCount("official_documents", (q) => {
        const t = new Date();
        t.setHours(0, 0, 0, 0);
        return q.gte("issued_at", t.toISOString());
      }),
      tableCount("course_sections", (q) => q.eq("status", "active")),
    ]);

    // Department comparison (counts only — no PII)
    const { data: depts } = await supabaseAdmin
      .from("departments")
      .select("id, name_ar")
      .limit(100);
    const deptCompare = [];
    for (const d of depts ?? []) {
      const n = await tableCount("student_profiles", (q) => q.eq("department_id", d.id));
      deptCompare.push({
        departmentId: d.id,
        name_ar: d.name_ar,
        students: n === null ? null : n,
      });
    }

    return {
      scopeLabelAr: "الكلية فقط",
      kpis: {
        students: countOrIncomplete(students),
        activeStudents: countOrIncomplete(activeStudents),
        faculty: countOrIncomplete(faculty),
        programs: countOrIncomplete(programs),
        staff: countOrIncomplete(staff),
        pendingRequests: countOrIncomplete(pendingRequests),
        documentsToday: countOrIncomplete(docsToday),
        activeSections: countOrIncomplete(sections),
      },
      departmentComparison: deptCompare,
      links: [
        { to: "/admin/reports", label: "مركز تقارير الكلية" },
        { to: "/admin/executive-dashboard", label: "لوحة المؤشرات التنفيذية" },
        { to: "/admin/department-reports", label: "تقارير الأقسام" },
      ],
    };
  });

/** VP Student Affairs — university student-affairs domain aggregates. */
export const getVpStudentAffairsReportsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(
      context.userId,
      VP_STUDENT_ROLES,
      "ليس لديك صلاحية تقارير شؤون الطلاب",
    );

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

    // Processing time from recent requests (anonymized)
    const { data: reqRows } = await supabaseAdmin
      .from("student_requests")
      .select("id, status, request_type, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(500);
    const now = Date.now();
    const facts = ((reqRows ?? []) as any[]).map((r) => {
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
    const processing = buildProcessingTimeKpis(facts, { treatEmptyAsZero: true });

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
      // Explicitly no academic-only sensitive dumps
      excludedDomains: ["teaching_load_detail", "faculty_evaluations", "grade_rosters"],
      links: [
        { to: "/admin/reports?tab=requests", label: "تقرير الطلبات" },
        { to: "/admin/reports?tab=students", label: "دليل الطلاب" },
        { to: "/admin/documents", label: "الوثائق الرسمية" },
      ],
    };
  });

/** VP Academic Affairs — university academic domain aggregates. */
export const getVpAcademicAffairsReportsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(
      context.userId,
      VP_ACADEMIC_ROLES,
      "ليس لديك صلاحية تقارير الشؤون الأكاديمية",
    );

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

/** University presidency — strategic aggregates only, no PII by default. */
export const getUniversityStrategicReportsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertExecRole(context.userId);

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

/** Operational units — requests/documents workload in unit domain. */
export const getOperationalUnitReportsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(
      context.userId,
      OPERATIONAL_ROLES,
      "ليس لديك صلاحية تقارير الوحدات التشغيلية",
    );

    const { data: reqRows } = await supabaseAdmin
      .from("student_requests")
      .select("id, status, request_type, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    const now = Date.now();
    const facts = ((reqRows ?? []) as any[]).map((r) => {
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
    const processing = buildProcessingTimeKpis(facts, { treatEmptyAsZero: true });
    const aggregate = buildRequestsAggregateReport({
      beneficiary: "operational_units_staff",
      rows: facts.map((f) => ({
        requestType: f.requestType,
        status: f.status,
        ageDays: f.ageDays,
      })),
    });

    const issuedDocs = await tableCount("official_documents", (q) =>
      q.in("status", ["issued", "archived"]),
    );

    return {
      scopeLabelAr: "وحدة تشغيلية — اختصاص الطلبات/الوثائق",
      processing,
      aggregateReportId: aggregate.reportId,
      aggregateKpis: aggregate.kpis,
      issuedDocuments: countOrIncomplete(issuedDocs),
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
      scope.level === "department" &&
      !scope.roles.some((r) =>
        ["system_admin", "admin", "dean", "registrar"].includes(r),
      );

    if (isDeptOnly) {
      assertScopeAllowed(scope);
      const counts = await loadDepartmentScopedCounts(scope.departmentId!);
      return {
        scopeLabelAr: "الشؤون الأكاديمية — نطاق القسم",
        mode: "department" as const,
        ...counts,
      };
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
      scopeLabelAr: "الشؤون الأكاديمية — نطاق جامعي/كلية",
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
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const scope = await resolveReportActorScope(context.userId);

    try {
      let query = (supabaseAdmin as any)
        .from("course_materials")
        .select("id, course_section_id, status, updated_at, faculty_profile_id")
        .limit(2000);

      if (data.mode === "self") {
        if (!scope.facultyProfileId) throw new Error("لا ملف هيئة تدريس");
        query = query.eq("faculty_profile_id", scope.facultyProfileId);
      } else if (data.mode === "department") {
        await assertAnyRole(context.userId, DEPT_REPORT_ROLES, "غير مصرح");
        assertScopeAllowed(scope);
        if (!scope.departmentId && !scope.roles.some((r) => ["admin", "system_admin", "dean"].includes(r))) {
          throw new Error("نطاق القسم مفقود");
        }
        // Filter via faculty in department when dept-scoped
        if (scope.departmentId) {
          const { data: fac } = await supabaseAdmin
            .from("faculty_profiles")
            .select("id")
            .eq("department_id", scope.departmentId);
          const ids = (fac ?? []).map((f) => f.id);
          if (ids.length === 0) {
            return {
              kpis: buildMaterialsCoverageKpis([], { treatEmptyAsZero: true }),
              scopeLabelAr: "قسم",
            };
          }
          query = query.in("faculty_profile_id", ids);
        }
      } else {
        await assertAnyRole(
          context.userId,
          ["system_admin", "admin", "dean", "registrar"],
          "غير مصرح",
        );
      }

      const { data: mats, error } = await query;
      if (error) throw new Error(error.message);

      return {
        kpis: buildMaterialsCoverageKpis(
          (mats ?? []).map((m: any) => ({
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
          data.mode === "self"
            ? "ذاتي"
            : data.mode === "department"
              ? "قسم"
              : "كلية",
      };
    } catch (e) {
      return {
        kpis: {
          totalMaterials: metricIncomplete((e as Error).message),
          published: metricIncomplete(),
          draft: metricIncomplete(),
          sectionsWithMaterials: metricIncomplete(),
          staleMaterials: metricIncomplete(),
        },
        scopeLabelAr: data.mode,
      };
    }
  });

/** Request processing-time report for operational / VP student roles. */
export const getRequestProcessingTimeReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(
      context.userId,
      [...OPERATIONAL_ROLES, "dean"] as const,
      "ليس لديك صلاحية تقرير زمن المعالجة",
    );

    const { data: reqRows, error } = await supabaseAdmin
      .from("student_requests")
      .select("id, status, request_type, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const now = Date.now();
    const facts = ((reqRows ?? []) as any[]).map((r) => {
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
      scopeLabelAr: "اختصاص الطلبات — بدون توسيع نطاق خارج الصلاحية",
      kpis: buildProcessingTimeKpis(facts, { treatEmptyAsZero: true }),
    };
  });

/** Documents issued report. */
export const getDocumentsIssuedReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(
      context.userId,
      [...OPERATIONAL_ROLES, "dean"] as const,
      "ليس لديك صلاحية تقرير الوثائق الصادرة",
    );

    const { data: docs, error } = await supabaseAdmin
      .from("official_documents")
      .select("id, document_type, status, issued_at")
      .in("status", ["issued", "archived"])
      .order("issued_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const byType = new Map<string, number>();
    for (const d of docs ?? []) {
      const key = (d as any).document_type ?? "unknown";
      byType.set(key, (byType.get(key) ?? 0) + 1);
    }

    return {
      scopeLabelAr: "الوثائق الصادرة — نطاق تشغيلي",
      total: metricValue((docs ?? []).length),
      byType: [...byType.entries()].map(([documentType, count]) => ({
        documentType,
        count,
      })),
      // No student PII in this aggregate view
      includesPii: false,
    };
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
void metricNoAccess;
