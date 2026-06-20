import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getReportsAcademic,
  getReportsEnrollment,
  getReportsFaculty,
  getReportsFinancial,
  getReportsPerformance,
  getReportsRequests,
} from "@/lib/admin-reports.functions";
import { exportCsv, exportXlsx, logReportView, type ExportRow } from "@/lib/reports/export";
import { cn } from "@/lib/utils";
import {
  GraduationCap, BookOpen, CalendarDays, ClipboardList, Users,
  FileWarning, Wallet, TrendingUp, Loader2, FileDown,
  ArrowUpDown, Search, ChevronLeft, ChevronRight,
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
  pageSize = 50,
}: {
  title: string;
  reportName: string;
  columns: Array<{ key: string; label: string; numeric?: boolean }>;
  rows: Array<Record<string, any>>;
  loading?: boolean;
  pageSize?: number;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const enableControls = rows.length > 100;

  const filtered = useMemo(() => {
    if (!enableControls || !search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q)),
    );
  }, [rows, search, columns, enableControls]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "ar") * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = enableControls ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const currentPage = Math.min(page, totalPages);
  const display = enableControls
    ? sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : sorted;

  const exportRows: ExportRow[] = sorted.map((r) => {
    const o: ExportRow = {};
    for (const c of columns) o[c.label] = r[c.key];
    return o;
  });

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  return (
    <div className="rounded-xl bg-card border border-border shadow-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="font-display text-sm font-bold text-primary">{title}</div>
        <div className="flex flex-wrap items-center gap-2">
          {enableControls && (
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="بحث..."
                className="h-8 w-40 rounded-md border border-border bg-background pe-7 ps-2 text-xs"
              />
            </div>
          )}
          <button
            type="button"
            disabled={!sorted.length}
            onClick={() => exportCsv(reportName, exportRows)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs font-bold text-primary hover:bg-secondary disabled:opacity-50"
          >
            <FileDown className="h-3.5 w-3.5" /> CSV
          </button>
          <button
            type="button"
            disabled={!sorted.length}
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
      ) : sorted.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">لا توجد بيانات.</div>
      ) : (
        <>
          <div className="overflow-x-auto max-h-[480px]">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs sticky top-0">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        "px-4 py-2 font-bold cursor-pointer select-none hover:bg-secondary/80",
                        c.numeric ? "text-left" : "text-right",
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        {c.label}
                        <ArrowUpDown className={cn("h-3 w-3", sortKey === c.key ? "text-primary" : "text-muted-foreground/50")} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {display.map((r, i) => (
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
          {enableControls && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs">
              <div className="text-muted-foreground">
                {sorted.length.toLocaleString("ar-EG")} سجل · صفحة {currentPage} من {totalPages}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-1 font-bold disabled:opacity-40"
                >
                  <ChevronRight className="h-3 w-3" /> السابق
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-1 font-bold disabled:opacity-40"
                >
                  التالي <ChevronLeft className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ===================================================================
// TAB: ACADEMIC
// ===================================================================
function AcademicTab() {
  const fetchReport = useServerFn(getReportsAcademic);
  const { data, isLoading } = useQuery({
    queryKey: ["reports-academic"],
    queryFn: () => fetchReport(),
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
        <StatCard label="إجمالي المجموعات الدراسية" value={d?.sections ?? 0} icon={CalendarDays} />
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
  const fetchReport = useServerFn(getReportsPerformance);
  const { data, isLoading } = useQuery({
    queryKey: ["reports-performance"],
    queryFn: () => fetchReport(),
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
  const fetchReport = useServerFn(getReportsEnrollment);
  const { data, isLoading } = useQuery({
    queryKey: ["reports-enrollment"],
    queryFn: () => fetchReport(),
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
          title="التسجيلات حسب المجموعات الدراسيةة"
          reportName="enrollments_by_section"
          loading={isLoading}
          columns={[
            { key: "section_code", label: "كود المجموعات الدراسيةة" },
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
  const fetchReport = useServerFn(getReportsFaculty);
  const { data, isLoading } = useQuery({
    queryKey: ["reports-faculty"],
    queryFn: () => fetchReport(),
  });

  return (
    <div className="space-y-4">
      <ReportTable
        title="العبء التدريسي وعدد المجموعات الدراسية لكل عضو هيئة تدريس"
        reportName="faculty_teaching_load"
        loading={isLoading}
        columns={[
          { key: "name", label: "العضو" },
          { key: "rank", label: "الرتبة" },
          { key: "department", label: "القسم" },
          { key: "sections", label: "عدد المجموعات الدراسية", numeric: true },
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
function RequestsTab() {
  const fetchReport = useServerFn(getReportsRequests);
  const { data, isLoading } = useQuery({
    queryKey: ["reports-requests"],
    queryFn: () => fetchReport(),
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
  const fetchReport = useServerFn(getReportsFinancial);
  const { data, isLoading } = useQuery({
    queryKey: ["reports-financial"],
    queryFn: () => fetchReport(),
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

  useEffect(() => {
    logReportView(`tab_${tab}`);
  }, [tab]);

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
