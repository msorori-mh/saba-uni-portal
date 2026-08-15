import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertAnyRole, assertStudentRead, REPORTS_ROLES } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getDbCodesForRequestTypeFilter,
  getStudentRequestTypeDisplayName,
} from "@/lib/student-requests/request-type-registry";
import {
  enforceDepartmentFilter,
} from "@/lib/reports/scope";
import { provenDepartmentIdsForCollege } from "@/lib/reports/scope/org-identity";
import {
  resolveReportActorScope,
} from "@/lib/reports/scope/resolve-scope.server";
import { isCoursePassed } from "@/lib/academic/pass-threshold";


/** University-wide unscoped aggregate dumps — admin family only (no silent dean/dept widen). */
const UNIVERSITY_WIDE_AGGREGATE_ROLES = ["system_admin", "admin"] as const;

async function assertReportsAccess(userId: string) {
  await assertAnyRole(
    userId,
    REPORTS_ROLES,
    "ليس لديك صلاحية عرض التقارير",
  );
}

async function assertUniversityWideAggregateAccess(userId: string) {
  await assertAnyRole(
    userId,
    UNIVERSITY_WIDE_AGGREGATE_ROLES,
    "التقارير المجمّعة على مستوى الجامعة متاحة للإدارة فقط — لا نطاق جامعي صامت للأدوار المحدودة",
  );
}

/**
 * Fail-closed department containment for /admin/reports data handlers.
 * Department heads are forced to their bound department. Deans require a proven
 * college→department map (currently unavailable ⇒ DENY). Admin/registrar keep
 * existing university operational access.
 */
async function applyAdminReportsDepartmentContainment(
  userId: string,
  requestedDepartmentId: string | null | undefined,
): Promise<string | null> {
  const scope = await resolveReportActorScope(userId);
  if (scope.denied) {
    throw new Error(scope.denyReasonAr ?? "نطاق التقارير مرفوض");
  }

  const isPrivileged = scope.roles.some((r) => r === "system_admin" || r === "admin");
  const isRegistrar = scope.roles.includes("registrar");
  const isDeptOnly =
    scope.level === "department" &&
    !scope.roles.some((r) =>
      ["system_admin", "admin", "dean", "registrar"].includes(r),
    );

  if (isPrivileged || isRegistrar) {
    return requestedDepartmentId ?? null;
  }

  if (isDeptOnly) {
    const enforced = enforceDepartmentFilter({
      scope,
      requestedDepartmentId: requestedDepartmentId ?? null,
    });
    if (enforced.denied || !enforced.departmentId) {
      throw new Error(enforced.reasonAr ?? "رئيس القسم بلا قسم مرتبط — يُرفض النطاق");
    }
    return enforced.departmentId;
  }

  if (scope.roles.includes("dean")) {
    if (!scope.bindings.collegeScopeConfigured || !scope.bindings.collegeId) {
      throw new Error(
        "تقارير العميد غير مكوّنة — لا يوجد college_id موثوق لعزل نطاق الكلية",
      );
    }
    const allowed = provenDepartmentIdsForCollege(scope.bindings.collegeId);
    if (!allowed) {
      throw new Error(
        "لا يوجد ربط كلية→أقسام موثوق لعزل نطاق العميد — يُرفض النطاق الجامعي الصامت",
      );
    }
    const deptId = requestedDepartmentId ?? null;
    if (!deptId) {
      throw new Error("يجب تحديد قسم ضمن كلية العميد — لا نطاق جامعي صامت");
    }
    if (!allowed.includes(deptId)) {
      throw new Error("القسم خارج نطاق كلية العميد المعتمدة");
    }
    return deptId;
  }

  // finance_officer / student_affairs / any other REPORTS_ROLES residual:
  // never silently widen to university-wide when department filter is absent.
  throw new Error(
    "نطاق التقارير غير معزول لهذا الدور — يُرفض العرض الجامعي الصامت بدون قسم محدد",
  );
}

