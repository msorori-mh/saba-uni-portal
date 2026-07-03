import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3, BookOpen, ClipboardList, FileBadge, FileDown, FileSearch,
  FileText, GraduationCap, History, Loader2, Printer, Search, ShieldCheck,
  Upload, UserCheck, Users, XCircle, Eye, FileWarning,
} from "lucide-react";
import { getStudentLookups } from "@/lib/admin-students.functions";
import {
  getAcademicProgramsReportForAdmin,
  getAcademicReportLookupsForAdmin,
  getCoursesReportForAdmin,
  getCourseAssignmentsReportForAdmin,
  getImportJobErrorsForAdmin,
  getImportJobsReportForAdmin,
  getFacultyLoadReportForAdmin,
  getReportsRequests,
  getRoomUtilizationReportForAdmin,
  getScheduleConflictIndicatorsForAdmin,
  getScheduleReportLookupsForAdmin,
  getStudentAccountsReportForAdmin,
  getStudentsReportForAdmin,
  getStudyGroupsReportForAdmin,
  getStudyPlanCoverageReportForAdmin,
  getStudyPlansReportForAdmin,
  getTimetableReportForAdmin,
  getUnassignedCoursesReportForAdmin,
} from "@/lib/admin-reports.functions";
import { logReportEvent } from "@/lib/reports/report-audit.functions";

const VALID_TABS = ["students", "imports", "accounts", "academic", "schedules", "requests", "faculty", "documents", "audit"] as const;
type TabId = typeof VALID_TABS[number];

export const Route = createFileRoute("/admin/reports")({
  validateSearch: (search: Record<string, unknown>): { tab?: TabId } => {
    const raw = typeof search.tab === "string" ? search.tab : undefined;
    return { tab: raw && (VALID_TABS as readonly string[]).includes(raw) ? (raw as TabId) : undefined };
  },
  component: ReportsPage,
});

type ReportFilters = {
  study_system: "all" | "regular" | "private" | "unset";
  department_id: string;
  program_id: string;
  level_id: string;
  academic_year_id: string;
  semester_id: string;
  status: string;
  account_status: "all" | "with_account" | "without_account";
};

type ImportFilters = {
  import_type: string;
  status: "all" | "completed" | "failed" | "processing" | "partial" | "dry_run";
  from_date: string;
  to_date: string;
  created_by: string;
  file_name: string;
};

type StudentAccountFilters = {
  department_id: string;
  program_id: string;
  level_id: string;
  academic_year_id: string;
  semester_id: string;
  study_system: "all" | "regular" | "private" | "unset";
  account_status: "all" | "with_account" | "without_account";
  status: string;
  academic_number: string;
  student_name: string;
};

type AcademicReportId = "programs" | "plans" | "courses" | "coverage";
type ScheduleReportId = "assignments" | "unassigned" | "groups" | "timetable" | "rooms" | "facultyLoad" | "conflicts";
type AcademicFilters = {
  department_id: string;
  program_id: string;
  study_plan_id: string;
  level_id: string;
  semester_code: "all" | "first" | "second";
  status: string;
  search: string;
};

type ScheduleFilters = {
  department_id: string;
  program_id: string;
  level_id: string;
  academic_year_id: string;
  semester_id: string;
  faculty_profile_id: string;
  room_id: string;
  course_section_id: string;
  day_of_week: string;
  schedule_type: string;
  assignment_status: "all" | "assigned" | "unassigned";
  section_status: string;
  room_type: string;
  conflict_type: "all" | "faculty" | "room" | "group" | "missing_data";
  search: string;
};

const EMPTY_FILTERS: ReportFilters = {
  study_system: "all",
  department_id: "",
  program_id: "",
  level_id: "",
  academic_year_id: "",
  semester_id: "",
  status: "all",
  account_status: "all",
};

const PAGE_SIZE = 50;
const IMPORT_PAGE_SIZE = 50;
const ACCOUNT_PAGE_SIZE = 50;

const EMPTY_IMPORT_FILTERS: ImportFilters = {
  import_type: "",
  status: "all",
  from_date: "",
  to_date: "",
  created_by: "",
  file_name: "",
};

const EMPTY_ACCOUNT_FILTERS: StudentAccountFilters = {
  department_id: "",
  program_id: "",
  level_id: "",
  academic_year_id: "",
  semester_id: "",
  study_system: "all",
  account_status: "all",
  status: "all",
  academic_number: "",
  student_name: "",
};

const EMPTY_ACADEMIC_FILTERS: AcademicFilters = {
  department_id: "",
  program_id: "",
  study_plan_id: "",
  level_id: "",
  semester_code: "all",
  status: "",
  search: "",
};

const EMPTY_SCHEDULE_FILTERS: ScheduleFilters = {
  department_id: "",
  program_id: "",
  level_id: "",
  academic_year_id: "",
  semester_id: "",
  faculty_profile_id: "",
  room_id: "",
  course_section_id: "",
  day_of_week: "",
  schedule_type: "",
  assignment_status: "all",
  section_status: "",
  room_type: "",
  conflict_type: "all",
  search: "",
};

function studySystemLabel(value: string | null | undefined) {
  if (value === "regular") return "عام";
  if (value === "private") return "نفقة خاصة";
  return "غير محدد";
}

function statusLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    active: "نشط",
    inactive: "معطّل",
    suspended: "موقوف",
    graduated: "متخرج",
    withdrawn: "منسحب",
    transferred: "محول",
  };
  return value ? labels[value] ?? value : "—";
}

function importStatusLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    completed: "ناجح",
    failed: "فاشل",
    processing: "قيد المعالجة",
    partial: "مكتمل مع أخطاء",
    dry_run: "تحقق فقط",
  };
  return value ? labels[value] ?? value : "—";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-EG");
}

function hasAnyFilter(filters: ReportFilters) {
  return filters.study_system !== "all"
    || Boolean(filters.department_id)
    || Boolean(filters.program_id)
    || Boolean(filters.level_id)
    || Boolean(filters.academic_year_id)
    || Boolean(filters.semester_id)
    || filters.status !== "all"
    || filters.account_status !== "all";
}

function hasImportFilter(filters: ImportFilters) {
  return Boolean(
    filters.import_type
    || filters.status !== "all"
    || filters.from_date
    || filters.to_date
    || filters.created_by
    || filters.file_name,
  );
}

function hasAccountFilter(filters: StudentAccountFilters) {
  return Boolean(
    filters.department_id
    || filters.program_id
    || filters.level_id
    || filters.academic_year_id
    || filters.semester_id
    || filters.study_system !== "all"
    || filters.account_status !== "all"
    || filters.status !== "all"
    || filters.academic_number
    || filters.student_name,
  );
}

function hasScheduleReportFilter(filters: ScheduleFilters, reportId: ScheduleReportId) {
  return Boolean(
    filters.department_id
    || filters.program_id
    || filters.level_id
    || filters.academic_year_id
    || filters.semester_id
    || filters.faculty_profile_id
    || filters.room_id
    || filters.course_section_id
    || filters.day_of_week
    || filters.schedule_type
    || filters.assignment_status !== "all"
    || filters.section_status
    || filters.room_type
    || filters.conflict_type !== "all"
    || filters.search,
  );
}

