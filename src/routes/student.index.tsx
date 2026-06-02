import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogOut, User, IdCard, Building2, GraduationCap, BadgeCheck, Loader2, CalendarRange, BookMarked, Layers, BookOpen, CalendarClock, ClipboardCheck, Award, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UnofficialTranscript } from "@/components/portal/UnofficialTranscript";
import { StudentRequestsSection } from "@/components/portal/StudentRequestsSection";
import { StudentFinanceSection } from "@/components/portal/StudentFinanceSection";
import { StudentDocumentsSection } from "@/components/portal/StudentDocumentsSection";
import { NotificationsBell } from "@/components/portal/NotificationsBell";
import collegeLogo from "@/assets/college-logo.jpg";

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

type PlanCourseRow = {
  id: string;
  semester_code: string;
  is_required: boolean;
  sort_order: number;
  level: { name: string; level_number: number } | null;
  course: { code: string; name_ar: string; credit_hours: number } | null;
  prerequisite: { code: string } | null;
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
  day_of_week: string; start_time: string; end_time: string;
  room: string | null; schedule_type: string;
};
type ScheduleRow = {
  section_id: string; section_code: string;
  course_code: string; course_name: string;
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

type RawSched = { schedule_type: string; status: string; time_slot: { day_of_week: string; start_time: string; end_time: string } | null; room: { name_ar: string; code: string } | null };
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
    .select("id, enrollment_status, section:course_sections(id, section_code, faculty:faculty_profiles(full_name_ar), offering:course_offerings(course:courses(code, name_ar)), schedule:class_schedule(schedule_type, status, time_slot:time_slots(day_of_week, start_time, end_time), room:rooms(name_ar, code)))")
    .eq("student_profile_id", studentId);
  if (error) throw error;
  type Raw = {
    id: string; enrollment_status: string;
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
    .select("id, academic_number, full_name_ar, full_name_en, email, status, program_id, department:departments(name_ar), program:programs(name_ar)")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as StudentRow;
}

async function fetchMyAcademicStatus(studentId: string): Promise<AcademicStatus | null> {
  const { data, error } = await supabase
    .from("student_academic_status")
    .select("enrollment_status, academic_year_id, semester_id, level_id, academic_year:academic_years(name), semester:semesters(name), level:academic_levels(name, level_number)")
    .eq("student_profile_id", studentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as AcademicStatus;
}

async function fetchMySchedule(programId: string, yearId: string, semId: string, levelId: string): Promise<ScheduleRow[]> {
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
    .select("id, section_code, course_offering_id, faculty:faculty_profiles(full_name_ar), schedule:class_schedule(schedule_type, status, time_slot:time_slots(day_of_week, start_time, end_time), room:rooms(name_ar, code))")
    .in("course_offering_id", offeringIds)
    .eq("status", "active");
  if (sErr) throw sErr;
  type RawOff = { id: string; course: { code: string; name_ar: string } | null };
  type RawSec = { id: string; section_code: string; course_offering_id: string; faculty: { full_name_ar: string } | null; schedule: RawSched[] | null };
  const offMap = new Map((offerings as unknown as RawOff[]).map((o) => [o.id, o.course]));
  return ((sections ?? []) as unknown as RawSec[]).map((s) => {
    const c = offMap.get(s.course_offering_id);
    return {
      section_id: s.id, section_code: s.section_code,
      course_code: c?.code ?? "—", course_name: c?.name_ar ?? "—",
      faculty_name: s.faculty?.full_name_ar ?? null,
      slots: flattenSched(s.schedule),
    };
  });
}


async function fetchMyStudyPlan(programId: string): Promise<PlanCourseRow[]> {
  const { data: plan, error: pErr } = await supabase
    .from("study_plans")
    .select("id")
    .eq("program_id", programId)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!plan) return [];
  const { data, error } = await supabase
    .from("study_plan_courses")
    .select("id, semester_code, is_required, sort_order, level:academic_levels(name, level_number), course:courses!study_plan_courses_course_id_fkey(code, name_ar, credit_hours), prerequisite:courses!study_plan_courses_prerequisite_course_id_fkey(code)")
    .eq("study_plan_id", plan.id)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as unknown as PlanCourseRow[];
}

export const Route = createFileRoute("/student/")({
  component: StudentDashboard,
});

function StudentDashboard() {
  const navigate = useNavigate();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["student", "me"],
    queryFn: fetchMyProfile,
  });
  const { data: acad } = useQuery({
    queryKey: ["student", "academic-status", profile?.id],
    queryFn: () => fetchMyAcademicStatus(profile!.id),
    enabled: !!profile?.id,
  });
  const { data: planCourses = [] } = useQuery({
    queryKey: ["student", "study-plan", profile?.program_id],
    queryFn: () => fetchMyStudyPlan(profile!.program_id!),
    enabled: !!profile?.program_id,
  });
  const { data: schedule = [] } = useQuery({
    queryKey: ["student", "schedule", profile?.program_id, acad?.academic_year_id, acad?.semester_id, acad?.level_id],
    queryFn: () => fetchMySchedule(profile!.program_id!, acad!.academic_year_id, acad!.semester_id, acad!.level_id),
    enabled: !!profile?.program_id && !!acad?.academic_year_id && !!acad?.semester_id && !!acad?.level_id,
  });
  const { data: myEnrollments = [] } = useQuery({
    queryKey: ["student", "my-enrollments", profile?.id],
    queryFn: () => fetchMyEnrollments(profile!.id),
    enabled: !!profile?.id,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/portal-login", replace: true });
  };

  const statusLabel: Record<string, string> = {
    active: "منتظم",
    suspended: "موقوف قيد",
    graduated: "خريج",
    withdrawn: "منسحب",
  };


  return (
    <div dir="rtl" className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-primary-deep text-primary-foreground border-b-2 border-gold/40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={collegeLogo} alt="شعار الكلية" className="h-11 w-11 rounded-full ring-2 ring-gold/50 object-cover" />
            <div>
              <div className="font-display font-extrabold text-gold leading-tight">بوابة الطالب</div>
              <div className="text-xs text-primary-foreground/70">كلية تكنولوجيا المعلومات وعلوم الحاسوب</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationsBell seeAllHref="/student/notifications" />
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-md border border-gold/40 px-4 py-2 text-sm font-bold text-gold hover:bg-gold hover:text-primary-deep transition-colors"
            >
              <LogOut className="h-4 w-4" /> تسجيل الخروج
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 max-w-4xl">
        {isLoading || !profile ? (
          <div className="grid place-items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <InfoCard icon={IdCard} label="الرقم الأكاديمي" value={profile.academic_number} mono />
              <InfoCard icon={BadgeCheck} label="الحالة" value={statusLabel[profile.status] ?? profile.status} />
              <InfoCard icon={Building2} label="القسم" value={profile.department?.name_ar ?? "—"} />
              <InfoCard icon={GraduationCap} label="البرنامج" value={profile.program?.name_ar ?? "—"} />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Link to="/student/schedule" className="block rounded-xl border-2 border-gold/30 bg-card p-4 hover:border-gold hover:shadow-card transition-all">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
                    <CalendarClock className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-primary">جدولي الدراسي الأسبوعي</div>
                    <div className="text-xs text-muted-foreground">المحاضرات المعتمدة هذا الفصل.</div>
                  </div>
                </div>
              </Link>
              <Link to="/student/progress" className="block rounded-xl border-2 border-gold/30 bg-card p-4 hover:border-gold hover:shadow-card transition-all">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-primary">تقدمي الأكاديمي</div>
                    <div className="text-xs text-muted-foreground">الإنجاز، المعدل، وأهلية التخرج.</div>
                  </div>
                </div>
              </Link>
            </div>

            <div className="mt-6">
              <h2 className="font-display text-base font-bold text-primary mb-3 flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-gold" /> الوضع الأكاديمي الحالي
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoCard icon={CalendarRange} label="السنة الأكاديمية" value={acad?.academic_year?.name ?? "—"} />
                <InfoCard icon={BookMarked} label="الفصل الحالي" value={acad?.semester?.name ?? "—"} />
                <InfoCard icon={Layers} label="المستوى" value={acad?.level?.name ?? "—"} />
                <InfoCard icon={BadgeCheck} label="حالة التسجيل" value={statusLabel[acad?.enrollment_status ?? ""] ?? acad?.enrollment_status ?? "—"} />
              </div>
            </div>

            <StudyPlanSection rows={planCourses} />

            <MyEnrollmentsSection rows={myEnrollments} />

            <MyGradesSection studentProfileId={profile.id} />

            <div className="mt-6">
              <h2 className="font-display text-base font-bold text-primary mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-gold" /> السجل الأكاديمي غير الرسمي
              </h2>
              <UnofficialTranscript studentProfileId={profile.id} />
            </div>

            <StudentRequestsSection studentProfileId={profile.id} />

            <StudentFinanceSection studentProfileId={profile.id} />

            <StudentDocumentsSection studentProfileId={profile.id} />



            <div className="mt-3 rounded-md border border-border bg-muted/30 p-2.5 text-[11px] text-muted-foreground text-center">
              قسم «الجدول الدراسي العام» يعرض جميع شعب البرنامج للمستوى الحالي، بينما «مقرراتي المسجلة» يعرض فقط الشعب التي سُجلت فيها فعلياً.
            </div>

            <ScheduleSection rows={schedule} />

            <div className="mt-6 rounded-xl border border-dashed border-border bg-card p-4 text-xs text-muted-foreground text-center">
              ستتوفر الخدمات الأكاديمية الأخرى (الدرجات، الرسوم، الطلبات) في المراحل القادمة.
            </div>



          </>
        )}
      </main>
    </div>
  );
}

