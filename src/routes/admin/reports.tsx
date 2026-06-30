import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3, BookOpen, ClipboardList, FileBadge, FileDown, FileSearch,
  FileText, GraduationCap, History, Loader2, Printer, Search, ShieldCheck,
  Upload, UserCheck, Users,
} from "lucide-react";
import { getStudentLookups } from "@/lib/admin-students.functions";
import { getStudentsReportForAdmin } from "@/lib/admin-reports.functions";

export const Route = createFileRoute("/admin/reports")({
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
  const [activeSection, setActiveSection] = useState("students");

  const sections = [
    { id: "students", title: "تقارير الطلاب", icon: GraduationCap, active: true },
    { id: "imports", title: "تقارير الاستيراد", icon: Upload },
    { id: "academic", title: "التقارير الأكاديمية", icon: BookOpen },
    { id: "schedules", title: "تقارير الجداول والإسناد", icon: ClipboardList },
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
              onClick={() => setActiveSection(section.id)}
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

      {activeSection === "students" ? (
        <StudentsReport />
      ) : (
        <ComingSoonCard title={sections.find((section) => section.id === activeSection)?.title ?? "قسم التقارير"} />
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
