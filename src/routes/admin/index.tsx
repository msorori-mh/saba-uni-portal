import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Newspaper, Users, FlaskConical, Calendar, MessageSquare, Plus,
  GraduationCap, BookOpen, CalendarDays, ClipboardList, ClipboardCheck,
  FileWarning, UserCog, FileText, ListTree, ScrollText, Bell, ShieldCheck,
  Wallet, AlertCircle, Lock, Database, ShieldAlert, Layers, CalendarClock, DoorOpen,
  FileBadge, FileCheck2, Receipt, FileSignature, FileClock, FileSpreadsheet,
  BarChart3, TrendingUp, Activity, HardDrive,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { activeUserCounts, adminAccountCounts } from "@/lib/admin-users.functions";
import { getProgressDashboardKpis } from "@/lib/academic-status.functions";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

async function tableCount(table: string, filters?: (q: any) => any) {
  let q = supabase.from(table as any).select("id", { count: "exact", head: true });
  if (filters) q = filters(q);
  const { count } = await q;
  return count ?? 0;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  enrollment_certificate: "شهادة قيد",
  official_transcript: "سجل أكاديمي",
  financial_receipt: "سند مالي",
};
function docTypeLabel(t: string) {
  return DOC_TYPE_LABELS[t] ?? t;
}

