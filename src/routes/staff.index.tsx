import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { User, IdCard, Briefcase, BadgeCheck, ShieldCheck, Loader2, GraduationCap, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell } from "@/components/portal/PortalShell";
import { StatCard } from "@/components/brand";
import { AnnouncementsWidget } from "@/components/communications/AnnouncementsWidget";
import { StaffInboxShell } from "@/components/student-requests/StaffInboxShell";
import { staffFunctionalRoleDisplayLabel } from "@/lib/staff-functional-roles";
import { portalFeatures } from "@/lib/portal-features";

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
  const handleLogout = useStaffLogout();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["staff", "me"],
    queryFn: fetchMyStaffProfile,
  });


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

            {portalFeatures.staffGraduatesAffairs && (
              <div className="mt-6">
                <Link
                  to="/staff/graduates-affairs"
                  className="flex items-center gap-3 rounded-xl border-2 border-gold/30 bg-card p-4 hover:border-gold hover:shadow-card transition-all"
                >
                  <GraduationCap className="h-5 w-5 text-gold shrink-0" />
                  <div className="min-w-0">
                    <div className="font-bold text-primary">شؤون الخريجين</div>
                    <div className="text-xs text-muted-foreground">
                      ملف الخريج والتقارير المجمعة — يتطلب تعييناً نشطاً في وحدة شؤون الخريجين.
                    </div>
                  </div>
                </Link>
              </div>
            )}

            <div className="mt-4">
              <Link
                to="/staff/audit-log"
                className="flex items-center gap-3 rounded-xl border-2 border-gold/30 bg-card p-4 hover:border-gold hover:shadow-card transition-all"
              >
                <ClipboardList className="h-5 w-5 text-gold shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold text-primary">سجل التدقيق</div>
                  <div className="text-xs text-muted-foreground">
                    وقت اعتماد كل خطوة، واسم المستخدم، وحالة الخطوة.
                  </div>
                </div>
              </Link>
            </div>

            <div className="mt-4">
              <Link
                to="/staff/fixtures-diagnostics"
                className="flex items-center gap-3 rounded-xl border-2 border-gold/30 bg-card p-4 hover:border-gold hover:shadow-card transition-all"
              >
                <ClipboardList className="h-5 w-5 text-gold shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold text-primary">تشخيص بيانات الاختبار</div>
                  <div className="text-xs text-muted-foreground">
                    حالة كل fixture وجداول التفاصيل المفقودة — لمسؤولي النظام.
                  </div>
                </div>
              </Link>
            </div>

            <div className="mt-4">
              <Link
                to="/staff/fee-assessment-board"
                className="flex items-center gap-3 rounded-xl border-2 border-gold/30 bg-card p-4 hover:border-gold hover:shadow-card transition-all"
              >
                <ClipboardList className="h-5 w-5 text-gold shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold text-primary">لوحة مهام تقييم الرسوم</div>
                  <div className="text-xs text-muted-foreground">
                    الطلبات المعلّقة في تقييم الرسوم والخطوة التالية — لمدير شؤون الطلاب.
                  </div>
                </div>
              </Link>
            </div>


            <div className="mt-6 space-y-3">
              <h2 className="font-display text-lg font-extrabold text-primary-deep flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                صندوق طلبات المعالجة
              </h2>
              <StaffInboxShell />
            </div>
          </>
        )}
      </main>
    </PortalShell>
  );
}
