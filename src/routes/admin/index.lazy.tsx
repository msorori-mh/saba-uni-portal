import type { ComponentType } from "react";
import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { usePagePerf } from "@/lib/perf-probe";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Newspaper, Users, FlaskConical, Calendar, MessageSquare, Plus,
  GraduationCap, BookOpen, CalendarDays, ClipboardList, ClipboardCheck,
  FileWarning, UserCog, FileText, ListTree, ScrollText, Bell, ShieldCheck,
  Wallet, AlertCircle, Lock, Database, ShieldAlert, Layers, CalendarClock, DoorOpen,
  FileBadge, FileCheck2, Receipt, FileSignature, FileClock, FileSpreadsheet,
  BarChart3, TrendingUp, Activity, HardDrive, Megaphone, MailOpen, CheckCircle2,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

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

type MetricValue = number | null;

function formatMetric(value: MetricValue): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("ar-EG");
}

function CompactStatCard({
  label,
  value,
  icon: Icon,
  to,
  search,
  detail,
}: {
  label: string;
  value: MetricValue;
  icon: ComponentType<{ className?: string }>;
  to?: string;
  search?: Record<string, string>;
  detail?: string;
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-muted-foreground leading-snug">{label}</div>
        <div className="mt-1 font-display text-[1.65rem] sm:text-[1.75rem] font-extrabold text-primary leading-none tabular-nums">
          {formatMetric(value)}
        </div>
        {detail ? (
          <div className="mt-1 text-xs text-muted-foreground leading-snug">{detail}</div>
        ) : null}
      </div>
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gold-gradient text-primary">
        <Icon className="h-4 w-4" aria-hidden />
      </div>
    </>
  );
  const cls =
    "rounded-xl bg-card border border-border px-4 py-3 shadow-card flex items-center justify-between gap-3 min-h-[4.5rem]";
  return to ? (
    <Link to={to} search={search as any} className={cn(cls, "hover:border-gold transition-all")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

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
  const { data: commStats, isLoading: loadingComm } = useQuery({
    queryKey: ["admin-comm-stats"],
    queryFn: () => fetchCommStats(),
    staleTime: 60_000,
  });
  const { data: automation } = useQuery({
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
  const { data: pilot } = useQuery({
    queryKey: ["admin-pilot-overview"],
    queryFn: () => fetchPilot(),
    staleTime: 60_000,
  });
  const { data: progressKpis, isLoading: loadingProgress } = useQuery({
    queryKey: ["admin-progress-kpis"],
    queryFn: () => fetchProgressKpis(),
    staleTime: 5 * 60_000,
  });
  const { data: active } = useQuery({
    queryKey: ["active-user-counts"],
    queryFn: () => fetchActive(),
  });
  const { data: adminCounts } = useQuery({
    queryKey: ["admin-account-counts"],
    queryFn: () => fetchAdminCounts(),
  });
  const { data: hardening } = useQuery({
    queryKey: ["hardening-status"],
    queryFn: () => fetchHardening({ data: {} }),
  });
  const { data: s, isLoading: loadingCounts } = useQuery({
    queryKey: ["admin-dashboard-counts"],
    queryFn: () => fetchDashboardCounts({ data: {} }),
  });

  const { data: scheduleStats } = useQuery({
    queryKey: ["admin-schedule-stats"],
    queryFn: () => fetchScheduleStats({ data: {} }),
  });

  const { data: recentDocs } = useQuery({
    queryKey: ["admin-recent-documents"],
    queryFn: () => fetchRecentDocs({ data: {} }),
  });

  const { data: kpis, isLoading: loadingKpis } = useQuery({
    queryKey: ["admin-perf-kpis-rpc"],
    queryFn: () => fetchPerfKpis({ data: {} }),
    staleTime: 60_000,
  });

  const { data: aops } = useQuery({
    queryKey: ["admin-academic-ops-kpis"],
    queryFn: () => fetchAcademicOps({ data: {} }),
  });

  // Keep zero defaults for secondary sections that already used this pattern,
  // but top KPIs / attention use explicit loading → "—" distinction.
  const counts = s ?? {
    programs: 0, courses: 0, sections: 0, students: 0,
    faculty: 0, staff: 0, newReq: 0, reviewReq: 0,
    news: 0, events: 0, research: 0, audit24h: 0, notif24h: 0,
    feesPending: 0, feesPartial: 0,
    docsAll: 0, docsEnroll: 0, docsTranscript: 0, docsReceipt: 0, docsToday: 0,
    docsIssuedToday: 0, docsCancelledToday: 0,
    docsActive: 0, docsCancelled: 0, docsThisMonth: 0,
    importsTotal: 0, importsToday: 0, importsCompleted: 0, importsFailed: 0, importsRate: 0,
  };

  const kpiStudents: MetricValue = loadingCounts ? null : (s?.students ?? 0);
  const kpiCourses: MetricValue = loadingCounts ? null : (s?.courses ?? 0);
  const kpiSections: MetricValue = loadingCounts ? null : (s?.sections ?? 0);
  const kpiOpenRequests: MetricValue = loadingKpis
    ? null
    : (kpis?.openRequests ?? null);

  type AttentionItem = {
    id: string;
    title: string;
    value: MetricValue;
    to: string;
    search?: Record<string, string>;
    detail?: string;
  };

  const attentionItems: AttentionItem[] = [];
  const openReqVal = kpiOpenRequests;
  if (openReqVal !== null && openReqVal > 0) {
    attentionItems.push({
      id: "open-requests",
      title: "طلبات مفتوحة",
      value: openReqVal,
      to: "/admin/student-requests",
      detail: "تتطلب متابعة تشغيلية",
    });
  }
  if (!loadingCounts && (s?.importsFailed ?? 0) > 0) {
    attentionItems.push({
      id: "failed-imports",
      title: "استيرادات فاشلة",
      value: s!.importsFailed,
      to: "/admin/imports",
      detail: "من بيانات الاستيراد الحالية",
    });
  }
  // مخفي بناءً على طلب الإدارة — الطلاب المتعثرون أكاديمياً

  if (!loadingComm && (commStats?.unread_messages ?? 0) > 0) {
    attentionItems.push({
      id: "unread-messages",
      title: "رسائل غير مقروءة",
      value: commStats!.unread_messages,
      to: "/messages",
    });
  }
  if (!loadingCounts && (s?.newReq ?? 0) > 0 && (openReqVal === null || openReqVal === 0)) {
    attentionItems.push({
      id: "new-requests",
      title: "طلبات جديدة",
      value: s!.newReq,
      to: "/admin/student-requests",
    });
  }

  const sections_: Array<{
    title: string;
    cards: Array<{
      label: string;
      value: number;
      icon: any;
      to?: string;
      search?: Record<string, string>;
      detail?: string;
    }>;
  }> = [
    {
      title: "الشؤون الأكاديمية",
      cards: [
        { label: "المقررات المطروحة", value: aops?.activeOfferings ?? 0, icon: CalendarDays, to: "/admin/academic-operations" },
        { label: "المجموعات الدراسية النشطة", value: aops?.activeSections ?? 0, icon: Layers, to: "/admin/academic-operations" },
        { label: "التسجيلات النشطة", value: aops?.activeEnrollments ?? 0, icon: ClipboardList, to: "/admin/academic-operations" },
        { label: "إيصالات قيد المراجعة", value: aops?.pendingReceipts ?? 0, icon: Receipt, to: "/admin/academic-operations" },
      ],
    },
    {
      title: "عمليات اليوم / الجداول",
      cards: [
        { label: "الجداول المنشورة", value: scheduleStats?.published ?? 0, icon: CalendarDays, to: "/admin/course-offerings?tab=schedule" },
        { label: "منشورة اليوم", value: scheduleStats?.publishedToday ?? 0, icon: CalendarClock, to: "/admin/course-offerings?tab=schedule" },
        { label: "المجموعات الدراسية غير المجدولة", value: scheduleStats?.unscheduled ?? 0, icon: AlertCircle, to: "/admin/course-offerings?tab=schedule" },
        { label: "القاعات المستخدمة", value: scheduleStats?.roomsUsed ?? 0, icon: DoorOpen, to: "/admin/course-offerings?tab=schedule" },
        { label: "أعضاء لديهم جداول", value: scheduleStats?.facultyWithSchedules ?? 0, icon: Users, to: "/admin/course-offerings?tab=schedule" },
        { label: "إجمالي القاعات", value: scheduleStats?.rooms ?? 0, icon: DoorOpen, to: "/admin/course-offerings?tab=schedule" },
      ],
    },
    // قسم «التقدم الأكاديمي» مخفي حالياً بناءً على طلب الإدارة.

    {
      title: "الموارد البشرية",
      cards: [
        { label: "أعضاء هيئة التدريس", value: counts.faculty, icon: Users },
        { label: "الموظفون", value: counts.staff, icon: UserCog },
      ],
    },
    {
      title: "الاتصالات",
      cards: [
        { label: "إعلانات اليوم", value: commStats?.announcements_today ?? 0, icon: Megaphone, to: "/admin/communications" },
        { label: "إعلانات نشطة", value: commStats?.active_announcements ?? 0, icon: Megaphone, to: "/admin/communications" },
        { label: "إعلانات غير مقروءة", value: commStats?.unread_announcements ?? 0, icon: Bell, to: "/admin/communications" },
        { label: "رسائل غير مقروءة", value: commStats?.unread_messages ?? 0, icon: MailOpen, to: "/messages" },
      ],
    },
    {
      title: "صحة النظام",
      cards: [
        { label: "حالة العمليات", value: 1, icon: Activity, to: "/admin/operations" },
        { label: "حالة النسخ الاحتياطي", value: 1, icon: Database, to: "/admin/backup-status" },
        { label: "التنبيهات الحرجة", value: (counts.importsFailed ?? 0) + (counts.feesPending > 50 ? 1 : 0), icon: ShieldAlert, to: "/admin/operations" },
        { label: "جاهزية الاسترجاع", value: 1, icon: HardDrive, to: "/admin/operations" },
      ],
    },
    {
      title: "مؤشرات إضافية",
      cards: [
        { label: "نسبة النجاح %", value: kpis?.successRate ?? 0, icon: TrendingUp, to: "/admin/reports" },
        { label: "الرسوم المستحقة", value: kpis?.outstanding ?? 0, icon: Wallet, to: "/admin/reports" },
        { label: "البرامج", value: counts.programs, icon: GraduationCap },
      ],
    },
    {
      title: "حالة الأتمتة",
      cards: [
        { label: "الأتمتة المفعّلة", value: automation?.enabled_count ?? 0, icon: Activity, to: "/admin/automation" },
        { label: "الأتمتة المعطّلة", value: automation?.disabled_count ?? 0, icon: AlertCircle, to: "/admin/automation" },
        { label: "إجراءات قادمة", value: automation?.upcoming_action ? 1 : 0, icon: CalendarClock, to: "/admin/automation" },
        { label: "أحداث معلّقة", value: 0, icon: Bell, to: "/admin/automation" },
      ],
    },
    {
      title: "التشغيل التجريبي",
      cards: [
        { label: "نسبة الجاهزية %", value: pilot?.readiness?.score ?? 0, icon: Rocket, to: "/admin/pilot-center" },
        { label: "مشاكل مفتوحة", value: pilot?.issues?.open ?? 0, icon: AlertCircle, to: "/admin/pilot-center" },
        { label: "مشاكل حرجة", value: pilot?.issues?.critical ?? 0, icon: ShieldAlert, to: "/admin/pilot-center" },
        { label: "مشاركون نشطون", value: pilot?.participants?.active ?? 0, icon: Users, to: "/admin/pilot-center" },
      ],
    },
    {
      title: "الخدمات",
      cards: [
        { label: "طلبات جديدة", value: counts.newReq, icon: FileWarning },
        { label: "قيد المراجعة", value: counts.reviewReq, icon: ClipboardCheck },
      ],
    },
    {
      title: "المالية",
      cards: [
        { label: "رسوم غير مسددة", value: counts.feesPending, icon: Wallet },
        { label: "رسوم مسددة جزئياً", value: counts.feesPartial, icon: AlertCircle },
      ],
    },
    {
      title: "الموقع",
      cards: [
        { label: "الأخبار المنشورة", value: counts.news, icon: Newspaper },
        { label: "الفعاليات", value: counts.events, icon: Calendar },
        { label: "الأبحاث", value: counts.research, icon: FlaskConical },
      ],
    },
    {
      title: "الوثائق الرسمية",
      cards: [
        { label: "إجمالي الوثائق", value: counts.docsAll, icon: FileSignature, to: "/admin/documents" },
        { label: "وثائق صادرة اليوم", value: counts.docsIssuedToday, icon: FileClock, to: "/admin/documents" },
        { label: "وثائق هذا الشهر", value: counts.docsThisMonth, icon: FileClock, to: "/admin/documents" },
        { label: "وثائق فعالة", value: counts.docsActive, icon: FileCheck2, to: "/admin/documents" },
        { label: "وثائق ملغاة", value: counts.docsCancelled, icon: FileWarning, to: "/admin/documents" },
        { label: "شهادات القيد", value: counts.docsEnroll, icon: FileBadge, to: "/admin/documents" },
        { label: "السجلات الأكاديمية", value: counts.docsTranscript, icon: FileCheck2, to: "/admin/documents" },
        { label: "السندات المالية", value: counts.docsReceipt, icon: Receipt, to: "/admin/documents" },
      ],
    },
    {
      title: "الاستيراد الجماعي",
      cards: [
        { label: "إجمالي الاستيرادات", value: counts.importsTotal, icon: FileSpreadsheet, to: "/admin/imports" },
        { label: "استيرادات اليوم", value: counts.importsToday, icon: FileSpreadsheet, to: "/admin/imports" },
        { label: "ناجحة", value: counts.importsCompleted, icon: FileCheck2, to: "/admin/imports" },
        { label: "فاشلة", value: counts.importsFailed, icon: FileWarning, to: "/admin/imports" },
        { label: "نسبة النجاح %", value: counts.importsRate, icon: FileBadge, to: "/admin/imports" },
      ],
    },
    {
      title: "النظام",
      cards: [
        { label: "سجل التدقيق (آخر 24 ساعة)", value: counts.audit24h, icon: ScrollText },
        { label: "الإشعارات (آخر 24 ساعة)", value: counts.notif24h, icon: Bell },
        { label: "وثائق صادرة اليوم", value: counts.docsIssuedToday, icon: FileSignature, to: "/admin/documents" },
        { label: "وثائق ملغاة اليوم", value: counts.docsCancelledToday, icon: FileWarning, to: "/admin/documents" },
        { label: "طلاب نشطون", value: active?.students ?? 0, icon: ShieldCheck },
        { label: "أعضاء هيئة تدريس نشطون", value: active?.faculty ?? 0, icon: ShieldCheck },
        { label: "موظفون نشطون", value: active?.staff ?? 0, icon: ShieldCheck },
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

  const sectionOrderIndex = (title: string) => {
    const order = [
      "الشؤون الأكاديمية",
      "عمليات اليوم / الجداول",
      "التقدم الأكاديمي",
      "الموارد البشرية",
      "الاتصالات",
      "صحة النظام",
    ];
    const i = order.indexOf(title);
    return i === -1 ? 100 + title.length : i;
  };

  return (
    <div className="space-y-6" data-testid="admin-dashboard">
      <div>
        <h1 className="font-display text-2xl sm:text-[1.75rem] lg:text-[1.85rem] font-extrabold text-primary">
          لوحة التحكم
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          نظرة سريعة على الأولويات التشغيلية والخدمات الأكاديمية.
        </p>
      </div>

      {/* A. نظرة سريعة / المؤشرات الرئيسية */}
      <section aria-label="نظرة سريعة" className="space-y-3" data-testid="admin-dashboard-kpi-row">
        <h2 className="font-display text-[17px] sm:text-lg font-bold text-primary">نظرة سريعة</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CompactStatCard label="الطلاب" value={kpiStudents} icon={ClipboardList} to="/admin/students" />
          <CompactStatCard label="المقررات" value={kpiCourses} icon={BookOpen} to="/admin/study-plans" />
          <CompactStatCard
            label="المجموعات الدراسية"
            value={kpiSections}
            icon={CalendarDays}
            to="/admin/course-offerings"
          />
          <CompactStatCard
            label="الطلبات المفتوحة"
            value={kpiOpenRequests}
            icon={FileWarning}
            to="/admin/student-requests"
          />
        </div>
      </section>

      {/* B. يحتاج انتباهك */}
      <section
        aria-label="يحتاج انتباهك"
        className="rounded-xl border border-border bg-card p-4 shadow-card"
        data-testid="admin-dashboard-attention"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[17px] sm:text-lg font-bold text-primary">يحتاج انتباهك</h2>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              عناصر تشغيلية من البيانات الحالية فقط — دون تصنيف خطورة مُخترع.
            </p>
          </div>
        </div>
        {attentionItems.length === 0 ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            لا توجد عناصر تتطلب انتباهًا فوريًا حاليًا.
          </div>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {attentionItems.map((item) => (
              <Link
                key={item.id}
                to={item.to}
                search={item.search as any}
                className="rounded-lg border border-border bg-background px-3 py-2.5 hover:border-gold transition-colors min-h-11"
              >
                <div className="text-sm font-semibold text-muted-foreground">{item.title}</div>
                <div className="mt-0.5 font-display text-2xl font-extrabold text-primary tabular-nums">
                  {formatMetric(item.value)}
                </div>
                {item.detail ? (
                  <div className="mt-0.5 text-xs text-muted-foreground">{item.detail}</div>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Operational → academic → resources → system health (deprioritized) → secondary */}
      {sections_
        .slice()
        .sort((a, b) => sectionOrderIndex(a.title) - sectionOrderIndex(b.title))
        .filter((sec) => portalFeatures.adminFinance || sec.title !== "المالية")
        .map((sec) => {
          const visibleCards = sec.cards.filter(
            (c) =>
              !HIDDEN_ADMIN_DASHBOARD_CARD_LABELS.has(c.label) &&
              (portalFeatures.adminFinance || !FINANCE_FROZEN_CARD_LABELS.has(c.label)),
          );
          if (visibleCards.length === 0) return null;
          return (
            <section
              key={sec.title}
              className="space-y-2.5"
              data-section={sec.title}
              data-testid={sec.title === "صحة النظام" ? "admin-dashboard-system-health" : undefined}
            >
              <h2 className="font-display text-[17px] sm:text-lg font-bold text-primary">{sec.title}</h2>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                {visibleCards.map((c) => (
                  <CompactStatCard
                    key={c.label}
                    label={c.label}
                    value={c.value}
                    icon={c.icon}
                    to={c.to}
                    search={c.search}
                    detail={c.detail}
                  />
                ))}
              </div>
            </section>
          );
        })}

      {/* Recent Official Documents */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[17px] sm:text-lg font-bold text-primary">آخر الوثائق الصادرة</h2>
          <Link to="/admin/documents" className="text-[13px] font-bold text-primary hover:underline">
            عرض الكل
          </Link>
        </div>
        <div className="rounded-xl bg-card border border-border shadow-card overflow-hidden">
          {!recentDocs || recentDocs.length === 0 ? (
            <div className="p-5 text-center text-sm text-muted-foreground">لا توجد وثائق صادرة بعد.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-[13px]">
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
      <section className="space-y-2.5">
        <h2 className="font-display text-[17px] sm:text-lg font-bold text-primary">إجراءات سريعة</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.label}
                to={a.to}
                className="flex items-center gap-3 rounded-xl bg-card border border-border px-3 py-3 hover:border-gold hover:shadow-card transition-all min-h-11"
              >
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-secondary text-primary">
                  <Icon className="h-4 w-4" aria-hidden />
                </div>
                <div className="flex-1 text-sm font-bold text-primary">{a.label}</div>
                <Plus className="h-4 w-4 text-muted-foreground" aria-hidden />
              </Link>
            );
          })}
        </div>
      </section>

      {/* Production Readiness section */}
      <section className="space-y-2.5">
        <h2 className="font-display text-[17px] sm:text-lg font-bold text-primary">Production Readiness</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <ReadinessCard
            title="الحسابات الإدارية"
            icon={ShieldAlert}
            to="/admin/users"
            status={
              (adminCounts?.admin ?? 0) >= 2 && (adminCounts?.system_admin ?? 0) >= 1
                ? "PASS" : "FAIL"
            }
            primary={`Admin: ${adminCounts?.admin ?? 0}`}
            secondary={`System Admin: ${adminCounts?.system_admin ?? 0}`}
          />
          <ReadinessCard
            title="حالة التأمين"
            icon={Lock}
            to="/admin/security-status"
            status={hardening ? (hardeningOverall(hardening)) : "WARNING"}
            primary="Auth · Storage · Admins"
            secondary="مراجعة قراءة-فقط"
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
      <section className="rounded-xl bg-card border border-border p-5 shadow-card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-primary">جاهزية النظام للتشغيل</h2>
            <p className="text-sm text-muted-foreground mt-1">
              نتائج الاختبارات التشخيصية لجميع الأنظمة الحالية.
            </p>
          </div>
          <Link
            to="/admin/system-readiness"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 min-h-11"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden /> فتح لوحة الجاهزية
          </Link>
        </div>
      </section>

      {/* Shortcut to record link */}
      <section className="rounded-xl bg-card border border-border p-5 shadow-card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-primary">السجلات الأكاديمية</h2>
            <p className="text-sm text-muted-foreground mt-1">
              ابحث عن طالب لعرض سجله الأكاديمي غير الرسمي.
            </p>
          </div>
          <Link
            to="/admin/transcripts"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 min-h-11"
          >
            <FileText className="h-4 w-4" aria-hidden /> فتح السجلات
          </Link>
        </div>
      </section>
    </div>
  );
}

function hardeningOverall(h: any): "PASS" | "WARNING" | "FAIL" {
  if (!h) return "WARNING";
  const buckets: any[] = h.buckets ?? [];
  const privateBkts = new Set(["payment-receipts", "student-request-attachments"]);
  let fail = false, warn = false;
  if ((h.admin_count ?? 0) < 2 || (h.system_admin_count ?? 0) < 1) fail = true;
  for (const b of buckets) {
    if (privateBkts.has(b.id) && b.public) fail = true;
    if (!b.file_size_limit || !(b.allowed_mime_types?.length)) warn = true;
  }
  if (fail) return "FAIL";
  if (warn) return "WARNING";
  return "PASS";
}

function ReadinessCard({
  title, icon: Icon, to, status, primary, secondary,
}: {
  title: string; icon: any; to: string;
  status: "PASS" | "WARNING" | "FAIL";
  primary: string; secondary: string;
}) {
  const color =
    status === "PASS" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : status === "WARNING" ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-red-200 bg-red-50 text-red-700";
  return (
    <Link to={to} className={`block rounded-xl border p-4 shadow-card hover:opacity-90 transition ${color}`}>
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5" aria-hidden />
        <span className="rounded-md border bg-white/60 px-2 py-0.5 text-[11px] font-extrabold">{status}</span>
      </div>
      <div className="mt-2 text-sm font-extrabold">{title}</div>
      <div className="mt-1 text-xs font-bold">{primary}</div>
      <div className="text-xs opacity-80">{secondary}</div>
    </Link>
  );
}
