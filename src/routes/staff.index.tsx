import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell } from "@/components/portal/PortalShell";
import { StaffSelfServiceShowcase } from "@/components/staff-showcase/StaffSelfServiceShowcase";
import { StaffSelfServiceLiveActions } from "@/components/staff-showcase/StaffSelfServiceLiveActions";
import { StaffSelfServiceLiveDashboard } from "@/components/staff-showcase/StaffSelfServiceLiveDashboard";
import { StaffValueAddedEmployeePanel } from "@/components/staff-showcase/StaffValueAddedEmployeePanel";

import { useStaffLogout } from "@/lib/use-staff-logout";
import { portalFeatures } from "@/lib/portal-features";

type StaffProfileRow = {
  employee_number: string | null;
  full_name_ar: string;
  full_name_en: string | null;
  job_title: string;
  role_type: string;
  status: string;
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
    <PortalShell title="بوابة الموظفين" onLogout={handleLogout} headerClassName="print:hidden">
      {isLoading || !profile ? (
        <div className="grid min-h-[70vh] place-items-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <div className="mt-3 text-sm text-muted-foreground">جاري تجهيز خدمات الموظف...</div>
          </div>
        </div>
      ) : (
        <>
          {portalFeatures.staffSelfServiceLive && (
            <div className="container mx-auto max-w-[1600px] space-y-4 px-4 pt-5">
              <StaffSelfServiceLiveActions variant="employee" />
              <StaffSelfServiceLiveDashboard />
              {portalFeatures.staffSelfServiceValueAdded && (
                <StaffValueAddedEmployeePanel />
              )}
            </div>
          )}

          <StaffSelfServiceShowcase profile={profile} />
          {portalFeatures.staffGraduatesAffairs && (
            <div className="container mx-auto max-w-6xl px-4 pb-8 print:hidden">
              <Link
                to="/staff/graduates-affairs"
                className="flex items-center gap-3 rounded-xl border-2 border-gold/30 bg-card p-4 shadow-card transition-all hover:border-gold"
              >
                <GraduationCap className="h-5 w-5 shrink-0 text-gold" />
                <div>
                  <div className="font-bold text-primary">شؤون الخريجين</div>
                  <div className="text-xs text-muted-foreground">
                    مساحة العمل التشغيلية لشؤون الخريجين حسب التعيين والنطاق المعتمد.
                  </div>
                </div>
              </Link>
            </div>
          )}
        </>
      )}
    </PortalShell>
  );
}
