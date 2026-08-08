import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarClock,
  Inbox,
  ListChecks,
  Users,
  FileText,
  Archive,
  AlertCircle,
  Loader2,
  ScrollText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCouncilChairDashboardFn } from "@/lib/councils-c9.functions";

interface CouncilChairDashboardProps {
  councilId: string;
  councilName: string;
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

export function CouncilChairDashboard({ councilId, councilName }: CouncilChairDashboardProps) {
  const fetchDashboard = useServerFn(getCouncilChairDashboardFn);
  const query = useQuery({
    queryKey: ["council-chair-dashboard", councilId],
    queryFn: () => fetchDashboard({ data: { council_id: councilId } }),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const data = (query.data ?? {}) as Record<string, unknown[]>;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <ScrollText className="h-5 w-5 text-primary" />
        <h2 className="font-bold text-primary">لوحة عمل رئيس المجلس — {councilName}</h2>
      </div>

      {query.isLoading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : query.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          تعذر تحميل لوحة رئيس المجلس. تأكد من صلاحياتك.
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
                    className="flex items-center justify-between rounded-md border border-border p-2 text-xs"
                  >
                    <div>
                      <p className="font-bold">{m.title}</p>
                      <p className="text-muted-foreground mt-0.5">
                        {formatDateTime(m.scheduled_at)}
                      </p>
                    </div>
                    <Badge variant="secondary">{statusLabel(m.status)}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Inbox className="h-4 w-4" />
                حالة استقبال الموضوعات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.intake_open_meetings ?? []).length === 0 ? (
                <EmptyItem text="لا يوجد استقبال مفتوح حالياً." />
              ) : (
                (data.intake_open_meetings as Array<{
                  meeting_id: string;
                  title: string;
                  intake_opens_at: string;
                  intake_closes_at: string;
                }>).map((m) => (
                  <div
                    key={m.meeting_id}
                    className="rounded-md border border-border p-2 text-xs"
                  >
                    <p className="font-bold">{m.title}</p>
                    <p className="text-muted-foreground mt-0.5">
                      الإغلاق: {formatDateTime(m.intake_closes_at)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                موضوعات تحتاج مراجعة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.topics_needing_review ?? []).length === 0 ? (
                <EmptyItem text="لا توجد موضوعات تنتظر المراجعة." />
              ) : (
                (data.topics_needing_review as Array<{
                  topic_id: string;
                  title: string;
                  status: string;
                }>).map((t) => (
                  <div
                    key={t.topic_id}
                    className="flex items-center justify-between rounded-md border border-border p-2 text-xs"
                  >
                    <p className="font-bold truncate">{t.title}</p>
                    <Badge variant="outline">{statusLabel(t.status)}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ListChecks className="h-4 w-4" />
                جاهزية جدول الأعمال
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.meetings_awaiting_agenda_finalization ?? []).length === 0 ? (
                <EmptyItem text="لا توجد اجتماعات تنتظر اعتماد جدول الأعمال." />
              ) : (
                (data.meetings_awaiting_agenda_finalization as Array<{
                  meeting_id: string;
                  title: string;
                  status: string;
                }>).map((m) => (
                  <div
                    key={m.meeting_id}
                    className="flex items-center justify-between rounded-md border border-border p-2 text-xs"
                  >
                    <p className="font-bold">{m.title}</p>
                    <Badge variant="outline">بانتظار الاعتماد</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                الحضور والنصاب
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.meetings_awaiting_session ?? []).length === 0 ? (
                <EmptyItem text="لا توجد اجتماعات جاهزة للجلسة." />
              ) : (
                (data.meetings_awaiting_session as Array<{
                  meeting_id: string;
                  title: string;
                  scheduled_at: string;
                }>).map((m) => (
                  <div
                    key={m.meeting_id}
                    className="flex items-center justify-between rounded-md border border-border p-2 text-xs"
                  >
                    <div>
                      <p className="font-bold">{m.title}</p>
                      <p className="text-muted-foreground mt-0.5">
                        {formatDateTime(m.scheduled_at)}
                      </p>
                    </div>
                    <Badge variant="secondary">جاهز للجلسة</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" />
                محاضر تنتظر الاعتماد
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.minutes_awaiting_approval ?? []).length === 0 ? (
                <EmptyItem text="لا توجد محاضر تنتظر الاعتماد." />
              ) : (
                (data.minutes_awaiting_approval as Array<{
                  meeting_id: string;
                  title: string;
                  minutes_status: string;
                }>).map((m) => (
                  <div
                    key={m.meeting_id}
                    className="flex items-center justify-between rounded-md border border-border p-2 text-xs"
                  >
                    <p className="font-bold">{m.title}</p>
                    <Badge variant="outline">بانتظار الاعتماد</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                قرارات متأخرة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.overdue_decisions ?? []).length === 0 ? (
                <EmptyItem text="لا توجد قرارات متأخرة." />
              ) : (
                (data.overdue_decisions as Array<{
                  decision_id: string;
                  canonical_number: string;
                  title: string;
                  due_date: string;
                }>).map((d) => (
                  <div
                    key={d.decision_id}
                    className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs"
                  >
                    <p className="font-bold text-destructive">{d.title}</p>
                    <p className="text-muted-foreground mt-0.5">
                      الموعد: {formatDateTime(d.due_date)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Archive className="h-4 w-4" />
                اجتماعات جاهزة للأرشفة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.meetings_ready_to_archive ?? []).length === 0 ? (
                <EmptyItem text="لا توجد اجتماعات جاهزة للأرشفة." />
              ) : (
                (data.meetings_ready_to_archive as Array<{
                  meeting_id: string;
                  title: string;
                  status: string;
                }>).map((m) => (
                  <div
                    key={m.meeting_id}
                    className="flex items-center justify-between rounded-md border border-border p-2 text-xs"
                  >
                    <p className="font-bold">{m.title}</p>
                    <Badge variant="outline">جاهز للأرشفة</Badge>
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
