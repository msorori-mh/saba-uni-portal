import { createFileRoute, Link } from "@tanstack/react-router";
import { usePagePerf } from "@/lib/perf-probe";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  User,
  IdCard,
  Building2,
  GraduationCap,
  BookOpen,
  BadgeCheck,
  Award,
  CalendarClock,
  ClipboardCheck,
  ScrollText,
  Inbox,
  ArrowLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FacultyGradesManager } from "@/components/portal/FacultyGradesManager";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { StatCard } from "@/components/brand";
import { hasActiveProcessingAssignment } from "@/lib/faculty-portal/processing-access.functions";
import {
  getTodayDayCode,
  getTodaySessions,
  processingAccessSummaryLabel,
  type TeachingSection,
} from "@/lib/faculty-portal/dashboard-schedule";
import { AnnouncementsWidget } from "@/components/communications/AnnouncementsWidget";
import { LazyMount } from "@/components/util/LazyMount";
import { portalFeatures } from "@/lib/portal-features";

type FacultyProfileRow = {
  id: string;
  employee_number: string | null;
  full_name_ar: string;
  full_name_en: string | null;
  academic_rank: string | null;
  position_title: string | null;
  status: string;
  department: { name_ar: string } | null;
  program: { name_ar: string } | null;
};

async function fetchMyFacultyProfile(): Promise<FacultyProfileRow | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("faculty_profiles")
    .select(
      "id, employee_number, full_name_ar, full_name_en, academic_rank, position_title, status, department:departments(name_ar), program:programs(name_ar)",
    )
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as FacultyProfileRow;
}

async function fetchMyTeaching(facultyProfileId: string): Promise<TeachingSection[]> {
  const { data, error } = await supabase
    .from("course_sections")
    .select(
      "id, section_code, offering:course_offerings(course:courses(code, name_ar)), schedule:class_schedule(schedule_type, status, time_slot:time_slots(day_of_week, start_time, end_time), room:rooms(name_ar, code))",
    )
    .eq("faculty_profile_id", facultyProfileId)
    .eq("status", "active");
  if (error) throw error;
  type RawSched = {
    schedule_type: string;
    status: string;
    time_slot: { day_of_week: string; start_time: string; end_time: string } | null;
    room: { name_ar: string; code: string } | null;
  };
  type Raw = {
    id: string;
    section_code: string;
    offering: { course: { code: string; name_ar: string } | null } | null;
    schedule: RawSched[] | null;
  };
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    id: r.id,
    section_code: r.section_code,
    course: r.offering?.course ?? null,
    schedule: (r.schedule ?? [])
      .filter((s) => s.status !== "cancelled" && s.time_slot)
      .map((s) => ({
        day_of_week: s.time_slot!.day_of_week,
        start_time: s.time_slot!.start_time,
        end_time: s.time_slot!.end_time,
        room: s.room?.name_ar ?? s.room?.code ?? null,
        schedule_type: s.schedule_type,
      })),
  }));
}

export const Route = createFileRoute("/faculty-portal/")({
  component: FacultyDashboard,
});

const TYPE_LABELS: Record<string, string> = { lecture: "محاضرة", lab: "عملي", tutorial: "تمارين" };

