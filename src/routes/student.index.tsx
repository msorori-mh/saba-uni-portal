import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogOut, User, IdCard, Building2, GraduationCap, BadgeCheck, Loader2, CalendarRange, BookMarked, Layers, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  academic_year: { name: string } | null;
  semester: { name: string } | null;
  level: { name: string; level_number: number } | null;
};

async function fetchMyProfile(): Promise<StudentRow | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("student_profiles")
    .select("id, academic_number, full_name_ar, full_name_en, email, status, department:departments(name_ar), program:programs(name_ar)")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as StudentRow;
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/portal-login", replace: true });
  };

  const statusLabel: Record<string, string> = {
    active: "منتظم",
    suspended: "موقوف",
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
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-md border border-gold/40 px-4 py-2 text-sm font-bold text-gold hover:bg-gold hover:text-primary-deep transition-colors"
          >
            <LogOut className="h-4 w-4" /> تسجيل الخروج
          </button>
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

            <div className="mt-6 rounded-xl border border-dashed border-border bg-card p-4 text-xs text-muted-foreground text-center">
              ستتوفر الخدمات الأكاديمية (الجداول، الدرجات، الرسوم، الطلبات) في المراحل القادمة.
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
