import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { usePagePerf } from "@/lib/perf-probe";
import { useQuery } from "@tanstack/react-query";
import {
  User,
  IdCard,
  Building2,
  GraduationCap,
  BadgeCheck,
  Loader2,
  CalendarRange,
  BookMarked,
  Layers,
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  Award,
  FileText,
} from "lucide-react";
import { UnofficialTranscript } from "@/components/portal/UnofficialTranscript";
import { StudentRequestsPortalSummary } from "@/components/portal/StudentRequestsPortalSummary";
import { StudentFinanceSection } from "@/components/portal/StudentFinanceSection";
import { StudentDocumentsSection } from "@/components/portal/StudentDocumentsSection";
import { NotificationsBell } from "@/components/portal/NotificationsBell";
import { PortalShell } from "@/components/portal/PortalShell";
import { StatCard } from "@/components/brand";
import { AnnouncementsWidget } from "@/components/communications/AnnouncementsWidget";
import { LazyMount } from "@/components/util/LazyMount";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { portalFeatures } from "@/lib/portal-features";
import { useStudentLogout } from "@/lib/use-student-logout";
import {
import { gradeArabicLabel, normalizeOfficialResult } from "@/lib/academic/grading-scale";
  resolveCanonicalCurrentFourthLevelEligibility,
  shouldShowStudentGpNav,
  type AcademicStatusTimestampRow,
} from "@/lib/graduation-projects/eligibility";

const STALE_LONG = 5 * 60 * 1000;
const STALE_MED = 60 * 1000;
const STALE_SHORT = 30 * 1000;

function SectionSkeleton({ h = 120 }: { h?: number }) {
  return <Skeleton className="w-full rounded-lg" style={{ height: h }} />;
}

type StudentRow = {
  id: string;
  academic_number: string;
  full_name_ar: string;
  full_name_en: string | null;
  email: string | null;
  status: string;
  program_id: string | null;
  department: { name_ar: string } | null;
  program: { name_ar: string } | null;
};

type AcademicStatus = {
  enrollment_status: string;
  academic_year_id: string;
  semester_id: string;
  level_id: string;
  academic_year: { name: string } | null;
  semester: { name: string } | null;
  level: { name: string; level_number: number } | null;
};

type ScheduleSlot = {
  day_of_week: string;
  start_time: string;
  end_time: string;
  room: string | null;
  schedule_type: string;
};
type ScheduleRow = {
  section_id: string;
  section_code: string;
  course_code: string;
  course_name: string;
  faculty_name: string | null;
  slots: ScheduleSlot[];
};

type MyEnrollmentRow = {
  id: string;
  enrollment_status: string;
  section_code: string;
  course_code: string;
  course_name: string;
  faculty_name: string | null;
  slots: ScheduleSlot[];
};

type RawSched = {
  schedule_type: string;
  status: string;
  time_slot: { day_of_week: string; start_time: string; end_time: string } | null;
  room: { name_ar: string; code: string } | null;
};

function flattenSched(raws: RawSched[] | null | undefined): ScheduleSlot[] {
  return (raws ?? [])
    .filter((s) => s.status !== "cancelled" && s.time_slot)
    .map((s) => ({
      day_of_week: s.time_slot!.day_of_week,
      start_time: s.time_slot!.start_time,
      end_time: s.time_slot!.end_time,
      room: s.room?.name_ar ?? s.room?.code ?? null,
      schedule_type: s.schedule_type,
    }));
}

async function fetchMyEnrollments(studentId: string): Promise<MyEnrollmentRow[]> {
  const { data, error } = await supabase
    .from("student_enrollments")
    .select(
      "id, enrollment_status, section:course_sections(id, section_code, faculty:faculty_profiles(full_name_ar), offering:course_offerings(course:courses(code, name_ar)), schedule:class_schedule(schedule_type, status, time_slot:time_slots(day_of_week, start_time, end_time), room:rooms(name_ar, code)))",
    )
    .eq("student_profile_id", studentId);
  if (error) throw error;
  type Raw = {
    id: string;
    enrollment_status: string;
    section: {
      section_code: string;
      faculty: { full_name_ar: string } | null;
      offering: { course: { code: string; name_ar: string } | null } | null;
      schedule: RawSched[] | null;
    } | null;
  };
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    id: r.id,
    enrollment_status: r.enrollment_status,
    section_code: r.section?.section_code ?? "—",
    course_code: r.section?.offering?.course?.code ?? "—",
    course_name: r.section?.offering?.course?.name_ar ?? "—",
    faculty_name: r.section?.faculty?.full_name_ar ?? null,
    slots: flattenSched(r.section?.schedule),
  }));
}

