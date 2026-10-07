import type { ReactNode } from "react";
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
  CalendarCheck,
  ClipboardCheck,
  ScrollText,
  Inbox,
  ArrowLeft,
  Clock,
  MapPin,
  LayoutGrid,
  type LucideIcon,
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
import { academicRankLabel } from "@/lib/public-site-format";
import { listFacultyDeliverySections } from "@/lib/lecture-execution.functions";

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
      "id, section_code, offering:course_offerings(program:programs(name_ar), level:academic_levels(name), course:courses(code, name_ar)), schedule:class_schedule(schedule_type, status, time_slot:time_slots(day_of_week, start_time, end_time), room:rooms(name_ar, code))",
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
    offering: {
      program: { name_ar: string } | null;
      level: { name: string } | null;
      course: { code: string; name_ar: string } | null;
    } | null;
    schedule: RawSched[] | null;
  };
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    id: r.id,
    section_code: r.section_code,
    course: r.offering?.course ?? null,
    program_name: r.offering?.program?.name_ar ?? null,
    level_name: r.offering?.level?.name ?? null,
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

/** Section heading used across the faculty home: tinted icon, title, optional hint and action. */
function SectionHeading({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-border/70 pb-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gold/15 text-primary-deep">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-extrabold leading-tight text-primary">{title}</h2>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

const ACTION_CARD_CLASS =
  "group flex h-full min-h-[5.5rem] flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ActionCardBody({
  icon: Icon,
  title,
  description,
  cta,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  cta?: string;
}) {
  return (
    <>
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-gradient text-primary-deep shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-extrabold leading-snug text-primary">{title}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-end gap-1 pt-3 text-xs font-bold text-primary-deep">
        {cta ? (
          <span className="rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1">{cta}</span>
        ) : (
          <span className="opacity-70 transition-opacity group-hover:opacity-100">فتح</span>
        )}
        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
      </div>
    </>
  );
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
  const { data: deliverySections = [] } = useQuery({
    queryKey: ["faculty", "lecture-execution", "sections"],
    queryFn: () => listFacultyDeliverySections(),
    enabled: !!profile?.id,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const deliveryBySection = new Map(
    deliverySections.map((section) => [section.course_section_id, section]),
  );
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
      <main className="container mx-auto max-w-5xl px-4 py-6 sm:py-8">
        {isLoading || !profile ? (
          <div className="space-y-4">
            <div className="h-28 rounded-2xl bg-muted animate-pulse" />
            <div className="h-20 rounded-xl bg-muted animate-pulse" />
            <div className="h-40 rounded-xl bg-muted animate-pulse" />
          </div>
        ) : (
          <>
            {/* 1 — Welcome / identity header */}
            <div
              data-testid="faculty-dashboard-header"
              className="relative overflow-hidden rounded-2xl bg-hero-gradient p-5 text-primary-foreground shadow-elegant sm:p-6"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-gold/15 blur-3xl"
              />
              <div className="relative flex flex-wrap items-center gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gold-gradient text-primary-deep shadow-gold sm:h-16 sm:w-16">
                  <User className="h-7 w-7 sm:h-8 sm:w-8" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold tracking-wide text-gold">مرحباً</div>
                  <h1 className="mt-0.5 font-display text-xl font-extrabold leading-snug sm:text-2xl">
                    {profile.full_name_ar}
                  </h1>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-primary-foreground/85">
                    {profile.academic_rank && (
                      <span className="font-semibold">{academicRankLabel(profile.academic_rank)}</span>
                    )}
                    {profile.academic_rank && profile.position_title && (
                      <span className="opacity-50" aria-hidden>
                        ·
                      </span>
                    )}
                    {profile.position_title && <span>{profile.position_title}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {profile.department?.name_ar ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 font-bold">
                      <Building2 className="h-3.5 w-3.5 text-gold" />
                      {profile.department.name_ar}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 font-mono tracking-wider">
                    <IdCard className="h-3.5 w-3.5 text-gold" />
                    {profile.employee_number ?? "—"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 font-bold">
                    <BadgeCheck className="h-3.5 w-3.5 text-gold" />
                    {statusLabel[profile.status] ?? profile.status}
                  </span>
                </div>
              </div>
            </div>

            {/* 2 — Daily operational summary */}
            <div
              data-testid="faculty-daily-summary"
              className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
            >
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <CalendarClock className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-muted-foreground">محاضرات اليوم</div>
                  <div
                    data-testid="faculty-summary-today-sessions"
                    className="font-display text-2xl font-extrabold leading-tight text-primary"
                  >
                    {todaySessions.length}
                  </div>
                </div>
              </div>
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <BookOpen className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-muted-foreground">مقرراتي</div>
                  <div
                    data-testid="faculty-summary-courses"
                    className="font-display text-2xl font-extrabold leading-tight text-primary"
                  >
                    {coursesCount}
                  </div>
                </div>
              </div>
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:col-span-1">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold/15 text-primary-deep">
                  <Inbox className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-muted-foreground">طلبات المعالجة</div>
                  <div
                    data-testid="faculty-summary-processing"
                    className="truncate text-sm font-extrabold leading-6 text-primary"
                  >
                    {processingLabel}
                  </div>
                </div>
              </div>
            </div>

            {/* 3 — My teaching schedule / today's sessions (single section) */}
            <section data-testid="faculty-teaching-schedule" className="mt-7">
              <SectionHeading
                icon={CalendarClock}
                title="جدولي التدريسي"
                hint="محاضراتك المجدولة لهذا اليوم"
                action={
                  <Link
                    to="/faculty-portal/schedule"
                    data-testid="faculty-full-schedule-link"
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm font-bold text-primary transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    عرض الجدول الكامل
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                }
              />

              {teaching.length === 0 ? (
                <div
                  data-testid="faculty-teaching-empty"
                  className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground"
                >
                  لا توجد مجموعات مرتبطة بك حالياً.
                </div>
              ) : todaySessions.length === 0 ? (
                <div
                  data-testid="faculty-teaching-no-today"
                  className="space-y-2 rounded-xl border border-dashed bg-card p-6 text-center"
                >
                  <p className="text-base font-bold text-primary">لا توجد محاضرات اليوم</p>
                  <p className="text-sm text-muted-foreground">
                    لديك {coursesCount} مقرر/مجموعة مسندة — يمكنك مراجعة الجدول الأسبوعي الكامل.
                  </p>
                  <Link
                    to="/faculty-portal/schedule"
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-gold/40 bg-gold/10 px-4 text-sm font-bold text-primary-deep transition-colors hover:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    عرض الجدول الكامل
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </div>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {todaySessions.map((s, i) => (
                    <li
                      key={`${s.sectionId}-${s.start_time}-${i}`}
                      data-testid="faculty-today-session"
                      className="flex gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm"
                    >
                      <div className="flex w-[4.75rem] shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 px-1 py-2 text-primary">
                        <Clock className="mb-1 h-4 w-4 opacity-70" />
                        <span className="font-mono text-sm font-extrabold leading-tight" dir="ltr">
                          {s.start_time.slice(0, 5)}
                        </span>
                        <span className="font-mono text-[11px] leading-tight opacity-70" dir="ltr">
                          {s.end_time.slice(0, 5)}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-[15px] font-extrabold leading-snug text-primary">
                          {s.courseName}
                        </div>
                        <div className="mt-0.5 font-mono text-xs font-bold text-muted-foreground">
                          {s.courseCode}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="rounded-md bg-muted px-2 py-0.5 font-bold">
                            مجموعة {s.sectionCode}
                          </span>
                          <span className="rounded-md border bg-muted/50 px-2 py-0.5">
                            {TYPE_LABELS[s.schedule_type] ?? s.schedule_type}
                          </span>
                          {s.room && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5" />
                              {s.room}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 4 — Grades management */}
            <section data-testid="faculty-grades-section" className="mt-7">
              <LazyMount fallback={<div className="h-40 rounded-xl bg-muted animate-pulse" />}>
                <SectionHeading
                  icon={ClipboardCheck}
                  title="إدارة الدرجات"
                  hint="مكونات الدرجات ورصدها لكل مجموعة مسندة إليك"
                />
                <FacultyGradesManager
                  facultyProfileId={profile.id}
                  sections={teaching.map((t) => ({
                    id: t.id,
                    section_code: t.section_code,
                    course_code: t.course?.code ?? "—",
                    course_name: t.course?.name_ar ?? "—",
                     program_name: t.program_name,
                     level_name: t.level_name,
                     student_count: deliveryBySection.get(t.id)?.student_count,
                  }))}
                />
              </LazyMount>
            </section>

            {/* 5 — Operational actions */}
            <div className="mt-7">
              <SectionHeading icon={LayoutGrid} title="خدماتي" hint="أكثر ما تحتاجه في عملك اليومي" />
            </div>
            <section
              data-testid="faculty-operational-actions"
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              {showProcessingCard && (
                <Link
                  to="/faculty-portal/processing-requests"
                  data-testid="faculty-processing-card"
                  className={ACTION_CARD_CLASS}
                >
                  <ActionCardBody
                    icon={Inbox}
                    title="طلبات المعالجة"
                    description="الطلبات التي تنتظر إجراءك"
                    cta="فتح صندوق المعالجة"
                  />
                </Link>
              )}

              <Link
                to="/faculty-portal/academic-councils"
                data-testid="faculty-councils-card"
                className={ACTION_CARD_CLASS}
              >
                <ActionCardBody
                  icon={ScrollText}
                  title="مجالسي الأكاديمية"
                  description="المجالس والاجتماعات المرتبطة بك"
                  cta="دخول مجالسي الأكاديمية"
                />
              </Link>

              <Link
                to="/faculty-portal/lecture-execution"
                data-testid="faculty-lecture-execution-card"
                className={ACTION_CARD_CLASS}
              >
                <ActionCardBody
                  icon={CalendarCheck}
                  title="تنفيذ المحاضرات"
                  description="خطة المحاضرات المرقمة وتسجيل ما نُفذ وما تعذر"
                />
              </Link>

              {portalFeatures.facultyCourseMaterials && (
                <Link
                  to="/faculty-portal/materials"
                  data-testid="faculty-materials-card"
                  className={ACTION_CARD_CLASS}
                >
                  <ActionCardBody
                    icon={BookOpen}
                    title="موادي التعليمية"
                    description="رفع ونشر محاضرات وملفات المقررات المسندة إليك"
                  />
                </Link>
              )}
            </section>

            {/* 6 — Announcements (after operational actions) */}
            <section data-testid="faculty-announcements-section" className="mt-7">
              <LazyMount fallback={<div className="h-20 rounded-xl bg-muted animate-pulse" />}>
                <AnnouncementsWidget limit={5} compactEmpty />
              </LazyMount>
            </section>

            {/* 7 — Academic profile details */}
            <section data-testid="faculty-profile-details" className="mt-7">
              <SectionHeading icon={GraduationCap} title="بياناتي الأكاديمية" />
              <div className="card-grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                  value={academicRankLabel(profile.academic_rank) ?? "—"}
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

          </>
        )}
      </main>
    </FacultyPortalShell>
  );
}