async function fetchAll<T = Record<string, unknown>>(
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (q: any) => any,
  pageSize = 1000,
): Promise<T[]> {
  const adminDb = supabaseAdmin as unknown as { from: (table: string) => any };
  const out: T[] = [];
  let from = 0;
  for (let i = 0; i < 10; i++) {
    let q = adminDb.from(table).select("*");
    q = build(q);
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

function groupCount<T>(items: T[], keyFn: (x: T) => string | null | undefined) {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = keyFn(it) ?? "â€”";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries()).map(([key, value]) => ({ key, value }));
}

async function fetchAcademicReport() {
  const [students, programs, courses, sections, depts, levels] = await Promise.all([
    fetchAll<{ id: string; status: string; program_id: string; department_id: string }>(
      "student_profiles", (q) => q.select("id, status, program_id, department_id")),
    fetchAll<{ id: string; name_ar: string; department_id: string }>(
      "programs", (q) => q.select("id, name_ar, department_id")),
    fetchAll<{ id: string; name_ar: string; code: string }>(
      "courses", (q) => q.select("id, name_ar, code")),
    fetchAll<{ id: string; status: string }>(
      "course_sections", (q) => q.select("id, status")),
    fetchAll<{ id: string; name_ar: string }>(
      "departments", (q) => q.select("id, name_ar")),
    fetchAll<{ id: string; name: string; level_number: number }>(
      "academic_levels", (q) => q.select("id, name, level_number")),
  ]);
  const sas = await fetchAll<{ student_profile_id: string; level_id: string; enrollment_status: string }>(
    "student_academic_status", (q) => q.select("student_profile_id, level_id, enrollment_status"));

  const programMap = new Map(programs.map((p) => [p.id, p.name_ar]));
  const deptMap = new Map(depts.map((d) => [d.id, d.name_ar]));
  const levelMap = new Map(levels.map((l) => [l.id, l.name]));

  const studentLevel = new Map<string, string | null>();
  for (const r of sas) {
    if (!studentLevel.has(r.student_profile_id))
      studentLevel.set(r.student_profile_id, r.level_id);
  }

  const byProgram = groupCount(students, (s) => programMap.get(s.program_id) ?? null)
    .sort((a, b) => b.value - a.value);
  const byDept = groupCount(students, (s) => deptMap.get(s.department_id) ?? null)
    .sort((a, b) => b.value - a.value);
  const byLevel = groupCount(students, (s) => {
    const lvl = studentLevel.get(s.id);
    return lvl ? levelMap.get(lvl) ?? null : null;
  }).sort((a, b) => (a.key > b.key ? 1 : -1));
  const byStatus = groupCount(students, (s) => s.status);

  return {
    totalStudents: students.length,
    activeStudents: students.filter((s) => s.status === "active").length,
    suspendedStudents: students.filter((s) => s.status === "suspended").length,
    programs: programs.length,
    courses: courses.length,
    sections: sections.length,
    byProgram, byDept, byLevel, byStatus,
  };
}

async function fetchPerformanceReport() {
  const rows = await fetchAll<{
    student_profile_id: string;
    academic_number: string;
    student_name: string;
    course_id: string;
    course_code: string;
    course_name: string;
    percentage: number;
    overall_status: string;
  }>("student_course_grade_summary", (q) =>
    q.select("student_profile_id, academic_number, student_name, course_id, course_code, course_name, percentage, overall_status"));

  const perCourse = new Map<string, { code: string; name: string; total: number; pass: number; sum: number }>();
  for (const r of rows) {
    const key = r.course_id ?? r.course_code;
    const cur = perCourse.get(key) ?? { code: r.course_code, name: r.course_name, total: 0, pass: 0, sum: 0 };
    cur.total += 1;
    cur.sum += Number(r.percentage ?? 0);
    if (isCoursePassed(Number(r.percentage ?? 0))) cur.pass += 1;
    perCourse.set(key, cur);
  }
  const courseRows = Array.from(perCourse.values()).map((c) => ({
    code: c.code,
    name: c.name,
    total: c.total,
    success_rate: c.total ? Math.round((c.pass / c.total) * 1000) / 10 : 0,
    avg: c.total ? Math.round((c.sum / c.total) * 10) / 10 : 0,
  })).sort((a, b) => b.total - a.total);

  const perStudent = new Map<string, { academic_number: string; student_name: string; sum: number; count: number }>();
  for (const r of rows) {
    const k = r.student_profile_id;
    const cur = perStudent.get(k) ?? { academic_number: r.academic_number, student_name: r.student_name, sum: 0, count: 0 };
    cur.sum += Number(r.percentage ?? 0);
    cur.count += 1;
    perStudent.set(k, cur);
  }
  const studentRows = Array.from(perStudent.values()).map((s) => ({
    academic_number: s.academic_number,
    student_name: s.student_name,
    average: s.count ? Math.round((s.sum / s.count) * 10) / 10 : 0,
  }));

  const top = studentRows.filter((s) => s.average >= 85)
    .sort((a, b) => b.average - a.average)
    .slice(0, 50)
    .map((s) => ({ ...s, status: "Ù…ØªÙÙˆÙ‚" }));
  const atRisk = studentRows.filter((s) => s.average < 60)
    .sort((a, b) => a.average - b.average)
    .slice(0, 50)
    .map((s) => ({ ...s, status: "Ù…ØªØ¹Ø«Ø±" }));

  return { courseRows, top, atRisk };
}

async function fetchEnrollmentReport() {
  const [enrollments, sections, courses, offerings, programs] = await Promise.all([
    fetchAll<{ id: string; course_section_id: string; enrollment_status: string }>(
      "student_enrollments", (q) => q.select("id, course_section_id, enrollment_status")),
    fetchAll<{ id: string; section_code: string; course_offering_id: string }>(
      "course_sections", (q) => q.select("id, section_code, course_offering_id")),
    fetchAll<{ id: string; code: string; name_ar: string }>(
      "courses", (q) => q.select("id, code, name_ar")),
    fetchAll<{ id: string; course_id: string; program_id: string }>(
      "course_offerings", (q) => q.select("id, course_id, program_id")),
    fetchAll<{ id: string; name_ar: string }>(
      "programs", (q) => q.select("id, name_ar")),
  ]);
  const sectionMap = new Map(sections.map((s) => [s.id, s]));
  const offeringMap = new Map(offerings.map((o) => [o.id, o]));
  const courseMap = new Map(courses.map((c) => [c.id, c]));
  const programMap = new Map(programs.map((p) => [p.id, p.name_ar]));

  const perSection = new Map<string, number>();
  const perCourse = new Map<string, { code: string; name: string; count: number }>();
  const perProgram = new Map<string, number>();
  for (const e of enrollments) {
    perSection.set(e.course_section_id, (perSection.get(e.course_section_id) ?? 0) + 1);
    const s = sectionMap.get(e.course_section_id);
    const off = s ? offeringMap.get(s.course_offering_id) : undefined;
    const c = off ? courseMap.get(off.course_id) : undefined;
    if (c) {
      const cur = perCourse.get(c.id) ?? { code: c.code, name: c.name_ar, count: 0 };
      cur.count += 1;
      perCourse.set(c.id, cur);
    }
    if (off?.program_id) {
      const pn = programMap.get(off.program_id) ?? "â€”";
      perProgram.set(pn, (perProgram.get(pn) ?? 0) + 1);
    }
  }

  const programRows = Array.from(perProgram.entries())
    .map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
  const courseRows = Array.from(perCourse.values())
    .sort((a, b) => b.count - a.count);
  const sectionRows = Array.from(perSection.entries()).map(([id, count]) => {
    const s = sectionMap.get(id);
    const off = s ? offeringMap.get(s.course_offering_id) : undefined;
    const c = off ? courseMap.get(off.course_id) : undefined;
    return {
      section_code: s?.section_code ?? "â€”",
      course: c ? `${c.code} â€” ${c.name_ar}` : "â€”",
      count,
    };
  }).sort((a, b) => b.count - a.count);

  const mostPopular = [...courseRows].slice(0, 20);
  const leastPopular = [...courseRows].slice().sort((a, b) => a.count - b.count).slice(0, 20);

  return { programRows, courseRows, sectionRows, mostPopular, leastPopular };
}

async function fetchFacultyReport() {
  const [faculty, sections, enrollments, depts] = await Promise.all([
    fetchAll<{ id: string; full_name_ar: string; department_id: string; academic_rank: string; status: string }>(
      "faculty_profiles", (q) => q.select("id, full_name_ar, department_id, academic_rank, status")),
    fetchAll<{ id: string; faculty_profile_id: string | null; status: string }>(
      "course_sections", (q) => q.select("id, faculty_profile_id, status")),
    fetchAll<{ id: string; course_section_id: string }>(
      "student_enrollments", (q) => q.select("id, course_section_id")),
    fetchAll<{ id: string; name_ar: string }>(
      "departments", (q) => q.select("id, name_ar")),
  ]);
  const deptMap = new Map(depts.map((d) => [d.id, d.name_ar]));
  const sectionsByFaculty = new Map<string, number>();
  const sectionFaculty = new Map<string, string | null>();
  for (const s of sections) {
    sectionFaculty.set(s.id, s.faculty_profile_id);
    if (s.faculty_profile_id) {
      sectionsByFaculty.set(s.faculty_profile_id, (sectionsByFaculty.get(s.faculty_profile_id) ?? 0) + 1);
    }
  }
  const studentsByFaculty = new Map<string, number>();
  for (const e of enrollments) {
    const fid = sectionFaculty.get(e.course_section_id);
    if (fid) studentsByFaculty.set(fid, (studentsByFaculty.get(fid) ?? 0) + 1);
  }
  const facultyRows = faculty.map((f) => ({
    name: f.full_name_ar,
    rank: f.academic_rank ?? "â€”",
    department: deptMap.get(f.department_id) ?? "â€”",
    sections: sectionsByFaculty.get(f.id) ?? 0,
    students: studentsByFaculty.get(f.id) ?? 0,
    status: f.status,
  })).sort((a, b) => b.sections - a.sections);

  const byDept = groupCount(faculty, (f) => deptMap.get(f.department_id) ?? null)
    .sort((a, b) => b.value - a.value);

  return { facultyRows, byDept };
}

const REQ_STATUS_AR: Record<string, string> = {
  draft: "Ù…Ø³ÙˆØ¯Ø©",
  submitted: "Ù…Ù‚Ø¯Ù‘Ù…",
  under_review: "Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©",
  returned: "ÙŠØ­ØªØ§Ø¬ Ø§Ø³ØªÙƒÙ…Ø§Ù„",
  approved: "Ù…ÙˆØ§ÙÙŽÙ‚ Ø¹Ù„ÙŠÙ‡",
  rejected: "Ù…Ø±ÙÙˆØ¶",
  cancelled: "Ù…Ù„ØºÙ‰",
};

export type RequestsReportFilters = {
  from_date?: string | null;
  to_date?: string | null;
  department_id?: string | null;
  program_id?: string | null;
  status?: string | null;
  request_type?: string | null;
};

const OPEN_STATUSES = new Set(["submitted", "under_review", "returned", "draft"]);

async function fetchRequestsReport(filters: RequestsReportFilters = {}) {
  const rows = await fetchAll<{
    id: string;
    request_number: string | null;
    request_type: string;
    status: string;
    student_profile_id: string;
    submitted_at: string | null;
    reviewed_at: string | null;
    created_at: string;
  }>("student_requests", (q) => {
    let s = q.select("id, request_number, request_type, status, student_profile_id, submitted_at, reviewed_at, created_at");
    if (filters.status) s = s.eq("status", filters.status);
    if (filters.request_type) {
      const typeCodes = getDbCodesForRequestTypeFilter(filters.request_type);
      if (typeCodes.length === 1) s = s.eq("request_type", typeCodes[0]);
      else if (typeCodes.length > 1) s = s.in("request_type", typeCodes);
    }
    if (filters.from_date) s = s.gte("created_at", filters.from_date);
    if (filters.to_date) s = s.lte("created_at", `${filters.to_date}T23:59:59.999Z`);
    return s;
  });

  const profileIds = Array.from(new Set(rows.map((r) => r.student_profile_id).filter(Boolean)));
  const profiles = profileIds.length
    ? await fetchAll<{ id: string; academic_number: string | null; full_name_ar: string | null; program_id: string | null; department_id: string | null }>(
        "student_profiles", (q) => q.select("id, academic_number, full_name_ar, program_id, department_id").in("id", profileIds))
    : [];
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  const filtered = rows.filter((r) => {
    const p = profileMap.get(r.student_profile_id);
    if (filters.department_id && p?.department_id !== filters.department_id) return false;
    if (filters.program_id && p?.program_id !== filters.program_id) return false;
    return true;
  });

  const byType = groupCount(filtered, (r) => getStudentRequestTypeDisplayName(r.request_type));
  const byStatus = groupCount(filtered, (r) => REQ_STATUS_AR[r.status] ?? r.status);
  const approved = filtered.filter((r) => r.status === "approved");
  const rejected = filtered.filter((r) => r.status === "rejected");
  const open = filtered.filter((r) => OPEN_STATUSES.has(r.status));
  const reviewed = filtered.filter((r) => r.submitted_at && r.reviewed_at);
  const avgMs = reviewed.length
    ? reviewed.reduce((acc, r) => acc + (new Date(r.reviewed_at!).getTime() - new Date(r.submitted_at!).getTime()), 0) / reviewed.length
    : 0;
  const avgDays = Math.round((avgMs / (1000 * 60 * 60 * 24)) * 10) / 10;

  const detailRows = filtered
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((r) => {
      const p = profileMap.get(r.student_profile_id);
      return {
        id: r.id,
        request_number: r.request_number ?? "",
        request_type: r.request_type,
        request_type_ar: getStudentRequestTypeDisplayName(r.request_type),
        status: r.status,
        status_ar: REQ_STATUS_AR[r.status] ?? r.status,
        student_name: p?.full_name_ar ?? "",
        academic_number: p?.academic_number ?? "",
        created_at: r.created_at,
        submitted_at: r.submitted_at,
        reviewed_at: r.reviewed_at,
      };
    });

  return {
    total: filtered.length,
    approvedCount: approved.length,
    rejectedCount: rejected.length,
    openCount: open.length,
    avgDays,
    byType, byStatus,
    rows: detailRows,
  };
}

async function fetchFinancialReport() {
  const [fees, payments, receipts, discounts, students, programs] = await Promise.all([
    fetchAll<{ id: string; amount: number; status: string; student_profile_id: string }>(
      "student_fees", (q) => q.select("id, amount, status, student_profile_id")),
    fetchAll<{ id: string; amount: number; student_fee_id: string }>(
      "student_payments", (q) => q.select("id, amount, student_fee_id")),
    fetchAll<{ id: string; status: string }>(
      "payment_receipts", (q) => q.select("id, status")),
    fetchAll<{ id: string; value: number; status: string }>(
      "student_discounts", (q) => q.select("id, value, status")),
    fetchAll<{ id: string; program_id: string }>(
      "student_profiles", (q) => q.select("id, program_id")),
    fetchAll<{ id: string; name_ar: string }>(
      "programs", (q) => q.select("id, name_ar")),
  ]);
  const totalFees = fees.reduce((a, f) => a + Number(f.amount ?? 0), 0);
  const totalPaid = payments.reduce((a, p) => a + Number(p.amount ?? 0), 0);
  const outstanding = Math.max(0, totalFees - totalPaid);
  const discountsTotal = discounts
    .filter((d) => d.status === "active")
    .reduce((a, d) => a + Number(d.value ?? 0), 0);

  const programMap = new Map(programs.map((p) => [p.id, p.name_ar]));
  const studentProgram = new Map(students.map((s) => [s.id, s.program_id]));
  const feesByProgram = new Map<string, number>();
  for (const f of fees) {
    const pid = studentProgram.get(f.student_profile_id);
    const pname = pid ? (programMap.get(pid) ?? "â€”") : "â€”";
    feesByProgram.set(pname, (feesByProgram.get(pname) ?? 0) + Number(f.amount ?? 0));
  }
  const feesByProgramRows = Array.from(feesByProgram.entries())
    .map(([key, value]) => ({ key, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);

  const receiptStatusRows = groupCount(receipts, (r) => r.status);
  const discountsRows = groupCount(discounts, (d) => d.status);

  const paidVsOutstanding = [
    { key: "Ù…Ø³Ø¯Ø¯Ø©", value: Math.round(totalPaid * 100) / 100 },
    { key: "ØºÙŠØ± Ù…Ø³Ø¯Ø¯Ø©", value: Math.round(outstanding * 100) / 100 },
  ];

  return {
    totalFees, totalPaid, outstanding, discountsTotal,
    feesByProgramRows, receiptStatusRows, discountsRows, paidVsOutstanding,
  };
}

function reportsHandler<T>(fn: () => Promise<T>) {
  return createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .handler(async ({ context }) => {
      // Unscoped university-wide dumps: admin family only (Independent R2 HIGH closure).
      await assertUniversityWideAggregateAccess(context.userId);
      return fn();
    });
}

export const getReportsAcademic = reportsHandler(fetchAcademicReport);
export const getReportsPerformance = reportsHandler(fetchPerformanceReport);
export const getReportsEnrollment = reportsHandler(fetchEnrollmentReport);
export const getReportsFaculty = reportsHandler(fetchFacultyReport);

const requestsReportSchema = z.object({
  from_date: z.string().optional().nullable(),
  to_date: z.string().optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  program_id: z.string().uuid().optional().nullable(),
  status: z.string().optional().nullable(),
  request_type: z.string().optional().nullable(),
}).default({});

export const getReportsRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestsReportSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertReportsAccess(context.userId);
    const departmentId = await applyAdminReportsDepartmentContainment(
      context.userId,
      data?.department_id ?? null,
    );
    return fetchRequestsReport({ ...(data ?? {}), department_id: departmentId });
  });
export const getReportsFinancial = reportsHandler(fetchFinancialReport);

const studentsReportSchema = z.object({
  study_system: z.enum(["all", "regular", "private", "unset"]).default("all"),
  department_id: z.string().uuid().optional().nullable(),
  program_id: z.string().uuid().optional().nullable(),
  level_id: z.string().uuid().optional().nullable(),
  academic_year_id: z.string().uuid().optional().nullable(),
  semester_id: z.string().uuid().optional().nullable(),
  status: z.enum(["all", "active", "inactive", "suspended", "graduated", "withdrawn", "transferred"]).default("all"),
  account_status: z.enum(["all", "with_account", "without_account"]).default("all"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

export const getStudentsReportForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => studentsReportSchema.parse(input))
  .handler(async ({ data: rawData, context }) => {
    await assertStudentRead(context.userId);
    const enforcedDepartmentId = await applyAdminReportsDepartmentContainment(
      context.userId,
      rawData.department_id ?? null,
    );
    const data = { ...rawData, department_id: enforcedDepartmentId };

    const hasFilter = Boolean(
      data.study_system !== "all"
      || data.department_id
      || data.program_id
      || data.level_id
      || data.academic_year_id
      || data.semester_id
      || data.status !== "all"
      || data.account_status !== "all",
    );

    if (!hasFilter) {
      return {
        rows: [],
        total: 0,
        page: data.page,
        pageSize: data.pageSize,
        kpis: {
          total: 0,
          regular: 0,
          private: 0,
          unsetStudySystem: 0,
          withAccount: 0,
          withoutAccount: 0,
        },
        message: "اختر فلترًا واحدًا على الأقل لعرض التقرير.",
      };
    }

    let scopedProfileIds: string[] | null = null;
    if (data.level_id || data.academic_year_id || data.semester_id) {
      let statusQuery = supabaseAdmin
        .from("student_academic_status")
        .select("student_profile_id")
        .limit(10000);
      if (data.level_id) statusQuery = statusQuery.eq("level_id", data.level_id);
      if (data.academic_year_id) statusQuery = statusQuery.eq("academic_year_id", data.academic_year_id);
      if (data.semester_id) statusQuery = statusQuery.eq("semester_id", data.semester_id);
      const { data: statusRows, error: statusErr } = await statusQuery;
      if (statusErr) throw new Error(statusErr.message);
      scopedProfileIds = Array.from(new Set((statusRows ?? []).map((row: any) => row.student_profile_id).filter(Boolean)));
      if (scopedProfileIds.length === 0) {
        return {
          rows: [],
          total: 0,
          page: data.page,
          pageSize: data.pageSize,
          kpis: {
            total: 0,
            regular: 0,
            private: 0,
            unsetStudySystem: 0,
            withAccount: 0,
            withoutAccount: 0,
          },
          message: null,
        };
      }
    }

    const applyProfileFilters = (query: any, override?: {
      study_system?: "regular" | "private" | "unset";
      account_status?: "with_account" | "without_account";
    }) => {
      if (data.department_id) query = query.eq("department_id", data.department_id);
      if (data.program_id) query = query.eq("program_id", data.program_id);
      if (data.status !== "all") query = query.eq("status", data.status);
      if (scopedProfileIds) query = query.in("id", scopedProfileIds);

      const studySystem = override?.study_system ?? (data.study_system === "all" ? undefined : data.study_system);
      if (studySystem === "regular" || studySystem === "private") query = query.eq("study_system", studySystem);
      if (studySystem === "unset") query = query.is("study_system", null);

      const accountStatus = override?.account_status ?? (data.account_status === "all" ? undefined : data.account_status);
      if (accountStatus === "with_account") query = query.not("user_id", "is", null);
      if (accountStatus === "without_account") query = query.is("user_id", null);

      return query;
    };

    const countProfiles = async (override?: {
      study_system?: "regular" | "private" | "unset";
      account_status?: "with_account" | "without_account";
    }) => {
      const { count, error } = await applyProfileFilters(
        supabaseAdmin.from("student_profiles").select("id", { count: "exact", head: true }),
        override,
      );
      if (error) throw new Error(error.message);
      return count ?? 0;
    };

    const total = await countProfiles();
    const [regular, privateCount, unsetStudySystem, withAccount, withoutAccount] = await Promise.all([
      countProfiles({ study_system: "regular" }),
      countProfiles({ study_system: "private" }),
      countProfiles({ study_system: "unset" }),
      countProfiles({ account_status: "with_account" }),
      countProfiles({ account_status: "without_account" }),
    ]);

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: profiles, error } = await applyProfileFilters(
      supabaseAdmin
        .from("student_profiles")
        .select(`
          id,
          academic_number,
          full_name_ar,
          status,
          study_system,
          user_id,
          department_id,
          program_id,
          departments(name_ar),
          programs(name_ar, code)
        `)
        .order("academic_number", { ascending: true })
        .range(from, to),
    );
    if (error) throw new Error(error.message);

    const profileIds = (profiles ?? []).map((profile: any) => profile.id);
    const statusByProfile = new Map<string, any>();
    if (profileIds.length > 0) {
      let academicStatusQuery = supabaseAdmin
        .from("student_academic_status")
        .select(`
          student_profile_id,
          enrollment_status,
          updated_at,
          academic_levels(name, level_number),
          academic_years(name),
          semesters(name, code)
        `)
        .in("student_profile_id", profileIds)
        .order("updated_at", { ascending: false });
      if (data.level_id) academicStatusQuery = academicStatusQuery.eq("level_id", data.level_id);
      if (data.academic_year_id) academicStatusQuery = academicStatusQuery.eq("academic_year_id", data.academic_year_id);
      if (data.semester_id) academicStatusQuery = academicStatusQuery.eq("semester_id", data.semester_id);
      const { data: statuses, error: statusesErr } = await academicStatusQuery;
      if (statusesErr) throw new Error(statusesErr.message);
      for (const row of statuses ?? []) {
        const profileId = (row as any).student_profile_id;
        if (!statusByProfile.has(profileId)) statusByProfile.set(profileId, row);
      }
    }

    const rows = (profiles ?? []).map((profile: any) => {
      const academicStatus = statusByProfile.get(profile.id);
      const level = academicStatus?.academic_levels;
      const year = academicStatus?.academic_years;
      const semester = academicStatus?.semesters;
      return {
        id: profile.id,
        academic_number: profile.academic_number,
        full_name_ar: profile.full_name_ar,
        department_name: profile.departments?.name_ar ?? null,
        program_name: profile.programs?.name_ar ?? null,
        program_code: profile.programs?.code ?? null,
        level_name: level?.name ?? null,
        level_number: level?.level_number ?? null,
        academic_year: year?.name ?? null,
        semester: semester?.code ?? semester?.name ?? null,
        study_system: profile.study_system ?? null,
        status: profile.status,
        has_account: Boolean(profile.user_id),
      };
    });

    return {
      rows,
      total,
      page: data.page,
      pageSize: data.pageSize,
      kpis: {
        total,
        regular,
        private: privateCount,
        unsetStudySystem,
        withAccount,
        withoutAccount,
      },
      message: null,
    };
  });

const IMPORT_REPORT_ROLES = [
  "admin",
  "system_admin",
  "registrar",
  "student_affairs",
  "finance_officer",
] as const;

const importReportSchema = z.object({
  import_type: z.string().trim().max(80).optional().nullable(),
  status: z.enum(["all", "completed", "failed", "processing", "partial", "dry_run"]).default("all"),
  from_date: z.string().trim().max(32).optional().nullable(),
  to_date: z.string().trim().max(32).optional().nullable(),
  created_by: z.string().uuid().optional().nullable(),
  file_name: z.string().trim().max(180).optional().nullable(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

function hasImportReportFilter(data: z.infer<typeof importReportSchema>) {
  return Boolean(
    data.import_type
    || data.status !== "all"
    || data.from_date
    || data.to_date
    || data.created_by
    || data.file_name,
  );
}

function applyImportFilters(query: any, data: z.infer<typeof importReportSchema>) {
  if (data.import_type) query = query.eq("import_type", data.import_type);
  if (data.status !== "all") query = query.eq("status", data.status);
  if (data.from_date) query = query.gte("created_at", `${data.from_date}T00:00:00.000Z`);
  if (data.to_date) query = query.lte("created_at", `${data.to_date}T23:59:59.999Z`);
  if (data.created_by) query = query.eq("created_by", data.created_by);
  if (data.file_name) query = query.ilike("file_name", `%${data.file_name}%`);
  return query;
}

export const getImportJobsReportForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => importReportSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, IMPORT_REPORT_ROLES, "Ù„ÙŠØ³ Ù„Ø¯ÙŠÙƒ ØµÙ„Ø§Ø­ÙŠØ© Ø¹Ø±Ø¶ ØªÙ‚Ø§Ø±ÙŠØ± Ø§Ù„Ø§Ø³ØªÙŠØ±Ø§Ø¯");

    if (!hasImportReportFilter(data)) {
      return {
        rows: [],
        total: 0,
        page: data.page,
        pageSize: data.pageSize,
        kpis: { total: 0, completed: 0, failed: 0, rowsTotal: 0, errorsTotal: 0 },
        message: "Ø§Ø®ØªØ± ÙÙ„ØªØ±Ù‹Ø§ ÙˆØ§Ø­Ø¯Ù‹Ø§ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„ Ù„Ø¹Ø±Ø¶ Ø§Ù„ØªÙ‚Ø±ÙŠØ±.",
      };
    }

    const countByStatus = async (status: string) => {
      const { count, error } = await applyImportFilters(
        supabaseAdmin.from("import_logs").select("id", { count: "exact", head: true }).eq("status", status),
        { ...data, status: "all" },
      );
      if (error) throw new Error(error.message);
      return count ?? 0;
    };

    const { data: aggregateRows, error: aggregateErr } = await applyImportFilters(
      supabaseAdmin.from("import_logs").select("rows_total, rows_failed"),
      data,
    ).limit(10000);
    if (aggregateErr) throw new Error(aggregateErr.message);

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: logs, error, count } = await applyImportFilters(
      supabaseAdmin
        .from("import_logs")
        .select("id, created_at, created_by, import_type, file_name, rows_total, rows_success, rows_failed, status, notes", { count: "exact" })
        .order("created_at", { ascending: false }),
      data,
    ).range(from, to);
    if (error) throw new Error(error.message);

    const rows = (logs ?? []).map((row: any) => ({
      id: row.id,
      created_at: row.created_at,
      import_type: row.import_type,
      file_name: row.file_name,
      status: row.status,
      rows_total: row.rows_total ?? 0,
      rows_success: row.rows_success ?? 0,
      rows_failed: row.rows_failed ?? 0,
      error_count: row.rows_failed ?? 0,
      created_by: row.created_by ?? null,
      notes: row.notes ? String(row.notes).slice(0, 240) : null,
    }));

    return {
      rows,
      total: count ?? rows.length,
      page: data.page,
      pageSize: data.pageSize,
      kpis: {
        total: count ?? rows.length,
        completed: await countByStatus("completed"),
        failed: await countByStatus("failed"),
        rowsTotal: (aggregateRows ?? []).reduce((sum: number, row: any) => sum + Number(row.rows_total ?? 0), 0),
        errorsTotal: (aggregateRows ?? []).reduce((sum: number, row: any) => sum + Number(row.rows_failed ?? 0), 0),
      },
      message: null,
    };
  });

const importJobErrorsSchema = z.object({
  import_log_id: z.string().uuid(),
});

function parseImportNotes(notes: string | null | undefined) {
  if (!notes) return [];
  return notes
    .split(" | ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((part, index) => {
      const match = part.match(/^R(\d+)(?:\s+\[([^\]]+)\])?:\s*(.*)$/);
      return {
        row: match ? Number(match[1]) : index + 1,
        column: match?.[2] ?? null,
        message: match?.[3] ?? part,
        value: null as string | null,
      };
    });
}

