import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getAgendaItemsForMeeting } from "@/lib/faculty-councils.functions";
import {
  LIVE_SESSION_INTERVAL_MS,
  agendaSessionStatusLabel,
  agendaSessionStatusTone,
  liveQueryOptions,
  useLivePollInterval,
} from "@/lib/councils-live";
import { AGENDA_LOAD_FAILED_UI, CompactEmpty } from "./shared";

export function MeetingAgendaExpandable({
  meetingId,
  autoExpand = false,
  live = false,
}: {
  meetingId: string;
  /** Opens the agenda immediately (used when the user asked for this meeting's agenda). */
  autoExpand?: boolean;
  /** Poll item states every 2s while the meeting is in session. */
  live?: boolean;
}) {
  const fetchAgenda = useServerFn(getAgendaItemsForMeeting);
  const liveInterval = useLivePollInterval(live, LIVE_SESSION_INTERVAL_MS);
  const [expanded, setExpanded] = useState(autoExpand);

  useEffect(() => {
    if (autoExpand) setExpanded(true);
  }, [autoExpand]);
  const agendaQuery = useQuery({
    queryKey: ["faculty", "meeting-agenda", meetingId],
    queryFn: () => fetchAgenda({ data: { meetingId } }),
    enabled: expanded,
    ...liveQueryOptions(liveInterval),
  });
  const items = agendaQuery.data?.items ?? [];

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-8 items-center gap-1.5 text-xs font-bold text-primary hover:underline"
      >
        <ListChecks className="h-3.5 w-3.5" />
        عرض جدول الأعمال
        <ChevronLeft
          className={`h-3.5 w-3.5 transition-transform ${expanded ? "-rotate-90" : "rotate-180"}`}
        />
      </button>
      {expanded ? (
        <div className="mt-2">
          {agendaQuery.isLoading ? (
            <p className="text-[11px] text-muted-foreground">جاري تحميل جدول الأعمال…</p>
          ) : agendaQuery.isError ? (
            <p className="text-[11px] text-destructive">{AGENDA_LOAD_FAILED_UI}</p>
          ) : items.length === 0 ? (
            <CompactEmpty text="لا توجد بنود في جدول الأعمال حتى الآن." />
          ) : (
            <ol className="list-none space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={
                    agendaSessionStatusTone(item.session_status) === "active"
                      ? "rounded-md border-2 border-primary bg-primary/10 px-2.5 py-2 text-[11px] shadow-sm"
                      : agendaSessionStatusTone(item.session_status) === "success"
                        ? "rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-2 text-[11px]"
                        : "rounded-md border border-border/70 bg-muted/10 px-2.5 py-2 text-[11px]"
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-primary">{item.order_index}.</span>
                    <span className="font-medium text-foreground">{item.title}</span>
                    <Badge
                      variant={
                        agendaSessionStatusTone(item.session_status) === "active"
                          ? "default"
                          : "outline"
                      }
                      className="text-[9px]"
                    >
                      {agendaSessionStatusLabel(item.session_status)}
                    </Badge>
                    {item.is_approved ? (
                      <Badge variant="secondary" className="text-[9px]">
                        معتمد
                      </Badge>
                    ) : null}
                  </div>
                  {item.topic ? (
                    <p className="mt-1 text-muted-foreground">موضوع: {item.topic.title}</p>
                  ) : null}
                  {item.notes ? <p className="mt-1 text-foreground/80">{item.notes}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
}
