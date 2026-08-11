import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Briefcase } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { FeatureFrozenNotice } from "@/components/portal/FeatureFrozenNotice";
import { GraduatesAffairsStaffWorkspace } from "@/components/portal/GraduatesAffairsStaffWorkspace";
import { GraduatesAffairsAuthoringPanel } from "@/components/portal/GraduatesAffairsAuthoringPanel";
import { useStaffLogout } from "@/lib/use-staff-logout";
import { portalFeatures, STAFF_GRADUATES_AFFAIRS_FROZEN_MSG } from "@/lib/portal-features";


export const Route = createFileRoute("/staff/graduates-affairs")({
  component: StaffGraduatesAffairsPage,
});

/**
 * Graduates-affairs staff surface.
 * Nav/route visibility is presentation-only. Access requires an active
 * graduate_affairs assignment (manager college / specialist department /
 * direct assignee). admin / dean / registrar / student_affairs alone never
 * grant operational access. Presentational panels mount after adapters supply
 * AUTH-04-backed props — no mock production data.
 */
function StaffGraduatesAffairsPage() {
  const handleLogout = useStaffLogout();


  return (
    <PortalShell title="بوابة الموظف" onLogout={handleLogout}>
      <main className="container mx-auto max-w-7xl px-4 py-6 sm:py-8" dir="rtl">
        <div className="mb-4">
          <Link
            to="/staff"
            className="text-sm text-primary hover:text-gold inline-flex items-center gap-1"
          >
            <ArrowRight className="h-4 w-4" /> العودة إلى بوابة الموظف
          </Link>
        </div>
        <h1 className="font-display text-xl font-extrabold text-primary mb-4 flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-gold" /> شؤون الخريجين — تشغيل الموظفين
        </h1>

        {!portalFeatures.staffGraduatesAffairs ? (
          <FeatureFrozenNotice
            message={STAFF_GRADUATES_AFFAIRS_FROZEN_MSG}
            homeHref="/staff"
            homeLabel="العودة لبوابة الموظف"
          />
        ) : (
          <div className="space-y-8">
            <GraduatesAffairsStaffWorkspace />
            <GraduatesAffairsAuthoringPanel />
          </div>
        )}
      </main>
    </PortalShell>
  );
}