export const getImportJobErrorsForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => importJobErrorsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, IMPORT_REPORT_ROLES, "Ù„ÙŠØ³ Ù„Ø¯ÙŠÙƒ ØµÙ„Ø§Ø­ÙŠØ© Ø¹Ø±Ø¶ ØªÙ‚Ø§Ø±ÙŠØ± Ø§Ù„Ø§Ø³ØªÙŠØ±Ø§Ø¯");
    const { data: row, error } = await supabaseAdmin
      .from("import_logs")
      .select("id, created_at, created_by, import_type, file_name, rows_total, rows_success, rows_failed, status, notes")
      .eq("id", data.import_log_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Ø¹Ù…Ù„ÙŠØ© Ø§Ù„Ø§Ø³ØªÙŠØ±Ø§Ø¯ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©");
    return {
      job: row,
      errors: parseImportNotes((row as any).notes),
      source: "import_logs.notes" as const,
    };
  });

const studentAccountsReportSchema = z.object({
  department_id: z.string().uuid().optional().nullable(),
  program_id: z.string().uuid().optional().nullable(),
  level_id: z.string().uuid().optional().nullable(),
  academic_year_id: z.string().uuid().optional().nullable(),
  semester_id: z.string().uuid().optional().nullable(),
  study_system: z.enum(["all", "regular", "private", "unset"]).default("all"),
  account_status: z.enum(["all", "with_account", "without_account"]).default("all"),
  status: z.enum(["all", "active", "inactive", "suspended", "graduated", "withdrawn", "transferred"]).default("all"),
  academic_number: z.string().trim().max(32).regex(/^[A-Za-z0-9_-]*$/, "Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ø£ÙƒØ§Ø¯ÙŠÙ…ÙŠ ÙŠØ­ØªÙˆÙŠ Ø¹Ù„Ù‰ Ø£Ø­Ø±Ù ØºÙŠØ± ØµØ­ÙŠØ­Ø©").optional(),
  student_name: z.string().trim().max(120).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

export const getStudentAccountsReportForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => studentAccountsReportSchema.parse(input))
  .handler(async ({ data: rawData, context }) => {
    await assertStudentRead(context.userId);
    const enforcedDepartmentId = await applyAdminReportsDepartmentContainment(
      context.userId,
      rawData.department_id ?? null,
    );
    const data = { ...rawData, department_id: enforcedDepartmentId };

    const hasFilter = Boolean(
      data.department_id
      || data.program_id
      || data.level_id
      || data.academic_year_id
      || data.semester_id
      || data.study_system !== "all"
      || data.account_status !== "all"
      || data.status !== "all"
      || data.academic_number
      || data.student_name,
    );

    if (!hasFilter) {
      return {
        rows: [],
        total: 0,
        page: data.page,
        pageSize: data.pageSize,
        kpis: { total: 0, withAccount: 0, withoutAccount: 0, regular: 0, private: 0, unsetStudySystem: 0 },
        message: "Ø§Ø®ØªØ± ÙÙ„ØªØ±Ù‹Ø§ ÙˆØ§Ø­Ø¯Ù‹Ø§ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„ Ù„Ø¹Ø±Ø¶ Ø§Ù„ØªÙ‚Ø±ÙŠØ±.",
      };
    }

    let scopedProfileIds: string[] | null = null;
    if (data.level_id || data.academic_year_id || data.semester_id) {
      let statusQuery = supabaseAdmin.from("student_academic_status").select("student_profile_id").limit(10000);
      if (data.level_id) statusQuery = statusQuery.eq("level_id", data.level_id);
      if (data.academic_year_id) statusQuery = statusQuery.eq("academic_year_id", data.academic_year_id);
      if (data.semester_id) statusQuery = statusQuery.eq("semester_id", data.semester_id);
      const { data: statusRows, error: statusErr } = await statusQuery;
      if (statusErr) throw new Error(statusErr.message);
      scopedProfileIds = Array.from(new Set((statusRows ?? []).map((row: any) => row.student_profile_id).filter(Boolean)));
      if (scopedProfileIds.length === 0) {
        return {
          rows: [],
          total: 0,
          page: data.page,
          pageSize: data.pageSize,
          kpis: { total: 0, withAccount: 0, withoutAccount: 0, regular: 0, private: 0, unsetStudySystem: 0 },
          message: null,
        };
      }
    }

    const applyFilters = (query: any, override?: {
      study_system?: "regular" | "private" | "unset";
      account_status?: "with_account" | "without_account";
    }) => {
      if (data.department_id) query = query.eq("department_id", data.department_id);
      if (data.program_id) query = query.eq("program_id", data.program_id);
      if (data.status !== "all") query = query.eq("status", data.status);
      if (data.academic_number) query = query.eq("academic_number", data.academic_number);
      if (data.student_name) query = query.ilike("full_name_ar", `%${data.student_name}%`);
      if (scopedProfileIds) query = query.in("id", scopedProfileIds);
      const studySystem = override?.study_system ?? (data.study_system === "all" ? undefined : data.study_system);
      if (studySystem === "regular" || studySystem === "private") query = query.eq("study_system", studySystem);
      if (studySystem === "unset") query = query.is("study_system", null);
      const accountStatus = override?.account_status ?? (data.account_status === "all" ? undefined : data.account_status);
      if (accountStatus === "with_account") query = query.not("user_id", "is", null);
      if (accountStatus === "without_account") query = query.is("user_id", null);
      return query;
    };

    const countProfiles = async (override?: {
      study_system?: "regular" | "private" | "unset";
      account_status?: "with_account" | "without_account";
    }) => {
      const { count, error } = await applyFilters(
        supabaseAdmin.from("student_profiles").select("id", { count: "exact", head: true }),
        override,
      );
      if (error) throw new Error(error.message);
      return count ?? 0;
    };

    const total = await countProfiles();
    const [withAccount, withoutAccount, regular, privateCount, unsetStudySystem] = await Promise.all([
      countProfiles({ account_status: "with_account" }),
      countProfiles({ account_status: "without_account" }),
      countProfiles({ study_system: "regular" }),
      countProfiles({ study_system: "private" }),
      countProfiles({ study_system: "unset" }),
    ]);

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: profiles, error } = await applyFilters(
      supabaseAdmin
        .from("student_profiles")
        .select(`
          id,
          academic_number,
          full_name_ar,
          department_id,
          program_id,
          study_system,
          status,
          user_id,
          created_at,
          updated_at,
          departments(name_ar),
          programs(name_ar, code)
        `)
        .order("academic_number", { ascending: true })
        .range(from, to),
    );
    if (error) throw new Error(error.message);

    const profileIds = (profiles ?? []).map((profile: any) => profile.id);
    const statusByProfile = new Map<string, any>();
    if (profileIds.length > 0) {
      let academicStatusQuery = supabaseAdmin
        .from("student_academic_status")
        .select(`
          student_profile_id,
          updated_at,
          academic_levels(name, level_number),
          academic_years(name),
          semesters(name, code)
        `)
        .in("student_profile_id", profileIds)
        .order("updated_at", { ascending: false });
      if (data.level_id) academicStatusQuery = academicStatusQuery.eq("level_id", data.level_id);
      if (data.academic_year_id) academicStatusQuery = academicStatusQuery.eq("academic_year_id", data.academic_year_id);
      if (data.semester_id) academicStatusQuery = academicStatusQuery.eq("semester_id", data.semester_id);
      const { data: statuses, error: statusesErr } = await academicStatusQuery;
      if (statusesErr) throw new Error(statusesErr.message);
      for (const row of statuses ?? []) {
        if (!statusByProfile.has((row as any).student_profile_id)) {
          statusByProfile.set((row as any).student_profile_id, row);
        }
      }
    }

    const rows = (profiles ?? []).map((profile: any) => {
      const academicStatus = statusByProfile.get(profile.id);
      const level = academicStatus?.academic_levels;
      return {
        id: profile.id,
        academic_number: profile.academic_number,
        full_name_ar: profile.full_name_ar,
        department_name: profile.departments?.name_ar ?? null,
        program_name: profile.programs?.name_ar ?? null,
        program_code: profile.programs?.code ?? null,
        level_name: level?.name ?? null,
        level_number: level?.level_number ?? null,
        study_system: profile.study_system ?? null,
        status: profile.status,
        has_account: Boolean(profile.user_id),
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      };
    });

    return {
      rows,
      total,
      page: data.page,
      pageSize: data.pageSize,
      kpis: { total, withAccount, withoutAccount, regular, private: privateCount, unsetStudySystem },
      message: null,
    };
  });

