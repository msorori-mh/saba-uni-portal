import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { User, IdCard, Briefcase, BadgeCheck, ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell } from "@/components/portal/PortalShell";
import { StatCard } from "@/components/brand";
import { AnnouncementsWidget } from "@/components/communications/AnnouncementsWidget";
import { staffFunctionalRoleDisplayLabel } from "@/lib/staff-functional-roles";

type StaffProfileRow = {
  employee_number: string | null;
  full_name_ar: string;
  full_name_en: string | null;
  job_title: string;
  role_type: string;
  status: string;
};

const STATUS_LABEL: Record<string, string> = {
  active: "نشط",
  on_leave: "في إجازة",
  retired: "متقاعد",
  suspended: "موقوف",
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

  return (
    <PortalShell title="بوابة الموظف" onLogout={handleLogout}>
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

            <div className="mt-5 card-grid sm:grid-cols-2">
              <StatCard icon={IdCard} label="رقم الموظف" value={<span className="font-mono tracking-wider">{profile.employee_number ?? "—"}</span>} density="compact" />
              <StatCard icon={BadgeCheck} label="الحالة" value={STATUS_LABEL[profile.status] ?? profile.status} density="compact" />
              <StatCard icon={Briefcase} label="الوظيفة" value={profile.job_title?.trim() || "—"} density="compact" />
              <StatCard icon={ShieldCheck} label="الدور" value={staffFunctionalRoleDisplayLabel(profile.role_type)} density="compact" />
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
    </PortalShell>
  );
}
