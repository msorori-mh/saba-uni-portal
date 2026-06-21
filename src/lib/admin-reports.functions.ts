import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const REPORTS_ROLES = [
  "system_admin", "admin", "dean", "registrar", "finance_officer", "student_affairs",
] as const;

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