async function fetchMyProfile(): Promise<StudentRow | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("student_profiles")
    .select(
      "id, academic_number, full_name_ar, full_name_en, email, status, program_id, department:departments(name_ar), program:programs(name_ar)",
    )
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as StudentRow;
}

async function fetchMyAcademicStatus(studentId: string): Promise<AcademicStatus | null> {
  // Canonical ordering matches backend student_is_current_fourth_academic_level:
  // updated_at DESC NULLS LAST, created_at DESC. Ambiguous top ties yield null
  // so GP nav never flashes for an ineligible / ambiguous student.
  const { data, error } = await supabase
    .from("student_academic_status")
    .select(
      "id, enrollment_status, academic_year_id, semester_id, level_id, created_at, updated_at, academic_year:academic_years(name), semester:semesters(name), level:academic_levels(name, level_number)",
    )
    .eq("student_profile_id", studentId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as (AcademicStatus & AcademicStatusTimestampRow)[];
  const resolved = resolveCanonicalCurrentFourthLevelEligibility(rows);
  if (!resolved.current) return null;
  return resolved.current as unknown as AcademicStatus;
}

async function fetchMySchedule(
  programId: string,
  yearId: string,
  semId: string,
  levelId: string,
): Promise<ScheduleRow[]> {
  const { data: offerings, error: oErr } = await supabase
    .from("course_offerings")
    .select("id, course:courses(code, name_ar)")
    .eq("program_id", programId)
    .eq("academic_year_id", yearId)
    .eq("semester_id", semId)
    .eq("level_id", levelId)
    .eq("status", "active");
  if (oErr) throw oErr;
  const offeringIds = (offerings ?? []).map((o: { id: string }) => o.id);
  if (offeringIds.length === 0) return [];
  const { data: sections, error: sErr } = await supabase
    .from("course_sections")
    .select(
      "id, section_code, course_offering_id, faculty:faculty_profiles(full_name_ar), schedule:class_schedule(schedule_type, status, time_slot:time_slots(day_of_week, start_time, end_time), room:rooms(name_ar, code))",
    )
    .in("course_offering_id", offeringIds)
    .eq("status", "active");
  if (sErr) throw sErr;
  type RawOff = { id: string; course: { code: string; name_ar: string } | null };
  type RawSec = {
    id: string;
    section_code: string;
    course_offering_id: string;
    faculty: { full_name_ar: string } | null;
    schedule: RawSched[] | null;
  };
  const offMap = new Map((offerings as unknown as RawOff[]).map((o) => [o.id, o.course]));
  return ((sections ?? []) as unknown as RawSec[]).map((s) => {
    const c = offMap.get(s.course_offering_id);
    return {
      section_id: s.id,
      section_code: s.section_code,
      course_code: c?.code ?? "—",
      course_name: c?.name_ar ?? "—",
      faculty_name: s.faculty?.full_name_ar ?? null,
      slots: flattenSched(s.schedule),
    };
  });
}

/** Compact readable value for long department/program names inside StatCard. */
function InfoValue({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <span
      className={`block text-sm sm:text-base font-extrabold leading-snug break-words text-balance ${mono ? "font-en tracking-wider" : ""}`}
    >
      {children}
    </span>
  );
}

const SERVICE_LINKS = [
  {
    to: "/student/graduation-projects" as const,
    title: "مشاريع التخرج",
    desc: "الفريق والمقترح والتقدم والمناقشة.",
    Icon: GraduationCap,
  },
  {
    to: "/student/schedule" as const,
    title: "جدولي الدراسي الأسبوعي",
    desc: "المحاضرات المعتمدة هذا الفصل.",
    Icon: CalendarClock,
  },
  {
    to: "/student/study-plan" as const,
    title: "الخطة الدراسية",
    desc: "تصفح الخطة حسب المستوى والفصل.",
    Icon: BookOpen,
  },
  // بطاقة «تقدمي الأكاديمي» مخفية حالياً بناءً على طلب الإدارة.

  {
    to: "/student/requests" as const,
    title: "الخدمات الطلابية",
    desc: "تقديم ومتابعة الخدمات الطلابية.",
    Icon: FileText,
  },
  {
    to: "/student/reports" as const,
    title: "تقاريري",
    desc: "ملخص أكاديمي وطلبات ووثائق ذاتية فقط.",
    Icon: FileText,
  },
  ...(portalFeatures.studentCourseMaterials
    ? ([{
        to: "/student/materials" as const,
        title: "المواد التعليمية",
        desc: "محاضرات وملفات المقررات.",
        Icon: BookOpen,
      }] as const)
    : []),
  ...(portalFeatures.studentGraduatesAffairs
    ? ([{
        to: "/student/graduates-affairs" as const,
        title: "شؤون الخريجين",
        desc: "ملف الخريج والخدمات الذاتية بعد التخرج.",
        Icon: GraduationCap,
      }] as const)
    : []),
] as const;

export const Route = createFileRoute("/student/")({
  component: StudentDashboard,
});

function StudentDashboard() {
  usePagePerf("/student");
  const navigate = useNavigate();
  const handleLogout = useStudentLogout();

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (hash === "student-requests" || hash === "requests") {
      navigate({ to: "/student/requests", replace: true });
    }
  }, [navigate]);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["student", "me"],
    queryFn: fetchMyProfile,
    staleTime: STALE_LONG,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const { data: acad } = useQuery({
    queryKey: ["student", "academic-status", profile?.id],
    queryFn: () => fetchMyAcademicStatus(profile!.id),
    enabled: !!profile?.id,
    staleTime: STALE_LONG,
    refetchOnWindowFocus: false,
  });
  const { data: schedule = [] } = useQuery({
    queryKey: [
      "student",
      "schedule",
      profile?.program_id,
      acad?.academic_year_id,
      acad?.semester_id,
      acad?.level_id,
    ],
    queryFn: () =>
      fetchMySchedule(
        profile!.program_id!,
        acad!.academic_year_id,
        acad!.semester_id,
        acad!.level_id,
      ),
    enabled:
      !!profile?.program_id && !!acad?.academic_year_id && !!acad?.semester_id && !!acad?.level_id,
    staleTime: STALE_MED,
    refetchOnWindowFocus: false,
  });
  const { data: myEnrollments = [] } = useQuery({
    queryKey: ["student", "my-enrollments", profile?.id],
    queryFn: () => fetchMyEnrollments(profile!.id),
    enabled: !!profile?.id && portalFeatures.studentRegisteredCourses,
    staleTime: STALE_MED,
    refetchOnWindowFocus: false,
  });

  const ACADEMIC_NUMBER_LABEL = "الرقم الأكاديمي";

  const statusLabel: Record<string, string> = {
    active: "منتظم",
    suspended: "موقوف قيد",
    graduated: "خريج",
    withdrawn: "منسحب",
  };

  return (
    <PortalShell
      title="بوابة الطالب"
      actions={<NotificationsBell seeAllHref="/student/notifications" />}
      onLogout={handleLogout}
    >
      <main className="container mx-auto px-4 py-8 max-w-5xl" dir="rtl">
        {isLoading || !profile ? (
          <>
            <Skeleton className="h-20 w-full rounded-xl" />
            <div className="mt-5 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl bg-gold-gradient text-primary-deep p-4 shadow-elegant flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-primary-deep text-gold shrink-0">
                <User className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                  مرحباً
                </div>
                <h1 className="font-display text-lg sm:text-xl font-extrabold truncate">
                  {profile.full_name_ar}
                </h1>
                {profile.full_name_en && (
                  <div className="text-xs opacity-80 truncate">{profile.full_name_en}</div>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
              <StatCard
                icon={IdCard}
                label={ACADEMIC_NUMBER_LABEL}
                value={<InfoValue mono>{profile.academic_number}</InfoValue>}
                density="compact"
                className="h-full"
              />
              <StatCard
                icon={BadgeCheck}
                label="الحالة"
                value={<InfoValue>{statusLabel[profile.status] ?? profile.status}</InfoValue>}
                density="compact"
                className="h-full"
              />
              <StatCard
                icon={Building2}
                label="القسم"
                value={<InfoValue>{profile.department?.name_ar ?? "—"}</InfoValue>}
                density="compact"
                className="h-full"
              />
              <StatCard
                icon={GraduationCap}
                label="البرنامج"
                value={<InfoValue>{profile.program?.name_ar ?? "—"}</InfoValue>}
                density="compact"
                className="h-full"
              />
            </div>

            <div className="mt-4 grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
              {SERVICE_LINKS.filter((link) => {
                if (link.to === "/student/graduates-affairs") {
                  // Presentation only — backend graduate-self RPC remains authoritative.
                  // The graduate surface belongs to graduates only (status = graduated).
                  return profile.status === "graduated";
                }
                if (link.to !== "/student/graduation-projects") return true;
                // Presentation only — backend L4 predicate remains authoritative.
                // Hide while loading / ambiguous / non-L4 (no transient GP link).
                return shouldShowStudentGpNav(
                  resolveCanonicalCurrentFourthLevelEligibility(
                    acad ? [acad as AcademicStatusTimestampRow] : [],
                  ).eligible,
                );
              }).map(({ to, title, desc, Icon }) => (

                <Link
                  key={to}
                  to={to}
                  className="flex h-full flex-row items-start gap-3 rounded-xl border-2 border-gold/30 bg-card p-3 hover:border-gold hover:shadow-card transition-all"
                >
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-primary text-sm leading-snug">{title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground leading-5">{desc}</div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-6">
              <h2 className="font-display text-base font-bold text-primary mb-3 flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-gold" /> الوضع الأكاديمي الحالي
              </h2>
              <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
                <StatCard
                  icon={CalendarRange}
                  label="السنة الأكاديمية"
                  value={<InfoValue>{acad?.academic_year?.name ?? "—"}</InfoValue>}
                  density="compact"
                  className="h-full"
                />
                <StatCard
                  icon={BookMarked}
                  label="الفصل الحالي"
                  value={<InfoValue>{acad?.semester?.name ?? "—"}</InfoValue>}
                  density="compact"
                  className="h-full"
                />
                <StatCard
                  icon={Layers}
                  label="المستوى"
                  value={<InfoValue>{acad?.level?.name ?? "—"}</InfoValue>}
                  density="compact"
                  className="h-full"
                />
                <StatCard
                  icon={BadgeCheck}
                  label="حالة التسجيل"
                  value={
                    <InfoValue>
                      {statusLabel[acad?.enrollment_status ?? ""] ?? acad?.enrollment_status ?? "—"}
                    </InfoValue>
                  }
                  density="compact"
                  className="h-full"
                />
              </div>
            </div>

            {portalFeatures.studentRegisteredCourses && (
              <LazyMount
                fallback={
                  <div className="mt-6">
                    <SectionSkeleton h={140} />
                  </div>
                }
              >
                <MyEnrollmentsSection rows={myEnrollments} />
              </LazyMount>
            )}

            <LazyMount
              fallback={
                <div className="mt-6">
                  <SectionSkeleton h={140} />
                </div>
              }
            >
              <MyGradesSection studentProfileId={profile.id} />
            </LazyMount>

            {portalFeatures.studentUnofficialTranscript && (
              <LazyMount
                fallback={
                  <div className="mt-6">
                    <SectionSkeleton h={160} />
                  </div>
                }
              >
                <div className="mt-6">
                  <h2 className="font-display text-base font-bold text-primary mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gold" /> السجل الأكاديمي غير الرسمي
                  </h2>
                  <UnofficialTranscript studentProfileId={profile.id} />
                </div>
              </LazyMount>
            )}

            <LazyMount
              fallback={
                <div className="mt-6">
                  <SectionSkeleton h={120} />
                </div>
              }
            >
              <div className="mt-6">
                <AnnouncementsWidget limit={3} />
              </div>
            </LazyMount>

            <LazyMount
              fallback={
                <div className="mt-6">
                  <SectionSkeleton h={140} />
                </div>
              }
            >
              <StudentRequestsPortalSummary />
            </LazyMount>

            {portalFeatures.studentFinance && (
              <LazyMount
                fallback={
                  <div className="mt-6">
                    <SectionSkeleton h={140} />
                  </div>
                }
              >
                <StudentFinanceSection studentProfileId={profile.id} />
              </LazyMount>
            )}

            <LazyMount
              fallback={
                <div className="mt-6">
                  <SectionSkeleton h={140} />
                </div>
              }
            >
              <StudentDocumentsSection studentProfileId={profile.id} />
            </LazyMount>

            <LazyMount
              fallback={
                <div className="mt-6">
                  <SectionSkeleton h={160} />
                </div>
              }
            >
              <ScheduleSection rows={schedule} />
            </LazyMount>
          </>
        )}
      </main>
    </PortalShell>
  );
}

const DAY_LABELS: Record<string, string> = {
  saturday: "السبت",
  sunday: "الأحد",
  monday: "الإثنين",
  tuesday: "الثلاثاء",
  wednesday: "الأربعاء",
  thursday: "الخميس",
  friday: "الجمعة",
};
const TYPE_LABELS: Record<string, string> = { lecture: "محاضرة", lab: "عملي", tutorial: "تمارين" };
const DAY_ORDER = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];

function ScheduleSection({ rows }: { rows: ScheduleRow[] }) {
  if (!rows || rows.length === 0) return null;
  type Flat = {
    day: string;
    start: string;
    end: string;
    room: string | null;
    type: string;
    course: string;
    section: string;
    faculty: string | null;
  };
  const flat: Flat[] = [];
  for (const r of rows) {
    for (const s of r.slots) {
      flat.push({
        day: s.day_of_week,
        start: s.start_time,
        end: s.end_time,
        room: s.room,
        type: s.schedule_type,
        course: `${r.course_code} — ${r.course_name}`,
        section: r.section_code,
        faculty: r.faculty_name,
      });
    }
  }
  const byDay = new Map<string, Flat[]>();
  for (const d of DAY_ORDER) byDay.set(d, []);
  for (const f of flat) byDay.get(f.day)?.push(f);

  return (
    <div className="mt-6">
      <h2 className="font-display text-base font-bold text-primary mb-3 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-gold" /> الجدول الدراسي العام
      </h2>
      <div className="space-y-2">
        {DAY_ORDER.map((d) => {
          const items = (byDay.get(d) ?? []).sort((a, b) => a.start.localeCompare(b.start));
          if (items.length === 0) return null;
          return (
            <div key={d} className="rounded-lg border bg-card overflow-hidden">
              <div className="px-3 py-1.5 bg-muted/40 text-xs font-bold text-primary border-b">
                {DAY_LABELS[d]}
              </div>
              <div className="divide-y">
                {items.map((it, i) => (
                  <div key={i} className="p-2.5 flex items-center gap-2 text-xs">
                    <span className="font-mono bg-muted px-1.5 py-0.5 rounded">
                      {it.start.slice(0, 5)}-{it.end.slice(0, 5)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{it.course}</div>
                      <div className="text-[11px] text-muted-foreground">
                        مجموعة دراسية {it.section}
                        {it.faculty && <> • {it.faculty}</>}
                        {it.room && <> • {it.room}</>}
                      </div>
                    </div>
                    <span className="text-[10px] border bg-muted/40 px-1.5 py-0.5 rounded shrink-0">
                      {TYPE_LABELS[it.type] ?? it.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MyEnrollmentsSection({ rows }: { rows: MyEnrollmentRow[] }) {
  const statusLabel: Record<string, { text: string; cls: string }> = {
    enrolled: { text: "مُسجَّل", cls: "bg-emerald-100 text-emerald-800" },
    dropped: { text: "محذوف", cls: "bg-rose-100 text-rose-800" },
    completed: { text: "مكتمل", cls: "bg-blue-100 text-blue-800" },
  };
  return (
    <div className="mt-6">
      <h2 className="font-display text-base font-bold text-primary mb-3 flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-gold" /> مقرراتي المسجلة
      </h2>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-4 text-xs text-muted-foreground text-center">
          لم يتم تسجيلك في أي مجموعة دراسية بعد. تواصل مع شؤون الطلاب.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const st = statusLabel[r.enrollment_status] ?? {
              text: r.enrollment_status,
              cls: "bg-muted",
            };
            return (
              <div key={r.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-primary">{r.course_code}</span>
                    <span className="mx-2 text-muted-foreground">—</span>
                    <span className="font-semibold text-sm">{r.course_name}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${st.cls}`}>
                    {st.text}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="bg-muted px-1.5 py-0.5 rounded">
                    مجموعة دراسية {r.section_code}
                  </span>
                  {r.faculty_name && <span>• {r.faculty_name}</span>}
                </div>
                {r.slots.length > 0 && (
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {r.slots.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1 text-[11px]"
                      >
                        <span className="font-bold">
                          {DAY_LABELS[s.day_of_week] ?? s.day_of_week}
                        </span>
                        <span className="font-mono">
                          {s.start_time.slice(0, 5)}-{s.end_time.slice(0, 5)}
                        </span>
                        {s.room && <span className="text-muted-foreground">• {s.room}</span>}
                        <span className="ms-auto text-[10px] bg-card border px-1.5 py-0.5 rounded">
                          {TYPE_LABELS[s.schedule_type] ?? s.schedule_type}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MyGradesSection({ studentProfileId }: { studentProfileId: string }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["student", "grades", studentProfileId],
    queryFn: async () => {
      const { data: enr, error: e1 } = await supabase
        .from("student_enrollments")
        .select(
          "id, course_section_id, section:course_sections(section_code, offering:course_offerings(course:courses(code, name_ar)))",
        )
        .eq("student_profile_id", studentProfileId);
      if (e1) throw e1;
      type EnRaw = {
        id: string;
        course_section_id: string;
        section: {
          section_code: string;
          offering: { course: { code: string; name_ar: string } | null } | null;
        } | null;
      };
      const enrollments = (enr ?? []) as unknown as EnRaw[];
      if (enrollments.length === 0) return [];
      const { data: gs, error: e2 } = await sb
        .from("student_grades")
        .select("id, student_enrollment_id, grade_component_id, score, status")
        .in(
          "student_enrollment_id",
          enrollments.map((e) => e.id),
        )
        .eq("status", "approved");
      if (e2) throw e2;
      type GR = {
        id: string;
        student_enrollment_id: string;
        grade_component_id: string;
        score: number;
        status: string;
      };
      const grades = (gs ?? []) as GR[];
      if (grades.length === 0) return [];
      const sectionIds = Array.from(new Set(enrollments.map((e) => e.course_section_id)));
      const { data: cs, error: e3 } = await sb
        .from("grade_components")
        .select("id, course_section_id, name, max_score, sort_order")
        .in("course_section_id", sectionIds)
        .order("sort_order");
      if (e3) throw e3;
      type CR = { id: string; course_section_id: string; name: string; max_score: number };
      const comps = (cs ?? []) as CR[];
      return enrollments
        .map((e) => {
          const myComps = comps.filter((c) => c.course_section_id === e.course_section_id);
          const myGrades = grades.filter((g) => g.student_enrollment_id === e.id);
          if (myGrades.length === 0) return null;
          const totalMax = myComps.reduce((s, c) => s + Number(c.max_score), 0);
          const total = myGrades.reduce((s, g) => s + Number(g.score), 0);
          return {
            enrollmentId: e.id,
            courseCode: e.section?.offering?.course?.code ?? "—",
            courseName: e.section?.offering?.course?.name_ar ?? "—",
            sectionCode: e.section?.section_code ?? "—",
            total,
            totalMax,
            percentage: totalMax > 0 ? Math.round((total / totalMax) * 1000) / 10 : 0,
            details: myComps.map((c) => ({
              name: c.name,
              max: Number(c.max_score),
              score: Number(myGrades.find((g) => g.grade_component_id === c.id)?.score ?? 0),
            })),
          };
        })
        .filter(Boolean) as Array<{
        enrollmentId: string;
        courseCode: string;
        courseName: string;
        sectionCode: string;
        total: number;
        totalMax: number;
        percentage: number;
        details: { name: string; max: number; score: number }[];
      }>;
    },
    staleTime: STALE_SHORT,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="mt-6">
      <h2 className="font-display text-base font-bold text-primary mb-3 flex items-center gap-2">
        <Award className="h-4 w-4 text-gold" /> درجاتي
      </h2>
      {isLoading ? (
        <div className="rounded-lg border bg-card p-4 text-center">
          <Loader2 className="inline h-4 w-4 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-4 text-xs text-muted-foreground text-center">
          لا توجد درجات معتمدة حالياً.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.enrollmentId} className="rounded-lg border bg-card p-3">
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-mono font-bold text-primary">{r.courseCode}</span>
                  <span className="mx-2 text-muted-foreground">—</span>
                  <span className="font-semibold text-sm">{r.courseName}</span>
                </div>
                <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded">
                  مجموعة دراسية {r.sectionCode}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-sm">
                <span className="font-mono font-extrabold text-primary">
                  {r.total}/{r.totalMax}
                </span>
                <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                  {normalizeOfficialResult(r.percentage) ?? 0}%
                </span>
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-bold">
                  {gradeArabicLabel(r.percentage) ?? "—"}
                </span>
              </div>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                {r.details.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded border bg-muted/30 px-2 py-1 text-xs"
                  >
                    <span>{d.name}</span>
                    <span className="font-mono">
                      <b>{d.score}</b>
                      <span className="text-muted-foreground">/{d.max}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
