import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, GraduationCap } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { FeatureFrozenNotice } from "@/components/portal/FeatureFrozenNotice";
import { GaEmpty } from "@/components/graduates-affairs/GaStates";
import { NotificationsBell } from "@/components/portal/NotificationsBell";
import { supabase } from "@/integrations/supabase/client";
import {
  portalFeatures,
  STUDENT_GRADUATES_AFFAIRS_FROZEN_MSG,
} from "@/lib/portal-features";
import { ACCOUNT_CONTINUITY_POLICY_UNDECIDED } from "@/lib/graduates-affairs/account-continuity";

export const Route = createFileRoute("/student/graduates-affairs/")({
  component: StudentGraduatesAffairsPage,
});

/**
 * Graduate self-service surface.
 * Route existence is presentation-only. While the feature flag is OFF the
 * page stays frozen. Authorization remains AUTH-04 RPCs + continuity gate.
 * Existing presentational components (GraduateFileCard, etc.) mount only when
 * adapters supply real props after promotion — no mock production data here.
 */
function StudentGraduatesAffairsPage() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/portal-login", replace: true });
  };

  return (
    <PortalShell title="بوابة الطالب" actions={<NotificationsBell />} onLogout={handleLogout}>
      <main className="container mx-auto px-4 py-8 max-w-4xl" dir="rtl">
        <div className="mb-4">
          <Link to="/student" className="text-sm text-primary hover:text-gold inline-flex items-center gap-1">
            <ArrowRight className="h-4 w-4" /> العودة إلى البوابة
          </Link>
        </div>
        <h1 className="font-display text-xl font-extrabold text-primary mb-4 flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-gold" /> شؤون الخريجين
        </h1>

        {!portalFeatures.studentGraduatesAffairs ? (
          <FeatureFrozenNotice
            message={STUDENT_GRADUATES_AFFAIRS_FROZEN_MSG}
            homeHref="/student"
            homeLabel="العودة لبوابة الطالب"
          />
        ) : (
          <div className="space-y-4">
            <div
              className="space-y-3 rounded-xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground"
              role="status"
            >
              <p>
                العلم التشغيلي مفعّل. الظهور هنا لا يمنح صلاحية: يلزم سجل خريج معتمد،
                سياسة استمرارية حساب معتمدة للقدرة المطلوبة، واستدعاءات AUTH-04 فقط.
                حالة ملف الطالب أو قوائم المرشحين لا تُنشئ صلاحية خريج.
              </p>
              <p className="text-xs">
                سياسة الاستمرارية الافتراضية:{" "}
                <span className="font-mono">{ACCOUNT_CONTINUITY_POLICY_UNDECIDED.state}</span>{" "}
                (fail-closed لكل القدرات).
              </p>
            </div>
            <GaEmpty message="لا توجد بيانات خريج معتمدة للعرض بعد. يلزم سجل معتمد عبر AUTH-04 دون بيانات وهمية." />
          </div>
        )}
      </main>
    </PortalShell>
  );
}