const academicPageSchema = z.object({
  department_id: z.string().uuid().optional().nullable(),
  program_id: z.string().uuid().optional().nullable(),
  status: z.string().trim().max(40).optional().nullable(),
  search: z.string().trim().max(160).optional().nullable(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

const coursesReportSchema = academicPageSchema.extend({
  level_id: z.string().uuid().optional().nullable(),
  semester_code: z.enum(["all", "first", "second"]).default("all"),
});

const coverageReportSchema = z.object({
  department_id: z.string().uuid().optional().nullable(),
  program_id: z.string().uuid().optional().nullable(),
  study_plan_id: z.string().uuid().optional().nullable(),
  level_id: z.string().uuid().optional().nullable(),
  semester_code: z.enum(["all", "first", "second"]).default("all"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

export const getAcademicReportLookupsForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertReportsAccess(context.userId);
    // Fail closed for dean until college→department containment exists.
    await applyAdminReportsDepartmentContainment(context.userId, null);
    const scope = await resolveReportActorScope(context.userId);
    const isDeptOnly =
      scope.level === "department" &&
      !scope.roles.some((r) =>
        ["system_admin", "admin", "dean", "registrar"].includes(r),
      );
    const [departments, programs, levels, plans] = await Promise.all([
      supabaseAdmin.from("departments").select("id, name_ar").order("sort_order"),
      supabaseAdmin.from("programs").select("id, code, name_ar, department_id").order("sort_order"),
      supabaseAdmin.from("academic_levels").select("id, name, level_number").order("level_number"),
      supabaseAdmin.from("study_plans").select("id, name, version, program_id").order("name"),
    ]);
    const firstError = [departments, programs, levels, plans].find((res) => res.error)?.error;
    if (firstError) throw new Error(firstError.message);
    let departmentRows = departments.data ?? [];
    let programRows = programs.data ?? [];
    if (isDeptOnly && scope.departmentId) {
      departmentRows = departmentRows.filter((d: { id: string }) => d.id === scope.departmentId);
      programRows = programRows.filter((p: { department_id: string | null }) => p.department_id === scope.departmentId);
    }
    return {
      departments: departmentRows,
      programs: programRows,
      levels: levels.data ?? [],
      studyPlans: plans.data ?? [],
      semesters: [
        { code: "first", name: "الفصل الأول" },
        { code: "second", name: "الفصل الثاني" },
      ],
    };
  });

function hasAcademicFilter(data: z.infer<typeof academicPageSchema>) {
  return Boolean(data.department_id || data.program_id || data.status || data.search);
}

export const getAcademicProgramsReportForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => academicPageSchema.parse(input))
  .handler(async ({ data: rawData, context }) => {
    await assertReportsAccess(context.userId);
    const enforcedDepartmentId = await applyAdminReportsDepartmentContainment(
      context.userId,
      rawData.department_id ?? null,
    );
    const data = { ...rawData, department_id: enforcedDepartmentId };
    if (!hasAcademicFilter(data)) {
      return { rows: [], total: 0, page: data.page, pageSize: data.pageSize,
        kpis: { total: 0, active: 0, inactive: 0, withoutPlans: 0, withStudents: 0 },
        message: "اختر فلترًا واحدًا على الأقل لعرض التقرير." };
    }

    let query = supabaseAdmin
      .from("programs")
      .select("id, code, name_ar, degree_type, status, is_active, department_id, years, departments(name_ar)", { count: "exact" })
      .order("sort_order");
    if (data.department_id) query = query.eq("department_id", data.department_id);
    if (data.program_id) query = query.eq("id", data.program_id);
    if (data.status) query = query.eq("status", data.status);
    if (data.search) query = query.or(`code.ilike.%${data.search}%,name_ar.ilike.%${data.search}%`);

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: programs, error, count } = await query.range(from, to);
    if (error) throw new Error(error.message);
    const programIds = (programs ?? []).map((program: any) => program.id);

    const [{ data: plans }, { data: students }] = await Promise.all([
      programIds.length ? supabaseAdmin.from("study_plans").select("id, program_id").in("program_id", programIds) : Promise.resolve({ data: [] as any[] }),
      programIds.length ? supabaseAdmin.from("student_profiles").select("id, program_id").in("program_id", programIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const planCount = new Map<string, number>();
    for (const plan of plans ?? []) planCount.set((plan as any).program_id, (planCount.get((plan as any).program_id) ?? 0) + 1);
    const studentCount = new Map<string, number>();
    for (const student of students ?? []) studentCount.set((student as any).program_id, (studentCount.get((student as any).program_id) ?? 0) + 1);

    const rows = (programs ?? []).map((program: any) => ({
      id: program.id,
      department: program.departments?.name_ar ?? null,
      code: program.code,
      name: program.name_ar,
      degree_type: program.degree_type ?? null,
      status: program.status ?? (program.is_active ? "active" : "inactive"),
      levels_count: program.years ?? null,
      plans_count: planCount.get(program.id) ?? 0,
      students_count: studentCount.get(program.id) ?? 0,
    }));
    return {
      rows,
      total: count ?? rows.length,
      page: data.page,
      pageSize: data.pageSize,
      kpis: {
        total: count ?? rows.length,
        active: rows.filter((row) => row.status === "active").length,
        inactive: rows.filter((row) => row.status !== "active").length,
        withoutPlans: rows.filter((row) => row.plans_count === 0).length,
        withStudents: rows.filter((row) => row.students_count > 0).length,
      },
      message: null,
    };
  });

export const getStudyPlansReportForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => academicPageSchema.parse(input))
  .handler(async ({ data: rawData, context }) => {
    await assertReportsAccess(context.userId);
    const enforcedDepartmentId = await applyAdminReportsDepartmentContainment(
      context.userId,
      rawData.department_id ?? null,
    );
    const data = { ...rawData, department_id: enforcedDepartmentId };
    if (!hasAcademicFilter(data)) {
      return { rows: [], total: 0, page: data.page, pageSize: data.pageSize,
        kpis: { total: 0, active: 0, withoutCourses: 0, avgCourses: 0, totalHours: 0 },
        message: "اختر فلترًا واحدًا على الأقل لعرض التقرير." };
    }

    let programIds: string[] | null = null;
    if (data.department_id) {
      const { data: programs, error } = await supabaseAdmin.from("programs").select("id").eq("department_id", data.department_id);
      if (error) throw new Error(error.message);
      programIds = (programs ?? []).map((program: any) => program.id);
      if (programIds.length === 0) return { rows: [], total: 0, page: data.page, pageSize: data.pageSize, kpis: { total: 0, active: 0, withoutCourses: 0, avgCourses: 0, totalHours: 0 }, message: null };
    }
    let query = supabaseAdmin
      .from("study_plans")
      .select("id, name, version, program_id, status, is_active, total_credit_hours, updated_at, programs(name_ar, code, department_id, departments(name_ar))", { count: "exact" })
      .order("updated_at", { ascending: false });
    if (data.program_id) query = query.eq("program_id", data.program_id);
    else if (programIds) query = query.in("program_id", programIds);
    if (data.status) query = query.eq("status", data.status);
    if (data.search) query = query.or(`name.ilike.%${data.search}%,version.ilike.%${data.search}%`);
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: plans, error, count } = await query.range(from, to);
    if (error) throw new Error(error.message);
    const planIds = (plans ?? []).map((plan: any) => plan.id);
    const { data: planCourses } = planIds.length
      ? await supabaseAdmin.from("study_plan_courses").select("study_plan_id, courses:courses!study_plan_courses_course_id_fkey(credit_hours)").in("study_plan_id", planIds)
      : { data: [] as any[] };
    const courseCount = new Map<string, number>();
    const hoursByPlan = new Map<string, number>();
    for (const link of planCourses ?? []) {
      const planId = (link as any).study_plan_id;
      courseCount.set(planId, (courseCount.get(planId) ?? 0) + 1);
      hoursByPlan.set(planId, (hoursByPlan.get(planId) ?? 0) + Number((link as any).courses?.credit_hours ?? 0));
    }
    const rows = (plans ?? []).map((plan: any) => ({
      id: plan.id,
      name: plan.name,
      code: plan.version,
      department: plan.programs?.departments?.name_ar ?? null,
      program: plan.programs?.name_ar ?? null,
      program_code: plan.programs?.code ?? null,
      academic_year: null as string | null,
      status: plan.status ?? (plan.is_active ? "active" : "archived"),
      courses_count: courseCount.get(plan.id) ?? 0,
      total_hours: hoursByPlan.get(plan.id) || plan.total_credit_hours || 0,
      updated_at: plan.updated_at,
    }));
    const totalCourses = rows.reduce((sum, row) => sum + row.courses_count, 0);
    return {
      rows,
      total: count ?? rows.length,
      page: data.page,
      pageSize: data.pageSize,
      kpis: {
        total: count ?? rows.length,
        active: rows.filter((row) => row.status === "active").length,
        withoutCourses: rows.filter((row) => row.courses_count === 0).length,
        avgCourses: rows.length ? Math.round((totalCourses / rows.length) * 10) / 10 : 0,
        totalHours: rows.reduce((sum, row) => sum + row.total_hours, 0),
      },
      message: null,
    };
  });

export const getCoursesReportForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => coursesReportSchema.parse(input))
  .handler(async ({ data: rawData, context }) => {
    await assertReportsAccess(context.userId);
    const enforcedDepartmentId = await applyAdminReportsDepartmentContainment(
      context.userId,
      rawData.department_id ?? null,
    );
    const data = { ...rawData, department_id: enforcedDepartmentId };
    const hasFilter = Boolean(data.department_id || data.program_id || data.level_id || data.semester_code !== "all" || data.status || data.search);
    if (!hasFilter) {
      return { rows: [], total: 0, page: data.page, pageSize: data.pageSize,
        kpis: { total: 0, missingCode: 0, withoutPlan: 0, withoutLevel: 0, withoutSemester: 0, complete: 0, incomplete: 0 },
        message: "اختر فلترًا واحدًا على الأقل لعرض التقرير." };
    }
    let scopedCourseIds: string[] | null = null;
    if (data.program_id || data.level_id || data.semester_code !== "all") {
      let linkQuery = supabaseAdmin.from("study_plan_courses").select("course_id, study_plans(program_id)");
      if (data.level_id) linkQuery = linkQuery.eq("level_id", data.level_id);
      if (data.semester_code !== "all") linkQuery = linkQuery.eq("semester_code", data.semester_code);
      const { data: links, error } = await linkQuery;
      if (error) throw new Error(error.message);
      scopedCourseIds = Array.from(new Set((links ?? [])
        .filter((link: any) => !data.program_id || link.study_plans?.program_id === data.program_id)
        .map((link: any) => link.course_id)));
      if (scopedCourseIds.length === 0) return { rows: [], total: 0, page: data.page, pageSize: data.pageSize, kpis: { total: 0, missingCode: 0, withoutPlan: 0, withoutLevel: 0, withoutSemester: 0, complete: 0, incomplete: 0 }, message: null };
    }
    let query = supabaseAdmin
      .from("courses")
      .select("id, code, name_ar, department_id, theory_hours, practical_hours, credit_hours, status, departments(name_ar)", { count: "exact" })
      .order("code");
    if (data.department_id) query = query.eq("department_id", data.department_id);
    if (data.status) query = query.eq("status", data.status);
    if (data.search) query = query.or(`code.ilike.%${data.search}%,name_ar.ilike.%${data.search}%`);
    if (scopedCourseIds) query = query.in("id", scopedCourseIds);
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: courses, error, count } = await query.range(from, to);
    if (error) throw new Error(error.message);
    const courseIds = (courses ?? []).map((course: any) => course.id);
    const { data: links } = courseIds.length
      ? await supabaseAdmin.from("study_plan_courses").select("course_id, level_id, semester_code, study_plans(name, programs(name_ar, code))").in("course_id", courseIds)
      : { data: [] as any[] };
    const linksByCourse = new Map<string, any[]>();
    for (const link of links ?? []) {
      const arr = linksByCourse.get((link as any).course_id) ?? [];
      arr.push(link);
      linksByCourse.set((link as any).course_id, arr);
    }
    const rows = (courses ?? []).map((course: any) => {
      const courseLinks = linksByCourse.get(course.id) ?? [];
      const firstLink = courseLinks[0];
      const incomplete = !course.code || !course.name_ar || !course.department_id || courseLinks.length === 0
        || courseLinks.some((link) => !link.level_id || !link.semester_code);
      return {
        id: course.id,
        code: course.code,
        name: course.name_ar,
        department: course.departments?.name_ar ?? null,
        plan_or_program: firstLink?.study_plans?.programs?.name_ar ?? firstLink?.study_plans?.name ?? null,
        level: firstLink?.level_id ? "Ù…Ø­Ø¯Ø¯" : null,
        semester: firstLink?.semester_code ?? null,
        theory_hours: course.theory_hours ?? 0,
        practical_hours: course.practical_hours ?? 0,
        credit_hours: course.credit_hours ?? 0,
        data_status: incomplete ? "Ù†Ø§Ù‚Øµ" : "Ù…ÙƒØªÙ…Ù„",
        links_count: courseLinks.length,
      };
    });
    return {
      rows,
      total: count ?? rows.length,
      page: data.page,
      pageSize: data.pageSize,
      kpis: {
        total: count ?? rows.length,
        missingCode: rows.filter((row) => !row.code).length,
        withoutPlan: rows.filter((row) => row.links_count === 0).length,
        withoutLevel: rows.filter((row) => !row.level).length,
        withoutSemester: rows.filter((row) => !row.semester).length,
        complete: rows.filter((row) => row.data_status === "Ù…ÙƒØªÙ…Ù„").length,
        incomplete: rows.filter((row) => row.data_status === "Ù†Ø§Ù‚Øµ").length,
      },
      message: null,
    };
  });

export const getStudyPlanCoverageReportForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => coverageReportSchema.parse(input))
  .handler(async ({ data: rawData, context }) => {
    await assertReportsAccess(context.userId);
    const enforcedDepartmentId = await applyAdminReportsDepartmentContainment(
      context.userId,
      rawData.department_id ?? null,
    );
    const data = { ...rawData, department_id: enforcedDepartmentId };
    const hasFilter = Boolean(data.department_id || data.program_id || data.study_plan_id || data.level_id || data.semester_code !== "all");
    if (!hasFilter) {
      return { rows: [], total: 0, page: data.page, pageSize: data.pageSize,
        kpis: { plans: 0, filledSlots: 0, emptySlots: 0, courses: 0, hours: 0 },
        message: "اختر فلترًا واحدًا على الأقل لعرض التقرير." };
    }
    let programIds: string[] | null = null;
    if (data.department_id) {
      const { data: programs, error } = await supabaseAdmin.from("programs").select("id").eq("department_id", data.department_id);
      if (error) throw new Error(error.message);
      programIds = (programs ?? []).map((program: any) => program.id);
    }
    let plansQuery = supabaseAdmin
      .from("study_plans")
      .select("id, name, version, program_id, programs(name_ar, code, departments(name_ar))")
      .order("name");
    if (data.study_plan_id) plansQuery = plansQuery.eq("id", data.study_plan_id);
    if (data.program_id) plansQuery = plansQuery.eq("program_id", data.program_id);
    else if (programIds) plansQuery = plansQuery.in("program_id", programIds);
    const { data: plans, error: plansErr } = await plansQuery.limit(200);
    if (plansErr) throw new Error(plansErr.message);
    const planIds = (plans ?? []).map((plan: any) => plan.id);
    if (planIds.length === 0) return { rows: [], total: 0, page: data.page, pageSize: data.pageSize, kpis: { plans: 0, filledSlots: 0, emptySlots: 0, courses: 0, hours: 0 }, message: null };
    const [{ data: levels }, { data: links, error: linksErr }] = await Promise.all([
      supabaseAdmin.from("academic_levels").select("id, name, level_number").order("level_number"),
      supabaseAdmin.from("study_plan_courses").select("study_plan_id, level_id, semester_code, courses:courses!study_plan_courses_course_id_fkey(credit_hours)").in("study_plan_id", planIds),
    ]);
    if (linksErr) throw new Error(linksErr.message);
    const selectedLevels = (levels ?? []).filter((level: any) => !data.level_id || level.id === data.level_id);
    const semesters = data.semester_code === "all" ? ["first", "second"] : [data.semester_code];
    const grouped = new Map<string, { count: number; hours: number }>();
    for (const link of links ?? []) {
      if (data.level_id && (link as any).level_id !== data.level_id) continue;
      if (data.semester_code !== "all" && (link as any).semester_code !== data.semester_code) continue;
      const key = `${(link as any).study_plan_id}|${(link as any).level_id}|${(link as any).semester_code}`;
      const current = grouped.get(key) ?? { count: 0, hours: 0 };
      current.count += 1;
      current.hours += Number((link as any).courses?.credit_hours ?? 0);
      grouped.set(key, current);
    }
    const allRows = (plans ?? []).flatMap((plan: any) => selectedLevels.flatMap((level: any) => semesters.map((semester) => {
      const current = grouped.get(`${plan.id}|${level.id}|${semester}`) ?? { count: 0, hours: 0 };
      return {
        id: `${plan.id}-${level.id}-${semester}`,
        plan: `${plan.name} (${plan.version})`,
        program: plan.programs?.name_ar ?? null,
        level: level.name,
        semester,
        courses_count: current.count,
        total_hours: current.hours,
        notes: current.count === 0 ? "Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ù‚Ø±Ø±Ø§Øª" : current.hours === 0 ? "Ù„Ø§ ØªÙˆØ¬Ø¯ Ø³Ø§Ø¹Ø§Øª" : "ØªÙˆØ²ÙŠØ¹ Ù…ÙƒØªÙ…Ù„",
      };
    })));
    const from = (data.page - 1) * data.pageSize;
    const rows = allRows.slice(from, from + data.pageSize);
    return {
      rows,
      total: allRows.length,
      page: data.page,
      pageSize: data.pageSize,
      kpis: {
        plans: planIds.length,
        filledSlots: allRows.filter((row) => row.courses_count > 0).length,
        emptySlots: allRows.filter((row) => row.courses_count === 0).length,
        courses: allRows.reduce((sum, row) => sum + row.courses_count, 0),
        hours: allRows.reduce((sum, row) => sum + row.total_hours, 0),
      },
      message: null,
    };
  });

