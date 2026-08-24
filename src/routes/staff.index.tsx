import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell } from "@/components/portal/PortalShell";
import {
  StaffEmployeePortal,
  type StaffPortalProfile,
} from "@/components/staff-portal/StaffEmployeePortal";
import { useStaffLogout } from "@/lib/use-staff-logout";
import { portalFeatures } from "@/lib/portal-features";

async function fetchMyStaffProfile(): Promise<StaffPortalProfile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("staff_profiles")
    .select("employee_number, full_name_ar, full_name_en, job_title, role_type, status")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as StaffPortalProfile;
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
      ) : portalFeatures.staffSelfServiceLive ? (
        <StaffEmployeePortal profile={profile} />
      ) : (
        <div className="container mx-auto max-w-3xl px-4 py-12 text-center text-sm text-muted-foreground">
          خدمات الموظفين غير متاحة مؤقتاً.
        </div>
      )}
    </PortalShell>
  );
}