function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(fileName: string, rows: Array<Record<string, unknown>>) {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ReportsPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [activeSection, setActiveSection] = useState<TabId>(tab ?? "students");

  useEffect(() => {
    if (tab && tab !== activeSection) setActiveSection(tab);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectSection = (id: TabId) => {
    setActiveSection(id);
    navigate({ search: { tab: id }, replace: true });
  };

  const sections: Array<{ id: TabId; title: string; icon: any; active?: boolean }> = [
    { id: "students", title: "تقارير الطلاب", icon: GraduationCap, active: true },
    { id: "imports", title: "تقارير الاستيراد", icon: Upload, active: true },
    { id: "accounts", title: "تقارير حسابات الطلاب", icon: UserCheck, active: true },
    { id: "academic", title: "التقارير الأكاديمية", icon: BookOpen, active: true },
    { id: "schedules", title: "تقارير الجداول والإسناد", icon: ClipboardList, active: true },
    { id: "requests", title: "تقارير الطلبات", icon: FileWarning, active: true },
    { id: "faculty", title: "تقارير أعضاء هيئة التدريس", icon: Users },
    { id: "documents", title: "تقارير الوثائق والخدمات", icon: FileBadge },
    { id: "audit", title: "تقارير التدقيق والأمان", icon: ShieldCheck },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-extrabold text-primary flex items-center gap-2">
          <BarChart3 className="h-7 w-7 text-gold" /> مركز التقارير
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          استعراض وطباعة وتصدير التقارير الأكاديمية والإدارية للكلية.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => selectSection(section.id)}
              className={`rounded-xl border p-4 text-right shadow-card transition ${
                isActive ? "border-gold bg-gold/10" : "border-border bg-card hover:border-gold/60"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-display text-sm font-extrabold text-primary">{section.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {section.active ? "متاح الآن" : "سيتم تفعيله لاحقاً"}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {activeSection === "students" && <StudentsReport />}
      {activeSection === "imports" && <ImportJobsReport />}
      {activeSection === "accounts" && <StudentAccountsReport />}
      {activeSection === "academic" && <AcademicReports />}
      {activeSection === "schedules" && <ScheduleReports />}
      {activeSection === "requests" && <RequestsReport />}
      {!["students", "imports", "accounts", "academic", "schedules", "requests"].includes(activeSection) && (
        <ComingSoonCard title={sections.find((section) => section.id === activeSection)?.title ?? "قسم التقارير"} />
      )}
    </div>
  );
}

const REQ_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "draft", label: "مسودة" },
  { value: "submitted", label: "مقدَّم" },
  { value: "under_review", label: "قيد المراجعة" },
  { value: "returned", label: "يحتاج استكمال" },
  { value: "approved", label: "موافَق عليه" },
  { value: "rejected", label: "مرفوض" },
  { value: "cancelled", label: "ملغى" },
];

const REQ_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "grade_appeal", label: "تظلم على درجة" },
  { value: "absence_excuse", label: "عذر غياب" },
  { value: "extra_chance", label: "فرصة إضافية" },
  { value: "equivalency", label: "معادلة مقررات" },
  { value: "transfer", label: "تحويل" },
  { value: "enrollment_suspension", label: "وقف قيد" },
  { value: "enrollment_reinstatement", label: "إعادة قيد" },
  { value: "official_transcript", label: "سجل أكاديمي رسمي" },
];

type RequestsFilters = {
  from_date: string;
  to_date: string;
  department_id: string;
  program_id: string;
  status: string;
  request_type: string;
};

const EMPTY_REQUESTS_FILTERS: RequestsFilters = {
  from_date: "", to_date: "", department_id: "", program_id: "", status: "", request_type: "",
};

function RequestsReport() {
  const lookupsFn = useServerFn(getAcademicReportLookupsForAdmin);
  const reportFn = useServerFn(getReportsRequests);
  const auditFn = useServerFn(logReportEvent);
  const [filters, setFilters] = useState<RequestsFilters>(EMPTY_REQUESTS_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<RequestsFilters>(EMPTY_REQUESTS_FILTERS);

  const { data: lookups } = useQuery({
    queryKey: ["academic-reports-lookups"],
    queryFn: () => lookupsFn({ data: {} }),
    staleTime: Infinity,
  });

  const payload = {
    from_date: appliedFilters.from_date || undefined,
    to_date: appliedFilters.to_date || undefined,
    department_id: appliedFilters.department_id || undefined,
    program_id: appliedFilters.program_id || undefined,
    status: appliedFilters.status || undefined,
    request_type: appliedFilters.request_type || undefined,
  };

  const { data: report, isFetching, error } = useQuery({
    queryKey: ["admin-requests-report", appliedFilters],
    queryFn: async () => {
      const res = await reportFn({ data: payload });
      auditFn({ data: { reportName: "student_requests_report", action: "report_viewed", filters: payload as Record<string, any> } }).catch(() => {});
      return res;
    },
  });

  const filteredPrograms = filters.department_id && lookups
    ? lookups.programs.filter((program: any) => program.department_id === filters.department_id)
    : lookups?.programs ?? [];

  const update = (key: keyof RequestsFilters, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "department_id" ? { program_id: "" } : {}),
    }));
  };
  const apply = () => setAppliedFilters(filters);
  const clear = () => { setFilters(EMPTY_REQUESTS_FILTERS); setAppliedFilters(EMPTY_REQUESTS_FILTERS); };

  const exportRows = useMemo(() => (report?.rows ?? []).map((row: any) => ({
    "رقم الطلب": row.request_number ?? "",
    "اسم الطالب": row.student_name ?? "",
    "الرقم الأكاديمي": row.academic_number ?? "",
    "نوع الطلب": row.request_type_ar ?? row.request_type ?? "",
    "الحالة": row.status_ar ?? row.status ?? "",
    "تاريخ الإنشاء": formatDateTime(row.created_at),
    "تاريخ التقديم": formatDateTime(row.submitted_at),
    "تاريخ المراجعة": formatDateTime(row.reviewed_at),
  })), [report]);

  const doExport = () => {
    downloadCsv("student_requests_report.csv", exportRows);
    auditFn({ data: { reportName: "student_requests_report", action: "report_exported", format: "csv", rowCount: exportRows.length, filters: payload as Record<string, any> } }).catch(() => {});
  };

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 shadow-card space-y-4">
        <div>
          <h2 className="font-display text-xl font-extrabold text-primary flex items-center gap-2">
            <FileWarning className="h-5 w-5 text-gold" /> تقارير الطلبات
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            نظرة شاملة على طلبات الطلاب حسب النوع والحالة والقسم والبرنامج.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <ReportField label="من تاريخ">
            <input type="date" value={filters.from_date} onChange={(e) => update("from_date", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </ReportField>
          <ReportField label="إلى تاريخ">
            <input type="date" value={filters.to_date} onChange={(e) => update("to_date", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </ReportField>
          <ReportField label="القسم">
            <select value={filters.department_id} onChange={(e) => update("department_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل الأقسام</option>
              {lookups?.departments.map((d: any) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
            </select>
          </ReportField>
          <ReportField label="البرنامج">
            <select value={filters.program_id} onChange={(e) => update("program_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل البرامج</option>
              {filteredPrograms.map((p: any) => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
            </select>
          </ReportField>
          <ReportField label="الحالة">
            <select value={filters.status} onChange={(e) => update("status", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل الحالات</option>
              {REQ_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </ReportField>
          <ReportField label="نوع الطلب">
            <select value={filters.request_type} onChange={(e) => update("request_type", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل الأنواع</option>
              {REQ_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </ReportField>
        </div>

        <ReportActions
          onApply={apply}
          onClear={clear}
          onPrint={() => window.print()}
          onCsv={doExport}
          csvDisabled={!exportRows.length}
          printDisabled={!report?.rows?.length}
        />
      </div>

      {error ? (
        <ErrorBox message={(error as Error).message} />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
            <KpiCard label="إجمالي الطلبات" value={report?.total ?? 0} icon={FileText} />
            <KpiCard label="مفتوحة" value={report?.openCount ?? 0} icon={FileWarning} />
            <KpiCard label="مقبولة" value={report?.approvedCount ?? 0} icon={UserCheck} />
            <KpiCard label="مرفوضة" value={report?.rejectedCount ?? 0} icon={XCircle} />
            <KpiCard label="متوسط أيام المعالجة" value={report?.avgDays ?? 0} icon={History} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <BreakdownCard title="حسب الحالة" rows={report?.byStatus ?? []} />
            <BreakdownCard title="حسب النوع" rows={report?.byType ?? []} />
          </div>

          <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <ReportHeader title="آخر الطلبات" loading={isFetching} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-right">رقم الطلب</th>
                    <th className="px-3 py-2 text-right">الطالب</th>
                    <th className="px-3 py-2 text-right">الرقم الأكاديمي</th>
                    <th className="px-3 py-2 text-right">النوع</th>
                    <th className="px-3 py-2 text-right">الحالة</th>
                    <th className="px-3 py-2 text-right">أنشئ</th>
                    <th className="px-3 py-2 text-right">قُدِّم</th>
                    <th className="px-3 py-2 text-right">روجع</th>
                  </tr>
                </thead>
                <tbody>
                  {(report?.rows ?? []).length === 0 ? (
                    <EmptyTableRow colSpan={8} />
                  ) : (
                    (report?.rows ?? []).slice(0, 200).map((row: any) => (
                      <tr key={row.id} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs">{row.request_number}</td>
                        <td className="px-3 py-2">{row.student_name}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.academic_number}</td>
                        <td className="px-3 py-2">{row.request_type_ar}</td>
                        <td className="px-3 py-2">{row.status_ar}</td>
                        <td className="px-3 py-2 text-xs">{formatDateTime(row.created_at)}</td>
                        <td className="px-3 py-2 text-xs">{formatDateTime(row.submitted_at)}</td>
                        <td className="px-3 py-2 text-xs">{formatDateTime(row.reviewed_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: Array<{ key: string; value: number }> }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <h3 className="font-display text-sm font-extrabold text-primary mb-3">{title}</h3>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground">لا توجد بيانات.</div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between text-sm">
              <span>{r.key}</span>
              <span className="font-bold text-primary">
                {r.value}
                {total > 0 && <span className="mr-1 text-xs text-muted-foreground">({Math.round((r.value / total) * 100)}%)</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


function StudentsReport() {
  const lookupsFn = useServerFn(getStudentLookups);
  const reportFn = useServerFn(getStudentsReportForAdmin);
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const { data: lookups } = useQuery({
    queryKey: ["admin-report-student-lookups"],
    queryFn: () => lookupsFn(),
    staleTime: Infinity,
  });

  const reportEnabled = hasAnyFilter(appliedFilters);
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["admin-students-report", appliedFilters, page],
    enabled: reportEnabled,
    queryFn: () => reportFn({
      data: {
        ...appliedFilters,
        department_id: appliedFilters.department_id || undefined,
        program_id: appliedFilters.program_id || undefined,
        level_id: appliedFilters.level_id || undefined,
        academic_year_id: appliedFilters.academic_year_id || undefined,
        semester_id: appliedFilters.semester_id || undefined,
        page,
        pageSize: PAGE_SIZE,
      },
    }),
  });

  const filteredPrograms = filters.department_id && lookups
    ? lookups.programs.filter((program: any) => program.department_id === filters.department_id)
    : lookups?.programs ?? [];
  const filteredSemesters = filters.academic_year_id && lookups
    ? lookups.semesters.filter((semester: any) => semester.academic_year_id === filters.academic_year_id)
    : lookups?.semesters ?? [];

  const totalPages = Math.max(1, Math.ceil((report?.total ?? 0) / PAGE_SIZE));

  const exportRows = useMemo(() => (report?.rows ?? []).map((row) => ({
    "الرقم الأكاديمي": row.academic_number,
    "اسم الطالب": row.full_name_ar,
    "القسم": row.department_name ?? "",
    "البرنامج": row.program_code ? `${row.program_name ?? ""} (${row.program_code})` : row.program_name ?? "",
    "المستوى": row.level_number != null ? `${row.level_name ?? ""} - ${row.level_number}` : row.level_name ?? "",
    "العام الأكاديمي": row.academic_year ?? "",
    "الفصل الدراسي": row.semester ?? "",
    "نظام الدراسة": studySystemLabel(row.study_system),
    "الحالة": statusLabel(row.status),
    "حالة حساب الدخول": row.has_account ? "لديه حساب" : "بدون حساب",
  })), [report?.rows]);

  const updateFilter = (key: keyof ReportFilters, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "department_id" ? { program_id: "" } : {}),
      ...(key === "academic_year_id" ? { semester_id: "" } : {}),
    }));
  };

  const applyFilters = () => {
    setPage(1);
    setAppliedFilters(filters);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 shadow-card space-y-4">
        <div>
          <h2 className="font-display text-xl font-extrabold text-primary flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-gold" /> كشف الطلاب
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            تقرير قراءة فقط لعرض الطلاب حسب الفلاتر الأكاديمية وحالة حساب الدخول.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <ReportField label="نظام الدراسة">
            <select value={filters.study_system} onChange={(e) => updateFilter("study_system", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="all">الكل</option>
              <option value="regular">عام</option>
              <option value="private">نفقة خاصة</option>
              <option value="unset">غير محدد</option>
            </select>
          </ReportField>
          <ReportField label="القسم">
            <select value={filters.department_id} onChange={(e) => updateFilter("department_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل الأقسام</option>
              {lookups?.departments.map((department: any) => (
                <option key={department.id} value={department.id}>{department.name_ar}</option>
              ))}
            </select>
          </ReportField>
          <ReportField label="البرنامج">
            <select value={filters.program_id} onChange={(e) => updateFilter("program_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل البرامج</option>
              {filteredPrograms.map((program: any) => (
                <option key={program.id} value={program.id}>{program.name_ar}{program.code ? ` (${program.code})` : ""}</option>
              ))}
            </select>
          </ReportField>
          <ReportField label="المستوى">
            <select value={filters.level_id} onChange={(e) => updateFilter("level_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل المستويات</option>
              {lookups?.levels.map((level: any) => (
                <option key={level.id} value={level.id}>{level.name}</option>
              ))}
            </select>
          </ReportField>
          <ReportField label="العام الأكاديمي">
            <select value={filters.academic_year_id} onChange={(e) => updateFilter("academic_year_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل الأعوام</option>
              {lookups?.academic_years.map((year: any) => (
                <option key={year.id} value={year.id}>{year.name}{year.is_current ? " (الحالي)" : ""}</option>
              ))}
            </select>
          </ReportField>
          <ReportField label="الفصل الدراسي">
            <select value={filters.semester_id} onChange={(e) => updateFilter("semester_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل الفصول</option>
              {filteredSemesters.map((semester: any) => (
                <option key={semester.id} value={semester.id}>{semester.name}{semester.code ? ` (${semester.code})` : ""}</option>
              ))}
            </select>
          </ReportField>
          <ReportField label="الحالة">
            <select value={filters.status} onChange={(e) => updateFilter("status", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="all">كل الحالات</option>
              <option value="active">نشط</option>
              <option value="inactive">معطّل</option>
              <option value="suspended">موقوف</option>
              <option value="graduated">متخرج</option>
              <option value="withdrawn">منسحب</option>
              <option value="transferred">محول</option>
            </select>
          </ReportField>
          <ReportField label="حساب الدخول">
            <select value={filters.account_status} onChange={(e) => updateFilter("account_status", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="all">الكل</option>
              <option value="with_account">لديه حساب</option>
              <option value="without_account">بدون حساب</option>
            </select>
          </ReportField>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={applyFilters}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90">
            <Search className="h-4 w-4" /> عرض التقرير
          </button>
          <button type="button" onClick={clearFilters}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-bold text-primary hover:bg-secondary">
            مسح الفلاتر
          </button>
          <button type="button" disabled={!report?.rows?.length} onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-bold text-primary hover:bg-secondary disabled:opacity-50">
            <Printer className="h-4 w-4" /> طباعة
          </button>
          <button type="button" disabled={!exportRows.length} onClick={() => downloadCsv("students_report.csv", exportRows)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-bold text-primary hover:bg-secondary disabled:opacity-50">
            <FileDown className="h-4 w-4" /> تصدير CSV
          </button>
        </div>
      </div>

      {!reportEnabled ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          اختر فلترًا واحدًا على الأقل لعرض التقرير.
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-bold text-destructive">
          {(error as Error).message}
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="إجمالي الطلاب" value={report?.kpis.total ?? 0} icon={Users} />
            <KpiCard label="النظام العام" value={report?.kpis.regular ?? 0} icon={GraduationCap} />
            <KpiCard label="النفقة الخاصة" value={report?.kpis.private ?? 0} icon={GraduationCap} />
            <KpiCard label="غير محددي النظام" value={report?.kpis.unsetStudySystem ?? 0} icon={History} />
            <KpiCard label="لديهم حساب دخول" value={report?.kpis.withAccount ?? 0} icon={UserCheck} />
            <KpiCard label="بدون حساب دخول" value={report?.kpis.withoutAccount ?? 0} icon={Users} />
          </div>

          <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden print:shadow-none">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="font-display text-sm font-extrabold text-primary flex items-center gap-2">
                <FileText className="h-4 w-4 text-gold" /> نتائج كشف الطلاب
              </h3>
              {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-secondary/50 text-primary">
                  <tr>
                    <th className="px-3 py-2 text-right">الرقم الأكاديمي</th>
                    <th className="px-3 py-2 text-right">اسم الطالب</th>
                    <th className="px-3 py-2 text-right">القسم</th>
                    <th className="px-3 py-2 text-right">البرنامج</th>
                    <th className="px-3 py-2 text-right">المستوى</th>
                    <th className="px-3 py-2 text-right">العام</th>
                    <th className="px-3 py-2 text-right">الفصل</th>
                    <th className="px-3 py-2 text-right">نظام الدراسة</th>
                    <th className="px-3 py-2 text-right">الحالة</th>
                    <th className="px-3 py-2 text-right">حساب الدخول</th>
                  </tr>
                </thead>
                <tbody>
                  {report?.rows.length ? report.rows.map((row) => (
                    <tr key={row.id} className="border-t border-border/60">
                      <td className="px-3 py-2 font-mono">{row.academic_number}</td>
                      <td className="px-3 py-2 font-bold">{row.full_name_ar}</td>
                      <td className="px-3 py-2">{row.department_name ?? "—"}</td>
                      <td className="px-3 py-2">{row.program_name ?? "—"}{row.program_code ? ` (${row.program_code})` : ""}</td>
                      <td className="px-3 py-2">{row.level_name ?? "—"}{row.level_number != null ? ` — ${row.level_number}` : ""}</td>
                      <td className="px-3 py-2">{row.academic_year ?? "—"}</td>
                      <td className="px-3 py-2">{row.semester ?? "—"}</td>
                      <td className="px-3 py-2">{studySystemLabel(row.study_system)}</td>
                      <td className="px-3 py-2">{statusLabel(row.status)}</td>
                      <td className="px-3 py-2">{row.has_account ? "لديه حساب" : "بدون حساب"}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                        لا توجد بيانات مطابقة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {report && report.total > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs">
                <span className="text-muted-foreground">
                  عرض {report.rows.length.toLocaleString("ar-EG")} من {report.total.toLocaleString("ar-EG")} سجل
                </span>
                <div className="flex gap-1">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded border border-border px-3 py-1 disabled:opacity-40">السابق</button>
                  <span className="px-2 py-1 font-mono">{page} / {Math.max(1, Math.ceil(report.total / PAGE_SIZE))}</span>
                  <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded border border-border px-3 py-1 disabled:opacity-40">التالي</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function ImportJobsReport() {
  const reportFn = useServerFn(getImportJobsReportForAdmin);
  const errorsFn = useServerFn(getImportJobErrorsForAdmin);
  const [filters, setFilters] = useState<ImportFilters>(EMPTY_IMPORT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ImportFilters>(EMPTY_IMPORT_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const enabled = hasImportFilter(appliedFilters);
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["admin-import-jobs-report", appliedFilters, page],
    enabled,
    queryFn: () => reportFn({
      data: {
        ...appliedFilters,
        import_type: appliedFilters.import_type || undefined,
        from_date: appliedFilters.from_date || undefined,
        to_date: appliedFilters.to_date || undefined,
        created_by: appliedFilters.created_by || undefined,
        file_name: appliedFilters.file_name || undefined,
        page,
        pageSize: IMPORT_PAGE_SIZE,
      },
    }),
  });

  const { data: details, isFetching: detailsLoading } = useQuery({
    queryKey: ["admin-import-job-errors", selectedJobId],
    enabled: Boolean(selectedJobId),
    queryFn: () => errorsFn({ data: { import_log_id: selectedJobId! } }),
  });

  const totalPages = Math.max(1, Math.ceil((report?.total ?? 0) / IMPORT_PAGE_SIZE));
  const exportRows = useMemo(() => (report?.rows ?? []).map((row) => ({
    "تاريخ العملية": formatDateTime(row.created_at),
    "نوع الاستيراد": row.import_type,
    "اسم الملف": row.file_name,
    "الحالة": importStatusLabel(row.status),
    "إجمالي الصفوف": row.rows_total,
    "الصفوف الناجحة": row.rows_success,
    "الصفوف الفاشلة": row.rows_failed,
    "عدد الأخطاء": row.error_count,
    "المنفذ": row.created_by ?? "",
    "ملاحظات": row.notes ?? "",
  })), [report?.rows]);

  const update = (key: keyof ImportFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const apply = () => { setPage(1); setSelectedJobId(null); setAppliedFilters(filters); };
  const clear = () => { setFilters(EMPTY_IMPORT_FILTERS); setAppliedFilters(EMPTY_IMPORT_FILTERS); setSelectedJobId(null); setPage(1); };

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 shadow-card space-y-4">
        <div>
          <h2 className="font-display text-xl font-extrabold text-primary flex items-center gap-2">
            <Upload className="h-5 w-5 text-gold" /> سجل عمليات الاستيراد
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            تقرير قراءة فقط يعرض سجلات الاستيراد المخزنة في import_logs.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <ReportField label="نوع الاستيراد">
            <input value={filters.import_type} onChange={(e) => update("import_type", e.target.value)}
              placeholder="students / class_schedule ..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </ReportField>
          <ReportField label="الحالة">
            <select value={filters.status} onChange={(e) => update("status", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="all">الكل</option>
              <option value="completed">ناجح</option>
              <option value="failed">فاشل</option>
              <option value="processing">قيد المعالجة</option>
              <option value="partial">مكتمل مع أخطاء</option>
              <option value="dry_run">تحقق فقط</option>
            </select>
          </ReportField>
          <ReportField label="اسم الملف">
            <input value={filters.file_name} onChange={(e) => update("file_name", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </ReportField>
          <ReportField label="من تاريخ">
            <input type="date" value={filters.from_date} onChange={(e) => update("from_date", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </ReportField>
          <ReportField label="إلى تاريخ">
            <input type="date" value={filters.to_date} onChange={(e) => update("to_date", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </ReportField>
          <ReportField label="المستخدم/المنفذ">
            <input value={filters.created_by} onChange={(e) => update("created_by", e.target.value)}
              dir="ltr" placeholder="UUID إن وجد"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono" />
          </ReportField>
        </div>
        <ReportActions
          onApply={apply}
          onClear={clear}
          onPrint={() => window.print()}
          onCsv={() => downloadCsv("import_jobs_report.csv", exportRows)}
          csvDisabled={!exportRows.length}
          printDisabled={!report?.rows?.length}
        />
      </div>

      {!enabled ? (
        <EmptyReportMessage message="اختر فلترًا واحدًا على الأقل لعرض التقرير." />
      ) : error ? (
        <ErrorBox message={(error as Error).message} />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-5">
            <KpiCard label="إجمالي العمليات" value={report?.kpis.total ?? 0} icon={Upload} />
            <KpiCard label="العمليات الناجحة" value={report?.kpis.completed ?? 0} icon={UserCheck} />
            <KpiCard label="العمليات الفاشلة" value={report?.kpis.failed ?? 0} icon={XCircle} />
            <KpiCard label="إجمالي الصفوف" value={report?.kpis.rowsTotal ?? 0} icon={ClipboardList} />
            <KpiCard label="إجمالي الأخطاء" value={report?.kpis.errorsTotal ?? 0} icon={XCircle} />
          </div>
          <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <ReportHeader title="نتائج سجل الاستيراد" loading={isFetching} />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-secondary/50 text-primary">
                  <tr>
                    <th className="px-3 py-2 text-right">التاريخ</th>
                    <th className="px-3 py-2 text-right">النوع</th>
                    <th className="px-3 py-2 text-right">الملف</th>
                    <th className="px-3 py-2 text-right">الحالة</th>
                    <th className="px-3 py-2 text-right">إجمالي</th>
                    <th className="px-3 py-2 text-right">ناجح</th>
                    <th className="px-3 py-2 text-right">فاشل</th>
                    <th className="px-3 py-2 text-right">الأخطاء</th>
                    <th className="px-3 py-2 text-right">المنفذ</th>
                    <th className="px-3 py-2 text-right">ملاحظات</th>
                    <th className="px-3 py-2 text-right">تفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {report?.rows.length ? report.rows.map((row) => (
                    <tr key={row.id} className="border-t border-border/60">
                      <td className="px-3 py-2">{formatDateTime(row.created_at)}</td>
                      <td className="px-3 py-2 font-mono">{row.import_type}</td>
                      <td className="px-3 py-2">{row.file_name}</td>
                      <td className="px-3 py-2">{importStatusLabel(row.status)}</td>
                      <td className="px-3 py-2 font-mono">{row.rows_total}</td>
                      <td className="px-3 py-2 font-mono">{row.rows_success}</td>
                      <td className="px-3 py-2 font-mono">{row.rows_failed}</td>
                      <td className="px-3 py-2 font-mono">{row.error_count}</td>
                      <td className="px-3 py-2 font-mono">{row.created_by ?? "—"}</td>
                      <td className="px-3 py-2 max-w-xs truncate">{row.notes ?? "—"}</td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => setSelectedJobId(row.id)}
                          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 font-bold hover:bg-secondary">
                          <Eye className="h-3 w-3" /> عرض
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <EmptyTableRow colSpan={11} />
                  )}
                </tbody>
              </table>
            </div>
            <PaginationFooter page={page} total={report?.total ?? 0} pageSize={IMPORT_PAGE_SIZE} totalPages={totalPages} setPage={setPage} />
          </div>
        </>
      )}

      {selectedJobId && (
        <ImportDetailsDialog
          details={details}
          loading={detailsLoading}
          onClose={() => setSelectedJobId(null)}
        />
      )}
    </section>
  );
}

function StudentAccountsReport() {
  const lookupsFn = useServerFn(getStudentLookups);
  const reportFn = useServerFn(getStudentAccountsReportForAdmin);
  const [filters, setFilters] = useState<StudentAccountFilters>(EMPTY_ACCOUNT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<StudentAccountFilters>(EMPTY_ACCOUNT_FILTERS);
  const [page, setPage] = useState(1);

  const { data: lookups } = useQuery({
    queryKey: ["admin-report-student-account-lookups"],
    queryFn: () => lookupsFn(),
    staleTime: Infinity,
  });

  const enabled = hasAccountFilter(appliedFilters);
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["admin-student-accounts-report", appliedFilters, page],
    enabled,
    queryFn: () => reportFn({
      data: {
        ...appliedFilters,
        department_id: appliedFilters.department_id || undefined,
        program_id: appliedFilters.program_id || undefined,
        level_id: appliedFilters.level_id || undefined,
        academic_year_id: appliedFilters.academic_year_id || undefined,
        semester_id: appliedFilters.semester_id || undefined,
        academic_number: appliedFilters.academic_number || undefined,
        student_name: appliedFilters.student_name || undefined,
        page,
        pageSize: ACCOUNT_PAGE_SIZE,
      },
    }),
  });

  const filteredPrograms = filters.department_id && lookups
    ? lookups.programs.filter((program: any) => program.department_id === filters.department_id)
    : lookups?.programs ?? [];
  const filteredSemesters = filters.academic_year_id && lookups
    ? lookups.semesters.filter((semester: any) => semester.academic_year_id === filters.academic_year_id)
    : lookups?.semesters ?? [];

  const totalPages = Math.max(1, Math.ceil((report?.total ?? 0) / ACCOUNT_PAGE_SIZE));
  const exportRows = useMemo(() => (report?.rows ?? []).map((row) => ({
    "الرقم الأكاديمي": row.academic_number,
    "اسم الطالب": row.full_name_ar,
    "القسم": row.department_name ?? "",
    "البرنامج": row.program_code ? `${row.program_name ?? ""} (${row.program_code})` : row.program_name ?? "",
    "المستوى": row.level_number != null ? `${row.level_name ?? ""} - ${row.level_number}` : row.level_name ?? "",
    "نظام الدراسة": studySystemLabel(row.study_system),
    "الحالة": statusLabel(row.status),
    "حالة حساب الدخول": row.has_account ? "لديه حساب" : "بدون حساب",
    "تاريخ الإنشاء": formatDateTime(row.created_at),
    "آخر تحديث": formatDateTime(row.updated_at),
  })), [report?.rows]);

  const update = (key: keyof StudentAccountFilters, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "department_id" ? { program_id: "" } : {}),
      ...(key === "academic_year_id" ? { semester_id: "" } : {}),
    }));
  };
  const apply = () => { setPage(1); setAppliedFilters(filters); };
  const clear = () => { setFilters(EMPTY_ACCOUNT_FILTERS); setAppliedFilters(EMPTY_ACCOUNT_FILTERS); setPage(1); };

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 shadow-card space-y-4">
        <div>
          <h2 className="font-display text-xl font-extrabold text-primary flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-gold" /> حسابات دخول الطلاب
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">تقرير قراءة فقط لحالة ربط الطلاب بحسابات الدخول.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <ReportField label="الرقم الأكاديمي">
            <input value={filters.academic_number} onChange={(e) => update("academic_number", e.target.value)}
              dir="ltr" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono" />
          </ReportField>
          <ReportField label="اسم الطالب">
            <input value={filters.student_name} onChange={(e) => update("student_name", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </ReportField>
          <ReportField label="القسم">
            <select value={filters.department_id} onChange={(e) => update("department_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل الأقسام</option>
              {lookups?.departments.map((department: any) => <option key={department.id} value={department.id}>{department.name_ar}</option>)}
            </select>
          </ReportField>
          <ReportField label="البرنامج">
            <select value={filters.program_id} onChange={(e) => update("program_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل البرامج</option>
              {filteredPrograms.map((program: any) => <option key={program.id} value={program.id}>{program.name_ar}{program.code ? ` (${program.code})` : ""}</option>)}
            </select>
          </ReportField>
          <ReportField label="المستوى">
            <select value={filters.level_id} onChange={(e) => update("level_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل المستويات</option>
              {lookups?.levels.map((level: any) => <option key={level.id} value={level.id}>{level.name}</option>)}
            </select>
          </ReportField>
          <ReportField label="العام الأكاديمي">
            <select value={filters.academic_year_id} onChange={(e) => update("academic_year_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل الأعوام</option>
              {lookups?.academic_years.map((year: any) => <option key={year.id} value={year.id}>{year.name}</option>)}
            </select>
          </ReportField>
          <ReportField label="الفصل الدراسي">
            <select value={filters.semester_id} onChange={(e) => update("semester_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل الفصول</option>
              {filteredSemesters.map((semester: any) => <option key={semester.id} value={semester.id}>{semester.name}{semester.code ? ` (${semester.code})` : ""}</option>)}
            </select>
          </ReportField>
          <ReportField label="نظام الدراسة">
            <select value={filters.study_system} onChange={(e) => update("study_system", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="all">الكل</option>
              <option value="regular">عام</option>
              <option value="private">نفقة خاصة</option>
              <option value="unset">غير محدد</option>
            </select>
          </ReportField>
          <ReportField label="حالة الحساب">
            <select value={filters.account_status} onChange={(e) => update("account_status", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="all">الكل</option>
              <option value="with_account">لديه حساب</option>
              <option value="without_account">بدون حساب</option>
            </select>
          </ReportField>
          <ReportField label="حالة الطالب">
            <select value={filters.status} onChange={(e) => update("status", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="all">كل الحالات</option>
              <option value="active">نشط</option>
              <option value="inactive">معطّل</option>
              <option value="suspended">موقوف</option>
              <option value="graduated">متخرج</option>
              <option value="withdrawn">منسحب</option>
              <option value="transferred">محول</option>
            </select>
          </ReportField>
        </div>
        <ReportActions
          onApply={apply}
          onClear={clear}
          onPrint={() => window.print()}
          onCsv={() => downloadCsv("student_accounts_report.csv", exportRows)}
          csvDisabled={!exportRows.length}
          printDisabled={!report?.rows?.length}
        />
      </div>

      {!enabled ? (
        <EmptyReportMessage message="اختر فلترًا واحدًا على الأقل لعرض التقرير." />
      ) : error ? (
        <ErrorBox message={(error as Error).message} />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="إجمالي الطلاب" value={report?.kpis.total ?? 0} icon={Users} />
            <KpiCard label="لديهم حساب" value={report?.kpis.withAccount ?? 0} icon={UserCheck} />
            <KpiCard label="بدون حساب" value={report?.kpis.withoutAccount ?? 0} icon={Users} />
            <KpiCard label="النظام العام" value={report?.kpis.regular ?? 0} icon={GraduationCap} />
            <KpiCard label="النفقة الخاصة" value={report?.kpis.private ?? 0} icon={GraduationCap} />
            <KpiCard label="غير محددي النظام" value={report?.kpis.unsetStudySystem ?? 0} icon={History} />
          </div>
          <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <ReportHeader title="نتائج حسابات دخول الطلاب" loading={isFetching} />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-secondary/50 text-primary">
                  <tr>
                    <th className="px-3 py-2 text-right">الرقم الأكاديمي</th>
                    <th className="px-3 py-2 text-right">اسم الطالب</th>
                    <th className="px-3 py-2 text-right">القسم</th>
                    <th className="px-3 py-2 text-right">البرنامج</th>
                    <th className="px-3 py-2 text-right">المستوى</th>
                    <th className="px-3 py-2 text-right">نظام الدراسة</th>
                    <th className="px-3 py-2 text-right">الحالة</th>
                    <th className="px-3 py-2 text-right">حالة الدخول</th>
                    <th className="px-3 py-2 text-right">تاريخ الإنشاء</th>
                    <th className="px-3 py-2 text-right">آخر تحديث</th>
                  </tr>
                </thead>
                <tbody>
                  {report?.rows.length ? report.rows.map((row) => (
                    <tr key={row.id} className="border-t border-border/60">
                      <td className="px-3 py-2 font-mono">{row.academic_number}</td>
                      <td className="px-3 py-2 font-bold">{row.full_name_ar}</td>
                      <td className="px-3 py-2">{row.department_name ?? "—"}</td>
                      <td className="px-3 py-2">{row.program_name ?? "—"}{row.program_code ? ` (${row.program_code})` : ""}</td>
                      <td className="px-3 py-2">{row.level_name ?? "—"}{row.level_number != null ? ` — ${row.level_number}` : ""}</td>
                      <td className="px-3 py-2">{studySystemLabel(row.study_system)}</td>
                      <td className="px-3 py-2">{statusLabel(row.status)}</td>
                      <td className="px-3 py-2">{row.has_account ? "لديه حساب" : "بدون حساب"}</td>
                      <td className="px-3 py-2">{formatDateTime(row.created_at)}</td>
                      <td className="px-3 py-2">{formatDateTime(row.updated_at)}</td>
                    </tr>
                  )) : (
                    <EmptyTableRow colSpan={10} />
                  )}
                </tbody>
              </table>
            </div>
            <PaginationFooter page={page} total={report?.total ?? 0} pageSize={ACCOUNT_PAGE_SIZE} totalPages={totalPages} setPage={setPage} />
          </div>
        </>
      )}
    </section>
  );
}

function hasAcademicReportFilter(reportId: AcademicReportId, filters: AcademicFilters) {
  if (reportId === "coverage") {
    return Boolean(filters.department_id || filters.program_id || filters.study_plan_id || filters.level_id || filters.semester_code !== "all");
  }
  if (reportId === "courses") {
    return Boolean(filters.department_id || filters.program_id || filters.level_id || filters.semester_code !== "all" || filters.status || filters.search);
  }
  return Boolean(filters.department_id || filters.program_id || filters.status || filters.search);
}

function AcademicReports() {
  const lookupsFn = useServerFn(getAcademicReportLookupsForAdmin);
  const programsFn = useServerFn(getAcademicProgramsReportForAdmin);
  const plansFn = useServerFn(getStudyPlansReportForAdmin);
  const coursesFn = useServerFn(getCoursesReportForAdmin);
  const coverageFn = useServerFn(getStudyPlanCoverageReportForAdmin);
  const [reportId, setReportId] = useState<AcademicReportId>("programs");
  const [filters, setFilters] = useState<AcademicFilters>(EMPTY_ACADEMIC_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AcademicFilters>(EMPTY_ACADEMIC_FILTERS);
  const [page, setPage] = useState(1);

  const { data: lookups } = useQuery({
    queryKey: ["academic-reports-lookups"],
    queryFn: () => lookupsFn({ data: {} }),
    staleTime: Infinity,
  });

  const enabled = hasAcademicReportFilter(reportId, appliedFilters);
  const commonPayload = {
    department_id: appliedFilters.department_id || undefined,
    program_id: appliedFilters.program_id || undefined,
    status: appliedFilters.status || undefined,
    search: appliedFilters.search || undefined,
    page,
    pageSize: 50,
  };
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["academic-report", reportId, appliedFilters, page],
    enabled,
    queryFn: () => {
      if (reportId === "programs") return programsFn({ data: commonPayload });
      if (reportId === "plans") return plansFn({ data: commonPayload });
      if (reportId === "courses") {
        return coursesFn({
          data: {
            ...commonPayload,
            level_id: appliedFilters.level_id || undefined,
            semester_code: appliedFilters.semester_code,
          },
        });
      }
      return coverageFn({
        data: {
          department_id: appliedFilters.department_id || undefined,
          program_id: appliedFilters.program_id || undefined,
          study_plan_id: appliedFilters.study_plan_id || undefined,
          level_id: appliedFilters.level_id || undefined,
          semester_code: appliedFilters.semester_code,
          page,
          pageSize: 50,
        },
      });
    },
  });

  const filteredPrograms = filters.department_id && lookups
    ? lookups.programs.filter((program: any) => program.department_id === filters.department_id)
    : lookups?.programs ?? [];
  const filteredPlans = filters.program_id && lookups
    ? lookups.studyPlans.filter((plan: any) => plan.program_id === filters.program_id)
    : lookups?.studyPlans ?? [];
  const totalPages = Math.max(1, Math.ceil(((report as any)?.total ?? 0) / 50));

  const update = (key: keyof AcademicFilters, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "department_id" ? { program_id: "", study_plan_id: "" } : {}),
      ...(key === "program_id" ? { study_plan_id: "" } : {}),
    }));
  };
  const apply = () => { setPage(1); setAppliedFilters(filters); };
  const clear = () => { setFilters(EMPTY_ACADEMIC_FILTERS); setAppliedFilters(EMPTY_ACADEMIC_FILTERS); setPage(1); };
  const switchReport = (next: AcademicReportId) => {
    setReportId(next);
    setPage(1);
    setAppliedFilters(EMPTY_ACADEMIC_FILTERS);
    setFilters(EMPTY_ACADEMIC_FILTERS);
  };

  const tabs: Array<{ id: AcademicReportId; label: string }> = [
    { id: "programs", label: "البرامج الأكاديمية" },
    { id: "plans", label: "الخطط الدراسية" },
    { id: "courses", label: "دليل المقررات" },
    { id: "coverage", label: "تغطية الخطط بالمقررات" },
  ];

  const exportRows = useMemo(() => {
    const rows = ((report as any)?.rows ?? []) as any[];
    if (reportId === "programs") return rows.map((row) => ({
      "القسم": row.department ?? "",
      "كود البرنامج": row.code ?? "",
      "اسم البرنامج": row.name ?? "",
      "نوع الدرجة": row.degree_type ?? "",
      "الحالة": row.status ?? "",
      "عدد المستويات": row.levels_count ?? "",
      "عدد الخطط": row.plans_count ?? 0,
      "عدد الطلاب": row.students_count ?? 0,
    }));
    if (reportId === "plans") return rows.map((row) => ({
      "اسم الخطة": row.name ?? "",
      "كود/إصدار الخطة": row.code ?? "",
      "القسم": row.department ?? "",
      "البرنامج": row.program ?? "",
      "العام الأكاديمي": row.academic_year ?? "",
      "الحالة": row.status ?? "",
      "عدد المقررات": row.courses_count ?? 0,
      "إجمالي الساعات": row.total_hours ?? 0,
      "آخر تحديث": formatDateTime(row.updated_at),
    }));
    if (reportId === "courses") return rows.map((row) => ({
      "كود المقرر": row.code ?? "",
      "اسم المقرر": row.name ?? "",
      "القسم": row.department ?? "",
      "البرنامج/الخطة": row.plan_or_program ?? "",
      "المستوى": row.level ?? "",
      "الفصل": row.semester ?? "",
      "نظري": row.theory_hours ?? 0,
      "عملي": row.practical_hours ?? 0,
      "إجمالي الساعات": row.credit_hours ?? 0,
      "حالة البيانات": row.data_status ?? "",
    }));
    return rows.map((row) => ({
      "الخطة": row.plan ?? "",
      "البرنامج": row.program ?? "",
      "المستوى": row.level ?? "",
      "الفصل": row.semester ?? "",
      "عدد المقررات": row.courses_count ?? 0,
      "إجمالي الساعات": row.total_hours ?? 0,
      "ملاحظات": row.notes ?? "",
    }));
  }, [report, reportId]);

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 shadow-card space-y-4">
        <div>
          <h2 className="font-display text-xl font-extrabold text-primary flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-gold" /> التقارير الأكاديمية
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            تقارير قراءة فقط للبرامج والخطط والمقررات وتغطية الخطط.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchReport(tab.id)}
              className={`rounded-t-lg border-b-2 px-4 py-2 text-sm font-bold ${
                reportId === tab.id ? "border-gold text-primary" : "border-transparent text-muted-foreground hover:text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <ReportField label="القسم">
            <select value={filters.department_id} onChange={(e) => update("department_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل الأقسام</option>
              {lookups?.departments.map((department: any) => <option key={department.id} value={department.id}>{department.name_ar}</option>)}
            </select>
          </ReportField>
          <ReportField label="البرنامج">
            <select value={filters.program_id} onChange={(e) => update("program_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل البرامج</option>
              {filteredPrograms.map((program: any) => <option key={program.id} value={program.id}>{program.name_ar}{program.code ? ` (${program.code})` : ""}</option>)}
            </select>
          </ReportField>
          {reportId === "coverage" && (
            <ReportField label="الخطة">
              <select value={filters.study_plan_id} onChange={(e) => update("study_plan_id", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="">كل الخطط</option>
                {filteredPlans.map((plan: any) => <option key={plan.id} value={plan.id}>{plan.name} ({plan.version})</option>)}
              </select>
            </ReportField>
          )}
          {(reportId === "courses" || reportId === "coverage") && (
            <ReportField label="المستوى">
              <select value={filters.level_id} onChange={(e) => update("level_id", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="">كل المستويات</option>
                {lookups?.levels.map((level: any) => <option key={level.id} value={level.id}>{level.name}</option>)}
              </select>
            </ReportField>
          )}
          {(reportId === "courses" || reportId === "coverage") && (
            <ReportField label="الفصل">
              <select value={filters.semester_code} onChange={(e) => update("semester_code", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="all">كل الفصول</option>
                <option value="first">الفصل الأول</option>
                <option value="second">الفصل الثاني</option>
              </select>
            </ReportField>
          )}
          {reportId !== "coverage" && (
            <ReportField label="الحالة">
              <input value={filters.status} onChange={(e) => update("status", e.target.value)}
                placeholder="active / inactive / archived"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </ReportField>
          )}
          {reportId !== "coverage" && (
            <ReportField label="بحث بالكود أو الاسم">
              <input value={filters.search} onChange={(e) => update("search", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </ReportField>
          )}
        </div>

        <ReportActions
          onApply={apply}
          onClear={clear}
          onPrint={() => window.print()}
          onCsv={() => downloadCsv(`${reportId}_academic_report.csv`, exportRows)}
          csvDisabled={!exportRows.length}
          printDisabled={!((report as any)?.rows?.length)}
        />
      </div>

      {!enabled ? (
        <EmptyReportMessage message="اختر فلترًا واحدًا على الأقل لعرض التقرير." />
      ) : error ? (
        <ErrorBox message={(error as Error).message} />
      ) : (
        <>
          <AcademicKpis reportId={reportId} report={report as any} />
          <AcademicTable reportId={reportId} report={report as any} loading={isFetching} />
          <PaginationFooter page={page} total={(report as any)?.total ?? 0} pageSize={50} totalPages={totalPages} setPage={setPage} />
        </>
      )}
    </section>
  );
}

function AcademicKpis({ reportId, report }: { reportId: AcademicReportId; report: any }) {
  const k = report?.kpis ?? {};
  if (reportId === "programs") {
    return (
      <div className="grid gap-3 md:grid-cols-5">
        <KpiCard label="إجمالي البرامج" value={k.total ?? 0} icon={GraduationCap} />
        <KpiCard label="النشطة" value={k.active ?? 0} icon={UserCheck} />
        <KpiCard label="غير النشطة" value={k.inactive ?? 0} icon={XCircle} />
        <KpiCard label="بدون خطة" value={k.withoutPlans ?? 0} icon={FileText} />
        <KpiCard label="لديها طلاب" value={k.withStudents ?? 0} icon={Users} />
      </div>
    );
  }
  if (reportId === "plans") {
    return (
      <div className="grid gap-3 md:grid-cols-5">
        <KpiCard label="إجمالي الخطط" value={k.total ?? 0} icon={FileText} />
        <KpiCard label="النشطة" value={k.active ?? 0} icon={UserCheck} />
        <KpiCard label="بدون مقررات" value={k.withoutCourses ?? 0} icon={XCircle} />
        <KpiCard label="متوسط المقررات" value={k.avgCourses ?? 0} icon={ClipboardList} />
        <KpiCard label="إجمالي الساعات" value={k.totalHours ?? 0} icon={BookOpen} />
      </div>
    );
  }
  if (reportId === "courses") {
    return (
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
        <KpiCard label="إجمالي المقررات" value={k.total ?? 0} icon={BookOpen} />
        <KpiCard label="بدون كود" value={k.missingCode ?? 0} icon={XCircle} />
        <KpiCard label="بدون خطة" value={k.withoutPlan ?? 0} icon={FileText} />
        <KpiCard label="بدون مستوى" value={k.withoutLevel ?? 0} icon={History} />
        <KpiCard label="بدون فصل" value={k.withoutSemester ?? 0} icon={History} />
        <KpiCard label="مكتملة" value={k.complete ?? 0} icon={UserCheck} />
        <KpiCard label="ناقصة" value={k.incomplete ?? 0} icon={XCircle} />
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-5">
      <KpiCard label="الخطط المشمولة" value={k.plans ?? 0} icon={FileText} />
      <KpiCard label="مستويات/فصول بها مقررات" value={k.filledSlots ?? 0} icon={UserCheck} />
      <KpiCard label="مستويات/فصول فارغة" value={k.emptySlots ?? 0} icon={XCircle} />
      <KpiCard label="إجمالي المقررات" value={k.courses ?? 0} icon={BookOpen} />
      <KpiCard label="إجمالي الساعات" value={k.hours ?? 0} icon={ClipboardList} />
    </div>
  );
}

function AcademicTable({ reportId, report, loading }: { reportId: AcademicReportId; report: any; loading?: boolean }) {
  const rows = report?.rows ?? [];
  const columns: Array<{ key: string; label: string }> =
    reportId === "programs" ? [
      { key: "department", label: "القسم" },
      { key: "code", label: "كود البرنامج" },
      { key: "name", label: "اسم البرنامج" },
      { key: "degree_type", label: "الدرجة" },
      { key: "status", label: "الحالة" },
      { key: "levels_count", label: "المستويات" },
      { key: "plans_count", label: "الخطط" },
      { key: "students_count", label: "الطلاب" },
    ] : reportId === "plans" ? [
      { key: "name", label: "اسم الخطة" },
      { key: "code", label: "الكود/الإصدار" },
      { key: "department", label: "القسم" },
      { key: "program", label: "البرنامج" },
      { key: "academic_year", label: "العام" },
      { key: "status", label: "الحالة" },
      { key: "courses_count", label: "المقررات" },
      { key: "total_hours", label: "الساعات" },
      { key: "updated_at", label: "آخر تحديث" },
    ] : reportId === "courses" ? [
      { key: "code", label: "كود المقرر" },
      { key: "name", label: "اسم المقرر" },
      { key: "department", label: "القسم" },
      { key: "plan_or_program", label: "البرنامج/الخطة" },
      { key: "level", label: "المستوى" },
      { key: "semester", label: "الفصل" },
      { key: "theory_hours", label: "نظري" },
      { key: "practical_hours", label: "عملي" },
      { key: "credit_hours", label: "إجمالي" },
      { key: "data_status", label: "حالة البيانات" },
    ] : [
      { key: "plan", label: "الخطة" },
      { key: "program", label: "البرنامج" },
      { key: "level", label: "المستوى" },
      { key: "semester", label: "الفصل" },
      { key: "courses_count", label: "المقررات" },
      { key: "total_hours", label: "الساعات" },
      { key: "notes", label: "ملاحظات" },
    ];
  return (
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      <ReportHeader title={reportId === "programs" ? "البرامج الأكاديمية" : reportId === "plans" ? "الخطط الدراسية" : reportId === "courses" ? "دليل المقررات" : "تغطية الخطط بالمقررات"} loading={loading} />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-secondary/50 text-primary">
            <tr>{columns.map((column) => <th key={column.key} className="px-3 py-2 text-right">{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row: any) => (
              <tr key={row.id} className="border-t border-border/60">
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-2">
                    {column.key === "updated_at" ? formatDateTime(row[column.key]) : row[column.key] ?? "—"}
                  </td>
                ))}
              </tr>
            )) : <EmptyTableRow colSpan={columns.length} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScheduleReports() {
  const lookupsFn = useServerFn(getScheduleReportLookupsForAdmin);
  const assignmentsFn = useServerFn(getCourseAssignmentsReportForAdmin);
  const unassignedFn = useServerFn(getUnassignedCoursesReportForAdmin);
  const groupsFn = useServerFn(getStudyGroupsReportForAdmin);
  const timetableFn = useServerFn(getTimetableReportForAdmin);
  const roomsFn = useServerFn(getRoomUtilizationReportForAdmin);
  const facultyLoadFn = useServerFn(getFacultyLoadReportForAdmin);
  const conflictsFn = useServerFn(getScheduleConflictIndicatorsForAdmin);
  const [reportId, setReportId] = useState<ScheduleReportId>("assignments");
  const [filters, setFilters] = useState<ScheduleFilters>(EMPTY_SCHEDULE_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ScheduleFilters>(EMPTY_SCHEDULE_FILTERS);
  const [page, setPage] = useState(1);

  const { data: lookups } = useQuery({
    queryKey: ["schedule-report-lookups"],
    queryFn: () => lookupsFn({ data: {} }),
    staleTime: Infinity,
  });

  const enabled = hasScheduleReportFilter(appliedFilters, reportId);
  const payload = {
    department_id: appliedFilters.department_id || undefined,
    program_id: appliedFilters.program_id || undefined,
    level_id: appliedFilters.level_id || undefined,
    academic_year_id: appliedFilters.academic_year_id || undefined,
    semester_id: appliedFilters.semester_id || undefined,
    faculty_profile_id: appliedFilters.faculty_profile_id || undefined,
    room_id: appliedFilters.room_id || undefined,
    course_section_id: appliedFilters.course_section_id || undefined,
    day_of_week: appliedFilters.day_of_week || undefined,
    schedule_type: appliedFilters.schedule_type || undefined,
    assignment_status: appliedFilters.assignment_status,
    section_status: appliedFilters.section_status || undefined,
    room_type: appliedFilters.room_type || undefined,
    conflict_type: appliedFilters.conflict_type,
    search: appliedFilters.search || undefined,
    page,
    pageSize: 50,
  };
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["schedule-report", reportId, appliedFilters, page],
    enabled,
    queryFn: () => {
      if (reportId === "assignments") return assignmentsFn({ data: payload });
      if (reportId === "unassigned") return unassignedFn({ data: payload });
      if (reportId === "groups") return groupsFn({ data: payload });
      if (reportId === "timetable") return timetableFn({ data: payload });
      if (reportId === "rooms") return roomsFn({ data: payload });
      if (reportId === "facultyLoad") return facultyLoadFn({ data: payload });
      return conflictsFn({ data: payload });
    },
  });

  const filteredPrograms = filters.department_id && lookups
    ? lookups.programs.filter((program: any) => program.department_id === filters.department_id)
    : lookups?.programs ?? [];
  const filteredSemesters = filters.academic_year_id && lookups
    ? lookups.semesters.filter((semester: any) => semester.academic_year_id === filters.academic_year_id)
    : lookups?.semesters ?? [];
  const totalPages = Math.max(1, Math.ceil(((report as any)?.total ?? 0) / 50));

  const tabs: Array<{ id: ScheduleReportId; label: string }> = [
    { id: "assignments", label: "إسناد المقررات" },
    { id: "unassigned", label: "المقررات غير المسندة" },
    { id: "groups", label: "المجموعات الدراسية" },
    { id: "timetable", label: "الجداول الدراسية" },
    { id: "rooms", label: "استخدام القاعات" },
    { id: "facultyLoad", label: "عبء المحاضرين" },
    { id: "conflicts", label: "مؤشرات التعارضات" },
  ];

  const update = (key: keyof ScheduleFilters, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "department_id" ? { program_id: "" } : {}),
      ...(key === "academic_year_id" ? { semester_id: "" } : {}),
    }));
  };
  const switchReport = (next: ScheduleReportId) => {
    setReportId(next);
    setFilters(EMPTY_SCHEDULE_FILTERS);
    setAppliedFilters(EMPTY_SCHEDULE_FILTERS);
    setPage(1);
  };
  const apply = () => { setPage(1); setAppliedFilters(filters); };
  const clear = () => { setFilters(EMPTY_SCHEDULE_FILTERS); setAppliedFilters(EMPTY_SCHEDULE_FILTERS); setPage(1); };

  const columns = scheduleColumns(reportId);
  const exportRows = useMemo(() => (((report as any)?.rows ?? []) as any[]).map((row) => {
    const out: Record<string, unknown> = {};
    for (const column of columns) out[column.label] = row[column.key] ?? "";
    return out;
  }), [report, columns]);

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 shadow-card space-y-4">
        <div>
          <h2 className="font-display text-xl font-extrabold text-primary flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-gold" /> تقارير الجداول والإسناد
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            تقارير قراءة فقط لإسناد المقررات والمجموعات الدراسية والجداول والقاعات وعبء المحاضرين.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-border">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" onClick={() => switchReport(tab.id)}
              className={`rounded-t-lg border-b-2 px-3 py-2 text-xs font-bold ${
                reportId === tab.id ? "border-gold text-primary" : "border-transparent text-muted-foreground hover:text-primary"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <ReportField label="القسم">
            <select value={filters.department_id} onChange={(e) => update("department_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل الأقسام</option>
              {lookups?.departments.map((department: any) => <option key={department.id} value={department.id}>{department.name_ar}</option>)}
            </select>
          </ReportField>
          <ReportField label="البرنامج">
            <select value={filters.program_id} onChange={(e) => update("program_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل البرامج</option>
              {filteredPrograms.map((program: any) => <option key={program.id} value={program.id}>{program.name_ar}{program.code ? ` (${program.code})` : ""}</option>)}
            </select>
          </ReportField>
          <ReportField label="المستوى">
            <select value={filters.level_id} onChange={(e) => update("level_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل المستويات</option>
              {lookups?.levels.map((level: any) => <option key={level.id} value={level.id}>{level.name}</option>)}
            </select>
          </ReportField>
          <ReportField label="العام الأكاديمي">
            <select value={filters.academic_year_id} onChange={(e) => update("academic_year_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل الأعوام</option>
              {lookups?.years.map((year: any) => <option key={year.id} value={year.id}>{year.name}</option>)}
            </select>
          </ReportField>
          <ReportField label="الفصل الدراسي">
            <select value={filters.semester_id} onChange={(e) => update("semester_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل الفصول</option>
              {filteredSemesters.map((semester: any) => <option key={semester.id} value={semester.id}>{semester.name}{semester.code ? ` (${semester.code})` : ""}</option>)}
            </select>
          </ReportField>
          <ReportField label="المحاضر">
            <select value={filters.faculty_profile_id} onChange={(e) => update("faculty_profile_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل المحاضرين</option>
              {lookups?.faculty.map((faculty: any) => <option key={faculty.id} value={faculty.id}>{faculty.full_name_ar}</option>)}
            </select>
          </ReportField>
          <ReportField label="القاعة">
            <select value={filters.room_id} onChange={(e) => update("room_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل القاعات</option>
              {lookups?.rooms.map((room: any) => <option key={room.id} value={room.id}>{room.code} — {room.name_ar}</option>)}
            </select>
          </ReportField>
          <ReportField label="المجموعة الدراسية">
            <select value={filters.course_section_id} onChange={(e) => update("course_section_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل المجموعات الدراسية</option>
              {lookups?.sections.map((section: any) => <option key={section.id} value={section.id}>{section.section_code}</option>)}
            </select>
          </ReportField>
          <ReportField label="اليوم">
            <select value={filters.day_of_week} onChange={(e) => update("day_of_week", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل الأيام</option>
              {lookups?.days.map((day: string) => <option key={day} value={day}>{dayLabel(day)}</option>)}
            </select>
          </ReportField>
          <ReportField label="نوع الجلسة">
            <select value={filters.schedule_type} onChange={(e) => update("schedule_type", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">كل الأنواع</option>
              {lookups?.scheduleTypes.map((type: string) => <option key={type} value={type}>{type}</option>)}
            </select>
          </ReportField>
          {reportId === "assignments" && (
            <ReportField label="حالة الإسناد">
              <select value={filters.assignment_status} onChange={(e) => update("assignment_status", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="all">الكل</option>
                <option value="assigned">مسند</option>
                <option value="unassigned">غير مسند</option>
              </select>
            </ReportField>
          )}
          {reportId === "groups" && (
            <ReportField label="حالة المجموعة">
              <input value={filters.section_status} onChange={(e) => update("section_status", e.target.value)}
                placeholder="active / inactive"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </ReportField>
          )}
          {reportId === "rooms" && (
            <ReportField label="نوع القاعة">
              <input value={filters.room_type} onChange={(e) => update("room_type", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </ReportField>
          )}
          {reportId === "conflicts" && (
            <ReportField label="نوع التعارض">
              <select value={filters.conflict_type} onChange={(e) => update("conflict_type", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="all">الكل</option>
                <option value="faculty">محاضر</option>
                <option value="room">قاعة</option>
                <option value="group">مجموعة دراسية</option>
                <option value="missing_data">بيانات ناقصة</option>
              </select>
            </ReportField>
          )}
          <ReportField label="بحث باسم أو كود المقرر">
            <input value={filters.search} onChange={(e) => update("search", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </ReportField>
        </div>
        <ReportActions
          onApply={() => { setPage(1); setAppliedFilters(filters); }}
          onClear={() => { setFilters(EMPTY_SCHEDULE_FILTERS); setAppliedFilters(EMPTY_SCHEDULE_FILTERS); setPage(1); }}
          onPrint={() => window.print()}
          onCsv={() => downloadCsv(`${reportId}_schedule_report.csv`, exportRows)}
          csvDisabled={!exportRows.length}
          printDisabled={!((report as any)?.rows?.length)}
        />
      </div>
      {!enabled ? (
        <EmptyReportMessage message="اختر فلترًا واحدًا على الأقل لعرض التقرير." />
      ) : error ? (
        <ErrorBox message={(error as Error).message} />
      ) : (
        <>
          <ScheduleKpis reportId={reportId} report={report as any} />
          {(report as any)?.message && <EmptyReportMessage message={(report as any).message} />}
          <ScheduleTable reportId={reportId} report={report as any} loading={isFetching} columns={columns} />
          <PaginationFooter page={page} total={(report as any)?.total ?? 0} pageSize={50} totalPages={totalPages} setPage={setPage} />
        </>
      )}
    </section>
  );
}

function dayLabel(day: string | null | undefined) {
  const labels: Record<string, string> = {
    saturday: "السبت",
    sunday: "الأحد",
    monday: "الإثنين",
    tuesday: "الثلاثاء",
    wednesday: "الأربعاء",
    thursday: "الخميس",
    friday: "الجمعة",
  };
  return day ? labels[day] ?? day : "—";
}

function scheduleColumns(reportId: ScheduleReportId): Array<{ key: string; label: string }> {
  if (reportId === "assignments") return [
    { key: "department", label: "القسم" },
    { key: "program", label: "البرنامج" },
    { key: "level", label: "المستوى" },
    { key: "course", label: "المقرر" },
    { key: "course_code", label: "كود المقرر" },
    { key: "academic_year", label: "العام" },
    { key: "semester", label: "الفصل" },
    { key: "faculty", label: "المحاضر المسند" },
    { key: "assignment_status", label: "حالة الإسناد" },
    { key: "groups_count", label: "المجموعات الدراسية" },
    { key: "schedule_sessions", label: "جلسات الجدول" },
  ];
  if (reportId === "unassigned") return [
    { key: "department", label: "القسم" },
    { key: "program", label: "البرنامج" },
    { key: "level", label: "المستوى" },
    { key: "course", label: "المقرر" },
    { key: "course_code", label: "كود المقرر" },
    { key: "academic_year", label: "العام" },
    { key: "semester", label: "الفصل" },
    { key: "expected_students", label: "الطلاب المتوقعون" },
    { key: "groups_count", label: "المجموعات الدراسية" },
    { key: "note", label: "ملاحظة" },
  ];
  if (reportId === "groups") return [
    { key: "section_code", label: "رمز المجموعة" },
    { key: "section_name", label: "اسم المجموعة" },
    { key: "department", label: "القسم" },
    { key: "program", label: "البرنامج" },
    { key: "level", label: "المستوى" },
    { key: "academic_year", label: "العام" },
    { key: "semester", label: "الفصل" },
    { key: "expected_students", label: "الطلاب المتوقعون" },
    { key: "courses_count", label: "المقررات" },
    { key: "schedule_sessions", label: "جلسات الجدول" },
    { key: "status", label: "الحالة" },
  ];
  if (reportId === "timetable") return [
    { key: "day", label: "اليوم" },
    { key: "start_time", label: "البداية" },
    { key: "end_time", label: "النهاية" },
    { key: "department", label: "القسم" },
    { key: "program", label: "البرنامج" },
    { key: "level", label: "المستوى" },
    { key: "section_code", label: "المجموعة الدراسية" },
    { key: "course", label: "المقرر" },
    { key: "faculty", label: "المحاضر" },
    { key: "room", label: "القاعة" },
    { key: "schedule_type", label: "نوع الجلسة" },
    { key: "notes", label: "ملاحظات" },
  ];
  if (reportId === "rooms") return [
    { key: "room", label: "القاعة" },
    { key: "room_type", label: "نوع القاعة" },
    { key: "capacity", label: "السعة" },
    { key: "day", label: "اليوم" },
    { key: "sessions_count", label: "الجلسات" },
    { key: "scheduled_hours", label: "الساعات" },
    { key: "first_time", label: "أول استخدام" },
    { key: "last_time", label: "آخر استخدام" },
    { key: "notes", label: "ملاحظات" },
  ];
  if (reportId === "facultyLoad") return [
    { key: "faculty", label: "اسم المحاضر" },
    { key: "department", label: "القسم" },
    { key: "assigned_courses", label: "المقررات المسندة" },
    { key: "groups_count", label: "المجموعات الدراسية" },
    { key: "schedule_sessions", label: "جلسات الجدول" },
    { key: "scheduled_hours", label: "الساعات المجدولة" },
    { key: "notes", label: "ملاحظات" },
  ];
  return [
    { key: "conflict_type", label: "نوع التعارض" },
    { key: "day", label: "اليوم" },
    { key: "start_time", label: "البداية" },
    { key: "end_time", label: "النهاية" },
    { key: "course", label: "المقرر" },
    { key: "faculty", label: "المحاضر" },
    { key: "room", label: "القاعة" },
    { key: "section_code", label: "المجموعة الدراسية" },
    { key: "description", label: "الوصف" },
  ];
}

function ScheduleKpis({ reportId, report }: { reportId: ScheduleReportId; report: any }) {
  const k = report?.kpis ?? {};
  if (reportId === "assignments") return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard label="إجمالي الطروحات" value={k.total ?? 0} icon={ClipboardList} />
      <KpiCard label="المسندة" value={k.assigned ?? 0} icon={UserCheck} />
      <KpiCard label="غير المسندة" value={k.unassigned ?? 0} icon={XCircle} />
      <KpiCard label="المحاضرون" value={k.faculty ?? 0} icon={Users} />
      <KpiCard label="المجموعات الدراسية" value={k.groups ?? 0} icon={Users} />
      <KpiCard label="لديها جدول" value={k.withSchedule ?? 0} icon={ClockIconShim} />
    </div>
  );
  if (reportId === "unassigned") return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard label="إجمالي غير المسند" value={k.total ?? 0} icon={XCircle} />
      <KpiCard label="حسب القسم" value={k.departments ?? 0} icon={BookOpen} />
      <KpiCard label="حسب البرنامج" value={k.programs ?? 0} icon={GraduationCap} />
      <KpiCard label="حسب المستوى" value={k.levels ?? 0} icon={History} />
      <KpiCard label="له مجموعات" value={k.withGroups ?? 0} icon={Users} />
      <KpiCard label="له جدول" value={k.withSchedule ?? 0} icon={ClipboardList} />
    </div>
  );
  if (reportId === "groups") return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard label="إجمالي المجموعات" value={k.total ?? 0} icon={Users} />
      <KpiCard label="بدون طلاب متوقعين" value={k.withoutStudents ?? 0} icon={XCircle} />
      <KpiCard label="بدون مقررات" value={k.withoutCourses ?? 0} icon={BookOpen} />
      <KpiCard label="بدون جدول" value={k.withoutSchedule ?? 0} icon={XCircle} />
      <KpiCard label="لديها جدول" value={k.withSchedule ?? 0} icon={ClipboardList} />
      <KpiCard label="متوسط المقررات" value={k.avgCourses ?? 0} icon={BookOpen} />
    </div>
  );
  if (reportId === "timetable") return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard label="جلسات الجدول" value={k.total ?? 0} icon={ClipboardList} />
      <KpiCard label="القاعات المستخدمة" value={k.rooms ?? 0} icon={BookOpen} />
      <KpiCard label="المحاضرون" value={k.faculty ?? 0} icon={Users} />
      <KpiCard label="المجموعات المجدولة" value={k.groups ?? 0} icon={Users} />
      <KpiCard label="بدون قاعة" value={k.withoutRoom ?? 0} icon={XCircle} />
      <KpiCard label="بدون محاضر" value={k.withoutFaculty ?? 0} icon={XCircle} />
    </div>
  );
  if (reportId === "rooms") return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard label="إجمالي القاعات" value={k.totalRooms ?? 0} icon={BookOpen} />
      <KpiCard label="المستخدمة" value={k.usedRooms ?? 0} icon={UserCheck} />
      <KpiCard label="غير المستخدمة" value={k.unusedRooms ?? 0} icon={XCircle} />
      <KpiCard label="إجمالي الجلسات" value={k.sessions ?? 0} icon={ClipboardList} />
      <KpiCard label="إجمالي الساعات" value={k.hours ?? 0} icon={History} />
      <KpiCard label="متوسط الاستخدام" value={k.avgUtilization ?? 0} icon={History} />
    </div>
  );
  if (reportId === "facultyLoad") return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard label="عدد المحاضرين" value={k.faculty ?? 0} icon={Users} />
      <KpiCard label="المقررات المسندة" value={k.assignedCourses ?? 0} icon={BookOpen} />
      <KpiCard label="جلسات الجدول" value={k.sessions ?? 0} icon={ClipboardList} />
      <KpiCard label="الساعات المجدولة" value={k.hours ?? 0} icon={History} />
      <KpiCard label="أعلى عبء" value={k.maxLoad ?? 0} icon={UserCheck} />
      <KpiCard label="بدون جدول" value={k.withoutSchedule ?? 0} icon={XCircle} />
    </div>
  );
  return (
    <div className="grid gap-3 md:grid-cols-5">
      <KpiCard label="إجمالي المؤشرات" value={k.total ?? 0} icon={XCircle} />
      <KpiCard label="تعارضات المحاضرين" value={k.faculty ?? 0} icon={Users} />
      <KpiCard label="تعارضات القاعات" value={k.room ?? 0} icon={BookOpen} />
      <KpiCard label="تعارضات المجموعات" value={k.group ?? 0} icon={Users} />
      <KpiCard label="ناقصة البيانات" value={k.missingData ?? 0} icon={XCircle} />
    </div>
  );
}

function ClockIconShim(props: any) {
  return <History {...props} />;
}

function ScheduleTable({ reportId, report, loading, columns }: {
  reportId: ScheduleReportId;
  report: any;
  loading?: boolean;
  columns: Array<{ key: string; label: string }>;
}) {
  const title = reportId === "assignments" ? "إسناد المقررات"
    : reportId === "unassigned" ? "المقررات غير المسندة"
    : reportId === "groups" ? "المجموعات الدراسية"
    : reportId === "timetable" ? "الجداول الدراسية"
    : reportId === "rooms" ? "استخدام القاعات"
    : reportId === "facultyLoad" ? "عبء المحاضرين"
    : "مؤشرات التعارضات";
  const rows = report?.rows ?? [];
  return (
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      <ReportHeader title={title} loading={loading} />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-secondary/50 text-primary">
            <tr>{columns.map((column) => <th key={column.key} className="px-3 py-2 text-right">{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row: any) => (
              <tr key={row.id} className="border-t border-border/60">
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-2">
                    {column.key === "day" ? dayLabel(row[column.key]) : row[column.key] ?? "—"}
                  </td>
                ))}
              </tr>
            )) : <EmptyTableRow colSpan={columns.length} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-gold" />
      </div>
      <div className="mt-2 font-display text-2xl font-extrabold text-primary">
        {value.toLocaleString("ar-EG")}
      </div>
    </div>
  );
}

function ReportActions({
  onApply,
  onClear,
  onPrint,
  onCsv,
  csvDisabled,
  printDisabled,
}: {
  onApply: () => void;
  onClear: () => void;
  onPrint: () => void;
  onCsv: () => void;
  csvDisabled: boolean;
  printDisabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onApply}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90">
        <Search className="h-4 w-4" /> تطبيق الفلاتر
      </button>
      <button type="button" onClick={onClear}
        className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-bold text-primary hover:bg-secondary">
        مسح الفلاتر
      </button>
      <button type="button" disabled={printDisabled} onClick={onPrint}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-bold text-primary hover:bg-secondary disabled:opacity-50">
        <Printer className="h-4 w-4" /> طباعة
      </button>
      <button type="button" disabled={csvDisabled} onClick={onCsv}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-bold text-primary hover:bg-secondary disabled:opacity-50">
        <FileDown className="h-4 w-4" /> تصدير CSV
      </button>
    </div>
  );
}

function ReportHeader({ title, loading }: { title: string; loading?: boolean }) {
  // PILOT-MEDIUM-FIX-01 (F-13): clearer loading affordance — spinner + label,
  // plus an indeterminate progress bar so wide-filter loads (schedule reports)
  // feel responsive instead of "stuck".
  return (
    <div className="border-b border-border">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="font-display text-sm font-extrabold text-primary flex items-center gap-2">
          <FileText className="h-4 w-4 text-gold" /> {title}
        </h3>
        {loading && (
          <span className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري تحميل التقرير...
          </span>
        )}
      </div>
      {loading && (
        <div
          className="h-0.5 w-full overflow-hidden bg-secondary/50"
          role="progressbar"
          aria-label="جاري تحميل التقرير"
        >
          <div className="h-full w-1/3 animate-[report-progress_1.2s_ease-in-out_infinite] bg-primary/70" />
        </div>
      )}
    </div>
  );
}

function EmptyReportMessage({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-bold text-destructive">
      {message}
    </div>
  );
}

function EmptyTableRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-muted-foreground">
        لا توجد بيانات مطابقة.
      </td>
    </tr>
  );
}

function PaginationFooter({
  page,
  total,
  pageSize,
  totalPages,
  setPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  totalPages: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs">
      <span className="text-muted-foreground">
        عرض حتى {pageSize.toLocaleString("ar-EG")} من {total.toLocaleString("ar-EG")} سجل
      </span>
      <div className="flex gap-1">
        <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}
          className="rounded border border-border px-3 py-1 disabled:opacity-40">السابق</button>
        <span className="px-2 py-1 font-mono">{page} / {totalPages}</span>
        <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          className="rounded border border-border px-3 py-1 disabled:opacity-40">التالي</button>
      </div>
    </div>
  );
}

function ImportDetailsDialog({
  details,
  loading,
  onClose,
}: {
  details: any;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="font-display text-lg font-extrabold text-primary">تفاصيل عملية الاستيراد</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-secondary" aria-label="إغلاق">×</button>
        </div>
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <Loader2 className="me-2 inline h-4 w-4 animate-spin" /> جاري التحميل...
          </div>
        ) : details ? (
          <div className="space-y-4 overflow-y-auto p-4">
            <div className="grid gap-2 rounded-lg border border-border bg-secondary/20 p-3 text-xs md:grid-cols-2">
              <div><span className="text-muted-foreground">النوع:</span> <span className="font-mono">{details.job.import_type}</span></div>
              <div><span className="text-muted-foreground">الملف:</span> {details.job.file_name}</div>
              <div><span className="text-muted-foreground">الحالة:</span> {importStatusLabel(details.job.status)}</div>
              <div><span className="text-muted-foreground">التاريخ:</span> {formatDateTime(details.job.created_at)}</div>
              <div><span className="text-muted-foreground">إجمالي:</span> {details.job.rows_total}</div>
              <div><span className="text-muted-foreground">فشل:</span> {details.job.rows_failed}</div>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-secondary/50 text-primary">
                  <tr>
                    <th className="px-3 py-2 text-right">رقم الصف</th>
                    <th className="px-3 py-2 text-right">العمود</th>
                    <th className="px-3 py-2 text-right">رسالة الخطأ</th>
                    <th className="px-3 py-2 text-right">القيمة</th>
                  </tr>
                </thead>
                <tbody>
                  {details.errors.length ? details.errors.map((item, index) => (
                    <tr key={index} className="border-t border-border/60">
                      <td className="px-3 py-2 font-mono">{item.row}</td>
                      <td className="px-3 py-2 font-mono">{item.column ?? "—"}</td>
                      <td className="px-3 py-2">{item.message}</td>
                      <td className="px-3 py-2">{item.value ?? "—"}</td>
                    </tr>
                  )) : (
                    <EmptyTableRow colSpan={4} />
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              مصدر التفاصيل الحالي: {details.source}. لا يوجد جدول import_errors مستقل في schema الحالي.
            </p>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">لا توجد تفاصيل.</div>
        )}
      </div>
    </div>
  );
}

function ComingSoonCard({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center shadow-card">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary">
        <BarChart3 className="h-5 w-5" />
      </div>
      <h2 className="mt-3 font-display text-lg font-extrabold text-primary">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">سيتم تفعيل هذا القسم لاحقاً.</p>
    </div>
  );
}

function ReportField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold text-primary">{label}</span>
      {children}
    </label>
  );
}
