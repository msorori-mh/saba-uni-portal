import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap, Loader2 } from "lucide-react";
import {
  listGraduateSelfEventsFn,
  listGraduateSelfOpportunitiesFn,
  resolveGraduateSelfSurfaceFn,
} from "@/lib/graduates-affairs/graduates-affairs.functions";
import { portalFeatures, STUDENT_GRADUATES_AFFAIRS_FROZEN_MSG } from "@/lib/portal-features";

export const Route = createFileRoute("/mobile/student/graduates-affairs")({
  head: () => ({ meta: [{ title: "شؤون الخريجين" }] }),
  component: MobileGraduatesAffairs,
});

type Opportunity = {
  id: string;
  title: string;
  opportunity_type: string;
  employer_name: string | null;
  closes_at: string | null;
};

type GraduateEvent = {
  id: string;
  title: string;
  event_type: string;
  starts_at: string;
};

/**
 * Graduate-only surface. Access is decided server-side by the AUTH-04 self
 * context RPC — a student status value alone never grants entry.
 */
function MobileGraduatesAffairs() {
  const resolveSelf = useServerFn(resolveGraduateSelfSurfaceFn);
  const selfQuery = useQuery({
    queryKey: ["mobile-student", "graduates-affairs", "self"],
    queryFn: () => resolveSelf({ data: { capability: "profile_self_service" as const } }),
    enabled: portalFeatures.studentGraduatesAffairs,
    retry: 1,
  });

  const recordId = selfQuery.data?.allowed ? selfQuery.data.graduateRecordId : null;

  return (
    <div className="px-4 py-5 space-y-4" dir="rtl">
      <h1 className="font-display text-lg font-extrabold text-primary flex items-center gap-2">
        <GraduationCap className="h-5 w-5 text-gold" /> شؤون الخريجين
      </h1>

      {!portalFeatures.studentGraduatesAffairs ? (
        <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          {STUDENT_GRADUATES_AFFAIRS_FROZEN_MSG}
        </p>
      ) : selfQuery.isLoading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !recordId ? (
        <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          هذه الخدمة متاحة فقط للخريجين بسجل تخرج رسمي معتمد.
        </p>
      ) : (
        <GraduateSelfLists graduateRecordId={recordId} />
      )}
    </div>
  );
}

function GraduateSelfLists({ graduateRecordId }: { graduateRecordId: string }) {
  const listOpportunities = useServerFn(listGraduateSelfOpportunitiesFn);
  const listEvents = useServerFn(listGraduateSelfEventsFn);

  const opportunities = useQuery({
    queryKey: ["mobile-student", "graduates-affairs", "opportunities", graduateRecordId],
    queryFn: () => listOpportunities({ data: { graduateRecordId } }),
  });
  const events = useQuery({
    queryKey: ["mobile-student", "graduates-affairs", "events", graduateRecordId],
    queryFn: () => listEvents({ data: { graduateRecordId } }),
  });

  const opportunityRows = (opportunities.data ?? []) as Opportunity[];
  const eventRows = (events.data ?? []) as GraduateEvent[];

  return (
    <>
      <section className="space-y-2">
        <h2 className="font-display text-sm font-extrabold text-primary">الفرص المتاحة</h2>
        {opportunities.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : opportunityRows.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">لا توجد فرص منشورة حالياً.</p>
        ) : (
          <ul className="space-y-2">
            {opportunityRows.map((o) => (
              <li key={o.id} className="rounded-2xl border border-border bg-card p-3.5 shadow-card">
                <div className="text-[13px] font-extrabold text-primary">{o.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  {o.employer_name ?? "—"}
                  {o.closes_at ? ` · حتى ${new Date(o.closes_at).toLocaleDateString("ar")}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-sm font-extrabold text-primary">الفعاليات</h2>
        {events.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : eventRows.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">لا توجد فعاليات منشورة حالياً.</p>
        ) : (
          <ul className="space-y-2">
            {eventRows.map((e) => (
              <li key={e.id} className="rounded-2xl border border-border bg-card p-3.5 shadow-card">
                <div className="text-[13px] font-extrabold text-primary">{e.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(e.starts_at).toLocaleString("ar")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
