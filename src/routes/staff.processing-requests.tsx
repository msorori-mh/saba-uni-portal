import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ClipboardCheck, Loader2, ShieldAlert } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { StaffInboxShell } from "@/components/student-requests/StaffInboxShell";
import { hasActiveProcessingAssignment } from "@/lib/faculty-portal/processing-access.functions";

/**
 * Processing inbox for any staff member with an ACTIVE processing assignment
 * (e.g. finance_officer on payment_confirmation). Shows only steps the actor
 * may act on; per-step authority stays in can_current_user_act_on_step.
 */
export const Route = createFileRoute("/staff/processing-requests")({
  head: () => ({
    meta: [
      { title: "صندوق معالجة الطلبات — بوابة الموظف" },
      { name: "description", content: "خطوات طلبات الطلاب المسندة إليك للمعالجة، ومنها تأكيد السداد." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StaffProcessingRequestsPage,
});

function StaffProcessingRequestsPage() {
  const accessFn = useServerFn(hasActiveProcessingAssignment);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["staff-portal", "processing-access"],
    queryFn: () => accessFn({ data: {} }),
    staleTime: 60_000,
  });
  const allowed = !!data && (data.hasAssignment || data.isAdmin);

  return (
    <PortalShell>
      <main className="container mx-auto px-4 py-6 max-w-6xl" dir="rtl">
        <Link to="/staff" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
          <ArrowRight className="h-4 w-4" />
          العودة للوحة الموظف
        </Link>
        <div className="my-4 flex items-center gap-2 text-primary">
          <ClipboardCheck className="h-5 w-5" aria-hidden />
          <h1 className="font-display text-lg font-extrabold">صندوق معالجة الطلبات المسندة إليك</h1>
        </div>
        {isLoading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : isError || !allowed ? (
          <div
            data-testid="staff-processing-unauthorized"
            className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground"
          >
            <ShieldAlert className="mx-auto mb-2 h-6 w-6" aria-hidden />
            لا تتوفر لديك خطوات معالجة نشطة حالياً.
          </div>
        ) : (
          <StaffInboxShell />
        )}
      </main>
    </PortalShell>
  );
}