function InfoCard({
  icon: Icon, label, value, mono,
}: { icon: typeof User; label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3.5 shadow-card">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-gold" />
        {label}
      </div>
      <div className={`mt-1.5 text-base font-extrabold text-foreground ${mono ? "font-mono tracking-wider" : ""}`}>
        {value}
      </div>
    </div>
  );

}

const SEMESTER_LABELS: Record<string, string> = {
  first: "الفصل الأول",
  second: "الفصل الثاني",
  summer: "الفصل الصيفي",
};

function StudyPlanSection({ rows }: { rows: PlanCourseRow[] }) {
  if (!rows || rows.length === 0) return null;

  // Group by level_number then semester_code
  type Group = { levelName: string; levelNumber: number; semesters: Record<string, PlanCourseRow[]> };
  const map = new Map<number, Group>();
  for (const r of rows) {
    const ln = r.level?.level_number ?? 0;
    if (!map.has(ln)) map.set(ln, { levelName: r.level?.name ?? `المستوى ${ln}`, levelNumber: ln, semesters: {} });
    const g = map.get(ln)!;
    (g.semesters[r.semester_code] ||= []).push(r);
  }
  const levels = Array.from(map.values()).sort((a, b) => a.levelNumber - b.levelNumber);

  return (
    <div className="mt-6">
      <h2 className="font-display text-base font-bold text-primary mb-3 flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-gold" /> الخطة الدراسية
      </h2>
      <div className="space-y-3">
        {levels.map((lvl) => (
          <div key={lvl.levelNumber} className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-3 py-2 bg-muted/40 text-sm font-bold text-primary border-b">{lvl.levelName}</div>
            <div className="grid sm:grid-cols-2 gap-px bg-border">
              {Object.entries(lvl.semesters).map(([sem, items]) => (
                <div key={sem} className="bg-card p-3">
                  <div className="text-[11px] font-bold text-muted-foreground mb-2">
                    {SEMESTER_LABELS[sem] ?? sem}
                  </div>
                  <ul className="space-y-1.5">
                    {items.map((it) => (
                      <li key={it.id} className="rounded border p-2 text-xs">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-mono font-bold">{it.course?.code}</span>
                          <span className="text-[10px] text-muted-foreground">{it.course?.credit_hours} س.م</span>
                        </div>
                        <div className="mt-0.5 font-semibold">{it.course?.name_ar}</div>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{it.is_required ? "إجباري" : "اختياري"}</span>
                          {it.prerequisite && <span>• متطلب: <span className="font-mono">{it.prerequisite.code}</span></span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const DAY_LABELS: Record<string, string> = {
  saturday: "السبت", sunday: "الأحد", monday: "الإثنين", tuesday: "الثلاثاء",
  wednesday: "الأربعاء", thursday: "الخميس", friday: "الجمعة",
};
const TYPE_LABELS: Record<string, string> = { lecture: "محاضرة", lab: "عملي", tutorial: "تمارين" };
const DAY_ORDER = ["saturday","sunday","monday","tuesday","wednesday","thursday","friday"];

function ScheduleSection({ rows }: { rows: ScheduleRow[] }) {
  if (!rows || rows.length === 0) return null;
  // Flatten to day -> slots
  type Flat = { day: string; start: string; end: string; room: string | null; type: string; course: string; section: string; faculty: string | null };
  const flat: Flat[] = [];
  for (const r of rows) for (const s of r.slots) flat.push({
    day: s.day_of_week, start: s.start_time, end: s.end_time, room: s.room, type: s.schedule_type,
    course: `${r.course_code} — ${r.course_name}`, section: r.section_code, faculty: r.faculty_name,
  });
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
              <div className="px-3 py-1.5 bg-muted/40 text-xs font-bold text-primary border-b">{DAY_LABELS[d]}</div>
              <div className="divide-y">
                {items.map((it, i) => (
                  <div key={i} className="p-2.5 flex items-center gap-2 text-xs">
                    <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{it.start.slice(0,5)}-{it.end.slice(0,5)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{it.course}</div>
                      <div className="text-[11px] text-muted-foreground">
                        شعبة {it.section}{it.faculty && <> • {it.faculty}</>}{it.room && <> • {it.room}</>}
                      </div>
                    </div>
                    <span className="text-[10px] border bg-muted/40 px-1.5 py-0.5 rounded shrink-0">{TYPE_LABELS[it.type] ?? it.type}</span>
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
          لم يتم تسجيلك في أي شعبة بعد. تواصل مع شؤون الطلاب.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const st = statusLabel[r.enrollment_status] ?? { text: r.enrollment_status, cls: "bg-muted" };
            return (
              <div key={r.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-primary">{r.course_code}</span>
                    <span className="mx-2 text-muted-foreground">—</span>
                    <span className="font-semibold text-sm">{r.course_name}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${st.cls}`}>{st.text}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="bg-muted px-1.5 py-0.5 rounded">شعبة {r.section_code}</span>
                  {r.faculty_name && <span>• {r.faculty_name}</span>}
                </div>
                {r.slots.length > 0 && (
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {r.slots.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1 text-[11px]">
                        <span className="font-bold">{DAY_LABELS[s.day_of_week] ?? s.day_of_week}</span>
                        <span className="font-mono">{s.start_time.slice(0,5)}-{s.end_time.slice(0,5)}</span>
                        {s.room && <span className="text-muted-foreground">• {s.room}</span>}
                        <span className="ms-auto text-[10px] bg-card border px-1.5 py-0.5 rounded">{TYPE_LABELS[s.schedule_type] ?? s.schedule_type}</span>
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
      const sb = supabase as unknown as { from: (t: string) => any };
      const { data: enr, error: e1 } = await supabase
        .from("student_enrollments")
        .select("id, course_section_id, section:course_sections(section_code, offering:course_offerings(course:courses(code, name_ar)))")
        .eq("student_profile_id", studentProfileId);
      if (e1) throw e1;
      type EnRaw = { id: string; course_section_id: string; section: { section_code: string; offering: { course: { code: string; name_ar: string } | null } | null } | null };
      const enrollments = (enr ?? []) as unknown as EnRaw[];
      if (enrollments.length === 0) return [];
      const { data: gs, error: e2 } = await sb.from("student_grades")
        .select("id, student_enrollment_id, grade_component_id, score, status")
        .in("student_enrollment_id", enrollments.map((e) => e.id))
        .eq("status", "approved");
      if (e2) throw e2;
      type GR = { id: string; student_enrollment_id: string; grade_component_id: string; score: number; status: string };
      const grades = (gs ?? []) as GR[];
      if (grades.length === 0) return [];
      const sectionIds = Array.from(new Set(enrollments.map((e) => e.course_section_id)));
      const { data: cs, error: e3 } = await sb.from("grade_components")
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
            total, totalMax,
            percentage: totalMax > 0 ? Math.round((total / totalMax) * 1000) / 10 : 0,
            details: myComps.map((c) => ({ name: c.name, max: Number(c.max_score), score: Number(myGrades.find((g) => g.grade_component_id === c.id)?.score ?? 0) })),
          };
        })
        .filter(Boolean) as Array<{ enrollmentId: string; courseCode: string; courseName: string; sectionCode: string; total: number; totalMax: number; percentage: number; details: { name: string; max: number; score: number }[] }>;
    },
  });

  return (
    <div className="mt-6">
      <h2 className="font-display text-base font-bold text-primary mb-3 flex items-center gap-2">
        <Award className="h-4 w-4 text-gold" /> درجاتي
      </h2>
      {isLoading ? (
        <div className="rounded-lg border bg-card p-4 text-center"><Loader2 className="inline h-4 w-4 animate-spin" /></div>
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
                <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded">شعبة {r.sectionCode}</span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-sm">
                <span className="font-mono font-extrabold text-primary">{r.total}/{r.totalMax}</span>
                <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">{r.percentage}%</span>
              </div>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                {r.details.map((d, i) => (
                  <div key={i} className="flex items-center justify-between rounded border bg-muted/30 px-2 py-1 text-xs">
                    <span>{d.name}</span>
                    <span className="font-mono"><b>{d.score}</b><span className="text-muted-foreground">/{d.max}</span></span>
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