function FacultyDashboard() {
  usePagePerf("/faculty-portal");
  const { data: profile, isLoading } = useQuery({
    queryKey: ["faculty", "me"],
    queryFn: fetchMyFacultyProfile,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const { data: teaching = [] } = useQuery({
    queryKey: ["faculty", "teaching", profile?.id],
    queryFn: () => fetchMyTeaching(profile!.id),
    enabled: !!profile?.id,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const processingAccessFn = useServerFn(hasActiveProcessingAssignment);
  const { data: processingAccess } = useQuery({
    queryKey: ["faculty-portal", "processing-access"],
    queryFn: () => processingAccessFn({ data: {} }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const showProcessingCard =
    !!processingAccess && (processingAccess.hasAssignment || processingAccess.isAdmin);

  const todayCode = getTodayDayCode();
  const todaySessions = getTodaySessions(teaching, todayCode);
  const coursesCount = teaching.length;
  const processingLabel = processingAccessSummaryLabel(processingAccess);

  const statusLabel: Record<string, string> = {
    active: "نشط",
    on_leave: "في إجازة",
    retired: "متقاعد",
    suspended: "موقوف",
  };

  return (
    <FacultyPortalShell title="بوابة عضو هيئة التدريس">
      <main className="container mx-auto px-4 py-6 sm:py-8 max-w-4xl">
        {isLoading || !profile ? (
          <div className="space-y-4">
            <div className="h-16 rounded-xl bg-muted animate-pulse" />
            <div className="h-14 rounded-xl bg-muted animate-pulse" />
            <div className="h-40 rounded-xl bg-muted animate-pulse" />
          </div>
        ) : (
          <>
            {/* 1 — Compact welcome / identity header */}
            <div
              data-testid="faculty-dashboard-header"
              className="rounded-xl bg-gold-gradient text-primary-deep p-3.5 sm:p-4 shadow-elegant flex items-center gap-3"
            >
              <div className="grid h-11 w-11 sm:h-12 sm:w-12 place-items-center rounded-full bg-primary-deep text-gold shrink-0">
                <User className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                  مرحباً
                </div>
                <h1 className="font-display text-base sm:text-xl font-extrabold truncate">
                  {profile.full_name_ar}
                </h1>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm">
                  {profile.academic_rank && (
                    <span className="font-semibold opacity-90">{profile.academic_rank}</span>
                  )}
                  {profile.academic_rank && profile.position_title && (
                    <span className="opacity-50" aria-hidden>
                      ·
                    </span>
                  )}
                  {profile.position_title && (
                    <span className="opacity-90">{profile.position_title}</span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary-deep/10 px-2 py-0.5 font-mono tracking-wider">
                    <IdCard className="h-3 w-3 opacity-70" />
                    {profile.employee_number ?? "—"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary-deep/10 px-2 py-0.5 font-bold">
                    <BadgeCheck className="h-3 w-3 opacity-70" />
                    {statusLabel[profile.status] ?? profile.status}
                  </span>
                </div>
              </div>
            </div>

            {/* 2 — Daily operational summary */}
            <div
              data-testid="faculty-daily-summary"
              className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2"
            >
              <div className="rounded-lg border bg-card px-3 py-2.5 flex items-center justify-between gap-2 min-w-0">
                <span className="text-[11px] sm:text-xs text-muted-foreground shrink-0">
                  محاضرات اليوم
                </span>
                <span
                  data-testid="faculty-summary-today-sessions"
                  className="font-display font-extrabold text-primary text-base sm:text-lg font-mono"
                >
                  {todaySessions.length}
                </span>
              </div>
              <div className="rounded-lg border bg-card px-3 py-2.5 flex items-center justify-between gap-2 min-w-0">
                <span className="text-[11px] sm:text-xs text-muted-foreground shrink-0">مقرراتي</span>
                <span
                  data-testid="faculty-summary-courses"
                  className="font-display font-extrabold text-primary text-base sm:text-lg font-mono"
                >
                  {coursesCount}
                </span>
              </div>
              <div className="rounded-lg border bg-card px-3 py-2.5 flex items-center justify-between gap-2 min-w-0 sm:col-span-1">
                <span className="text-[11px] sm:text-xs text-muted-foreground shrink-0">
                  طلبات المعالجة
                </span>
                <span
                  data-testid="faculty-summary-processing"
                  className="text-[11px] sm:text-xs font-bold text-primary text-left truncate"
                >
                  {processingLabel}
                </span>
              </div>
            </div>

            {/* 3 — My teaching schedule / today's sessions (single section) */}
            <section data-testid="faculty-teaching-schedule" className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="font-display text-base font-bold text-primary flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-gold shrink-0" /> جدولي التدريسي
                </h2>
                <Link
                  to="/faculty-portal/schedule"
                  data-testid="faculty-full-schedule-link"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-gold transition-colors min-h-10 px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                >
                  عرض الجدول الكامل
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Link>
              </div>

              {teaching.length === 0 ? (
                <div
                  data-testid="faculty-teaching-empty"
                  className="rounded-lg border border-dashed bg-card p-4 text-xs text-muted-foreground text-center"
                >
                  لا توجد مجموعات مرتبطة بك حالياً.
                </div>
              ) : todaySessions.length === 0 ? (
                <div
                  data-testid="faculty-teaching-no-today"
                  className="rounded-lg border border-dashed bg-card p-4 text-center space-y-2"
                >
                  <p className="text-sm font-semibold text-primary">لا توجد محاضرات اليوم</p>
                  <p className="text-xs text-muted-foreground">
                    لديك {coursesCount} مقرر/مجموعة مسندة — يمكنك مراجعة الجدول الأسبوعي الكامل.
                  </p>
                  <Link
                    to="/faculty-portal/schedule"
                    className="inline-flex items-center justify-center gap-1.5 min-h-10 px-3 rounded-md border border-gold/40 bg-gold/10 text-xs font-bold text-primary-deep hover:border-gold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    عرض الجدول الكامل
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : (
                <ul className="space-y-2">
                  {todaySessions.map((s, i) => (
                    <li
                      key={`${s.sectionId}-${s.start_time}-${i}`}
                      data-testid="faculty-today-session"
                      className="rounded-lg border bg-card p-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-mono font-bold text-primary">{s.courseCode}</span>
                          <span className="mx-2 text-muted-foreground">—</span>
                          <span className="font-semibold text-sm break-words">{s.courseName}</span>
                        </div>
                        <span className="text-[10px] sm:text-xs font-bold bg-muted px-2 py-0.5 rounded shrink-0">
                          مجموعة {s.sectionCode}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-bold">
                          {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                        </span>
                        {s.room && (
                          <span className="text-muted-foreground">• {s.room}</span>
                        )}
                        <span className="ms-auto text-[10px] bg-muted/50 border px-1.5 py-0.5 rounded">
                          {TYPE_LABELS[s.schedule_type] ?? s.schedule_type}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 4 — Grades management */}
            <section data-testid="faculty-grades-section" className="mt-5">
              <LazyMount fallback={<div className="h-40 rounded-lg bg-muted animate-pulse" />}>
                <h2 className="font-display text-base font-bold text-primary mb-3 flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-gold" /> إدارة الدرجات
                </h2>
                <FacultyGradesManager
                  facultyProfileId={profile.id}
                  sections={teaching.map((t) => ({
                    id: t.id,
                    section_code: t.section_code,
                    course_code: t.course?.code ?? "—",
                    course_name: t.course?.name_ar ?? "—",
                  }))}
                />
              </LazyMount>
            </section>

            {/* 5 — Operational actions */}
            <section
              data-testid="faculty-operational-actions"
              className="mt-5 grid gap-2 sm:grid-cols-2"
            >
              {showProcessingCard && (
                <Link
                  to="/faculty-portal/processing-requests"
                  data-testid="faculty-processing-card"
                  className="block rounded-xl border-2 border-gold/30 bg-card p-3.5 hover:border-gold hover:shadow-card transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[4.5rem]"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
                      <Inbox className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-primary text-sm">طلبات المعالجة</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        الطلبات التي تنتظر إجراءك
                      </div>
                      <span className="mt-1.5 inline-flex items-center rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-bold text-primary-deep">
                        فتح صندوق المعالجة
                      </span>
                    </div>
                  </div>
                </Link>
              )}

              <Link
                to="/faculty-portal/academic-councils"
                data-testid="faculty-councils-card"
                className="block rounded-xl border-2 border-gold/30 bg-card p-3.5 hover:border-gold hover:shadow-card transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[4.5rem]"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
                    <ScrollText className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-primary text-sm">مجالسي الأكاديمية</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      المجالس والاجتماعات المرتبطة بك
                    </div>
                    <span className="mt-1.5 inline-flex items-center rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-bold text-primary-deep">
                      دخول مجالسي الأكاديمية
                    </span>
                  </div>
                </div>
              </Link>

              <Link
                to="/faculty-portal/lecture-execution"
                data-testid="faculty-lecture-execution-card"
                className="block rounded-xl border-2 border-gold/30 bg-card p-3.5 hover:border-gold hover:shadow-card transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[4.5rem] sm:col-span-2"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
                    <CalendarCheck className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-primary text-sm">متابعة تنفيذ المحاضرات</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      خطة المحاضرات المرقمة وتسجيل ما نُفذ وما تعذر
                    </div>
                  </div>
                </div>
              </Link>

              {portalFeatures.facultyCourseMaterials && (
                <Link
                  to="/faculty-portal/materials"
                  data-testid="faculty-materials-card"
                  className="block rounded-xl border-2 border-gold/30 bg-card p-3.5 hover:border-gold hover:shadow-card transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[4.5rem] sm:col-span-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-primary text-sm">موادي التعليمية</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        رفع ونشر محاضرات وملفات المقررات المسندة إليك
                      </div>
                    </div>
                  </div>
                </Link>
              )}
            </section>

            {/* 6 — Announcements (after operational actions) */}
            <section data-testid="faculty-announcements-section" className="mt-5">
              <LazyMount fallback={<div className="h-20 rounded-lg bg-muted animate-pulse" />}>
                <AnnouncementsWidget limit={5} compactEmpty />
              </LazyMount>
            </section>

            {/* 7 — Academic profile details */}
            <section data-testid="faculty-profile-details" className="mt-5">
              <h2 className="font-display text-base font-bold text-primary mb-3">
                بياناتي الأكاديمية
              </h2>
              <div className="card-grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <StatCard
                  icon={IdCard}
                  label="رقم الموظف"
                  value={
                    <span className="font-mono tracking-wider text-sm">
                      {profile.employee_number ?? "—"}
                    </span>
                  }
                  density="compact"
                />
                <StatCard
                  icon={BadgeCheck}
                  label="الحالة"
                  value={statusLabel[profile.status] ?? profile.status}
                  density="compact"
                />
                <StatCard
                  icon={Building2}
                  label="القسم"
                  value={profile.department?.name_ar ?? "—"}
                  density="compact"
                />
                <StatCard
                  icon={GraduationCap}
                  label="البرنامج"
                  value={profile.program?.name_ar ?? "—"}
                  density="compact"
                />
                <StatCard
                  icon={Award}
                  label="الدرجة العلمية"
                  value={profile.academic_rank ?? "—"}
                  density="compact"
                />
                <StatCard
                  icon={BookOpen}
                  label="الصفة/المنصب"
                  value={profile.position_title ?? "—"}
                  density="compact"
                />
              </div>
            </section>

            <div className="mt-5 rounded-xl border border-dashed border-border bg-card p-3 text-xs text-muted-foreground text-center">
              ستتوفر الخدمات الأكاديمية الأخرى (الحضور، التقارير) في المراحل القادمة.
            </div>
          </>
        )}
      </main>
    </FacultyPortalShell>
  );
}
