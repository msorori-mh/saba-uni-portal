import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Users, GraduationCap, AlertCircle, UserCog, Layers, Wallet, Activity,
  CalendarClock, TrendingUp, BarChart3, ShieldCheck, CheckCircle2,
  AlertTriangle, XCircle, Info, ChevronLeft, FileBadge, FileWarning,
  Crown, FileDown, ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  logExecutiveDashboardViewed,
  getExecutiveScope,
  getExecutiveCoreKpis,
} from "@/lib/executive-dashboard.functions";
import {
  getExecutiveAnalytics,
  logExecutiveExport,
} from "@/lib/executive-analytics.functions";
import { exportXlsx } from "@/lib/reports/export";
import { cn } from "@/lib/utils";
import { getProgressDashboardKpis } from "@/lib/academic-status.functions";
import { adminAccountCounts } from "@/lib/admin-users.functions";

export const Route = createLazyFileRoute("/admin/executive-dashboard")({
  component: ExecutiveDashboardPage,
});

type Severity = "critical" | "warning" | "info";
type Alert = { id: string; severity: Severity; title: string; detail?: string; href?: string };

function SeverityIcon({ s }: { s: Severity }) {
  if (s === "critical") return <XCircle className="h-4 w-4 text-destructive" />;
  if (s === "warning") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <Info className="h-4 w-4 text-sky-600" />;
}

const CHART_COLORS = [
  "oklch(0.55 0.18 255)", "oklch(0.65 0.18 145)", "oklch(0.7 0.18 60)",
  "oklch(0.6 0.22 25)", "oklch(0.55 0.18 295)", "oklch(0.7 0.15 195)",
  "oklch(0.6 0.18 340)", "oklch(0.5 0.12 220)",
];

function EmptyState({ label = "لا توجد بيانات كافية للتحليل" }: { label?: string }) {
  return (
    <div className="grid h-48 place-items-center text-xs text-muted-foreground">{label}</div>
  );
}

function MiniBar({ data, dataKey = "value", nameKey = "label" }: { data: Array<{ label: string; value: number }>; dataKey?: string; nameKey?: string }) {
  if (!data || data.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.02 255)" />
        <XAxis dataKey={nameKey} tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, direction: "rtl" }} />
        <Bar dataKey={dataKey} fill="oklch(0.55 0.18 255)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function MiniPie({ data }: { data: Array<{ label: string; value: number }> }) {
  if (!data || data.length === 0 || data.every((d) => d.value === 0)) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={70} label={(e: any) => `${e.label}: ${e.value}`}>
          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ fontSize: 12, direction: "rtl" }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function TrendDelta({ current, previous, hasHistory, unit = "" }: { current: number; previous: number; hasHistory: boolean; unit?: string }) {
  if (!hasHistory) return <div className="text-[11px] text-muted-foreground">لا توجد بيانات تاريخية كافية</div>;
  const diff = current - previous;
  const pct = previous > 0 ? Math.round((diff / previous) * 100) : (current > 0 ? 100 : 0);
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  const color = diff > 0 ? "text-emerald-600" : diff < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="flex items-baseline gap-2">
      <div className="font-display text-2xl font-extrabold text-primary">{current.toLocaleString()}{unit}</div>
      <div className={cn("inline-flex items-center gap-0.5 text-xs font-bold", color)}>
        <Icon className="h-3.5 w-3.5" /> {Math.abs(pct)}%
      </div>
      <div className="text-[11px] text-muted-foreground">سابق: {previous.toLocaleString()}{unit}</div>
    </div>
  );
}

