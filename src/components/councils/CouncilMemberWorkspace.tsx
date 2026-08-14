import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarClock,
  ListChecks,
  Vote,
  FileText,
  Scale,
  Loader2,
  ScrollText,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCouncilMemberWorkspaceFn } from "@/lib/councils-c9.functions";
import {
  COUNCIL_LIVE_INDICATORS_INTERVAL_MS,
  agendaSessionStatusLabel,
  liveQueryOptions,
  useLivePollInterval,
} from "@/lib/councils-live";

interface CouncilMemberWorkspaceProps {
  councilId: string;
  councilName: string;
  readOnly?: boolean;
  /** Opens the meeting workspace for the live session. */
  onEnterMeeting?: (meetingId: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "مجدول",
  intake_open: "استقبال مفتوح",
  intake_closed: "استقبال مغلق",
  agenda_ready: "جدول الأعمال جاهز",
  in_session: "جلسة منعقدة",
  minutes_draft: "مسودة محضر",
  minutes_review: "مراجعة محضر",
  minutes_locked: "محضر مقفل",
  archived: "مؤرشف",
  cancelled: "ملغى",
  pending: "بانتظار المناقشة",
  in_discussion: "قيد المناقشة",
  voting_open: "التصويت مفتوح",
  voting_closed: "انتهى التصويت",
  resolved: "تم البت",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}


function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function EmptyItem({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

export function CouncilMemberWorkspace({
  councilId,
  councilName,
  readOnly = false,
  onEnterMeeting,
}: CouncilMemberWorkspaceProps) {
  const fetchWorkspace = useServerFn(getCouncilMemberWorkspaceFn);
  const liveInterval = useLivePollInterval(
    Boolean(councilId),
    COUNCIL_LIVE_INDICATORS_INTERVAL_MS,
  );
  const query = useQuery({
    queryKey: ["council-member-workspace", councilId],
    queryFn: () => fetchWorkspace({ data: { council_id: councilId } }),
    ...liveQueryOptions(liveInterval),
  });

  const data = (query.data ?? {}) as Record<string, unknown[]>;

  const meetings = (data.upcoming_meetings ?? []) as Array<{
    meeting_id: string;
    meeting_number: number;
    title: string;
    scheduled_at: string;
    status: string;
  }>;
  const liveMeeting = meetings.find((m) => m.status === "in_session") ?? null;
  const openVotes = (data.open_votes ?? []) as Array<{
    agenda_item_id: string;
    title: string;
    session_status: string;
  }>;


  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <ScrollText className="h-5 w-5 text-primary" />
        <h2 className="font-bold text-primary">
          {readOnly ? "عرض المجلس (قراءة فقط)" : "مساحة العضو"} — {councilName}
        </h2>
        {readOnly ? (
          <Badge variant="outline" className="gap-1">
            <Eye className="h-3 w-3" />
            مطّلع
          </Badge>
        ) : null}
      </div>

      {query.isLoading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : query.isError ? (
        <div className="rounded-md border border-muted/50 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
          {query.error instanceof Error ? query.error.message : "مساحة عمل عضو المجلس غير متاحة حالياً."}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CalendarClock className="h-4 w-4" />
                الاجتماعات القادمة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.upcoming_meetings ?? []).length === 0 ? (
                <EmptyItem text="لا توجد اجتماعات قادمة." />
              ) : (
                (data.upcoming_meetings as Array<{
                  meeting_id: string;
                  meeting_number: number;
                  title: string;
                  scheduled_at: string;
                  status: string;
                }>).map((m) => (
                  <div
                    key={m.meeting_id}
                    className="rounded-md border border-border p-2 text-xs"
                  >
                    <p className="font-bold">{m.title}</p>
                    <p className="text-muted-foreground mt-0.5">
                      {formatDateTime(m.scheduled_at)}
                    </p>
                    <Badge variant="secondary" className="mt-1.5">
                      {statusLabel(m.status)}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Live session summary — meeting-scoped. The full agenda lives inside
              the meeting workspace so agendas of different meetings never mix. */}
          <Card className={liveMeeting ? "border-primary/50 bg-primary/5" : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ListChecks className="h-4 w-4" />
                الجلسة الحالية
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!liveMeeting ? (
                <EmptyItem text="لا توجد جلسة منعقدة الآن. افتح اجتماعاً من تبويب الاجتماعات لعرض جدول أعماله." />
              ) : (
                <>
                  <p className="text-xs font-bold">{liveMeeting.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatDateTime(liveMeeting.scheduled_at)}
                  </p>
                  {openVotes.length > 0 ? (
                    <div className="rounded-md border border-primary/40 bg-primary/10 p-2 text-xs">
                      <p className="font-bold text-primary flex items-center gap-1.5">
                        <Vote className="h-3.5 w-3.5" />
                        تصويت مطلوب: {openVotes[0].title}
                      </p>
                      <Badge variant="default" className="mt-1.5">
                        {agendaSessionStatusLabel(openVotes[0].session_status)}
                      </Badge>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      لا يوجد تصويت مفتوح حالياً.
                    </p>
                  )}
                  {onEnterMeeting ? (
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-9 text-xs w-full"
                      onClick={() => onEnterMeeting(liveMeeting.meeting_id)}
                    >
                      {openVotes.length > 0 ? "صوّت الآن — دخول الجلسة" : "دخول الجلسة"}
                    </Button>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>


          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" />
                المحاضر
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.minutes ?? []).length === 0 ? (
                <EmptyItem text="لا توجد محاضر متاحة." />
              ) : (
                (data.minutes as Array<{
                  meeting_id: string;
                  title: string;
                  is_locked: boolean;
                }>).map((m) => (
                  <div
                    key={m.meeting_id}
                    className="flex items-center justify-between rounded-md border border-border p-2 text-xs"
                  >
                    <p className="font-bold">{m.title}</p>
                    <Badge variant={m.is_locked ? "secondary" : "outline"}>
                      {m.is_locked ? "مقفل" : "مسودة"}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Scale className="h-4 w-4" />
                القرارات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.decisions ?? []).length === 0 ? (
                <EmptyItem text="لا توجد قرارات صادرة لهذا المجلس." />
              ) : (
                (data.decisions as Array<{
                  decision_id: string;
                  canonical_number: string;
                  title: string;
                  status: string;
                  due_date: string;
                }>).map((d) => (
                  <div
                    key={d.decision_id}
                    className="flex items-center justify-between rounded-md border border-border p-2 text-xs"
                  >
                    <div>
                      <p className="font-bold">{d.title}</p>
                      <p className="text-muted-foreground mt-0.5">
                        الموعد: {formatDateTime(d.due_date)}
                      </p>
                    </div>
                    <Badge variant="outline">{statusLabel(d.status)}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
