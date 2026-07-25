import { Outlet, createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell } from "@/components/portal/PortalShell";
import { NotificationsBell } from "@/components/portal/NotificationsBell";

export const Route = createFileRoute("/faculty-portal/graduation-projects")({
  component: FacultyGraduationProjectsLayout,
});

function FacultyGraduationProjectsLayout() {
  const navigate = useNavigate();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/portal-login", replace: true });
  };

  return (
    <PortalShell title="مشاريع التخرج" actions={<NotificationsBell />} onLogout={handleLogout}>
      <main className="container mx-auto max-w-6xl px-4 py-8" dir="rtl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-primary">
            <GraduationCap className="h-5 w-5 text-gold" />
            <h1 className="font-display text-lg font-extrabold">المشاريع المسندة إليك</h1>
          </div>
          <Link
            to="/faculty-portal"
            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
          >
            <ArrowRight className="h-3 w-3" /> العودة إلى بوابة الأكاديمي
          </Link>
        </div>
        <Outlet />
      </main>
    </PortalShell>
  );
}