const SCHEDULE_REPORT_ROLES = ["system_admin", "admin", "dean", "registrar", "department_head"] as const;

const scheduleReportSchema = z.object({
  department_id: z.string().uuid().optional().nullable(),
  program_id: z.string().uuid().optional().nullable(),
  level_id: z.string().uuid().optional().nullable(),
  academic_year_id: z.string().uuid().optional().nullable(),
  semester_id: z.string().uuid().optional().nullable(),
  faculty_profile_id: z.string().uuid().optional().nullable(),
  room_id: z.string().uuid().optional().nullable(),
  course_section_id: z.string().uuid().optional().nullable(),
  day_of_week: z.string().trim().max(24).optional().nullable(),
  schedule_type: z.string().trim().max(24).optional().nullable(),
  assignment_status: z.enum(["all", "assigned", "unassigned"]).default("all"),
  section_status: z.string().trim().max(40).optional().nullable(),
  room_type: z.string().trim().max(40).optional().nullable(),
  conflict_type: z.enum(["all", "faculty", "room", "group", "missing_data"]).default("all"),
  search: z.string().trim().max(160).optional().nullable(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

async function assertScheduleReportsAccess(userId: string) {
  await assertAnyRole(userId, SCHEDULE_REPORT_ROLES, "ليس لديك صلاحية عرض تقارير الجداول والإسناد");
}

/**
 * Actor-derived department enforcement for schedule reports.
 * Department heads (without wider university roles) are forced to their own
 * department — client-supplied wider/other department_id is DENIED.
 * Deans require proven college→department containment (fail closed today).
 */
async function applyScheduleDepartmentScope(
  userId: string,
  data: z.infer<typeof scheduleReportSchema>,
): Promise<z.infer<typeof scheduleReportSchema>> {
  const departmentId = await applyAdminReportsDepartmentContainment(
    userId,
    data.department_id ?? null,
  );
  return { ...data, department_id: departmentId };
}

function hasScheduleFilter(data: z.infer<typeof scheduleReportSchema>, extra = false) {
  return Boolean(
    extra
    || data.department_id
    || data.program_id
    || data.level_id
    || data.academic_year_id
    || data.semester_id
    || data.faculty_profile_id
    || data.room_id
    || data.course_section_id
    || data.day_of_week
    || data.schedule_type
    || data.assignment_status !== "all"
    || data.section_status
    || data.room_type
    || data.conflict_type !== "all"
    || data.search,
  );
}

function paginateRows<T>(rows: T[], page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  return rows.slice(from, from + pageSize);
}

async function loadScheduleBase() {
  const [offeringsRes, sectionsRes, scheduleRes, roomsRes, slotsRes, facultyRes, coursesRes, programsRes, levelsRes, yearsRes, semestersRes, departmentsRes] = await Promise.all([
    supabaseAdmin.from("course_offerings").select(`id, course_id, academic_year_id, semester_id, program_id, level_id, status`).limit(5000),
    supabaseAdmin.from("course_sections").select("id, course_offering_id, section_code, faculty_profile_id, capacity, status").limit(5000),
    supabaseAdmin.from("class_schedule").select("id, course_section_id, faculty_profile_id, room_id, time_slot_id, schedule_type, status").limit(10000),
    supabaseAdmin.from("rooms").select("id, code, name_ar, room_type, capacity, is_active").limit(2000),
    supabaseAdmin.from("time_slots").select("id, day_of_week, start_time, end_time, name_ar").limit(2000),
    supabaseAdmin.from("faculty_profiles").select("id, full_name_ar, employee_number, department_id").limit(3000),
    supabaseAdmin.from("courses").select("id, code, name_ar, department_id, credit_hours").limit(5000),
    supabaseAdmin.from("programs").select("id, name_ar, code, department_id").limit(2000),
    supabaseAdmin.from("academic_levels").select("id, name, level_number").limit(200),
    supabaseAdmin.from("academic_years").select("id, name").limit(200),
    supabaseAdmin.from("semesters").select("id, name, code").limit(500),
    supabaseAdmin.from("departments").select("id, name_ar").limit(500),
  ]);
  const all = [offeringsRes, sectionsRes, scheduleRes, roomsRes, slotsRes, facultyRes, coursesRes, programsRes, levelsRes, yearsRes, semestersRes, departmentsRes];
  const firstError = all.find((res) => res.error)?.error;
  if (firstError) throw new Error(firstError.message);

  const coursesById = new Map((coursesRes.data ?? []).map((r: any) => [r.id, r]));
  const programsById = new Map((programsRes.data ?? []).map((r: any) => [r.id, r]));
  const levelsById = new Map((levelsRes.data ?? []).map((r: any) => [r.id, r]));
  const yearsById = new Map((yearsRes.data ?? []).map((r: any) => [r.id, r]));
  const semestersById = new Map((semestersRes.data ?? []).map((r: any) => [r.id, r]));
  const departmentsById = new Map((departmentsRes.data ?? []).map((r: any) => [r.id, r]));

  const offerings = (offeringsRes.data ?? []).map((o: any) => {
    const course: any = coursesById.get(o.course_id) ?? null;
    const program: any = programsById.get(o.program_id) ?? null;
    return {
      ...o,
      courses: course ? { ...course, departments: course.department_id ? departmentsById.get(course.department_id) ?? null : null } : null,
      programs: program ? { ...program, departments: program.department_id ? departmentsById.get(program.department_id) ?? null : null } : null,
      academic_levels: levelsById.get(o.level_id) ?? null,
      academic_years: yearsById.get(o.academic_year_id) ?? null,
      semesters: semestersById.get(o.semester_id) ?? null,
    };
  });

  const faculty = (facultyRes.data ?? []).map((f: any) => ({
    ...f,
    departments: f.department_id ? departmentsById.get(f.department_id) ?? null : null,
  }));

  return {
    offerings,
    sections: sectionsRes.data ?? [],
    schedules: scheduleRes.data ?? [],
    rooms: roomsRes.data ?? [],
    slots: slotsRes.data ?? [],
    faculty,
  };
}

function scheduleLookups(base: Awaited<ReturnType<typeof loadScheduleBase>>) {
  return {
    sectionsByOffering: new Map<string, any[]>(),
    schedulesBySection: new Map<string, any[]>(),
    sectionsById: new Map((base.sections as any[]).map((row) => [row.id, row])),
    roomsById: new Map((base.rooms as any[]).map((row) => [row.id, row])),
    slotsById: new Map((base.slots as any[]).map((row) => [row.id, row])),
    facultyById: new Map((base.faculty as any[]).map((row) => [row.id, row])),
  };
}

function enrichScheduleMaps(base: Awaited<ReturnType<typeof loadScheduleBase>>) {
  const lookups = scheduleLookups(base);
  for (const section of base.sections as any[]) {
    const arr = lookups.sectionsByOffering.get(section.course_offering_id) ?? [];
    arr.push(section);
    lookups.sectionsByOffering.set(section.course_offering_id, arr);
  }
  for (const session of base.schedules as any[]) {
    const arr = lookups.schedulesBySection.get(session.course_section_id) ?? [];
    arr.push(session);
    lookups.schedulesBySection.set(session.course_section_id, arr);
  }
  return lookups;
}

function offeringMatches(offering: any, data: z.infer<typeof scheduleReportSchema>) {
  const course = offering.courses;
  const program = offering.programs;
  const q = data.search?.trim().toLowerCase();
  if (data.department_id && course?.department_id !== data.department_id && program?.department_id !== data.department_id) return false;
  if (data.program_id && offering.program_id !== data.program_id) return false;
  if (data.level_id && offering.level_id !== data.level_id) return false;
  if (data.academic_year_id && offering.academic_year_id !== data.academic_year_id) return false;
  if (data.semester_id && offering.semester_id !== data.semester_id) return false;
  if (q && !`${course?.code ?? ""} ${course?.name_ar ?? ""}`.toLowerCase().includes(q)) return false;
  return true;
}

export const getScheduleReportLookupsForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertScheduleReportsAccess(context.userId);
    // Fail closed for dean without proven college→department containment.
    const forcedDepartmentId = await applyAdminReportsDepartmentContainment(
      context.userId,
      null,
    );
    const scope = await resolveReportActorScope(context.userId);
    const isDeptOnly =
      scope.level === "department" &&
      !scope.roles.some((r) =>
        ["system_admin", "admin", "dean", "registrar"].includes(r),
      );
    if (isDeptOnly && !scope.departmentId) {
      throw new Error("رئيس القسم بلا قسم مرتبط — يُرفض النطاق");
    }

    const [departments, programs, levels, years, semesters, faculty, rooms, sections] = await Promise.all([
      supabaseAdmin.from("departments").select("id, name_ar").order("name_ar"),
      supabaseAdmin.from("programs").select("id, name_ar, code, department_id").order("sort_order"),
      supabaseAdmin.from("academic_levels").select("id, name, level_number").order("level_number"),
      supabaseAdmin.from("academic_years").select("id, name, is_current").order("start_date", { ascending: false }),
      supabaseAdmin.from("semesters").select("id, academic_year_id, name, code").order("start_date"),
      supabaseAdmin.from("faculty_profiles").select("id, full_name_ar, employee_number, department_id").order("full_name_ar"),
      supabaseAdmin.from("rooms").select("id, code, name_ar, room_type, capacity").order("code"),
      supabaseAdmin.from("course_sections").select("id, section_code").order("section_code"),
    ]);
    const firstError = [departments, programs, levels, years, semesters, faculty, rooms, sections].find((res) => res.error)?.error;
    if (firstError) throw new Error(firstError.message);

    let departmentRows = departments.data ?? [];
    let programRows = programs.data ?? [];
    let facultyRows = faculty.data ?? [];
    const scopedDeptId = forcedDepartmentId ?? (isDeptOnly ? scope.departmentId : null);
    if (scopedDeptId) {
      departmentRows = departmentRows.filter((d: { id: string }) => d.id === scopedDeptId);
      programRows = programRows.filter((p: { department_id: string | null }) => p.department_id === scopedDeptId);
      facultyRows = facultyRows.filter((f: { department_id: string | null }) => f.department_id === scopedDeptId);
    }

    return {
      departments: departmentRows,
      programs: programRows,
      levels: levels.data ?? [],
      years: years.data ?? [],
      semesters: semesters.data ?? [],
      faculty: facultyRows,
      rooms: rooms.data ?? [],
      sections: sections.data ?? [],
      days: ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"],
      scheduleTypes: ["lecture", "lab", "tutorial", "exam"],
      forcedDepartmentId: scopedDeptId,
    };
  });

export const getCourseAssignmentsReportForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scheduleReportSchema.parse(input))
  .handler(async ({ data: rawScheduleData, context }) => {
    await assertScheduleReportsAccess(context.userId);
    const data = await applyScheduleDepartmentScope(context.userId, rawScheduleData);
    if (!hasScheduleFilter(data)) return { rows: [], total: 0, page: data.page, pageSize: data.pageSize, kpis: {}, message: "Ø§Ø®ØªØ± ÙÙ„ØªØ±Ù‹Ø§ ÙˆØ§Ø­Ø¯Ù‹Ø§ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„ Ù„Ø¹Ø±Ø¶ Ø§Ù„ØªÙ‚Ø±ÙŠØ±." };
    const base = await loadScheduleBase();
    const maps = enrichScheduleMaps(base);
    let rows = (base.offerings as any[]).filter((offering) => offeringMatches(offering, data)).map((offering) => {
      const sections = maps.sectionsByOffering.get(offering.id) ?? [];
      const assignedSections = sections.filter((section) => section.faculty_profile_id);
      const scheduleCount = sections.reduce((sum, section) => sum + (maps.schedulesBySection.get(section.id)?.length ?? 0), 0);
      const faculty = assignedSections[0] ? maps.facultyById.get(assignedSections[0].faculty_profile_id) : null;
      return {
        id: offering.id,
        department: offering.courses?.departments?.name_ar ?? offering.programs?.departments?.name_ar ?? null,
        program: offering.programs?.name_ar ?? null,
        level: offering.academic_levels?.name ?? null,
        course: offering.courses?.name_ar ?? null,
        course_code: offering.courses?.code ?? null,
        academic_year: offering.academic_years?.name ?? null,
        semester: offering.semesters?.name ?? offering.semesters?.code ?? null,
        faculty: faculty?.full_name_ar ?? null,
        assignment_status: assignedSections.length > 0 ? "Ù…Ø³Ù†Ø¯" : "ØºÙŠØ± Ù…Ø³Ù†Ø¯",
        groups_count: sections.length,
        schedule_sessions: scheduleCount,
      };
    });
    if (data.assignment_status === "assigned") rows = rows.filter((row) => row.assignment_status === "Ù…Ø³Ù†Ø¯");
    if (data.assignment_status === "unassigned") rows = rows.filter((row) => row.assignment_status === "ØºÙŠØ± Ù…Ø³Ù†Ø¯");
    if (data.faculty_profile_id) {
      const offeringIds = new Set((base.sections as any[]).filter((section) => section.faculty_profile_id === data.faculty_profile_id).map((section) => section.course_offering_id));
      rows = rows.filter((row) => offeringIds.has(row.id));
    }
    const total = rows.length;
    const facultyIds = new Set((base.sections as any[]).filter((section) => section.faculty_profile_id).map((section) => section.faculty_profile_id));
    return {
      rows: paginateRows(rows, data.page, data.pageSize),
      total,
      page: data.page,
      pageSize: data.pageSize,
      kpis: {
        total,
        assigned: rows.filter((row) => row.assignment_status === "Ù…Ø³Ù†Ø¯").length,
        unassigned: rows.filter((row) => row.assignment_status === "ØºÙŠØ± Ù…Ø³Ù†Ø¯").length,
        faculty: facultyIds.size,
        groups: rows.reduce((sum, row) => sum + row.groups_count, 0),
        withSchedule: rows.filter((row) => row.schedule_sessions > 0).length,
      },
      message: null,
    };
  });

export const getUnassignedCoursesReportForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scheduleReportSchema.parse(input))
  .handler(async ({ data: rawScheduleData, context }) => {
    await assertScheduleReportsAccess(context.userId);
    const data = await applyScheduleDepartmentScope(context.userId, rawScheduleData);
    if (!hasScheduleFilter(data)) return { rows: [], total: 0, page: data.page, pageSize: data.pageSize, kpis: {}, message: "Ø§Ø®ØªØ± ÙÙ„ØªØ±Ù‹Ø§ ÙˆØ§Ø­Ø¯Ù‹Ø§ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„ Ù„Ø¹Ø±Ø¶ Ø§Ù„ØªÙ‚Ø±ÙŠØ±." };
    const base = await loadScheduleBase();
    const maps = enrichScheduleMaps(base);
    const rows = (base.offerings as any[])
      .filter((offering) => offeringMatches(offering, data))
      .map((offering) => {
        const sections = maps.sectionsByOffering.get(offering.id) ?? [];
        const assigned = sections.some((section) => section.faculty_profile_id);
        const scheduleCount = sections.reduce((sum, section) => sum + (maps.schedulesBySection.get(section.id)?.length ?? 0), 0);
        return {
          id: offering.id,
          department: offering.courses?.departments?.name_ar ?? offering.programs?.departments?.name_ar ?? null,
          program: offering.programs?.name_ar ?? null,
          level: offering.academic_levels?.name ?? null,
          course: offering.courses?.name_ar ?? null,
          course_code: offering.courses?.code ?? null,
          academic_year: offering.academic_years?.name ?? null,
          semester: offering.semesters?.name ?? offering.semesters?.code ?? null,
          expected_students: null,
          groups_count: sections.length,
          has_schedule: scheduleCount > 0,
          note: sections.length > 0 ? "ØºÙŠØ± Ù…Ø³Ù†Ø¯ ÙˆÙ„Ù‡ Ù…Ø¬Ù…ÙˆØ¹Ø§Øª Ø¯Ø±Ø§Ø³ÙŠØ©" : "ØºÙŠØ± Ù…Ø³Ù†Ø¯",
          assigned,
        };
      })
      .filter((row) => !row.assigned);
    const byDept = new Set(rows.map((row) => row.department).filter(Boolean)).size;
    const byProgram = new Set(rows.map((row) => row.program).filter(Boolean)).size;
    const byLevel = new Set(rows.map((row) => row.level).filter(Boolean)).size;
    return {
      rows: paginateRows(rows, data.page, data.pageSize),
      total: rows.length,
      page: data.page,
      pageSize: data.pageSize,
      kpis: {
        total: rows.length,
        departments: byDept,
        programs: byProgram,
        levels: byLevel,
        withGroups: rows.filter((row) => row.groups_count > 0).length,
        withSchedule: rows.filter((row) => row.has_schedule).length,
      },
      message: null,
    };
  });

