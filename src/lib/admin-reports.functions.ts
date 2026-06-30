import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertAnyRole, assertStudentRead, REPORTS_ROLES } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertReportsAccess(userId: string) {
  await assertAnyRole(
    userId,
    REPORTS_ROLES,
    "ليس لديك صلاحية عرض التقارير",
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
    const k = keyFn(it) ?? "—";
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
    if (Number(r.percentage ?? 0) >= 60) cur.pass += 1;
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
    .map((s) => ({ ...s, status: "متفوق" }));
  const atRisk = studentRows.filter((s) => s.average < 60)
    .sort((a, b) => a.average - b.average)
    .slice(0, 50)
    .map((s) => ({ ...s, status: "متعثر" }));

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
      const pn = programMap.get(off.program_id) ?? "—";
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
      section_code: s?.section_code ?? "—",
      course: c ? `${c.code} — ${c.name_ar}` : "—",
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
    rank: f.academic_rank ?? "—",
    department: deptMap.get(f.department_id) ?? "—",
    sections: sectionsByFaculty.get(f.id) ?? 0,
    students: studentsByFaculty.get(f.id) ?? 0,
    status: f.status,
  })).sort((a, b) => b.sections - a.sections);

  const byDept = groupCount(faculty, (f) => deptMap.get(f.department_id) ?? null)
    .sort((a, b) => b.value - a.value);

  return { facultyRows, byDept };
}

const REQ_TYPE_AR: Record<string, string> = {
  absence_excuse: "عذر غياب",
  enrollment_suspension: "إيقاف قيد",
  enrollment_reinstatement: "إعادة قيد",
  extra_chance: "فرصة إضافية",
  transfer: "تحويل",
  equivalency: "معادلة",
  grade_appeal: "تظلم درجات",
  official_transcript: "سجل أكاديمي رسمي",
};
const REQ_STATUS_AR: Record<string, string> = {
  draft: "مسودة",
  submitted: "مقدّم",
  under_review: "قيد المراجعة",
  returned: "يحتاج استكمال",
  approved: "موافَق عليه",
  rejected: "مرفوض",
  cancelled: "ملغى",
};

async function fetchRequestsReport() {
  const rows = await fetchAll<{
    id: string;
    request_type: string;
    status: string;
    submitted_at: string | null;
    reviewed_at: string | null;
    created_at: string;
  }>("student_requests", (q) =>
    q.select("id, request_type, status, submitted_at, reviewed_at, created_at"));
  const byType = groupCount(rows, (r) => REQ_TYPE_AR[r.request_type] ?? r.request_type);
  const byStatus = groupCount(rows, (r) => REQ_STATUS_AR[r.status] ?? r.status);
  const approved = rows.filter((r) => r.status === "approved");
  const rejected = rows.filter((r) => r.status === "rejected");
  const reviewed = rows.filter((r) => r.submitted_at && r.reviewed_at);
  const avgMs = reviewed.length
    ? reviewed.reduce((acc, r) => acc + (new Date(r.reviewed_at!).getTime() - new Date(r.submitted_at!).getTime()), 0) / reviewed.length
    : 0;
  const avgDays = Math.round((avgMs / (1000 * 60 * 60 * 24)) * 10) / 10;
  return {
    total: rows.length,
    approvedCount: approved.length,
    rejectedCount: rejected.length,
    avgDays,
    byType, byStatus,
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
    const pname = pid ? (programMap.get(pid) ?? "—") : "—";
    feesByProgram.set(pname, (feesByProgram.get(pname) ?? 0) + Number(f.amount ?? 0));
  }
  const feesByProgramRows = Array.from(feesByProgram.entries())
    .map(([key, value]) => ({ key, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);

  const receiptStatusRows = groupCount(receipts, (r) => r.status);
  const discountsRows = groupCount(discounts, (d) => d.status);

  const paidVsOutstanding = [
    { key: "مسددة", value: Math.round(totalPaid * 100) / 100 },
    { key: "غير مسددة", value: Math.round(outstanding * 100) / 100 },
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
      await assertReportsAccess(context.userId);
      return fn();
    });
}

export const getReportsAcademic = reportsHandler(fetchAcademicReport);
export const getReportsPerformance = reportsHandler(fetchPerformanceReport);
export const getReportsEnrollment = reportsHandler(fetchEnrollmentReport);
export const getReportsFaculty = reportsHandler(fetchFacultyReport);
export const getReportsRequests = reportsHandler(fetchRequestsReport);
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
  .handler(async ({ data, context }) => {
    await assertStudentRead(context.userId);

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
    await assertAnyRole(context.userId, IMPORT_REPORT_ROLES, "ليس لديك صلاحية عرض تقارير الاستيراد");

    if (!hasImportReportFilter(data)) {
      return {
        rows: [],
        total: 0,
        page: data.page,
        pageSize: data.pageSize,
        kpis: { total: 0, completed: 0, failed: 0, rowsTotal: 0, errorsTotal: 0 },
        message: "اختر فلترًا واحدًا على الأقل لعرض التقرير.",
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
    await assertAnyRole(context.userId, IMPORT_REPORT_ROLES, "ليس لديك صلاحية عرض تقارير الاستيراد");
    const { data: row, error } = await supabaseAdmin
      .from("import_logs")
      .select("id, created_at, created_by, import_type, file_name, rows_total, rows_success, rows_failed, status, notes")
      .eq("id", data.import_log_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("عملية الاستيراد غير موجودة");
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
  academic_number: z.string().trim().max(32).regex(/^[A-Za-z0-9_-]*$/, "الرقم الأكاديمي يحتوي على أحرف غير صحيحة").optional(),
  student_name: z.string().trim().max(120).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

export const getStudentAccountsReportForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => studentAccountsReportSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertStudentRead(context.userId);

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
        message: "اختر فلترًا واحدًا على الأقل لعرض التقرير.",
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
