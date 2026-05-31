import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogOut, User, IdCard, Building2, GraduationCap, BadgeCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import collegeLogo from "@/assets/college-logo.jpg";

type StudentRow = {
  academic_number: string;
  full_name_ar: string;
  full_name_en: string | null;
  email: string | null;
  status: string;
  department: { name_ar: string } | null;
  program: { name_ar: string } | null;
};

async function fetchMyProfile(): Promise<StudentRow | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("student_profiles")
    .select("academic_number, full_name_ar, full_name_en, email, status, department:departments(name_ar), program:programs(name_ar)")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as StudentRow;
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
            <div className="rounded-2xl bg-gold-gradient text-primary-deep p-6 shadow-elegant flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-primary-deep text-gold">
                <User className="h-7 w-7" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest opacity-70">مرحباً</div>
                <h1 className="font-display text-2xl font-extrabold">{profile.full_name_ar}</h1>
                {profile.full_name_en && <div className="text-sm opacity-80">{profile.full_name_en}</div>}
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <InfoCard icon={IdCard} label="الرقم الأكاديمي" value={profile.academic_number} mono />
              <InfoCard icon={BadgeCheck} label="الحالة" value={statusLabel[profile.status] ?? profile.status} />
              <InfoCard icon={Building2} label="القسم" value={profile.department?.name_ar ?? "—"} />
              <InfoCard icon={GraduationCap} label="البرنامج" value={profile.program?.name_ar ?? "—"} />
            </div>

            <div className="mt-10 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground text-center">
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
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
        <Icon className="h-4 w-4 text-gold" />
        {label}
      </div>
      <div className={`mt-2 text-lg font-extrabold text-foreground ${mono ? "font-mono tracking-wider" : ""}`}>
        {value}
      </div>
    </div>
  );
}
