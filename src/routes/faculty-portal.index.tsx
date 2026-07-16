import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { usePagePerf } from "@/lib/perf-probe";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { User, IdCard, Building2, GraduationCap, BookOpen, BadgeCheck, Award, Loader2, CalendarClock, Users2, ChevronDown, ChevronUp, ClipboardCheck, ScrollText, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FacultyGradesManager } from "@/components/portal/FacultyGradesManager";
import { NotificationsBell } from "@/components/portal/NotificationsBell";
import { PortalShell } from "@/components/portal/PortalShell";
import { StatCard } from "@/components/brand";
import { hasActiveProcessingAssignment } from "@/lib/faculty-portal/processing-access.functions";
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

type TeachingRow = {
  id: string;
  section_code: string;
  course: { code: string; name_ar: string } | null;
  schedule: { day_of_week: string; start_time: string; end_time: string; room: string | null; schedule_type: string }[];
};

async function fetchMyFacultyProfile(): Promise<FacultyProfileRow | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("faculty_profiles")
    .select("id, employee_number, full_name_ar, full_name_en, academic_rank, position_title, status, department:departments(name_ar), program:programs(name_ar)")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as FacultyProfileRow;
}

async function fetchMyTeaching(facultyProfileId: string): Promise<TeachingRow[]> {
  const { data, error } = await supabase
    .from("course_sections")
    .select("id, section_code, offering:course_offerings(course:courses(code, name_ar)), schedule:class_schedule(schedule_type, status, time_slot:time_slots(day_of_week, start_time, end_time), room:rooms(name_ar, code))")
    .eq("faculty_profile_id", facultyProfileId)
    .eq("status", "active");
  if (error) throw error;
  type RawSched = { schedule_type: string; status: string; time_slot: { day_of_week: string; start_time: string; end_time: string } | null; room: { name_ar: string; code: string } | null };
  type Raw = { id: string; section_code: string; offering: { course: { code: string; name_ar: string } | null } | null; schedule: RawSched[] | null };
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    id: r.id, section_code: r.section_code,
    course: r.offering?.course ?? null,
    schedule: (r.schedule ?? []).filter((s) => s.status !== "cancelled" && s.time_slot).map((s) => ({
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

const DAY_LABELS: Record<string, string> = {
  saturday: "السبت", sunday: "الأحد", monday: "الإثنين", tuesday: "الثلاثاء",
  wednesday: "الأربعاء", thursday: "الخميس", friday: "الجمعة",
};
const TYPE_LABELS: Record<string, string> = { lecture: "محاضرة", lab: "عملي", tutorial: "تمارين" };

function FacultyDashboard() {
  usePagePerf("/faculty-portal");
  const navigate = useNavigate();
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/portal-login", replace: true });
  };

  const statusLabel: Record<string, string> = {
    active: "نشط", on_leave: "في إجازة", retired: "متقاعد", suspended: "موقوف",
  };

  return (
    <PortalShell
      title="بوابة عضو هيئة التدريس"
      actions={<NotificationsBell />}
      onLogout={handleLogout}
    >
      <main className="container mx-auto px-4 py-10 max-w-4xl">
        {isLoading || !profile ? (
          <div className="space-y-5">
            <div className="h-20 rounded-xl bg-muted animate-pulse" />
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-gold-gradient text-primary-deep p-4 shadow-elegant flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-primary-deep text-gold shrink-0">
                <User className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">مرحباً</div>
                <h1 className="font-display text-lg sm:text-xl font-extrabold truncate">{profile.full_name_ar}</h1>
                {profile.full_name_en && <div className="text-xs opacity-80 truncate">{profile.full_name_en}</div>}
              </div>
            </div>

            <div className="mt-5 card-grid sm:grid-cols-2">
              <StatCard icon={IdCard} label="رقم الموظف" value={<span className="font-mono tracking-wider">{profile.employee_number ?? "—"}</span>} density="compact" />
              <StatCard icon={BadgeCheck} label="الحالة" value={statusLabel[profile.status] ?? profile.status} density="compact" />
              <StatCard icon={Building2} label="القسم" value={profile.department?.name_ar ?? "—"} density="compact" />
              <StatCard icon={GraduationCap} label="البرنامج" value={profile.program?.name_ar ?? "—"} density="compact" />
              <StatCard icon={Award} label="الدرجة العلمية" value={profile.academic_rank ?? "—"} density="compact" />
              <StatCard icon={BookOpen} label="الصفة/المنصب" value={profile.position_title ?? "—"} density="compact" />
            </div>

            <Link to="/faculty-portal/schedule" className="mt-4 block rounded-xl border-2 border-gold/30 bg-card p-4 hover:border-gold hover:shadow-card transition-all">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
                  <CalendarClock className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-primary">جدول التدريس الأسبوعي</div>
                  <div className="text-xs text-muted-foreground">عرض الفترات الزمنية والقاعات والمحاضرات المسندة إليك.</div>
                </div>
              </div>
            </Link>

            <Link
              to="/faculty-portal/academic-councils"
              className="mt-3 block rounded-xl border-2 border-gold/30 bg-card p-4 hover:border-gold hover:shadow-card transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
                  <ScrollText className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-primary">مجالسي الأكاديمية</div>
                  <div className="text-xs text-muted-foreground">
                    الدخول إلى المجالس الأكاديمية المرتبط بها حسابك.
                  </div>
                  <span className="mt-2 inline-flex items-center rounded-md border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-bold text-primary-deep">
                    دخول مجالسي الأكاديمية
                  </span>
                </div>
              </div>
            </Link>

            {portalFeatures.facultyCourseMaterials && (
              <Link
                to="/faculty-portal/materials"
                className="mt-3 block rounded-xl border-2 border-gold/30 bg-card p-4 hover:border-gold hover:shadow-card transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-primary">موادي التعليمية</div>
                    <div className="text-xs text-muted-foreground">
                      رفع ونشر محاضرات وملفات المقررات المسندة إليك.
                    </div>
                  </div>
                </div>
              </Link>
            )}


            <LazyMount fallback={<div className="mt-6 h-32 rounded-lg bg-muted animate-pulse" />}>
              <div className="mt-6">
                <AnnouncementsWidget limit={5} />
              </div>
            </LazyMount>

            <div className="mt-6">

              <h2 className="font-display text-base font-bold text-primary mb-3 flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-gold" /> جدولي التدريسي
              </h2>
              {teaching.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-card p-4 text-xs text-muted-foreground text-center">
                  لا توجد مجموعات مرتبطة بك حالياً.
                </div>
              ) : (
                <div className="space-y-2">
                  {teaching.map((t) => (
                    <SectionCard key={t.id} sectionId={t.id} sectionCode={t.section_code} courseCode={t.course?.code ?? "—"} courseName={t.course?.name_ar ?? "—"} schedule={t.schedule} />
                  ))}
                </div>
              )}
            </div>

            <LazyMount fallback={<div className="mt-6 h-40 rounded-lg bg-muted animate-pulse" />}>
              <div className="mt-6">
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
              </div>
            </LazyMount>

            <div className="mt-6 rounded-xl border border-dashed border-border bg-card p-4 text-xs text-muted-foreground text-center">
              ستتوفر الخدمات الأكاديمية الأخرى (الحضور، التقارير) في المراحل القادمة.
            </div>
          </>
        )}
      </main>
    </PortalShell>
  );
}

type ScheduleSlot = { day_of_week: string; start_time: string; end_time: string; room: string | null; schedule_type: string };

function SectionCard({
  sectionId, sectionCode, courseCode, courseName, schedule,
}: {
  sectionId: string; sectionCode: string; courseCode: string; courseName: string; schedule: ScheduleSlot[];
}) {
  const [open, setOpen] = useState(false);
  const { data: students = [], isLoading } = useQuery({
    queryKey: ["faculty", "section-students", sectionId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_enrollments")
        .select("id, enrollment_status, student:student_profiles(academic_number, full_name_ar)")
        .eq("course_section_id", sectionId);
      if (error) throw error;
      type Raw = { id: string; enrollment_status: string; student: { academic_number: string; full_name_ar: string } | null };
      return ((data ?? []) as unknown as Raw[]);
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const statusLabel: Record<string, string> = { enrolled: "مُسجَّل", dropped: "محذوف", completed: "مكتمل" };

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <span className="font-mono font-bold text-primary">{courseCode}</span>
          <span className="mx-2 text-muted-foreground">—</span>
          <span className="font-semibold text-sm">{courseName}</span>
        </div>
        <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded">مجموعة دراسية {sectionCode}</span>
      </div>
      {schedule.length === 0 ? (
        <div className="text-[11px] text-muted-foreground mt-2">لا يوجد جدول بعد</div>
      ) : (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {schedule.map((s, i) => (
            <div key={i} className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1.5 text-xs">
              <span className="font-bold">{DAY_LABELS[s.day_of_week] ?? s.day_of_week}</span>
              <span className="font-mono">{s.start_time.slice(0,5)}-{s.end_time.slice(0,5)}</span>
              {s.room && <span className="text-muted-foreground">• {s.room}</span>}
              <span className="ms-auto text-[10px] bg-card border px-1.5 py-0.5 rounded">{TYPE_LABELS[s.schedule_type] ?? s.schedule_type}</span>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-gold transition-colors"
      >
        <Users2 className="h-3.5 w-3.5" />
        الطلاب المسجلون
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="mt-2 rounded border bg-muted/20 p-2">
          {isLoading ? (
            <div className="text-center py-2"><Loader2 className="inline h-4 w-4 animate-spin" /></div>
          ) : students.length === 0 ? (
            <div className="text-[11px] text-muted-foreground text-center py-2">لا يوجد طلاب مسجلون</div>
          ) : (
            <ul className="divide-y">
              {students.map((s) => (
                <li key={s.id} className="py-1.5 flex items-center gap-2 text-xs">
                  <span className="font-mono text-muted-foreground w-20">{s.student?.academic_number ?? "—"}</span>
                  <span className="flex-1 font-semibold truncate">{s.student?.full_name_ar ?? "—"}</span>
                  <span className="text-[10px] bg-card border px-1.5 py-0.5 rounded">{statusLabel[s.enrollment_status] ?? s.enrollment_status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

