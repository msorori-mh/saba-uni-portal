import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { exportCsv, exportXlsx, type ExportRow } from "@/lib/reports/export";
import { cn } from "@/lib/utils";
import {
  GraduationCap, BookOpen, CalendarDays, ClipboardList, Users,
  FileWarning, Wallet, TrendingUp, Loader2, FileDown,
} from "lucide-react";

export const Route = createFileRoute("/admin/reports")({
  component: ReportsPage,
});

type TabId = "academic" | "performance" | "enrollment" | "faculty" | "requests" | "financial";

const TABS: Array<{ id: TabId; label: string; icon: any }> = [
  { id: "academic",    label: "التقارير الأكاديمية", icon: GraduationCap },
  { id: "performance", label: "تقارير الأداء",        icon: TrendingUp },
  { id: "enrollment",  label: "تقارير التسجيل",      icon: ClipboardList },
  { id: "faculty",     label: "تقارير هيئة التدريس", icon: Users },
  { id: "requests",    label: "تقارير الطلبات",      icon: FileWarning },
  { id: "financial",   label: "التقارير المالية",    icon: Wallet },
];

// -------- helpers --------
async function fetchAll<T = any>(
  table: string,
  build: (q: any) => any,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // up to 10k rows for performance targets
  for (let i = 0; i < 10; i++) {
    let q = supabase.from(table as any).select("*");
    q = build(q);
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
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

// -------- shared UI --------
function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: any }) {
  return (
    <div className="rounded-xl bg-card border border-border p-4 shadow-card flex items-center justify-between">
      <div>
        <div className="text-xs font-semibold text-muted-foreground">{label}</div>
        <div className="mt-1.5 font-display text-2xl font-extrabold text-primary">
          {typeof value === "number" ? value.toLocaleString("ar-EG") : value}
        </div>
      </div>
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary">
        <Icon className="h-4.5 w-4.5" />
      </div>
    </div>
  );
}