export const getStudyGroupsReportForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scheduleReportSchema.parse(input))
  .handler(async ({ data: rawScheduleData, context }) => {
    await assertScheduleReportsAccess(context.userId);
    const data = await applyScheduleDepartmentScope(context.userId, rawScheduleData);
    if (!hasScheduleFilter(data)) return { rows: [], total: 0, page: data.page, pageSize: data.pageSize, kpis: {}, message: "Ø§Ø®ØªØ± ÙÙ„ØªØ±Ù‹Ø§ ÙˆØ§Ø­Ø¯Ù‹Ø§ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„ Ù„Ø¹Ø±Ø¶ Ø§Ù„ØªÙ‚Ø±ÙŠØ±." };
    const base = await loadScheduleBase();
    const maps = enrichScheduleMaps(base);
    let rows = (base.sections as any[]).map((section) => {
      const offering = (base.offerings as any[]).find((item) => item.id === section.course_offering_id);
      const sessions = maps.schedulesBySection.get(section.id) ?? [];
      return {
        id: section.id,
        section_code: section.section_code,
        section_name: null as string | null,
        department: offering?.courses?.departments?.name_ar ?? offering?.programs?.departments?.name_ar ?? null,
        program: offering?.programs?.name_ar ?? null,
        level: offering?.academic_levels?.name ?? null,
        academic_year: offering?.academic_years?.name ?? null,
        semester: offering?.semesters?.name ?? offering?.semesters?.code ?? null,
        expected_students: section.capacity ?? null,
        courses_count: offering ? 1 : 0,
        schedule_sessions: sessions.length,
        status: section.status,
        offering,
      };
    }).filter((row) => row.offering && offeringMatches(row.offering, data));
    if (data.course_section_id) rows = rows.filter((row) => row.id === data.course_section_id);
    if (data.section_status) rows = rows.filter((row) => row.status === data.section_status);
    if (data.search) rows = rows.filter((row) => row.section_code.toLowerCase().includes(data.search!.toLowerCase()));
    return {
      rows: paginateRows(rows, data.page, data.pageSize),
      total: rows.length,
      page: data.page,
      pageSize: data.pageSize,
      kpis: {
        total: rows.length,
        withoutStudents: rows.filter((row) => !row.expected_students).length,
        withoutCourses: rows.filter((row) => row.courses_count === 0).length,
        withoutSchedule: rows.filter((row) => row.schedule_sessions === 0).length,
        withSchedule: rows.filter((row) => row.schedule_sessions > 0).length,
        avgCourses: rows.length ? Math.round((rows.reduce((sum, row) => sum + row.courses_count, 0) / rows.length) * 10) / 10 : 0,
      },
      message: null,
    };
  });

export const getTimetableReportForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scheduleReportSchema.parse(input))
  .handler(async ({ data: rawScheduleData, context }) => {
    await assertScheduleReportsAccess(context.userId);
    const data = await applyScheduleDepartmentScope(context.userId, rawScheduleData);
    if (!hasScheduleFilter(data)) return { rows: [], total: 0, page: data.page, pageSize: data.pageSize, kpis: {}, message: "Ø§Ø®ØªØ± ÙÙ„ØªØ±Ù‹Ø§ ÙˆØ§Ø­Ø¯Ù‹Ø§ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„ Ù„Ø¹Ø±Ø¶ Ø§Ù„ØªÙ‚Ø±ÙŠØ±." };
    const base = await loadScheduleBase();
    const maps = enrichScheduleMaps(base);
    let rows = (base.schedules as any[]).map((session) => {
      const section = maps.sectionsById.get(session.course_section_id);
      const offering = section ? (base.offerings as any[]).find((item) => item.id === section.course_offering_id) : null;
      const room = maps.roomsById.get(session.room_id);
      const slot = maps.slotsById.get(session.time_slot_id);
      const faculty = maps.facultyById.get(session.faculty_profile_id ?? section?.faculty_profile_id);
      return {
        id: session.id,
        day: slot?.day_of_week ?? null,
        start_time: slot?.start_time ?? null,
        end_time: slot?.end_time ?? null,
        department: offering?.courses?.departments?.name_ar ?? offering?.programs?.departments?.name_ar ?? null,
        program: offering?.programs?.name_ar ?? null,
        level: offering?.academic_levels?.name ?? null,
        section_code: section?.section_code ?? null,
        course: offering?.courses?.name_ar ?? null,
        course_code: offering?.courses?.code ?? null,
        faculty: faculty?.full_name_ar ?? null,
        room: room ? `${room.code} â€” ${room.name_ar}` : null,
        schedule_type: session.schedule_type,
        notes: null as string | null,
        offering,
        session,
      };
    }).filter((row) => row.offering && offeringMatches(row.offering, data));
    if (data.course_section_id) rows = rows.filter((row) => row.session.course_section_id === data.course_section_id);
    if (data.faculty_profile_id) rows = rows.filter((row) => row.session.faculty_profile_id === data.faculty_profile_id);
    if (data.room_id) rows = rows.filter((row) => row.session.room_id === data.room_id);
    if (data.day_of_week) rows = rows.filter((row) => row.day === data.day_of_week);
    if (data.schedule_type) rows = rows.filter((row) => row.schedule_type === data.schedule_type);
    return {
      rows: paginateRows(rows, data.page, data.pageSize),
      total: rows.length,
      page: data.page,
      pageSize: data.pageSize,
      kpis: {
        total: rows.length,
        rooms: new Set(rows.map((row) => row.session.room_id).filter(Boolean)).size,
        faculty: new Set(rows.map((row) => row.session.faculty_profile_id).filter(Boolean)).size,
        groups: new Set(rows.map((row) => row.session.course_section_id).filter(Boolean)).size,
        withoutRoom: rows.filter((row) => !row.room).length,
        withoutFaculty: rows.filter((row) => !row.faculty).length,
      },
      message: null,
    };
  });

function timeDiffHours(start?: string | null, end?: string | null) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return 0;
  return Math.max(0, ((eh * 60 + em) - (sh * 60 + sm)) / 60);
}