function ExecutiveDashboardPage() {
  const logView = useServerFn(logExecutiveDashboardViewed);
  const fetchScope = useServerFn(getExecutiveScope);
  const fetchProgress = useServerFn(getProgressDashboardKpis);
  const fetchAdminCounts = useServerFn(adminAccountCounts);
  const fetchAnalytics = useServerFn(getExecutiveAnalytics);
  const fetchCoreKpis = useServerFn(getExecutiveCoreKpis);
  const logExport = useServerFn(logExecutiveExport);

  useEffect(() => {
    logView().catch(() => {});
  }, [logView]);

  const { data: scope } = useQuery({
    queryKey: ["exec-scope"],
    queryFn: () => fetchScope(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: progress } = useQuery({
    queryKey: ["exec-progress"],
    queryFn: () => fetchProgress(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: adminCounts } = useQuery({
    queryKey: ["exec-admin-counts"],
    queryFn: () => fetchAdminCounts(),
  });

  const { data: analytics } = useQuery({
    queryKey: ["exec-analytics"],
    queryFn: () => fetchAnalytics(),
    staleTime: 2 * 60 * 1000,
  });

  const { data: core } = useQuery({
    queryKey: ["exec-core-kpis"],
    queryFn: () => fetchCoreKpis(),
    staleTime: 60_000,
  });

  // Build alerts from existing engines
  const alerts: Alert[] = [];
  if (core) {
    if (!core.currentYearOk) alerts.push({ id: "no-year", severity: "critical", title: "لا توجد سنة أكاديمية حالية", href: "/admin/academic-operations" });
    if (!core.currentSemOk) alerts.push({ id: "no-sem", severity: "critical", title: "لا يوجد فصل دراسي حالي", href: "/admin/academic-operations" });
    if (core.studentsNoProgram > 0) alerts.push({ id: "no-prog", severity: "warning", title: "طلاب بدون برنامج", detail: `${core.studentsNoProgram} طالب`, href: "/admin/students" });
    if (core.unassignedSections > 0) alerts.push({ id: "no-faculty", severity: "warning", title: "مجموعات بدون عضو هيئة تدريس", detail: `${core.unassignedSections} مجموعة دراسية`, href: "/admin/course-offerings?tab=schedule" });
    if (core.outstanding > 0) alerts.push({ id: "outstanding", severity: "warning", title: "رسوم غير محصّلة", detail: `${core.outstanding.toLocaleString()} ر.ي`, href: "/admin/finance" });
    if (core.newRequestsPending > 0) alerts.push({ id: "req", severity: "info", title: "طلبات طلابية بانتظار المراجعة", detail: `${core.newRequestsPending}`, href: "/admin/student-requests" });
    if (core.newDocsToday > 0) alerts.push({ id: "docs", severity: "info", title: "وثائق صادرة اليوم", detail: `${core.newDocsToday}`, href: "/admin/documents" });
  }
  if (adminCounts) {
    if ((adminCounts.admin ?? 0) < 2) alerts.push({ id: "admin-low", severity: "critical", title: "عدد المدراء أقل من 2", detail: `الحالي: ${adminCounts.admin ?? 0}`, href: "/admin/users" });
    if ((adminCounts.system_admin ?? 0) === 0) alerts.push({ id: "sa-zero", severity: "critical", title: "لا يوجد مدير نظام", href: "/admin/users" });
  }

  const kpis = [
    { label: "إجمالي الطلاب", value: core?.students ?? "—", icon: GraduationCap, href: "/admin/students" },
    { label: "الطلاب النشطون", value: core?.activeStudents ?? "—", icon: Users, href: "/admin/students" },
    
    { label: "الطلاب المتعثرون", value: progress?.atRisk ?? "—", icon: AlertCircle, href: "/admin/at-risk-students" },
    { label: "أعضاء هيئة التدريس", value: core?.faculty ?? "—", icon: UserCog, href: "/admin/faculty-management" },
    { label: "المجموعات الدراسية", value: core?.sections ?? "—", icon: Layers, href: "/admin/course-offerings" },
    { label: "نسبة التحصيل المالي", value: core ? `${core.collectionRate}%` : "—", icon: Wallet, href: "/admin/finance" },
    { label: "حالة النظام", value: core?.lastAudit ? "نشط" : "—", icon: ShieldCheck, href: "/admin/system-readiness" },
  ];

  const quickLinks = [
    { to: "/admin/academic-operations", label: "الشؤون الأكاديمية", icon: Activity },
    { to: "/admin/course-offerings", search: { tab: "schedule" }, label: "الجداول الدراسية", icon: CalendarClock },
    { to: "/admin/student-progress", label: "تقدم الطلاب", icon: TrendingUp },
    
    { to: "/admin/reports", label: "مركز التقارير", icon: BarChart3 },
    { to: "/admin/operations", label: "مركز العمليات", icon: ShieldCheck },
  ];

  // Derived analytics summary numbers
  const studentTotals = analytics?.students.total ?? 0;
  const studentRatios = useMemo(() => {
    if (!analytics || studentTotals === 0) {
      return { activeRatio: 0, gradReadiness: 0, atRiskRatio: 0 };
    }
    return {
      activeRatio: Math.round((analytics.students.active / studentTotals) * 100),
      gradReadiness: Math.round(((progress?.gradCandidates ?? 0) / studentTotals) * 100),
      atRiskRatio: Math.round(((progress?.atRisk ?? 0) / studentTotals) * 100),
    };
  }, [analytics, studentTotals, progress]);

  // Export helpers
  async function doExport(section: "students" | "academic" | "faculty" | "financial" | "summary") {
    if (!analytics) return;
    let rows: Array<Record<string, string | number>> = [];
    let name = "executive";
    if (section === "students") {
      name = "تحليل_الطلاب";
      rows = [
        ...analytics.students.byProgram.map((r) => ({ النوع: "حسب البرنامج", التصنيف: r.label, العدد: r.value })),
        ...analytics.students.byDepartment.map((r) => ({ النوع: "حسب القسم", التصنيف: r.label, العدد: r.value })),
        ...analytics.students.byLevel.map((r) => ({ النوع: "حسب المستوى", التصنيف: r.label, العدد: r.value })),
        ...analytics.students.byStatus.map((r) => ({ النوع: "حسب الحالة", التصنيف: r.label, العدد: r.value })),
        ...analytics.students.byAcademicStatus.map((r) => ({ النوع: "الحالة الأكاديمية", التصنيف: r.label, العدد: r.value })),
      ];
    } else if (section === "academic") {
      name = "الأداء_الأكاديمي";
      rows = [
        { المؤشر: "متوسط النتيجة الرسمية %", القيمة: progress?.avgOfficialPercentage ?? 0 },
        { المؤشر: "الطلاب المتعثرون", القيمة: progress?.atRisk ?? 0 },
        { المؤشر: "مرشحو التخرج", القيمة: progress?.gradCandidates ?? 0 },
        { المؤشر: "قرب التخرج", القيمة: progress?.nearCompletion ?? 0 },
        { المؤشر: "العيّنة", القيمة: progress?.sampled ?? 0 },
      ];
    } else if (section === "faculty") {
      name = "تحليل_هيئة_التدريس";
      rows = [
        { المؤشر: "إجمالي", القيمة: analytics.faculty.total },
        { المؤشر: "النشطون", القيمة: analytics.faculty.active },
        { المؤشر: "متوسط الحمل", القيمة: analytics.faculty.avgLoad },
        { المؤشر: "مجموعات بدون أستاذ", القيمة: analytics.faculty.unassignedSections },
        ...analytics.faculty.byDepartment.map((r) => ({ المؤشر: `قسم: ${r.label}`, القيمة: r.value })),
        ...analytics.faculty.loadDistribution.map((r) => ({ المؤشر: `حمل ${r.label}`, القيمة: r.value })),
      ];
    } else if (section === "financial") {
      name = "المؤشرات_المالية";
      rows = [
        { المؤشر: "إجمالي الرسوم", القيمة: analytics.finance.totalFees },
        { المؤشر: "المحصّل", القيمة: analytics.finance.paidAmount },
        { المؤشر: "المتبقي", القيمة: analytics.finance.outstanding },
        { المؤشر: "نسبة التحصيل %", القيمة: analytics.finance.collectionRate },
        { المؤشر: "طلاب عليهم رصيد", القيمة: analytics.finance.studentsWithBalance },
        ...analytics.finance.outstandingByProgram.map((r) => ({ المؤشر: `متبقي - ${r.label}`, القيمة: r.value })),
      ];
    } else {
      name = "ملخص_تنفيذي";
      rows = [
        { القسم: "طلاب", المؤشر: "الإجمالي", القيمة: analytics.students.total },
        { القسم: "طلاب", المؤشر: "النشطون", القيمة: analytics.students.active },
        { القسم: "أكاديمي", المؤشر: "متوسط النتيجة الرسمية %", القيمة: progress?.avgOfficialPercentage ?? 0 },
        { القسم: "أكاديمي", المؤشر: "مرشحو التخرج", القيمة: progress?.gradCandidates ?? 0 },
        { القسم: "أكاديمي", المؤشر: "متعثرون", القيمة: progress?.atRisk ?? 0 },
        { القسم: "هيئة تدريس", المؤشر: "النشطون", القيمة: analytics.faculty.active },
        { القسم: "هيئة تدريس", المؤشر: "متوسط الحمل", القيمة: analytics.faculty.avgLoad },
        { القسم: "مالي", المؤشر: "نسبة التحصيل %", القيمة: analytics.finance.collectionRate },
        { القسم: "مالي", المؤشر: "المتبقي", القيمة: analytics.finance.outstanding },
      ];
    }
    await exportXlsx(name, rows);
    try { await logExport({ data: { section, rowCount: rows.length, format: "xlsx" } }); } catch { /* best-effort */ }
  }

  function ExportBtn({ section, label }: { section: "students" | "academic" | "faculty" | "financial" | "summary"; label?: string }) {
    return (
      <button
        type="button"
        onClick={() => doExport(section)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-secondary"
      >
        <FileDown className="h-3 w-3" /> {label ?? "Excel"}
      </button>
    );
  }

  return (
    <div dir="rtl" className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md bg-gold-gradient/20 px-2.5 py-1 text-[11px] font-bold text-primary">
            <Crown className="h-3.5 w-3.5" /> القيادة التنفيذية
          </div>
          <h1 className="mt-2 font-display text-3xl font-extrabold text-primary">لوحة بيانات الإدارة العليا</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            عرض تنفيذي للقراءة فقط — مؤشرات، تنبيهات، ومتابعة حالة النظام.
          </p>
          {scope && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              النطاق: <span className="font-bold text-primary">{scope.scopeLabel}</span>
              {scope.isDeptHead && !scope.isAdmin && !scope.isDean && " (رئيس قسم — بيانات مقيّدة وفق صلاحياتك)"}
            </p>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          السنة: <span className="font-bold text-primary">{core?.currentYearName ?? "—"}</span> •
          الفصل: <span className="font-bold text-primary">{core?.currentSemName ?? "—"}</span>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Link
              key={k.label}
              to={k.href}
              className="group rounded-xl border border-border bg-card p-5 shadow-card hover:border-primary transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[11px] font-bold text-muted-foreground">{k.label}</div>
                  <div className="mt-2 font-display text-3xl font-extrabold text-primary">{k.value}</div>
                </div>
                <Icon className="h-5 w-5 text-primary/60 group-hover:text-primary" />
              </div>
            </Link>
          );
        })}
      </section>

      {/* Executive Alerts */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-base font-bold text-primary">التنبيهات التنفيذية</h2>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1 text-destructive"><XCircle className="h-3.5 w-3.5" /> حرجة</span>
            <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3.5 w-3.5" /> تحذير</span>
            <span className="inline-flex items-center gap-1 text-sky-600"><Info className="h-3.5 w-3.5" /> معلومات</span>
          </div>
        </div>
        {alerts.length === 0 ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> لا توجد تنبيهات تنفيذية حالياً.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {alerts
              .sort((a, b) => {
                const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
                return order[a.severity] - order[b.severity];
              })
              .map((a) => (
                <li key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <SeverityIcon s={a.severity} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-primary">{a.title}</div>
                      {a.detail && <div className="text-[11px] text-muted-foreground">{a.detail}</div>}
                    </div>
                  </div>
                  {a.href && (
                    <Link to={a.href} className="text-[11px] font-bold text-primary hover:underline inline-flex items-center gap-1">
                      انتقال <ChevronLeft className="h-3 w-3" />
                    </Link>
                  )}
                </li>
              ))}
          </ul>
        )}
      </section>

      {/* Operations integration */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="text-xs font-bold text-muted-foreground">السنة / الفصل</div>
          <div className="mt-2 text-sm font-bold text-primary">{core?.currentYearName ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{core?.currentSemName ?? "—"}</div>
          <Link to="/admin/academic-operations" className="mt-3 inline-flex text-[11px] font-bold text-primary hover:underline">
            مركز الشؤون الأكاديمية ←
          </Link>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="text-xs font-bold text-muted-foreground">آخر نشاط</div>
          <div className="mt-2 text-sm font-bold text-primary">
            {core?.lastAudit ? new Date(core.lastAudit.created_at).toLocaleString("ar") : "—"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {core?.lastAudit ? `${core.lastAudit.entity_type} / ${core.lastAudit.action_type}` : "لا يوجد"}
          </div>
          <Link to="/admin/audit-log" className="mt-3 inline-flex text-[11px] font-bold text-primary hover:underline">
            سجل التدقيق ←
          </Link>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="text-xs font-bold text-muted-foreground">جاهزية النظام</div>
          <div className="mt-2 text-sm font-bold text-primary inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> نشط
          </div>
          <div className="text-[11px] text-muted-foreground">تنبيهات: {alerts.length}</div>
          <Link to="/admin/system-readiness" className="mt-3 inline-flex text-[11px] font-bold text-primary hover:underline">
            صفحة الجاهزية ←
          </Link>
        </div>
      </section>

      {/* Phase 11H.1B — Student Analytics */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-base font-bold text-primary">تحليل الطلاب</h2>
          <ExportBtn section="students" />
        </div>
        {!analytics ? <EmptyState label="جاري التحميل..." /> : analytics.students.total === 0 ? <EmptyState /> : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] font-bold text-muted-foreground">إجمالي الطلاب</div>
                <div className="mt-1 font-display text-2xl font-extrabold text-primary">{analytics.students.total}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] font-bold text-muted-foreground">نسبة النشطين</div>
                <div className="mt-1 font-display text-2xl font-extrabold text-emerald-600">{studentRatios.activeRatio}%</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] font-bold text-muted-foreground">جاهزية التخرج</div>
                <div className="mt-1 font-display text-2xl font-extrabold text-sky-600">{studentRatios.gradReadiness}%</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] font-bold text-muted-foreground">نسبة المتعثرين</div>
                <div className="mt-1 font-display text-2xl font-extrabold text-destructive">{studentRatios.atRiskRatio}%</div>
              </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <div className="text-xs font-bold text-primary mb-2">الطلاب حسب البرنامج</div>
                <MiniBar data={analytics.students.byProgram} />
              </div>
              <div>
                <div className="text-xs font-bold text-primary mb-2">الطلاب حسب القسم</div>
                <MiniBar data={analytics.students.byDepartment} />
              </div>
              <div>
                <div className="text-xs font-bold text-primary mb-2">الطلاب حسب المستوى</div>
                <MiniBar data={analytics.students.byLevel} />
              </div>
              <div>
                <div className="text-xs font-bold text-primary mb-2">الطلاب حسب الحالة الأكاديمية</div>
                <MiniPie data={analytics.students.byAcademicStatus} />
              </div>
            </div>
          </>
        )}
      </section>

      {/* Academic Performance */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-base font-bold text-primary">الأداء الأكاديمي</h2>
          <ExportBtn section="academic" />
        </div>
        {!progress ? <EmptyState label="جاري التحميل..." /> : (progress.sampled ?? 0) === 0 ? <EmptyState /> : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] font-bold text-muted-foreground">متوسط النتيجة الرسمية</div>
                <div className="mt-1 font-display text-2xl font-extrabold text-primary">{progress.avgOfficialPercentage.toFixed(1)}%</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] font-bold text-muted-foreground">المتعثرون</div>
                <div className="mt-1 font-display text-2xl font-extrabold text-destructive">{progress.atRisk}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] font-bold text-muted-foreground">قرب التخرج</div>
                <div className="mt-1 font-display text-2xl font-extrabold text-amber-600">{progress.nearCompletion}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] font-bold text-muted-foreground">مرشحو التخرج</div>
                <div className="mt-1 font-display text-2xl font-extrabold text-emerald-600">{progress.gradCandidates}</div>
              </div>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              العيّنة: {progress.sampled} طالب — يعتمد على محرّك التقدم الأكاديمي (academic-status engine).
            </div>
          </>
        )}
      </section>

      {/* Faculty Analytics */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-base font-bold text-primary">تحليل أعضاء هيئة التدريس</h2>
          <ExportBtn section="faculty" />
        </div>
        {!analytics ? <EmptyState label="جاري التحميل..." /> : analytics.faculty.total === 0 ? <EmptyState /> : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] font-bold text-muted-foreground">الإجمالي</div>
                <div className="mt-1 font-display text-2xl font-extrabold text-primary">{analytics.faculty.total}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] font-bold text-muted-foreground">النشطون</div>
                <div className="mt-1 font-display text-2xl font-extrabold text-emerald-600">{analytics.faculty.active}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] font-bold text-muted-foreground">متوسط الحمل</div>
                <div className="mt-1 font-display text-2xl font-extrabold text-primary">{analytics.faculty.avgLoad}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] font-bold text-muted-foreground">مجموعات بدون أستاذ</div>
                <div className="mt-1 font-display text-2xl font-extrabold text-destructive">{analytics.faculty.unassignedSections}</div>
              </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <div className="text-xs font-bold text-primary mb-2">هيئة التدريس حسب القسم</div>
                <MiniBar data={analytics.faculty.byDepartment} />
              </div>
              <div>
                <div className="text-xs font-bold text-primary mb-2">توزيع الحمل التدريسي</div>
                <MiniBar data={analytics.faculty.loadDistribution} />
              </div>
            </div>
          </>
        )}
      </section>

      {/* Financial Analytics */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-base font-bold text-primary">المؤشرات المالية</h2>
          <ExportBtn section="financial" />
        </div>
        {!analytics ? <EmptyState label="جاري التحميل..." /> : analytics.finance.totalFees === 0 ? <EmptyState /> : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-6">
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] font-bold text-muted-foreground">إجمالي الرسوم</div>
                <div className="mt-1 font-display text-lg font-extrabold text-primary">{analytics.finance.totalFees.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] font-bold text-muted-foreground">المحصّل</div>
                <div className="mt-1 font-display text-lg font-extrabold text-emerald-600">{analytics.finance.paidAmount.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] font-bold text-muted-foreground">المتبقي</div>
                <div className="mt-1 font-display text-lg font-extrabold text-destructive">{analytics.finance.outstanding.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] font-bold text-muted-foreground">نسبة التحصيل</div>
                <div className="mt-1 font-display text-lg font-extrabold text-primary">{analytics.finance.collectionRate}%</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] font-bold text-muted-foreground">طلاب عليهم رصيد</div>
                <div className="mt-1 font-display text-lg font-extrabold text-amber-600">{analytics.finance.studentsWithBalance}</div>
              </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <div className="text-xs font-bold text-primary mb-2">المدفوع مقابل المتبقي</div>
                <MiniPie data={[
                  { label: "محصّل", value: analytics.finance.paidAmount },
                  { label: "متبقي", value: analytics.finance.outstanding },
                ]} />
              </div>
              <div>
                <div className="text-xs font-bold text-primary mb-2">المتبقي حسب البرنامج</div>
                <MiniBar data={analytics.finance.outstandingByProgram} />
              </div>
            </div>
          </>
        )}
      </section>

      {/* Trends */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-card">
        <h2 className="font-display text-base font-bold text-primary mb-4">الاتجاهات (الفصل الحالي vs السابق)</h2>
        {!analytics ? <EmptyState label="جاري التحميل..." /> : (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border p-4">
              <div className="text-[11px] font-bold text-muted-foreground mb-1">التسجيلات</div>
              <TrendDelta {...analytics.trends.enrollments} />
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="text-[11px] font-bold text-muted-foreground mb-1">الإيرادات</div>
              <TrendDelta {...analytics.trends.revenue} />
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="text-[11px] font-bold text-muted-foreground mb-1">طلبات الطلاب</div>
              <TrendDelta {...analytics.trends.requests} />
            </div>
          </div>
        )}
      </section>

      {/* Executive summary export */}
      <section className="rounded-xl border border-primary/20 bg-card p-4 shadow-card flex items-center justify-between gap-3">
        <div className="text-sm font-bold text-primary inline-flex items-center gap-2">
          <FileDown className="h-4 w-4" /> تصدير ملخص تنفيذي شامل
        </div>
        <ExportBtn section="summary" label="تنزيل Excel" />
      </section>

      {/* Quick Links */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-card">
        <h2 className="font-display text-base font-bold text-primary mb-4">وصول سريع</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((q) => {
            const Icon = q.icon;
            return (
              <Link
                key={q.to}
                to={q.to}
                {...("search" in q && q.search ? { search: q.search } : {})}
                className="flex items-center gap-3 rounded-lg border border-border p-3 hover:border-primary hover:bg-secondary transition-colors"
              >
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-primary flex-1">{q.label}</span>
                <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      </section>

      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <FileWarning className="h-3.5 w-3.5" />
        هذه اللوحة للقراءة فقط — تشمل KPIs، تنبيهات، تحليلات بيانية، اتجاهات، وتصدير Excel. لا تتضمن أي إجراءات تشغيلية.
      </div>
    </div>
  );
}