function ReportTable({
  title,
  reportName,
  columns,
  rows,
  loading,
}: {
  title: string;
  reportName: string;
  columns: Array<{ key: string; label: string; numeric?: boolean }>;
  rows: Array<Record<string, any>>;
  loading?: boolean;
}) {
  const exportRows: ExportRow[] = rows.map((r) => {
    const o: ExportRow = {};
    for (const c of columns) o[c.label] = r[c.key];
    return o;
  });

  return (
    <div className="rounded-xl bg-card border border-border shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="font-display text-sm font-bold text-primary">{title}</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!rows.length}
            onClick={() => exportCsv(reportName, exportRows)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs font-bold text-primary hover:bg-secondary disabled:opacity-50"
          >
            <FileDown className="h-3.5 w-3.5" /> CSV
          </button>
          <button
            type="button"
            disabled={!rows.length}
            onClick={() => exportXlsx(reportName, exportRows)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs font-bold text-primary hover:bg-secondary disabled:opacity-50"
          >
            <FileDown className="h-3.5 w-3.5" /> Excel
          </button>
        </div>
      </div>
      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="inline h-4 w-4 animate-spin me-2" /> جاري التحميل...
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">لا توجد بيانات.</div>
      ) : (
        <div className="overflow-x-auto max-h-[480px]">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs sticky top-0">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={cn("px-4 py-2 font-bold", c.numeric ? "text-left" : "text-right")}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border hover:bg-secondary/30">
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 py-2 text-xs", c.numeric ? "text-left font-mono" : "text-right")}>
                      {r[c.key] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ===================================================================
// TAB: ACADEMIC
// ===================================================================
function AcademicTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports-academic"],
    queryFn: async () => {
      const [students, programs, courses, sections, depts, levels] = await Promise.all([
        fetchAll<any>("student_profiles", (q) => q.select("id, status, program_id, department_id")),
        fetchAll<any>("programs", (q) => q.select("id, name_ar, department_id")),
        fetchAll<any>("courses", (q) => q.select("id, name_ar, code")),
        fetchAll<any>("course_sections", (q) => q.select("id, status")),
        fetchAll<any>("departments", (q) => q.select("id, name_ar")),
        fetchAll<any>("academic_levels", (q) => q.select("id, name, level_number")),
      ]);
      const statuses = fetchAll<any>("student_academic_status", (q) =>
        q.select("student_profile_id, level_id, enrollment_status"));
      const sas = await statuses;

      const programMap = new Map(programs.map((p) => [p.id, p.name_ar]));
      const deptMap = new Map(depts.map((d) => [d.id, d.name_ar]));
      const levelMap = new Map(levels.map((l) => [l.id, l.name]));

      // Latest SAS per student for level
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
    },
  });

  const d = data;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="إجمالي الطلاب" value={d?.totalStudents ?? 0} icon={ClipboardList} />
        <StatCard label="الطلاب النشطون" value={d?.activeStudents ?? 0} icon={Users} />
        <StatCard label="الطلاب الموقوفون" value={d?.suspendedStudents ?? 0} icon={FileWarning} />
        <StatCard label="إجمالي البرامج" value={d?.programs ?? 0} icon={GraduationCap} />
        <StatCard label="إجمالي المقررات" value={d?.courses ?? 0} icon={BookOpen} />
        <StatCard label="إجمالي الشعب" value={d?.sections ?? 0} icon={CalendarDays} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportTable
          title="الطلاب حسب البرنامج"
          reportName="students_by_program"
          loading={isLoading}
          columns={[{ key: "key", label: "البرنامج" }, { key: "value", label: "عدد الطلاب", numeric: true }]}
          rows={d?.byProgram ?? []}
        />
        <ReportTable
          title="الطلاب حسب القسم"
          reportName="students_by_department"
          loading={isLoading}
          columns={[{ key: "key", label: "القسم" }, { key: "value", label: "عدد الطلاب", numeric: true }]}
          rows={d?.byDept ?? []}
        />
        <ReportTable
          title="الطلاب حسب المستوى الأكاديمي"
          reportName="students_by_level"
          loading={isLoading}
          columns={[{ key: "key", label: "المستوى" }, { key: "value", label: "عدد الطلاب", numeric: true }]}
          rows={d?.byLevel ?? []}
        />
        <ReportTable
          title="الطلاب حسب الحالة الأكاديمية"
          reportName="students_by_status"
          loading={isLoading}
          columns={[{ key: "key", label: "الحالة" }, { key: "value", label: "عدد الطلاب", numeric: true }]}
          rows={d?.byStatus ?? []}
        />
      </div>
    </div>
  );
}

// ===================================================================
// TAB: PERFORMANCE
// ===================================================================
function PerformanceTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports-performance"],
    queryFn: async () => {
      const rows = await fetchAll<any>("student_course_grade_summary", (q) =>
        q.select("student_profile_id, academic_number, student_name, course_id, course_code, course_name, percentage, overall_status"));

      // Aggregate per course
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

      // Per student aggregate
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
    },
  });

  return (
    <div className="space-y-4">
      <ReportTable
        title="معدلات النجاح حسب المقرر"
        reportName="success_rate_by_course"
        loading={isLoading}
        columns={[
          { key: "code", label: "الكود" },
          { key: "name", label: "المقرر" },
          { key: "total", label: "عدد الطلاب", numeric: true },
          { key: "success_rate", label: "نسبة النجاح %", numeric: true },
          { key: "avg", label: "المتوسط %", numeric: true },
        ]}
        rows={data?.courseRows ?? []}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportTable
          title="الطلاب المتفوقون (متوسط ≥ 85)"
          reportName="top_students"
          loading={isLoading}
          columns={[
            { key: "academic_number", label: "الرقم الأكاديمي" },
            { key: "student_name", label: "اسم الطالب" },
            { key: "average", label: "المتوسط %", numeric: true },
            { key: "status", label: "الحالة" },
          ]}
          rows={data?.top ?? []}
        />
        <ReportTable
          title="الطلاب المتعثرون (متوسط < 60)"
          reportName="at_risk_students"
          loading={isLoading}
          columns={[
            { key: "academic_number", label: "الرقم الأكاديمي" },
            { key: "student_name", label: "اسم الطالب" },
            { key: "average", label: "المتوسط %", numeric: true },
            { key: "status", label: "الحالة" },
          ]}
          rows={data?.atRisk ?? []}
        />
      </div>
    </div>
  );
}

