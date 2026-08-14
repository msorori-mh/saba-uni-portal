import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gavel } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCouncilDecisionFollowupDashboardFn } from "@/lib/councils-c4-c8.functions";
import type { CouncilMeetingV2Item } from "@/lib/faculty-councils.functions";
import { CompactEmpty, ErrorBlock, LoadingBlock, SectionShell, formatDate } from "./shared";

const DECISION_STATUS_LABELS: Record<string, string> = {
  issued: "صادر",
  assigned: "مُسند",
  in_progress: "قيد التنفيذ",
  partially_completed: "منفذ جزئياً",
  completed: "مكتمل",
  delayed: "متأخر",
  cancelled: "ملغى",
  blocked: "متعثّر",
};

export function CouncilDecisionsPanel({
  councilId,
  meetings,
  onOpenSourceMeeting,
}: {
  councilId: string;
  meetings: CouncilMeetingV2Item[];
  onOpenSourceMeeting: (meetingId: string) => void;
}) {
  const fetchDashboard = useServerFn(getCouncilDecisionFollowupDashboardFn);
  const query = useQuery({
    queryKey: ["council-decisions-panel", councilId],
    queryFn: () => fetchDashboard({ data: { council_id: councilId } }),
    enabled: Boolean(councilId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const decisions = ((query.data as { decisions?: unknown[] } | null)?.decisions ??
    []) as Array<Record<string, string | null>>;

  const meetingById = new Map(meetings.map((m) => [m.meeting_id, m]));

  return (
    <SectionShell
      icon={Gavel}
      title="قرارات المجلس ومتابعة التنفيذ"
      testId="councils-decisions-panel"
    >
      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorBlock message="تعذّر تحميل قرارات المجلس." />
      ) : decisions.length === 0 ? (
        <CompactEmpty
          text="لا توجد قرارات صادرة لهذا المجلس بعد."
          testId="councils-decisions-empty"
        />
      ) : (
        <ul className="space-y-2">
          {decisions.map((dec) => {
            const meetingId = dec.meeting_id ?? null;
            const source = meetingId ? meetingById.get(meetingId) : undefined;
            const status = dec.status ?? "issued";
            return (
              <li
                key={String(dec.decision_id)}
                data-testid="councils-decision-row"
                className="rounded-lg border border-border bg-card px-3 py-2.5 space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold text-primary">
                    {dec.canonical_number || String(dec.decision_id).slice(0, 8)}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {DECISION_STATUS_LABELS[status] ?? status}
                  </Badge>
                </div>
                <p className="text-sm font-bold text-primary">{dec.title}</p>
                {dec.body ? (
                  <p className="text-xs text-muted-foreground line-clamp-2">{dec.body}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {dec.responsible_unit ? (
                    <span>الجهة المكلفة: {dec.responsible_unit}</span>
                  ) : null}
                  {dec.due_date ? <span>الاستحقاق: {formatDate(dec.due_date)}</span> : null}
                  <span data-testid="councils-decision-source-meeting">
                    الاجتماع المصدر:{" "}
                    {source
                      ? `${source.meeting_title?.trim() || `اجتماع رقم ${source.meeting_number}`}`
                      : "غير محدد"}
                  </span>
                  {source ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => onOpenSourceMeeting(source.meeting_id)}
                    >
                      فتح الاجتماع المصدر
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionShell>
  );
}