function AdminDashboard() {
  const fetchActive = useServerFn(activeUserCounts);
  const fetchAdminCounts = useServerFn(adminAccountCounts);
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
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_hardening_status" as any);
      if (error) throw new Error(error.message);
      return data as any;
    },
  });
  const { data: s } = useQuery({
    queryKey: ["admin-dashboard-counts"],
    queryFn: async () => {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
      const todayIso = startOfToday.toISOString();
      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
      const monthIso = startOfMonth.toISOString();
      const [
        programs, courses, sections, students,
        faculty, staff,
        newReq, reviewReq,
        news, events, research,
        audit24h, notif24h,
        feesPending, feesPartial,
        docsAll, docsEnroll, docsTranscript, docsReceipt, docsToday,
        docsIssuedToday, docsCancelledToday,
        docsActive, docsCancelled, docsThisMonth,
        importsTotal, importsToday, importsCompleted, importsFailed,
      ] = await Promise.all([
        tableCount("programs", (q) => q.eq("is_active", true)),
        tableCount("courses"),
        tableCount("course_sections"),
        tableCount("student_profiles"),
        tableCount("faculty_profiles"),
        tableCount("staff_profiles"),
        tableCount("student_requests", (q) => q.eq("status", "submitted")),
        tableCount("student_requests", (q) => q.eq("status", "under_review")),
        tableCount("news", (q) => q.eq("is_published", true)),
        tableCount("events", (q) => q.eq("is_published", true)),
        tableCount("research_papers", (q) => q.eq("is_published", true)),
        tableCount("audit_logs", (q) => q.gte("created_at", since24h)),
        tableCount("notifications", (q) => q.gte("created_at", since24h)),
        tableCount("student_fees", (q) => q.eq("status", "pending")),
        tableCount("student_fees", (q) => q.eq("status", "partially_paid")),
        tableCount("official_documents"),
        tableCount("official_documents", (q) => q.eq("document_type", "enrollment_certificate")),
        tableCount("official_documents", (q) => q.eq("document_type", "official_transcript")),
        tableCount("official_documents", (q) => q.eq("document_type", "financial_receipt")),
        tableCount("official_documents", (q) => q.gte("issued_at", todayIso)),
        tableCount("audit_logs", (q) => q.eq("entity_type", "document").eq("action_type", "document_issued").gte("created_at", todayIso)),
        tableCount("audit_logs", (q) => q.eq("entity_type", "document").eq("action_type", "document_cancelled").gte("created_at", todayIso)),
        tableCount("official_documents", (q) => q.eq("status", "issued")),
        tableCount("official_documents", (q) => q.eq("status", "cancelled")),
        tableCount("official_documents", (q) => q.gte("issued_at", monthIso)),
        tableCount("import_logs"),
        tableCount("import_logs", (q) => q.gte("created_at", todayIso)),
        tableCount("import_logs", (q) => q.eq("status", "completed")),
        tableCount("import_logs", (q) => q.eq("status", "failed")),
      ]);
      const importsRate = importsTotal > 0 ? Math.round((importsCompleted / importsTotal) * 100) : 0;
      return {
        programs, courses, sections, students, faculty, staff,
        newReq, reviewReq, news, events, research, audit24h, notif24h,
        feesPending, feesPartial,
        docsAll, docsEnroll, docsTranscript, docsReceipt, docsToday,
        docsIssuedToday, docsCancelledToday,
        docsActive, docsCancelled, docsThisMonth,
        importsTotal, importsToday, importsCompleted, importsFailed, importsRate,
      };
    },
  });

  const { data: scheduleStats } = useQuery({
    queryKey: ["admin-schedule-stats"],
    queryFn: async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const [rooms, slots, published, sectionsAll, scheduledSectionRows, publishedToday, scheduleAll] = await Promise.all([
        tableCount("rooms", (q) => q.eq("is_active", true)),
        tableCount("time_slots", (q) => q.eq("is_active", true)),
        tableCount("class_schedule", (q) => q.eq("status", "published")),
        tableCount("course_sections", (q) => q.eq("status", "active")),
        supabase.from("class_schedule").select("course_section_id, room_id, faculty_profile_id").in("status", ["draft", "published"]),
        tableCount("class_schedule", (q) => q.eq("status", "published").gte("updated_at", todayStart.toISOString())),
        supabase.from("class_schedule").select("room_id, faculty_profile_id").eq("status", "published"),
      ]);
      const scheduledIds = new Set(((scheduledSectionRows.data ?? []) as Array<{ course_section_id: string }>).map((r) => r.course_section_id));
      const pubRows = (scheduleAll.data ?? []) as Array<{ room_id: string | null; faculty_profile_id: string | null }>;
      const roomsUsed = new Set(pubRows.map((r) => r.room_id).filter(Boolean)).size;
      const facultyWithSchedules = new Set(pubRows.map((r) => r.faculty_profile_id).filter(Boolean)).size;
      return {
        rooms, slots, published,
        unscheduled: Math.max(0, sectionsAll - scheduledIds.size),
        publishedToday, roomsUsed, facultyWithSchedules,
      };
    },
  });

  const { data: recentDocs } = useQuery({
    queryKey: ["admin-recent-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("official_documents")
        .select("id, document_number, document_type, issued_at, status, student_profiles(full_name_ar, academic_number)")
        .order("issued_at", { ascending: false })
        .limit(10);
      if (error) throw new Error(error.message);
      return (data ?? []) as any[];
    },
  });

  const { data: kpis } = useQuery({
    queryKey: ["admin-perf-kpis"],
    queryFn: async () => {
      const [grades, feesRows, paymentsRows, openReq] = await Promise.all([
        supabase.from("student_course_grade_summary").select("percentage").limit(10000),
        supabase.from("student_fees").select("amount").limit(10000),
        supabase.from("student_payments").select("amount").limit(10000),
        supabase.from("student_requests").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
      ]);
      const grows = (grades.data ?? []) as Array<{ percentage: number | null }>;
      const passed = grows.filter((g) => Number(g.percentage ?? 0) >= 60).length;
      const successRate = grows.length ? Math.round((passed / grows.length) * 1000) / 10 : 0;
      const totalFees = ((feesRows.data ?? []) as Array<{ amount: number | null }>)
        .reduce((a, r) => a + Number(r.amount ?? 0), 0);
      const totalPaid = ((paymentsRows.data ?? []) as Array<{ amount: number | null }>)
        .reduce((a, r) => a + Number(r.amount ?? 0), 0);
      const outstanding = Math.max(0, totalFees - totalPaid);
      return {
        successRate,
        outstanding: Math.round(outstanding * 100) / 100,
        openRequests: openReq.count ?? 0,
      };
    },
  });

  const { data: aops } = useQuery({
    queryKey: ["admin-academic-ops-kpis"],
    queryFn: async () => {
      const yearQ = await supabase.from("academic_years").select("id").eq("is_current", true).maybeSingle();
      const semQ = await supabase.from("semesters").select("id").eq("is_current", true).maybeSingle();
      const yearId = yearQ.data?.id as string | undefined;
      const semId = semQ.data?.id as string | undefined;
      if (!yearId || !semId) {
        return { activeOfferings: 0, activeSections: 0, activeEnrollments: 0, pendingReceipts: 0 };
      }
      const offerings = await supabase
        .from("course_offerings")
        .select("id, status")
        .eq("academic_year_id", yearId)
        .eq("semester_id", semId);
      const offeringIds = (offerings.data ?? []).map((o: any) => o.id);
      const activeOfferings = (offerings.data ?? []).filter((o: any) => o.status === "active").length;
      let activeSections = 0;
      let sectionIds: string[] = [];
      if (offeringIds.length) {
        const secs = await supabase.from("course_sections").select("id, status").in("course_offering_id", offeringIds);
        sectionIds = (secs.data ?? []).map((s: any) => s.id);
        activeSections = (secs.data ?? []).filter((s: any) => s.status === "active").length;
      }
      let activeEnrollments = 0;
      if (sectionIds.length) {
        const en = await supabase
          .from("student_enrollments")
          .select("id", { count: "exact", head: true })
          .in("course_section_id", sectionIds)
          .eq("enrollment_status", "enrolled");
        activeEnrollments = en.count ?? 0;
      }
      const pr = await supabase
        .from("payment_receipts")
        .select("id", { count: "exact", head: true })
        .eq("status", "submitted");
      return { activeOfferings, activeSections, activeEnrollments, pendingReceipts: pr.count ?? 0 };
    },
  });

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

  const sections_: Array<{
    title: string;
    cards: Array<{ label: string; value: number; icon: any; to?: string }>;
  }> = [
    {
      title: "مؤشرات الأداء",
      cards: [
        { label: "الطلاب", value: counts.students, icon: ClipboardList, to: "/admin/reports" },
        { label: "نسبة النجاح %", value: kpis?.successRate ?? 0, icon: TrendingUp, to: "/admin/reports" },
        { label: "الرسوم المستحقة", value: kpis?.outstanding ?? 0, icon: Wallet, to: "/admin/reports" },
        { label: "طلبات مفتوحة", value: kpis?.openRequests ?? 0, icon: FileWarning, to: "/admin/reports" },
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
      title: "إحصائيات أكاديمية",
      cards: [
        { label: "البرامج", value: counts.programs, icon: GraduationCap },
        { label: "المقررات", value: counts.courses, icon: BookOpen },
        { label: "الشعب", value: counts.sections, icon: CalendarDays },
        { label: "الطلاب", value: counts.students, icon: ClipboardList },
      ],
    },
    {
      title: "العمليات الأكاديمية",
      cards: [
        { label: "المقررات المطروحة", value: aops?.activeOfferings ?? 0, icon: CalendarDays, to: "/admin/academic-operations" },
        { label: "الشعب النشطة", value: aops?.activeSections ?? 0, icon: Layers, to: "/admin/academic-operations" },
        { label: "التسجيلات النشطة", value: aops?.activeEnrollments ?? 0, icon: ClipboardList, to: "/admin/academic-operations" },
        { label: "إيصالات قيد المراجعة", value: aops?.pendingReceipts ?? 0, icon: Receipt, to: "/admin/academic-operations" },
      ],
    },
    {
      title: "الجداول الدراسية",
      cards: [
        { label: "الجداول المنشورة", value: scheduleStats?.published ?? 0, icon: CalendarDays, to: "/admin/schedules" },
        { label: "منشورة اليوم", value: scheduleStats?.publishedToday ?? 0, icon: CalendarClock, to: "/admin/schedules" },
        { label: "الشعب غير المجدولة", value: scheduleStats?.unscheduled ?? 0, icon: AlertCircle, to: "/admin/schedules" },
        { label: "القاعات المستخدمة", value: scheduleStats?.roomsUsed ?? 0, icon: DoorOpen, to: "/admin/schedules" },
        { label: "أعضاء لديهم جداول", value: scheduleStats?.facultyWithSchedules ?? 0, icon: Users, to: "/admin/schedules" },
        { label: "إجمالي القاعات", value: scheduleStats?.rooms ?? 0, icon: DoorOpen, to: "/admin/schedules" },
      ],
    },
    {
      title: "الموارد البشرية",
      cards: [
        { label: "أعضاء هيئة التدريس", value: counts.faculty, icon: Users },
        { label: "الموظفون", value: counts.staff, icon: UserCog },
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
    { to: "/admin/course-offerings", label: "إنشاء شعبة", icon: CalendarDays },
    { to: "/admin/enrollments", label: "تسجيل طالب", icon: ClipboardList },
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

      {/* Stats grouped sections */}
      {sections_.map((sec) => (
        <section key={sec.title} className="space-y-3">
          <h2 className="font-display text-base font-bold text-primary">{sec.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sec.cards.map((c) => {
              const Icon = c.icon;
              const inner = (
                <>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">{c.label}</div>
                    <div className="mt-2 font-display text-3xl font-extrabold text-primary">
                      {c.value.toLocaleString("ar-EG")}
                    </div>
                  </div>
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-gold-gradient text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                </>
              );
              const cls = "rounded-xl bg-card border border-border p-5 shadow-card flex items-center justify-between";
              return c.to ? (
                <Link key={c.label} to={c.to} className={cls + " hover:border-gold transition-all"}>
                  {inner}
                </Link>
              ) : (
                <div key={c.label} className={cls}>{inner}</div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Recent Official Documents */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-primary">آخر الوثائق الصادرة</h2>
          <Link to="/admin/documents" className="text-xs font-bold text-primary hover:underline">عرض الكل</Link>
        </div>
        <div className="rounded-xl bg-card border border-border shadow-card overflow-hidden">
          {(!recentDocs || recentDocs.length === 0) ? (
            <div className="p-6 text-center text-sm text-muted-foreground">لا توجد وثائق صادرة بعد.</div>
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
                          <span className="ms-2 text-xs text-muted-foreground">({d.student_profiles.academic_number})</span>
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
    <Link to={to} className={`block rounded-xl border p-5 shadow-card hover:opacity-90 transition ${color}`}>
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5" />
        <span className="rounded-md border bg-white/60 px-2 py-0.5 text-[10px] font-extrabold">{status}</span>
      </div>
      <div className="mt-3 text-sm font-extrabold">{title}</div>
      <div className="mt-1 text-xs font-bold">{primary}</div>
      <div className="text-[11px] opacity-80">{secondary}</div>
    </Link>
  );
}
