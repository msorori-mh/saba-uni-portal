import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ClipboardCheck, Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell } from "@/components/portal/PortalShell";
import { NotificationsBell } from "@/components/portal/NotificationsBell";
import { StaffInboxShell } from "@/components/student-requests/StaffInboxShell";
import { hasActiveProcessingAssignment } from "@/lib/faculty-portal/processing-access.functions";

export const Route = createFileRoute("/faculty-portal/processing-requests")({
  component: FacultyProcessingRequestsPage,
});

function FacultyProcessingRequestsPage() {
  const navigate = useNavigate();
  const accessFn = useServerFn(hasActiveProcessingAssignment);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["faculty-portal", "processing-access"],
    queryFn: () => accessFn({ data: {} }),
    staleTime: 60_000,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/portal-login", replace: true });
  };

  const allowed = !!data && (data.hasAssignment || data.isAdmin);

  return (
    <PortalShell
      title="طلبات المعالجة"
      actions={<NotificationsBell />}
      onLogout={handleLogout}
    >
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-primary">
            <ClipboardCheck className="h-5 w-5 text-gold" />
            <h1 className="font-display text-lg font-extrabold">طلبات المعالجة المُسندة إليك</h1>
          </div>
          <Link
            to="/faculty-portal"
            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
          >
            <ArrowRight className="h-3 w-3" /> العودة إلى البوابة
          </Link>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : isError || !allowed ? (
          <div
            data-testid="faculty-processing-unauthorized"
            className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground"
          >
            <ShieldAlert className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            لا تتوفر لديك خطوات معالجة نشطة حالياً.
          </div>
        ) : (
          <StaffInboxShell />
        )}
      </main>
    </PortalShell>
  );
}
