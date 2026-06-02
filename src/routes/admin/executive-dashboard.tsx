import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Users, GraduationCap, AlertCircle, UserCog, Layers, Wallet, Activity,
  CalendarClock, TrendingUp, BarChart3, ShieldCheck, CheckCircle2,
  AlertTriangle, XCircle, Info, ChevronLeft, FileBadge, FileWarning,
  Crown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getProgressDashboardKpis } from "@/lib/academic-status.functions";
import { adminAccountCounts } from "@/lib/admin-users.functions";
import {
  logExecutiveDashboardViewed,
  getExecutiveScope,
} from "@/lib/executive-dashboard.functions";

export const Route = createFileRoute("/admin/executive-dashboard")({
  component: ExecutiveDashboardPage,
});

async function tableCount(table: string, filters?: (q: any) => any) {
  let q = supabase.from(table as any).select("id", { count: "exact", head: true });
  if (filters) q = filters(q);
  const { count } = await q;
  return count ?? 0;
}

type Severity = "critical" | "warning" | "info";
type Alert = { id: string; severity: Severity; title: string; detail?: string; href?: string };

function SeverityIcon({ s }: { s: Severity }) {
  if (s === "critical") return <XCircle className="h-4 w-4 text-destructive" />;
  if (s === "warning") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <Info className="h-4 w-4 text-sky-600" />;
}

