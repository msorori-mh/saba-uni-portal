import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Briefcase } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { FeatureFrozenNotice } from "@/components/portal/FeatureFrozenNotice";
import { GaEmpty } from "@/components/graduates-affairs/GaStates";
import { supabase } from "@/integrations/supabase/client";
import {
  portalFeatures,
  STAFF_GRADUATES_AFFAIRS_FROZEN_MSG,
} from "@/lib/portal-features";
import {
  GRADUATE_AFFAIRS_MANAGER_ROLE,
  GRADUATE_AFFAIRS_SPECIALIST_ROLE,
  GRADUATE_AFFAIRS_UNIT_CODE,
} from "@/lib/graduates-affairs/authorization";

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
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/portal-login", replace: true });
  };

  return (
    <PortalShell title="بوابة الموظف" onLogout={handleLogout}>
      <main className="container mx-auto px-4 py-8 max-w-4xl" dir="rtl">
        <div className="mb-4">
          <Link to="/staff" className="text-sm text-primary hover:text-gold inline-flex items-center gap-1">
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
          <div className="space-y-4">
            <div
              className="space-y-3 rounded-xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground"
              role="status"
            >
              <p>
                العلم التشغيلي مفعّل. التفويض الساري يتطلب وحدة{" "}
                <span className="font-mono">{GRADUATE_AFFAIRS_UNIT_CODE}</span> مع دور{" "}
                <span className="font-mono">{GRADUATE_AFFAIRS_MANAGER_ROLE}</span> أو{" "}
                <span className="font-mono">{GRADUATE_AFFAIRS_SPECIALIST_ROLE}</span>{" "}
                ونطاق صريح أو تعيين حالة مباشر. أدوار app_role العامة لا تمنح صلاحية.
              </p>
            </div>
            <GaEmpty message="لا توجد سجلات تشغيلية ضمن نطاق التعيين الحالي. المدير/الأخصائي يعملان عبر AUTH-04 فقط." />
          </div>
        )}
      </main>
    </PortalShell>
  );
}