export const getRoomUtilizationReportForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scheduleReportSchema.parse(input))
  .handler(async ({ data: rawScheduleData, context }) => {
    await assertScheduleReportsAccess(context.userId);
    const data = await applyScheduleDepartmentScope(context.userId, rawScheduleData);
    if (!hasScheduleFilter(data)) return { rows: [], total: 0, page: data.page, pageSize: data.pageSize, kpis: {}, message: "Ø§Ø®ØªØ± ÙÙ„ØªØ±Ù‹Ø§ ÙˆØ§Ø­Ø¯Ù‹Ø§ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„ Ù„Ø¹Ø±Ø¶ Ø§Ù„ØªÙ‚Ø±ÙŠØ±." };
    const base = await loadScheduleBase();
    const maps = enrichScheduleMaps(base);
    const filteredSessions = (base.schedules as any[]).filter((session) => {
      const section = maps.sectionsById.get(session.course_section_id);
      const offering = section ? (base.offerings as any[]).find((item) => item.id === section.course_offering_id) : null;
      const slot = maps.slotsById.get(session.time_slot_id);
      if (!offering || !offeringMatches(offering, data)) return false;
      if (data.room_id && session.room_id !== data.room_id) return false;
      if (data.day_of_week && slot?.day_of_week !== data.day_of_week) return false;
      return true;
    });
    const sessionsByRoom = new Map<string, any[]>();
    for (const session of filteredSessions) {
      const arr = sessionsByRoom.get(session.room_id) ?? [];
      arr.push(session);
      sessionsByRoom.set(session.room_id, arr);
    }
    let rows = (base.rooms as any[]).filter((room) => {
      if (data.room_id && room.id !== data.room_id) return false;
      if (data.room_type && room.room_type !== data.room_type) return false;
      return true;
    }).map((room) => {
      const sessions = sessionsByRoom.get(room.id) ?? [];
      const slots = sessions.map((session) => maps.slotsById.get(session.time_slot_id)).filter(Boolean);
      const hours = slots.reduce((sum, slot) => sum + timeDiffHours(slot.start_time, slot.end_time), 0);
      const first = slots.map((slot) => slot.start_time).sort()[0] ?? null;
      const last = slots.map((slot) => slot.end_time).sort().at(-1) ?? null;
      const day = data.day_of_week ?? (slots[0]?.day_of_week ?? null);
      return {
        id: room.id,
        room: `${room.code} â€” ${room.name_ar}`,
        room_type: room.room_type,
        capacity: room.capacity,
        day,
        sessions_count: sessions.length,
        scheduled_hours: Math.round(hours * 10) / 10,
        first_time: first,
        last_time: last,
        notes: sessions.length === 0 ? "ØºÙŠØ± Ù…Ø³ØªØ®Ø¯Ù…Ø© Ø¶Ù…Ù† Ø§Ù„ÙÙ„Ø§ØªØ±" : hours === 0 ? "Ø¨ÙŠØ§Ù†Ø§Øª Ù†Ø§Ù‚ØµØ©" : "Ù…Ø³ØªØ®Ø¯Ù…Ø©",
      };
    });
    rows = rows.filter((row) => row.sessions_count > 0 || data.room_id || data.room_type);
    return {
      rows: paginateRows(rows, data.page, data.pageSize),
      total: rows.length,
      page: data.page,
      pageSize: data.pageSize,
      kpis: {
        totalRooms: rows.length,
        usedRooms: rows.filter((row) => row.sessions_count > 0).length,
        unusedRooms: rows.filter((row) => row.sessions_count === 0).length,
        sessions: rows.reduce((sum, row) => sum + row.sessions_count, 0),
        hours: Math.round(rows.reduce((sum, row) => sum + row.scheduled_hours, 0) * 10) / 10,
        avgUtilization: rows.length ? Math.round((rows.reduce((sum, row) => sum + row.scheduled_hours, 0) / rows.length) * 10) / 10 : 0,
      },
      message: null,
    };
  });

export const getFacultyLoadReportForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scheduleReportSchema.parse(input))
  .handler(async ({ data: rawScheduleData, context }) => {
    await assertScheduleReportsAccess(context.userId);
    const data = await applyScheduleDepartmentScope(context.userId, rawScheduleData);
    if (!hasScheduleFilter(data)) return { rows: [], total: 0, page: data.page, pageSize: data.pageSize, kpis: {}, message: "Ø§Ø®ØªØ± ÙÙ„ØªØ±Ù‹Ø§ ÙˆØ§Ø­Ø¯Ù‹Ø§ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„ Ù„Ø¹Ø±Ø¶ Ø§Ù„ØªÙ‚Ø±ÙŠØ±." };
    const base = await loadScheduleBase();
    const maps = enrichScheduleMaps(base);
    const facultyRows = (base.faculty as any[]).filter((faculty) => {
      if (data.faculty_profile_id && faculty.id !== data.faculty_profile_id) return false;
      if (data.department_id && faculty.department_id !== data.department_id) return false;
      return true;
    }).map((faculty) => {
      const assignedSections = (base.sections as any[]).filter((section) => section.faculty_profile_id === faculty.id);
      const matchingSections = assignedSections.filter((section) => {
        const offering = (base.offerings as any[]).find((item) => item.id === section.course_offering_id);
        return offering && offeringMatches(offering, data);
      });
      const sessions = (base.schedules as any[]).filter((session) => {
        if (session.faculty_profile_id !== faculty.id) return false;
        const section = maps.sectionsById.get(session.course_section_id);
        const offering = section ? (base.offerings as any[]).find((item) => item.id === section.course_offering_id) : null;
        return offering && offeringMatches(offering, data);
      });
      const hours = sessions.reduce((sum, session) => {
        const slot = maps.slotsById.get(session.time_slot_id);
        return sum + timeDiffHours(slot?.start_time, slot?.end_time);
      }, 0);
      const courses = new Set(matchingSections.map((section) => section.course_offering_id)).size;
      const note = sessions.length === 0 ? "Ø¨Ø¯ÙˆÙ† Ø¬Ø¯ÙˆÙ„" : hours < 4 ? "Ø¹Ø¨Ø¡ Ù…Ù†Ø®ÙØ¶" : hours > 18 ? "Ø¹Ø¨Ø¡ Ù…Ø±ØªÙØ¹" : "Ø·Ø¨ÙŠØ¹ÙŠ";
      return {
        id: faculty.id,
        faculty: faculty.full_name_ar,
        department: faculty.departments?.name_ar ?? null,
        assigned_courses: courses,
        groups_count: matchingSections.length,
        schedule_sessions: sessions.length,
        scheduled_hours: Math.round(hours * 10) / 10,
        notes: note,
      };
    }).filter((row) => row.assigned_courses > 0 || row.schedule_sessions > 0 || data.faculty_profile_id);
    return {
      rows: paginateRows(facultyRows, data.page, data.pageSize),
      total: facultyRows.length,
      page: data.page,
      pageSize: data.pageSize,
      kpis: {
        faculty: facultyRows.length,
        assignedCourses: facultyRows.reduce((sum, row) => sum + row.assigned_courses, 0),
        sessions: facultyRows.reduce((sum, row) => sum + row.schedule_sessions, 0),
        hours: Math.round(facultyRows.reduce((sum, row) => sum + row.scheduled_hours, 0) * 10) / 10,
        maxLoad: facultyRows.reduce((max, row) => Math.max(max, row.scheduled_hours), 0),
        withoutSchedule: facultyRows.filter((row) => row.schedule_sessions === 0).length,
      },
      message: null,
    };
  });

export const getScheduleConflictIndicatorsForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scheduleReportSchema.parse(input))
  .handler(async ({ data: rawScheduleData, context }) => {
    await assertScheduleReportsAccess(context.userId);
    const data = await applyScheduleDepartmentScope(context.userId, rawScheduleData);
    if (!hasScheduleFilter(data)) return { rows: [], total: 0, page: data.page, pageSize: data.pageSize, kpis: {}, message: "Ø§Ø®ØªØ± ÙÙ„ØªØ±Ù‹Ø§ ÙˆØ§Ø­Ø¯Ù‹Ø§ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„ Ù„Ø¹Ø±Ø¶ Ø§Ù„ØªÙ‚Ø±ÙŠØ±." };
    const base = await loadScheduleBase();
    const maps = enrichScheduleMaps(base);
    const sessions = (base.schedules as any[]).map((session) => {
      const section = maps.sectionsById.get(session.course_section_id);
      const offering = section ? (base.offerings as any[]).find((item) => item.id === section.course_offering_id) : null;
      const slot = maps.slotsById.get(session.time_slot_id);
      const room = maps.roomsById.get(session.room_id);
      const faculty = maps.facultyById.get(session.faculty_profile_id ?? section?.faculty_profile_id);
      return { session, section, offering, slot, room, faculty };
    }).filter((item) => item.offering && offeringMatches(item.offering, data))
      .filter((item) => !data.day_of_week || item.slot?.day_of_week === data.day_of_week);
    const indicators: any[] = [];
    const groups = [
      { type: "faculty", label: "ØªØ¹Ø§Ø±Ø¶ Ù…Ø­Ø§Ø¶Ø±", key: (x: any) => x.faculty?.id },
      { type: "room", label: "ØªØ¹Ø§Ø±Ø¶ Ù‚Ø§Ø¹Ø©", key: (x: any) => x.room?.id },
      { type: "group", label: "ØªØ¹Ø§Ø±Ø¶ Ù…Ø¬Ù…ÙˆØ¹Ø© Ø¯Ø±Ø§Ø³ÙŠØ©", key: (x: any) => x.section?.id },
    ];
    for (const g of groups) {
      const map = new Map<string, any[]>();
      for (const item of sessions) {
        const entity = g.key(item);
        if (!entity || !item.slot?.day_of_week || !item.slot?.start_time || !item.slot?.end_time) continue;
        const key = `${entity}|${item.slot.day_of_week}|${item.slot.start_time}|${item.slot.end_time}`;
        const arr = map.get(key) ?? [];
        arr.push(item);
        map.set(key, arr);
      }
      for (const arr of map.values()) {
        if (arr.length > 1) {
          const first = arr[0];
          indicators.push({
            id: `${g.type}-${first.session.id}`,
            conflict_type: g.label,
            day: first.slot.day_of_week,
            start_time: first.slot.start_time,
            end_time: first.slot.end_time,
            course: first.offering?.courses?.name_ar ?? null,
            faculty: first.faculty?.full_name_ar ?? null,
            room: first.room ? `${first.room.code} â€” ${first.room.name_ar}` : null,
            section_code: first.section?.section_code ?? null,
            description: `${g.label}: ${arr.length} Ø¬Ù„Ø³Ø§Øª ÙÙŠ Ù†ÙØ³ Ø§Ù„ÙˆÙ‚Øª`,
          });
        }
      }
    }
    for (const item of sessions) {
      if (!item.room || !item.faculty || !item.slot?.start_time || !item.slot?.end_time) {
        indicators.push({
          id: `missing-${item.session.id}`,
          conflict_type: "Ø¬Ù„Ø³Ø© Ù†Ø§Ù‚ØµØ© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª",
          day: item.slot?.day_of_week ?? null,
          start_time: item.slot?.start_time ?? null,
          end_time: item.slot?.end_time ?? null,
          course: item.offering?.courses?.name_ar ?? null,
          faculty: item.faculty?.full_name_ar ?? null,
          room: item.room ? `${item.room.code} â€” ${item.room.name_ar}` : null,
          section_code: item.section?.section_code ?? null,
          description: "Ø¬Ù„Ø³Ø© Ø¨Ø¯ÙˆÙ† Ù‚Ø§Ø¹Ø© Ø£Ùˆ Ù…Ø­Ø§Ø¶Ø± Ø£Ùˆ ÙˆÙ‚Øª Ù…ÙƒØªÙ…Ù„",
        });
      }
    }
    const filtered = data.conflict_type === "all"
      ? indicators
      : indicators.filter((item) =>
        data.conflict_type === "faculty" ? item.conflict_type === "ØªØ¹Ø§Ø±Ø¶ Ù…Ø­Ø§Ø¶Ø±"
          : data.conflict_type === "room" ? item.conflict_type === "ØªØ¹Ø§Ø±Ø¶ Ù‚Ø§Ø¹Ø©"
          : data.conflict_type === "group" ? item.conflict_type === "ØªØ¹Ø§Ø±Ø¶ Ù…Ø¬Ù…ÙˆØ¹Ø© Ø¯Ø±Ø§Ø³ÙŠØ©"
          : item.conflict_type === "Ø¬Ù„Ø³Ø© Ù†Ø§Ù‚ØµØ© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª");
    return {
      rows: paginateRows(filtered, data.page, data.pageSize),
      total: filtered.length,
      page: data.page,
      pageSize: data.pageSize,
      kpis: {
        total: filtered.length,
        faculty: filtered.filter((item) => item.conflict_type === "ØªØ¹Ø§Ø±Ø¶ Ù…Ø­Ø§Ø¶Ø±").length,
        room: filtered.filter((item) => item.conflict_type === "ØªØ¹Ø§Ø±Ø¶ Ù‚Ø§Ø¹Ø©").length,
        group: filtered.filter((item) => item.conflict_type === "ØªØ¹Ø§Ø±Ø¶ Ù…Ø¬Ù…ÙˆØ¹Ø© Ø¯Ø±Ø§Ø³ÙŠØ©").length,
        missingData: filtered.filter((item) => item.conflict_type === "Ø¬Ù„Ø³Ø© Ù†Ø§Ù‚ØµØ© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª").length,
      },
      message: sessions.length === 0 ? "Ù„Ø§ ØªØªÙˆÙØ± Ø¨ÙŠØ§Ù†Ø§Øª ÙƒØ§ÙÙŠØ© Ù„Ø§Ø³ØªØ®Ø±Ø§Ø¬ Ù…Ø¤Ø´Ø±Ø§Øª Ø§Ù„ØªØ¹Ø§Ø±Ø¶Ø§Øª Ù„Ù‡Ø°Ø§ Ø§Ù„Ù†Ø·Ø§Ù‚." : null,
    };
  });