// ===================================================================
// TAB: ENROLLMENT
// ===================================================================
function EnrollmentTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports-enrollment"],
    queryFn: async () => {
      const [enrollments, sections, courses, offerings, programs] = await Promise.all([
        fetchAll<any>("student_enrollments", (q) => q.select("id, course_section_id, enrollment_status")),
        fetchAll<any>("course_sections", (q) => q.select("id, section_code, course_offering_id")),
        fetchAll<any>("courses", (q) => q.select("id, code, name_ar")),
        fetchAll<any>("course_offerings", (q) => q.select("id, course_id, program_id")),
        fetchAll<any>("programs", (q) => q.select("id, name_ar")),
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
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportTable
          title="التسجيلات حسب البرنامج"
          reportName="enrollments_by_program"
          loading={isLoading}
          columns={[{ key: "key", label: "البرنامج" }, { key: "value", label: "عدد التسجيلات", numeric: true }]}
          rows={data?.programRows ?? []}
        />
        <ReportTable
          title="التسجيلات حسب المقرر"
          reportName="enrollments_by_course"
          loading={isLoading}
          columns={[
            { key: "code", label: "الكود" },
            { key: "name", label: "المقرر" },
            { key: "count", label: "عدد التسجيلات", numeric: true },
          ]}
          rows={data?.courseRows ?? []}
        />
        <ReportTable
          title="التسجيلات حسب الشعبة"
          reportName="enrollments_by_section"
          loading={isLoading}
          columns={[
            { key: "section_code", label: "كود الشعبة" },
            { key: "course", label: "المقرر" },
            { key: "count", label: "عدد التسجيلات", numeric: true },
          ]}
          rows={data?.sectionRows ?? []}
        />
        <ReportTable
          title="المقررات الأكثر إقبالاً"
          reportName="most_popular_courses"
          loading={isLoading}
          columns={[
            { key: "code", label: "الكود" },
            { key: "name", label: "المقرر" },
            { key: "count", label: "عدد التسجيلات", numeric: true },
          ]}
          rows={data?.mostPopular ?? []}
        />
        <ReportTable
          title="المقررات الأقل إقبالاً"
          reportName="least_popular_courses"
          loading={isLoading}
          columns={[
            { key: "code", label: "الكود" },
            { key: "name", label: "المقرر" },
            { key: "count", label: "عدد التسجيلات", numeric: true },
          ]}
          rows={data?.leastPopular ?? []}
        />
      </div>
    </div>
  );
}

// ===================================================================
// TAB: FACULTY
// ===================================================================
function FacultyTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports-faculty"],
    queryFn: async () => {
      const [faculty, sections, enrollments, depts] = await Promise.all([
        fetchAll<any>("faculty_profiles", (q) => q.select("id, full_name_ar, department_id, academic_rank, status")),
        fetchAll<any>("course_sections", (q) => q.select("id, faculty_profile_id, status")),
        fetchAll<any>("student_enrollments", (q) => q.select("id, course_section_id")),
        fetchAll<any>("departments", (q) => q.select("id, name_ar")),
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
    },
  });

  return (
    <div className="space-y-4">
      <ReportTable
        title="العبء التدريسي وعدد الشعب لكل عضو هيئة تدريس"
        reportName="faculty_teaching_load"
        loading={isLoading}
        columns={[
          { key: "name", label: "العضو" },
          { key: "rank", label: "الرتبة" },
          { key: "department", label: "القسم" },
          { key: "sections", label: "عدد الشعب", numeric: true },
          { key: "students", label: "عدد الطلاب", numeric: true },
          { key: "status", label: "الحالة" },
        ]}
        rows={data?.facultyRows ?? []}
      />
      <ReportTable
        title="توزيع هيئة التدريس حسب القسم"
        reportName="faculty_by_department"
        loading={isLoading}
        columns={[{ key: "key", label: "القسم" }, { key: "value", label: "عدد الأعضاء", numeric: true }]}
        rows={data?.byDept ?? []}
      />
    </div>
  );
}

// ===================================================================
// TAB: REQUESTS
// ===================================================================
const REQ_TYPE_AR: Record<string, string> = {
  absence_excuse: "عذر غياب",
  enrollment_suspension: "إيقاف قيد",
  extra_chance: "فرصة إضافية",
  transfer: "تحويل",
  equivalency: "معادلة",
};
const REQ_STATUS_AR: Record<string, string> = {
  draft: "مسودة",
  submitted: "مقدّم",
  under_review: "قيد المراجعة",
  approved: "موافَق عليه",
  rejected: "مرفوض",
  cancelled: "ملغى",
};

function RequestsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports-requests"],
    queryFn: async () => {
      const rows = await fetchAll<any>("student_requests", (q) =>
        q.select("id, request_type, status, submitted_at, reviewed_at, created_at"));
      const byType = groupCount(rows, (r) => REQ_TYPE_AR[r.request_type] ?? r.request_type);
      const byStatus = groupCount(rows, (r) => REQ_STATUS_AR[r.status] ?? r.status);
      const approved = rows.filter((r) => r.status === "approved");
      const rejected = rows.filter((r) => r.status === "rejected");
      // avg processing time in days (submitted -> reviewed)
      const reviewed = rows.filter((r) => r.submitted_at && r.reviewed_at);
      const avgMs = reviewed.length
        ? reviewed.reduce((acc, r) => acc + (new Date(r.reviewed_at).getTime() - new Date(r.submitted_at).getTime()), 0) / reviewed.length
        : 0;
      const avgDays = Math.round((avgMs / (1000 * 60 * 60 * 24)) * 10) / 10;
      return {
        total: rows.length,
        approvedCount: approved.length,
        rejectedCount: rejected.length,
        avgDays,
        byType, byStatus,
      };
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="إجمالي الطلبات" value={data?.total ?? 0} icon={FileWarning} />
        <StatCard label="الموافَق عليها" value={data?.approvedCount ?? 0} icon={FileWarning} />
        <StatCard label="المرفوضة" value={data?.rejectedCount ?? 0} icon={FileWarning} />
        <StatCard label="متوسط المعالجة (أيام)" value={data?.avgDays ?? 0} icon={TrendingUp} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportTable
          title="الطلبات حسب النوع"
          reportName="requests_by_type"
          loading={isLoading}
          columns={[{ key: "key", label: "النوع" }, { key: "value", label: "العدد", numeric: true }]}
          rows={data?.byType ?? []}
        />
        <ReportTable
          title="الطلبات حسب الحالة"
          reportName="requests_by_status"
          loading={isLoading}
          columns={[{ key: "key", label: "الحالة" }, { key: "value", label: "العدد", numeric: true }]}
          rows={data?.byStatus ?? []}
        />
      </div>
    </div>
  );
}

// ===================================================================
// TAB: FINANCIAL
// ===================================================================
function FinancialTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports-financial"],
    queryFn: async () => {
      const [fees, payments, receipts, discounts, students, programs] = await Promise.all([
        fetchAll<any>("student_fees", (q) => q.select("id, amount, status, student_profile_id")),
        fetchAll<any>("student_payments", (q) => q.select("id, amount, student_fee_id")),
        fetchAll<any>("payment_receipts", (q) => q.select("id, status")),
        fetchAll<any>("student_discounts", (q) => q.select("id, value, status")),
        fetchAll<any>("student_profiles", (q) => q.select("id, program_id")),
        fetchAll<any>("programs", (q) => q.select("id, name_ar")),
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
    },
  });

  const fmt = (n: number) => n.toLocaleString("ar-EG", { maximumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="إجمالي الرسوم" value={fmt(data?.totalFees ?? 0)} icon={Wallet} />
        <StatCard label="إجمالي المدفوعات" value={fmt(data?.totalPaid ?? 0)} icon={Wallet} />
        <StatCard label="الرصيد المستحق" value={fmt(data?.outstanding ?? 0)} icon={FileWarning} />
        <StatCard label="إجمالي الخصومات" value={fmt(data?.discountsTotal ?? 0)} icon={TrendingUp} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportTable
          title="الرسوم حسب البرنامج"
          reportName="fees_by_program"
          loading={isLoading}
          columns={[{ key: "key", label: "البرنامج" }, { key: "value", label: "المبلغ", numeric: true }]}
          rows={data?.feesByProgramRows ?? []}
        />
        <ReportTable
          title="المسدد مقابل المستحق"
          reportName="paid_vs_outstanding"
          loading={isLoading}
          columns={[{ key: "key", label: "البند" }, { key: "value", label: "المبلغ", numeric: true }]}
          rows={data?.paidVsOutstanding ?? []}
        />
        <ReportTable
          title="إحصائيات إيصالات الدفع"
          reportName="receipts_status"
          loading={isLoading}
          columns={[{ key: "key", label: "الحالة" }, { key: "value", label: "العدد", numeric: true }]}
          rows={data?.receiptStatusRows ?? []}
        />
        <ReportTable
          title="توزيع الخصومات"
          reportName="discounts_distribution"
          loading={isLoading}
          columns={[{ key: "key", label: "الحالة" }, { key: "value", label: "العدد", numeric: true }]}
          rows={data?.discountsRows ?? []}
        />
      </div>
    </div>
  );
}

// ===================================================================
// PAGE
// ===================================================================
function ReportsPage() {
  const [tab, setTab] = useState<TabId>("academic");
  const content = useMemo(() => {
    switch (tab) {
      case "academic":    return <AcademicTab />;
      case "performance": return <PerformanceTab />;
      case "enrollment":  return <EnrollmentTab />;
      case "faculty":     return <FacultyTab />;
      case "requests":    return <RequestsTab />;
      case "financial":   return <FinancialTab />;
    }
  }, [tab]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-primary">التقارير والتحليلات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تقارير قابلة للتصدير تعرض الأداء الأكاديمي والمالي والتشغيلي للكلية.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-bold transition-all border-b-2",
                active
                  ? "border-gold text-primary bg-card"
                  : "border-transparent text-muted-foreground hover:text-primary hover:bg-secondary/40",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {content}
    </div>
  );
}
