import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { usePagePerf } from "@/lib/perf-probe";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Newspaper,
  Users,
  FlaskConical,
  Calendar,
  MessageSquare,
  Plus,
  GraduationCap,
  BookOpen,
  CalendarDays,
  ClipboardList,
  ClipboardCheck,
  FileWarning,
  UserCog,
  FileText,
  ListTree,
  ScrollText,
  Bell,
  ShieldCheck,
  Wallet,
  AlertCircle,
  Lock,
  Database,
  ShieldAlert,
  Layers,
  CalendarClock,
  DoorOpen,
  FileBadge,
  FileCheck2,
  Receipt,
  FileSignature,
  FileClock,
  FileSpreadsheet,
  BarChart3,
  TrendingUp,
  Activity,
  HardDrive,
  Megaphone,
  MailOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { activeUserCounts, adminAccountCounts } from "@/lib/admin-users.functions";
import { getAdminProgressKpisFast } from "@/lib/academic-status.functions";
import { getCommunicationsDashboardStats } from "@/lib/communications.functions";
import { getAutomationSettings, getAutomationPreview } from "@/lib/automation.functions";
import { getPilotOverview } from "@/lib/pilot.functions";
import {
  getHardeningStatus,
  getDashboardCounts,
  getScheduleStats,
  getRecentOfficialDocuments,
  getDashboardPerfKpis,
  getAcademicOpsKpis,
} from "@/lib/admin-dashboard.functions";
import { Rocket } from "lucide-react";
import { portalFeatures } from "@/lib/portal-features";
import { DashboardMetricValue } from "@/components/portal/DashboardStates";
import { dashboardMetric } from "@/components/portal/dashboard-metrics";

/** Alias keeps the card definitions compact. */
const m = dashboardMetric;

export const Route = createLazyFileRoute("/admin/")({
  component: AdminDashboard,
});

const DOC_TYPE_LABELS: Record<string, string> = {
  enrollment_certificate: "شهادة قيد",
  official_transcript: "سجل أكاديمي",
  financial_receipt: "سند مالي",
};
function docTypeLabel(t: string) {
  return DOC_TYPE_LABELS[t] ?? t;
}

/** ADMIN-DASHBOARD-CARDS-RENAME-HIDE-01 — hidden from main admin dashboard only */
const HIDDEN_ADMIN_DASHBOARD_CARD_LABELS = new Set([
  "مرشحو التخرج",
  "المرشحين للتخرج",
  "المرشحون للتخرج",
  "الخصومات",
  "الترفيعات",
]);

const FINANCE_FROZEN_CARD_LABELS = new Set([
  "الرسوم المستحقة",
  "رسوم غير مسددة",
  "رسوم مسددة جزئياً",
  "إيصالات قيد المراجعة",
  "السندات المالية",
]);