function ExecutiveDashboardPage() {
  const logView = useServerFn(logExecutiveDashboardViewed);
  const fetchScope = useServerFn(getExecutiveScope);
  const fetchProgress = useServerFn(getProgressDashboardKpis);
  const fetchAdminCounts = useServerFn(adminAccountCounts);

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

  const { data: core } = useQuery({
    queryKey: ["exec-core-kpis"],
    queryFn: async () => {
      const [
        students, activeStudents, faculty, sections,
        currentYear, currentSem,
        feesTotalRows, feesPaidRows,
        studentsNoProgram, sectionsNoFaculty,
        gradCandidatesPending, newDocsToday, newRequestsPending,
        lastAudit,
      ] = await Promise.all([
        tableCount("student_profiles"),
        tableCount("student_profiles", (q) => q.eq("status", "active")),
        tableCount("faculty_profiles", (q) => q.eq("is_active", true)),
        tableCount("course_sections", (q) => q.eq("status", "active")),
        supabase.from("academic_years").select("name_ar, name_en").eq("is_current", true).maybeSingle(),
        supabase.from("semesters").select("name_ar, name_en").eq("is_current", true).maybeSingle(),
        supabase.from("student_fees").select("amount"),
        supabase.from("student_fees").select("amount").eq("status", "paid"),
        tableCount("student_profiles", (q) => q.is("program_id", null)),
        supabase.from("course_sections").select("id, course_offering_id").eq("status", "active"),
        tableCount("student_requests", (q) => q.eq("status", "submitted")),
        tableCount("official_documents", (q) => {
          const t = new Date(); t.setHours(0, 0, 0, 0);
          return q.gte("issued_at", t.toISOString());
        }),
        tableCount("student_requests", (q) => q.eq("status", "submitted")),
        supabase.from("audit_logs").select("created_at, action_type, entity_type")
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const totalFees = ((feesTotalRows.data ?? []) as Array<{ amount: number }>)
        .reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const paidFees = ((feesPaidRows.data ?? []) as Array<{ amount: number }>)
        .reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const collectionRate = totalFees > 0 ? Math.round((paidFees / totalFees) * 100) : 0;
      // outstanding = totalFees - paidFees
      const outstanding = Math.max(0, totalFees - paidFees);
      // sections without faculty: detect via class_schedule presence — fallback: 0
      const sectionsList = (sectionsNoFaculty.data ?? []) as Array<{ id: string }>;
      let unassignedSections = 0;
      if (sectionsList.length > 0) {
        const ids = sectionsList.map((s) => s.id);
        const { data: scheds } = await supabase
          .from("class_schedule")
          .select("course_section_id, faculty_profile_id")
          .in("course_section_id", ids);
        const assigned = new Set(
          ((scheds ?? []) as Array<{ course_section_id: string; faculty_profile_id: string | null }>)
            .filter((r) => r.faculty_profile_id)
            .map((r) => r.course_section_id),
        );
        unassignedSections = ids.filter((id) => !assigned.has(id)).length;
      }
      return {
        students, activeStudents, faculty, sections,
        currentYearName: (currentYear.data as { name_ar?: string } | null)?.name_ar ?? "غير محددة",
        currentSemName: (currentSem.data as { name_ar?: string } | null)?.name_ar ?? "غير محدد",
        currentYearOk: !!currentYear.data,
        currentSemOk: !!currentSem.data,
        collectionRate, totalFees, paidFees, outstanding,
        studentsNoProgram, unassignedSections,
        gradCandidatesPending, newDocsToday, newRequestsPending,
        lastAudit: lastAudit.data as { created_at: string; action_type: string; entity_type: string } | null,
      };
    },
    staleTime: 60_000,
  });

  // Build alerts from existing engines
  const alerts: Alert[] = [];
  if (core) {
    if (!core.currentYearOk) alerts.push({ id: "no-year", severity: "critical", title: "لا توجد سنة أكاديمية حالية", href: "/admin/academic-operations" });
    if (!core.currentSemOk) alerts.push({ id: "no-sem", severity: "critical", title: "لا يوجد فصل دراسي حالي", href: "/admin/academic-operations" });
    if (core.studentsNoProgram > 0) alerts.push({ id: "no-prog", severity: "warning", title: "طلاب بدون برنامج", detail: `${core.studentsNoProgram} طالب`, href: "/admin/students" });
    if (core.unassignedSections > 0) alerts.push({ id: "no-faculty", severity: "warning", title: "شعب بدون عضو هيئة تدريس", detail: `${core.unassignedSections} شعبة`, href: "/admin/schedules" });
    if (core.outstanding > 0) alerts.push({ id: "outstanding", severity: "warning", title: "رسوم غير محصّلة", detail: `${core.outstanding.toLocaleString()} ر.ي`, href: "/admin/finance" });
    if (core.newRequestsPending > 0) alerts.push({ id: "req", severity: "info", title: "طلبات طلابية بانتظار المراجعة", detail: `${core.newRequestsPending}`, href: "/admin/student-requests" });
    if (core.newDocsToday > 0) alerts.push({ id: "docs", severity: "info", title: "وثائق صادرة اليوم", detail: `${core.newDocsToday}`, href: "/admin/documents" });
  }
  if (progress && progress.gradCandidates > 0) {
    alerts.push({ id: "grads", severity: "info", title: "مرشحون للتخرج", detail: `${progress.gradCandidates}`, href: "/admin/graduation-candidates" });
  }
  if (adminCounts) {
    if ((adminCounts.admin ?? 0) < 2) alerts.push({ id: "admin-low", severity: "critical", title: "عدد المدراء أقل من 2", detail: `الحالي: ${adminCounts.admin ?? 0}`, href: "/admin/users" });
    if ((adminCounts.system_admin ?? 0) === 0) alerts.push({ id: "sa-zero", severity: "critical", title: "لا يوجد مدير نظام", href: "/admin/users" });
  }

  const kpis = [
    { label: "إجمالي الطلاب", value: core?.students ?? "—", icon: GraduationCap, href: "/admin/students" },
    { label: "الطلاب النشطون", value: core?.activeStudents ?? "—", icon: Users, href: "/admin/students" },
    { label: "المرشحون للتخرج", value: progress?.gradCandidates ?? "—", icon: FileBadge, href: "/admin/graduation-candidates" },
    { label: "الطلاب المتعثرون", value: progress?.atRisk ?? "—", icon: AlertCircle, href: "/admin/at-risk-students" },
    { label: "أعضاء هيئة التدريس", value: core?.faculty ?? "—", icon: UserCog, href: "/admin/faculty-management" },
    { label: "الشعب الدراسية", value: core?.sections ?? "—", icon: Layers, href: "/admin/course-offerings" },
    { label: "نسبة التحصيل المالي", value: core ? `${core.collectionRate}%` : "—", icon: Wallet, href: "/admin/finance" },
    { label: "حالة النظام", value: core?.lastAudit ? "نشط" : "—", icon: ShieldCheck, href: "/admin/system-readiness" },
  ];

  const quickLinks = [
    { to: "/admin/academic-operations", label: "العمليات الأكاديمية", icon: Activity },
    { to: "/admin/schedules", label: "الجداول الدراسية", icon: CalendarClock },
    { to: "/admin/student-progress", label: "تقدم الطلاب", icon: TrendingUp },
    { to: "/admin/graduation-candidates", label: "مرشحو التخرج", icon: FileBadge },
    { to: "/admin/reports", label: "مركز التقارير", icon: BarChart3 },
    { to: "/admin/operations", label: "مركز العمليات", icon: ShieldCheck },
  ];

  return (
    <div dir="rtl" className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md bg-gold-gradient/20 px-2.5 py-1 text-[11px] font-bold text-primary">
            <Crown className="h-3.5 w-3.5" /> القيادة التنفيذية
          </div>
          <h1 className="mt-2 font-display text-3xl font-extrabold text-primary">لوحة القيادة التنفيذية</h1>
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
            مركز العمليات الأكاديمية ←
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
        هذه اللوحة للقراءة فقط — لا تتضمن أي إجراءات تشغيلية. الرسوم البيانية والتحليلات المتقدمة ضمن Phase 11H.1B.
      </div>
    </div>
  );
}
