import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogOut, User, IdCard, Briefcase, BadgeCheck, ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import collegeLogo from "@/assets/college-logo.jpg";
import { AnnouncementsWidget } from "@/components/communications/AnnouncementsWidget";

type StaffProfileRow = {
  employee_number: string | null;
  full_name_ar: string;
  full_name_en: string | null;
  job_title: string;
  role_type: string;
  status: string;
};

const ROLE_LABEL: Record<string, string> = {
  admin: "مدير عام",
  system_admin: "مدير نظام",
  registrar: "قبول وتسجيل",
  student_affairs: "شؤون الطلاب",
  finance_officer: "مسؤول مالي",
  admin_staff: "موظف إداري",
};

async function fetchMyStaffProfile(): Promise<StaffProfileRow | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("staff_profiles")
    .select("employee_number, full_name_ar, full_name_en, job_title, role_type, status")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as StaffProfileRow;
}

export const Route = createFileRoute("/staff/")({
  component: StaffDashboard,
});

function StaffDashboard() {
  const navigate = useNavigate();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["staff", "me"],
    queryFn: fetchMyStaffProfile,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/portal-login", replace: true });
  };

  const statusLabel: Record<string, string> = {
    active: "نشط", on_leave: "في إجازة", retired: "متقاعد", suspended: "موقوف",
  };

  return (
    <div dir="rtl" className="min-h-screen bg-surface">
      <header className="bg-primary-deep text-primary-foreground border-b-2 border-gold/40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={collegeLogo} alt="شعار الكلية" className="h-11 w-11 rounded-full ring-2 ring-gold/50 object-cover" />
            <div>
              <div className="font-display font-extrabold text-gold leading-tight">بوابة الموظف</div>
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
              <InfoCard icon={IdCard} label="رقم الموظف" value={profile.employee_number ?? "—"} mono />
              <InfoCard icon={BadgeCheck} label="الحالة" value={statusLabel[profile.status] ?? profile.status} />
              <InfoCard icon={Briefcase} label="الوظيفة" value={profile.job_title} />
              <InfoCard icon={ShieldCheck} label="الدور" value={ROLE_LABEL[profile.role_type] ?? profile.role_type} />
            </div>

            <div className="mt-6">
              <AnnouncementsWidget limit={5} />
            </div>

            <div className="mt-6 rounded-xl border border-dashed border-border bg-card p-4 text-xs text-muted-foreground text-center">
              ستتوفر أدوات إدارة الطلاب والقبول والمالية في المراحل القادمة.
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value, mono }: { icon: typeof User; label: string; value: string; mono?: boolean }) {
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