function AdminDashboard() {
  usePagePerf("/admin");
  const fetchActive = useServerFn(activeUserCounts);
  const fetchAdminCounts = useServerFn(adminAccountCounts);
  const fetchProgressKpis = useServerFn(getAdminProgressKpisFast);
  const fetchCommStats = useServerFn(getCommunicationsDashboardStats);
  const fetchAutomationSettings = useServerFn(getAutomationSettings);
  const fetchAutomationPreview = useServerFn(getAutomationPreview);
  const fetchHardening = useServerFn(getHardeningStatus);
  const fetchDashboardCounts = useServerFn(getDashboardCounts);
  const fetchScheduleStats = useServerFn(getScheduleStats);
  const fetchRecentDocs = useServerFn(getRecentOfficialDocuments);
  const fetchPerfKpis = useServerFn(getDashboardPerfKpis);
  const fetchAcademicOps = useServerFn(getAcademicOpsKpis);
  const commStatsQ = useQuery({
    queryKey: ["admin-comm-stats"],
    queryFn: () => fetchCommStats(),
    staleTime: 60_000,
  });
  const automationQ = useQuery({
    queryKey: ["admin-automation-status"],
    queryFn: async () => {
      const [s, p] = await Promise.all([fetchAutomationSettings(), fetchAutomationPreview()]);
      const enabled_count = s.settings.filter((x) => x.enabled).length;
      const disabled_count = s.settings.length - enabled_count;
      return { enabled_count, disabled_count, upcoming_action: p.registration.upcoming_action };
    },
    staleTime: 60_000,
  });
  const fetchPilot = useServerFn(getPilotOverview);
  const pilotQ = useQuery({
    queryKey: ["admin-pilot-overview"],
    queryFn: () => fetchPilot(),
    staleTime: 60_000,
  });
  const progressKpisQ = useQuery({
    queryKey: ["admin-progress-kpis"],
    queryFn: () => fetchProgressKpis(),
    staleTime: 5 * 60 * 1000,
  });
  const activeQ = useQuery({
    queryKey: ["active-user-counts"],
    queryFn: () => fetchActive(),
  });
  const adminCountsQ = useQuery({
    queryKey: ["admin-account-counts"],
    queryFn: () => fetchAdminCounts(),
  });
  const hardeningQ = useQuery({
    queryKey: ["hardening-status"],
    queryFn: () => fetchHardening({ data: {} }),
  });
  const countsQ = useQuery({
    queryKey: ["admin-dashboard-counts"],
    queryFn: () => fetchDashboardCounts({ data: {} }),
  });

  const scheduleStatsQ = useQuery({
    queryKey: ["admin-schedule-stats"],
    queryFn: () => fetchScheduleStats({ data: {} }),
  });

  const recentDocsQ = useQuery({
    queryKey: ["admin-recent-documents"],
    queryFn: () => fetchRecentDocs({ data: {} }),
  });

  const kpisQ = useQuery({
    queryKey: ["admin-perf-kpis-rpc"],
    queryFn: () => fetchPerfKpis({ data: {} }),
    staleTime: 60_000,
  });

  const aopsQ = useQuery({
    queryKey: ["admin-academic-ops-kpis"],
    queryFn: () => fetchAcademicOps({ data: {} }),
  });

  const commStats = commStatsQ.data;
  const automation = automationQ.data;
  const pilot = pilotQ.data;
  const progressKpis = progressKpisQ.data;
  const active = activeQ.data;
  const adminCounts = adminCountsQ.data;
  const hardening = hardeningQ.data;
  const s = countsQ.data;
  const scheduleStats = scheduleStatsQ.data;
  const recentDocs = recentDocsQ.data;
  const kpis = kpisQ.data;
  const aops = aopsQ.data;

  const failedQueries = [
    commStatsQ,
    automationQ,
    pilotQ,
    progressKpisQ,
    activeQ,
    adminCountsQ,
    hardeningQ,
    countsQ,
    scheduleStatsQ,
    recentDocsQ,
    kpisQ,
    aopsQ,
  ];
  const anyQueryError = failedQueries.some((query) => query.isError);
  const retryFailedQueries = () => {
    for (const query of failedQueries) if (query.isError) void query.refetch();
  };

  const sections_: Array<{
    title: string;
    cards: Array<{
      label: string;
      value: number | null;
      icon: LucideIcon;
      to?: string;
      search?: Record<string, string>;
    }>;
  }> = [
    {
      title: "مؤشرات الأداء",
      cards: [
        {
          label: "الطلاب",
          value: m(s?.students, countsQ),
          icon: ClipboardList,
          to: "/admin/reports",
        },
        {
          label: "نسبة النجاح %",
          value: m(kpis?.successRate, kpisQ),
          icon: TrendingUp,
          to: "/admin/reports",
        },
        {
          label: "الرسوم المستحقة",
          value: m(kpis?.outstanding, kpisQ),
          icon: Wallet,
          to: "/admin/reports",
        },
        {
          label: "طلبات مفتوحة",
          value: m(kpis?.openRequests, kpisQ),
          icon: FileWarning,
          to: "/admin/reports",
          search: { tab: "requests" },
        },
      ],
    },
    {
      title: "صحة النظام",
      cards: [
        { label: "حالة العمليات", value: null, icon: Activity, to: "/admin/operations" },
        { label: "حالة النسخ الاحتياطي", value: null, icon: Database, to: "/admin/backup-status" },
        {
          label: "التنبيهات الحرجة",
          value: m(
            s === undefined ? undefined : (s.importsFailed ?? 0) + (s.feesPending > 50 ? 1 : 0),
            countsQ,
          ),
          icon: ShieldAlert,
          to: "/admin/operations",
        },
        { label: "جاهزية الاسترجاع", value: null, icon: HardDrive, to: "/admin/operations" },
      ],
    },
    {
      title: "إحصائيات أكاديمية",
      cards: [
        { label: "البرامج", value: m(s?.programs, countsQ), icon: GraduationCap },
        { label: "المقررات", value: m(s?.courses, countsQ), icon: BookOpen },
        { label: "المجموعات الدراسية", value: m(s?.sections, countsQ), icon: CalendarDays },
        { label: "الطلاب", value: m(s?.students, countsQ), icon: ClipboardList },
      ],
    },
    {
      title: "العمليات الأكاديمية",
      cards: [
        {
          label: "المقررات المطروحة",
          value: m(aops?.activeOfferings, aopsQ),
          icon: CalendarDays,
          to: "/admin/academic-operations",
        },
        {
          label: "المجموعات الدراسية النشطة",
          value: m(aops?.activeSections, aopsQ),
          icon: Layers,
          to: "/admin/academic-operations",
        },
        {
          label: "التسجيلات النشطة",
          value: m(aops?.activeEnrollments, aopsQ),
          icon: ClipboardList,
          to: "/admin/academic-operations",
        },
        {
          label: "إيصالات قيد المراجعة",
          value: m(aops?.pendingReceipts, aopsQ),
          icon: Receipt,
          to: "/admin/academic-operations",
        },
      ],
    },
    {
      title: "الجداول الدراسية",
      cards: [
        {
          label: "الجداول المنشورة",
          value: m(scheduleStats?.published, scheduleStatsQ),
          icon: CalendarDays,
          to: "/admin/course-offerings?tab=schedule",
        },
        {
          label: "منشورة اليوم",
          value: m(scheduleStats?.publishedToday, scheduleStatsQ),
          icon: CalendarClock,
          to: "/admin/course-offerings?tab=schedule",
        },
        {
          label: "المجموعات الدراسية غير المجدولة",
          value: m(scheduleStats?.unscheduled, scheduleStatsQ),
          icon: AlertCircle,
          to: "/admin/course-offerings?tab=schedule",
        },
        {
          label: "القاعات المستخدمة",
          value: m(scheduleStats?.roomsUsed, scheduleStatsQ),
          icon: DoorOpen,
          to: "/admin/course-offerings?tab=schedule",
        },
        {
          label: "أعضاء لديهم جداول",
          value: m(scheduleStats?.facultyWithSchedules, scheduleStatsQ),
          icon: Users,
          to: "/admin/course-offerings?tab=schedule",
        },
        {
          label: "إجمالي القاعات",
          value: m(scheduleStats?.rooms, scheduleStatsQ),
          icon: DoorOpen,
          to: "/admin/course-offerings?tab=schedule",
        },
      ],
    },
    {
      title: "التقدم الأكاديمي",
      cards: [
        {
          label: "متوسط المعدل التراكمي",
          value: m(progressKpis?.avgGpa, progressKpisQ),
          icon: TrendingUp,
          to: "/admin/student-progress",
        },
        {
          label: "الطلاب المتعثرون أكاديمياً",
          value: m(progressKpis?.atRisk, progressKpisQ),
          icon: AlertCircle,
          to: "/admin/at-risk-students",
        },
        {
          label: "مرشحو التخرج",
          value: m(progressKpis?.gradCandidates, progressKpisQ),
          icon: GraduationCap,
          to: "/admin/graduation-candidates",
        },
        {
          label: "قريبون من الإكمال (>80%)",
          value: m(progressKpis?.nearCompletion, progressKpisQ),
          icon: ClipboardCheck,
          to: "/admin/student-progress",
        },
      ],
    },
    {
      title: "الموارد البشرية",
      cards: [
        { label: "أعضاء هيئة التدريس", value: m(s?.faculty, countsQ), icon: Users },
        { label: "الموظفون", value: m(s?.staff, countsQ), icon: UserCog },
      ],
    },
    {
      title: "الاتصالات",
      cards: [
        {
          label: "إعلانات اليوم",
          value: m(commStats?.announcements_today, commStatsQ),
          icon: Megaphone,
          to: "/admin/communications",
        },
        {
          label: "إعلانات نشطة",
          value: m(commStats?.active_announcements, commStatsQ),
          icon: Megaphone,
          to: "/admin/communications",
        },
        {
          label: "إعلانات غير مقروءة",
          value: m(commStats?.unread_announcements, commStatsQ),
          icon: Bell,
          to: "/admin/communications",
        },
        {
          label: "رسائل غير مقروءة",
          value: m(commStats?.unread_messages, commStatsQ),
          icon: MailOpen,
          to: "/messages",
        },
      ],
    },
    {
      title: "حالة الأتمتة",
      cards: [
        {
          label: "الأتمتة المفعّلة",
          value: m(automation?.enabled_count, automationQ),
          icon: Activity,
          to: "/admin/automation",
        },
        {
          label: "الأتمتة المعطّلة",
          value: m(automation?.disabled_count, automationQ),
          icon: AlertCircle,
          to: "/admin/automation",
        },
        {
          label: "إجراءات قادمة",
          value: m(
            automation === undefined ? undefined : automation.upcoming_action ? 1 : 0,
            automationQ,
          ),
          icon: CalendarClock,
          to: "/admin/automation",
        },
        { label: "أحداث معلّقة", value: null, icon: Bell, to: "/admin/automation" },
      ],
    },
    {
      title: "التشغيل التجريبي",
      cards: [
        {
          label: "نسبة الجاهزية %",
          value: m(pilot?.readiness?.score, pilotQ),
          icon: Rocket,
          to: "/admin/pilot-center",
        },
        {
          label: "مشاكل مفتوحة",
          value: m(pilot?.issues?.open, pilotQ),
          icon: AlertCircle,
          to: "/admin/pilot-center",
        },
        {
          label: "مشاكل حرجة",
          value: m(pilot?.issues?.critical, pilotQ),
          icon: ShieldAlert,
          to: "/admin/pilot-center",
        },
        {
          label: "مشاركون نشطون",
          value: m(pilot?.participants?.active, pilotQ),
          icon: Users,
          to: "/admin/pilot-center",
        },
      ],
    },
    {
      title: "الخدمات",
      cards: [
        { label: "طلبات جديدة", value: m(s?.newReq, countsQ), icon: FileWarning },
        { label: "قيد المراجعة", value: m(s?.reviewReq, countsQ), icon: ClipboardCheck },
      ],
    },
    {
      title: "المالية",
      cards: [
        { label: "رسوم غير مسددة", value: m(s?.feesPending, countsQ), icon: Wallet },
        { label: "رسوم مسددة جزئياً", value: m(s?.feesPartial, countsQ), icon: AlertCircle },
      ],
    },
    {
      title: "الموقع",
      cards: [
        { label: "الأخبار المنشورة", value: m(s?.news, countsQ), icon: Newspaper },
        { label: "الفعاليات", value: m(s?.events, countsQ), icon: Calendar },
        { label: "الأبحاث", value: m(s?.research, countsQ), icon: FlaskConical },
      ],
    },
    {
      title: "الوثائق الرسمية",
      cards: [
        {
          label: "إجمالي الوثائق",
          value: m(s?.docsAll, countsQ),
          icon: FileSignature,
          to: "/admin/documents",
        },
        {
          label: "وثائق صادرة اليوم",
          value: m(s?.docsIssuedToday, countsQ),
          icon: FileClock,
          to: "/admin/documents",
        },
        {
          label: "وثائق هذا الشهر",
          value: m(s?.docsThisMonth, countsQ),
          icon: FileClock,
          to: "/admin/documents",
        },
        {
          label: "وثائق فعالة",
          value: m(s?.docsActive, countsQ),
          icon: FileCheck2,
          to: "/admin/documents",
        },
        {
          label: "وثائق ملغاة",
          value: m(s?.docsCancelled, countsQ),
          icon: FileWarning,
          to: "/admin/documents",
        },
        {
          label: "شهادات القيد",
          value: m(s?.docsEnroll, countsQ),
          icon: FileBadge,
          to: "/admin/documents",
        },
        {
          label: "السجلات الأكاديمية",
          value: m(s?.docsTranscript, countsQ),
          icon: FileCheck2,
          to: "/admin/documents",
        },
        {
          label: "السندات المالية",
          value: m(s?.docsReceipt, countsQ),
          icon: Receipt,
          to: "/admin/documents",
        },
      ],
    },
    {
      title: "الاستيراد الجماعي",
      cards: [
        {
          label: "إجمالي الاستيرادات",
          value: m(s?.importsTotal, countsQ),
          icon: FileSpreadsheet,
          to: "/admin/imports",
        },
        {
          label: "استيرادات اليوم",
          value: m(s?.importsToday, countsQ),
          icon: FileSpreadsheet,
          to: "/admin/imports",
        },
        {
          label: "ناجحة",
          value: m(s?.importsCompleted, countsQ),
          icon: FileCheck2,
          to: "/admin/imports",
        },
        {
          label: "فاشلة",
          value: m(s?.importsFailed, countsQ),
          icon: FileWarning,
          to: "/admin/imports",
        },
        {
          label: "نسبة النجاح %",
          value: m(s?.importsRate, countsQ),
          icon: FileBadge,
          to: "/admin/imports",
        },
      ],
    },
    {
      title: "النظام",
      cards: [
        { label: "سجل التدقيق (آخر 24 ساعة)", value: m(s?.audit24h, countsQ), icon: ScrollText },
        { label: "الإشعارات (آخر 24 ساعة)", value: m(s?.notif24h, countsQ), icon: Bell },
        {
          label: "وثائق صادرة اليوم",
          value: m(s?.docsIssuedToday, countsQ),
          icon: FileSignature,
          to: "/admin/documents",
        },
        {
          label: "وثائق ملغاة اليوم",
          value: m(s?.docsCancelledToday, countsQ),
          icon: FileWarning,
          to: "/admin/documents",
        },
        { label: "طلاب نشطون", value: m(active?.students, activeQ), icon: ShieldCheck },
        { label: "أعضاء هيئة تدريس نشطون", value: m(active?.faculty, activeQ), icon: ShieldCheck },
        { label: "موظفون نشطون", value: m(active?.staff, activeQ), icon: ShieldCheck },
      ],
    },
  ];

  const quickActions = [
    { to: "/admin/study-plans", label: "إضافة مقرر", icon: BookOpen },
    { to: "/admin/study-plans", label: "إنشاء خطة دراسية", icon: ListTree },
    { to: "/admin/course-offerings", label: "إنشاء مجموعة دراسية", icon: CalendarDays },
    { to: "/admin/enrollments", label: "تقسيم المجموعات", icon: ClipboardList },
    { to: "/admin/grades", label: "إدخال درجات", icon: ClipboardCheck },
    { to: "/admin/student-requests", label: "مراجعة الطلبات", icon: FileWarning },
    { to: "/admin/news", label: "خبر جديد", icon: Newspaper },
    { to: "/admin/contacts", label: "الرسائل", icon: MessageSquare },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-primary">لوحة التحكم</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          نظرة شاملة على حركة الكلية والخدمات الأكاديمية.
        </p>
      </div>

      {anyQueryError ? (
        <div
          role="alert"
          data-testid="admin-dashboard-partial-error"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <span>تعذّر تحميل بعض المؤشرات؛ القيم غير المتاحة تظهر كـ«—».</span>
          <button
            type="button"
            onClick={retryFailedQueries}
            className="inline-flex min-h-11 items-center rounded-lg border border-amber-400 bg-background px-3 text-xs font-bold text-amber-900 hover:bg-amber-100"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : null}

      {/* Stats grouped sections */}
      {sections_
        .filter((sec) => portalFeatures.adminFinance || sec.title !== "المالية")
        .map((sec) => {
          const visibleCards = sec.cards.filter(
            (c) =>
              !HIDDEN_ADMIN_DASHBOARD_CARD_LABELS.has(c.label) &&
              (portalFeatures.adminFinance || !FINANCE_FROZEN_CARD_LABELS.has(c.label)),
          );
          if (visibleCards.length === 0) return null;
          return (
            <section key={sec.title} className="space-y-3">
              <h2 className="font-display text-base font-bold text-primary">{sec.title}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {visibleCards.map((c) => {
                  const Icon = c.icon;
                  const inner = (
                    <>
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground">{c.label}</div>
                        <div className="mt-2 font-display text-3xl font-extrabold text-primary">
                          <span aria-live="polite">
                            <DashboardMetricValue value={c.value} />
                          </span>
                        </div>
                      </div>
                      <div className="grid h-11 w-11 place-items-center rounded-lg bg-gold-gradient text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                    </>
                  );
                  const cls =
                    "rounded-xl bg-card border border-border p-5 shadow-card flex items-center justify-between";
                  return c.to ? (
                    <Link
                      key={c.label}
                      to={c.to}
                      search={c.search}
                      className={cls + " hover:border-gold transition-all"}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div key={c.label} className={cls}>
                      {inner}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

      {/* Recent Official Documents */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-primary">آخر الوثائق الصادرة</h2>
          <Link to="/admin/documents" className="text-xs font-bold text-primary hover:underline">
            عرض الكل
          </Link>
        </div>
        <div className="rounded-xl bg-card border border-border shadow-card overflow-hidden">
          {recentDocsQ.isPending ? (
            <div className="p-6 text-center text-sm text-muted-foreground" aria-busy="true">
              جارٍ تحميل آخر الوثائق…
            </div>
          ) : recentDocsQ.isError ? (
            <div className="p-6 text-center text-sm text-destructive" role="alert">
              تعذّر تحميل آخر الوثائق. أعد المحاولة لاحقاً.
            </div>
          ) : !recentDocs || recentDocs.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              لا توجد وثائق صادرة بعد.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs">
                  <tr>
                    <th className="px-4 py-2 text-right font-bold">رقم الوثيقة</th>
                    <th className="px-4 py-2 text-right font-bold">الطالب</th>
                    <th className="px-4 py-2 text-right font-bold">النوع</th>
                    <th className="px-4 py-2 text-right font-bold">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDocs.map((d) => (
                    <tr key={d.id} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs">{d.document_number}</td>
                      <td className="px-4 py-2">
                        {d.student_profiles?.full_name_ar ?? "—"}
                        {d.student_profiles?.academic_number ? (
                          <span className="ms-2 text-xs text-muted-foreground">
                            ({d.student_profiles.academic_number})
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-xs">{docTypeLabel(d.document_type)}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {d.issued_at ? new Date(d.issued_at).toLocaleDateString("ar-EG") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Quick actions */}
      <section className="space-y-3">
        <h2 className="font-display text-base font-bold text-primary">إجراءات سريعة</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.label}
                to={a.to}
                className="flex items-center gap-3 rounded-xl bg-card border border-border p-4 hover:border-gold hover:shadow-card transition-all"
              >
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 text-sm font-bold text-primary">{a.label}</div>
                <Plus className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* Production Readiness section */}
      <section className="space-y-3">
        <h2 className="font-display text-base font-bold text-primary">Production Readiness</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <ReadinessCard
            title="الحسابات الإدارية"
            icon={ShieldAlert}
            to="/admin/users"
            status={
              adminCountsQ.isPending || adminCountsQ.isError
                ? "WARNING"
                : (adminCounts?.admin ?? 0) >= 2 && (adminCounts?.system_admin ?? 0) >= 1
                  ? "PASS"
                  : "FAIL"
            }
            primary={
              adminCountsQ.isPending || adminCountsQ.isError
                ? "—"
                : `Admin: ${adminCounts?.admin ?? 0}`
            }
            secondary={
              adminCountsQ.isPending
                ? "جارٍ التحقق"
                : adminCountsQ.isError
                  ? "تعذّر التحقق"
                  : `System Admin: ${adminCounts?.system_admin ?? 0}`
            }
          />
          <ReadinessCard
            title="حالة التأمين"
            icon={Lock}
            to="/admin/security-status"
            status={
              hardeningQ.isError ? "WARNING" : hardening ? hardeningOverall(hardening) : "WARNING"
            }
            primary="Auth · Storage · Admins"
            secondary={
              hardeningQ.isPending
                ? "جارٍ التحقق"
                : hardeningQ.isError
                  ? "تعذّر التحقق"
                  : "مراجعة قراءة-فقط"
            }
          />
          <ReadinessCard
            title="النسخ الاحتياطي"
            icon={Database}
            to="/admin/backup-status"
            status="WARNING"
            primary="يحتاج تحقق يدوي"
            secondary="PITR · Restore Drill"
          />
        </div>
      </section>

      {/* System Readiness CTA */}
      <section className="rounded-xl bg-card border border-border p-6 shadow-card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-primary">جاهزية النظام للتشغيل</h2>
            <p className="text-sm text-muted-foreground mt-1">
              نتائج الاختبارات التشخيصية لجميع الأنظمة الحالية.
            </p>
          </div>
          <Link
            to="/admin/system-readiness"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            <ShieldCheck className="h-4 w-4" /> فتح لوحة الجاهزية
          </Link>
        </div>
      </section>

      {/* Shortcut to record link */}
      <section className="rounded-xl bg-card border border-border p-6 shadow-card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-primary">السجلات الأكاديمية</h2>
            <p className="text-sm text-muted-foreground mt-1">
              ابحث عن طالب لعرض سجله الأكاديمي غير الرسمي.
            </p>
          </div>
          <Link
            to="/admin/transcripts"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            <FileText className="h-4 w-4" /> فتح السجلات
          </Link>
        </div>
      </section>
    </div>
  );
}

type HardeningStatus = {
  admin_count?: number;
  system_admin_count?: number;
  buckets?: Array<{
    id: string;
    public: boolean;
    file_size_limit?: number | null;
    allowed_mime_types?: string[] | null;
  }>;
};

function hardeningOverall(h: HardeningStatus | null | undefined): "PASS" | "WARNING" | "FAIL" {
  if (!h) return "WARNING";
  const buckets = h.buckets ?? [];
  const privateBkts = new Set(["payment-receipts", "student-request-attachments"]);
  let fail = false,
    warn = false;
  if ((h.admin_count ?? 0) < 2 || (h.system_admin_count ?? 0) < 1) fail = true;
  for (const b of buckets) {
    if (privateBkts.has(b.id) && b.public) fail = true;
    if (!b.file_size_limit || !b.allowed_mime_types?.length) warn = true;
  }
  if (fail) return "FAIL";
  if (warn) return "WARNING";
  return "PASS";
}

function ReadinessCard({
  title,
  icon: Icon,
  to,
  status,
  primary,
  secondary,
}: {
  title: string;
  icon: LucideIcon;
  to: string;
  status: "PASS" | "WARNING" | "FAIL";
  primary: string;
  secondary: string;
}) {
  const color =
    status === "PASS"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "WARNING"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-red-200 bg-red-50 text-red-700";
  return (
    <Link
      to={to}
      className={`block rounded-xl border p-5 shadow-card hover:opacity-90 transition ${color}`}
    >
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5" />
        <span className="rounded-md border bg-white/60 px-2 py-0.5 text-[10px] font-extrabold">
          {status}
        </span>
      </div>
      <div className="mt-3 text-sm font-extrabold">{title}</div>
      <div className="mt-1 text-xs font-bold">{primary}</div>
      <div className="text-[11px] opacity-80">{secondary}</div>
    </Link>
  );
}
