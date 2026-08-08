import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  Calendar,
  Loader2,
  FileSpreadsheet,
  Download,
  Users,
  Vote,
  Archive,
  AlertTriangle,
  CheckCircle2,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getCouncilReportMeetingSummaryFn,
  getCouncilReportAttendanceRateFn,
  getCouncilReportQuorumHistoryFn,
  getCouncilReportTopicDispositionFn,
  getCouncilReportAgendaCompletionFn,
  getCouncilReportVotingSummaryFn,
  getCouncilReportDecisionStatusFn,
  getCouncilReportDecisionOverdueFn,
  getCouncilReportMeetingArchiveFn,
  getCouncilActivityPeriodFn,
} from "@/lib/councils-c9.functions";
import { exportXlsx } from "@/lib/reports/export";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ar", { dateStyle: "medium" });
  } catch {
    return iso;
  }
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

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive text-center">
      {message}
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="grid place-items-center py-10">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <span className="sr-only">جاري التحميل…</span>
    </div>
  );
}

const REPORT_TABS = [
  { id: "meeting_summary", label: "ملخص الاجتماعات", icon: Calendar },
  { id: "attendance", label: "الحضور والنصاب", icon: Users },
  { id: "quorum", label: "تاريخ النصاب", icon: CheckCircle2 },
  { id: "topics", label: "حالة الموضوعات", icon: ListChecks },
  { id: "agenda", label: "اكتمال جدول الأعمال", icon: ListChecks },
  { id: "voting", label: "نتائج التصويت", icon: Vote },
  { id: "decisions", label: "حالة القرارات", icon: BarChart3 },
  { id: "overdue", label: "قرارات متأخرة", icon: AlertTriangle },
  { id: "archive", label: "أرشيف الاجتماعات", icon: Archive },
  { id: "activity", label: "النشاط خلال فترة", icon: BarChart3 },
] as const;

export function CouncilReportsPanel({ councilId }: { councilId: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [activeTab, setActiveTab] = useState<string>("meeting_summary");

  const fetchMeetingSummary = useServerFn(getCouncilReportMeetingSummaryFn);
  const fetchAttendance = useServerFn(getCouncilReportAttendanceRateFn);
  const fetchQuorum = useServerFn(getCouncilReportQuorumHistoryFn);
  const fetchTopics = useServerFn(getCouncilReportTopicDispositionFn);
  const fetchAgenda = useServerFn(getCouncilReportAgendaCompletionFn);
  const fetchVoting = useServerFn(getCouncilReportVotingSummaryFn);
  const fetchDecisions = useServerFn(getCouncilReportDecisionStatusFn);
  const fetchOverdue = useServerFn(getCouncilReportDecisionOverdueFn);
  const fetchArchive = useServerFn(getCouncilReportMeetingArchiveFn);
  const fetchActivity = useServerFn(getCouncilActivityPeriodFn);

  const commonOptions = {
    council_id: councilId,
    from: from || undefined,
    to: to || undefined,
  };

  const meetingSummaryQuery = useQuery({
    queryKey: ["council-report", "meeting-summary", councilId, from, to],
    queryFn: () => fetchMeetingSummary({ data: commonOptions }),
    enabled: activeTab === "meeting_summary",
  });

  const attendanceQuery = useQuery({
    queryKey: ["council-report", "attendance", councilId],
    queryFn: () => fetchAttendance({ data: { council_id: councilId } }),
    enabled: activeTab === "attendance",
  });

  const quorumQuery = useQuery({
    queryKey: ["council-report", "quorum", councilId],
    queryFn: () => fetchQuorum({ data: { council_id: councilId } }),
    enabled: activeTab === "quorum",
  });

  const topicsQuery = useQuery({
    queryKey: ["council-report", "topics", councilId, from, to],
    queryFn: () => fetchTopics({ data: commonOptions }),
    enabled: activeTab === "topics",
  });

  const agendaQuery = useQuery({
    queryKey: ["council-report", "agenda", councilId],
    queryFn: () => fetchAgenda({ data: { council_id: councilId } }),
    enabled: activeTab === "agenda",
  });

  const votingQuery = useQuery({
    queryKey: ["council-report", "voting", councilId],
    queryFn: () => fetchVoting({ data: { council_id: councilId } }),
    enabled: activeTab === "voting",
  });

  const decisionsQuery = useQuery({
    queryKey: ["council-report", "decisions", councilId],
    queryFn: () => fetchDecisions({ data: { council_id: councilId } }),
    enabled: activeTab === "decisions",
  });

  const overdueQuery = useQuery({
    queryKey: ["council-report", "overdue", councilId],
    queryFn: () => fetchOverdue({ data: { council_id: councilId } }),
    enabled: activeTab === "overdue",
  });

  const archiveQuery = useQuery({
    queryKey: ["council-report", "archive", councilId],
    queryFn: () => fetchArchive({ data: { council_id: councilId } }),
    enabled: activeTab === "archive",
  });

  const activityQuery = useQuery({
    queryKey: ["council-report", "activity", councilId, from, to],
    queryFn: () => fetchActivity({ data: commonOptions }),
    enabled: activeTab === "activity",
  });

  const exportCurrent = () => {
    let rows: Record<string, unknown>[] = [];
    let filename = "council-report";

    switch (activeTab) {
      case "meeting_summary": {
        const data = meetingSummaryQuery.data as { meetings?: Array<Record<string, unknown>> } | undefined;
        rows = data?.meetings ?? [];
        filename = "meeting-summary";
        break;
      }
      case "attendance": {
        const data = attendanceQuery.data as { meetings?: Array<Record<string, unknown>> } | undefined;
        rows = data?.meetings ?? [];
        filename = "attendance-rate";
        break;
      }
      case "quorum": {
        const data = quorumQuery.data as { quorum_checks?: Array<Record<string, unknown>> } | undefined;
        rows = data?.quorum_checks ?? [];
        filename = "quorum-history";
        break;
      }
      case "topics": {
        const data = topicsQuery.data as { topics?: Array<Record<string, unknown>> } | undefined;
        rows = data?.topics ?? [];
        filename = "topic-disposition";
        break;
      }
      case "agenda": {
        const data = agendaQuery.data as { meetings_with_agenda?: Array<Record<string, unknown>> } | undefined;
        rows = data?.meetings_with_agenda ?? [];
        filename = "agenda-completion";
        break;
      }
      case "voting": {
        const data = votingQuery.data as { items?: Array<Record<string, unknown>> } | undefined;
        rows = data?.items ?? [];
        filename = "voting-summary";
        break;
      }
      case "decisions": {
        const data = decisionsQuery.data as { decisions?: Array<Record<string, unknown>> } | undefined;
        rows = data?.decisions ?? [];
        filename = "decision-status";
        break;
      }
      case "overdue": {
        const data = overdueQuery.data as { overdue_decisions?: Array<Record<string, unknown>> } | undefined;
        rows = data?.overdue_decisions ?? [];
        filename = "decision-overdue";
        break;
      }
      case "archive": {
        const data = archiveQuery.data as { archived_meetings?: Array<Record<string, unknown>> } | undefined;
        rows = data?.archived_meetings ?? [];
        filename = "meeting-archive";
        break;
      }
      case "activity": {
        const data = activityQuery.data as Record<string, unknown> | undefined;
        rows = data ? [data] : [];
        filename = "activity-period";
        break;
      }
    }

    if (rows.length === 0) return;
    exportXlsx(rows, `${filename}.xlsx`);
  };

  const queries = useMemo(
    () => ({
      meeting_summary: meetingSummaryQuery,
      attendance: attendanceQuery,
      quorum: quorumQuery,
      topics: topicsQuery,
      agenda: agendaQuery,
      voting: votingQuery,
      decisions: decisionsQuery,
      overdue: overdueQuery,
      archive: archiveQuery,
      activity: activityQuery,
    }),
    [
      meetingSummaryQuery,
      attendanceQuery,
      quorumQuery,
      topicsQuery,
      agendaQuery,
      votingQuery,
      decisionsQuery,
      overdueQuery,
      archiveQuery,
      activityQuery,
    ]
  );

  const activeQuery = queries[activeTab as keyof typeof queries];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" aria-hidden />
            <CardTitle className="text-base">التقارير</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="report-from" className="text-xs text-muted-foreground">
                من
              </Label>
              <Input
                id="report-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-36 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="report-to" className="text-xs text-muted-foreground">
                إلى
              </Label>
              <Input
                id="report-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 w-36 text-xs"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={exportCurrent}
              disabled={!activeQuery?.data}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
              تصدير Excel
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
          <TabsList className="flex-wrap h-auto gap-1 mb-4">
            {REPORT_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="text-xs gap-1"
                  aria-label={tab.label}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="meeting_summary">
            {meetingSummaryQuery.isLoading ? (
              <LoadingBlock />
            ) : meetingSummaryQuery.isError ? (
              <ErrorState message="تعذّر تحميل ملخص الاجتماعات." />
            ) : (
              <MeetingSummaryContent data={meetingSummaryQuery.data} />
            )}
          </TabsContent>

          <TabsContent value="attendance">
            {attendanceQuery.isLoading ? (
              <LoadingBlock />
            ) : attendanceQuery.isError ? (
              <ErrorState message="تعذّر تحميل تقرير الحضور." />
            ) : (
              <AttendanceContent data={attendanceQuery.data} />
            )}
          </TabsContent>

          <TabsContent value="quorum">
            {quorumQuery.isLoading ? (
              <LoadingBlock />
            ) : quorumQuery.isError ? (
              <ErrorState message="تعذّر تحميل تاريخ النصاب." />
            ) : (
              <QuorumHistoryContent data={quorumQuery.data} />
            )}
          </TabsContent>

          <TabsContent value="topics">
            {topicsQuery.isLoading ? (
              <LoadingBlock />
            ) : topicsQuery.isError ? (
              <ErrorState message="تعذّر تحميل حالة الموضوعات." />
            ) : (
              <TopicDispositionContent data={topicsQuery.data} />
            )}
          </TabsContent>

          <TabsContent value="agenda">
            {agendaQuery.isLoading ? (
              <LoadingBlock />
            ) : agendaQuery.isError ? (
              <ErrorState message="تعذّر تحميل اكتمال جدول الأعمال." />
            ) : (
              <AgendaCompletionContent data={agendaQuery.data} />
            )}
          </TabsContent>

          <TabsContent value="voting">
            {votingQuery.isLoading ? (
              <LoadingBlock />
            ) : votingQuery.isError ? (
              <ErrorState message="تعذّر تحميل نتائج التصويت." />
            ) : (
              <VotingSummaryContent data={votingQuery.data} />
            )}
          </TabsContent>

          <TabsContent value="decisions">
            {decisionsQuery.isLoading ? (
              <LoadingBlock />
            ) : decisionsQuery.isError ? (
              <ErrorState message="تعذّر تحميل حالة القرارات." />
            ) : (
              <DecisionStatusContent data={decisionsQuery.data} />
            )}
          </TabsContent>

          <TabsContent value="overdue">
            {overdueQuery.isLoading ? (
              <LoadingBlock />
            ) : overdueQuery.isError ? (
              <ErrorState message="تعذّر تحميل القرارات المتأخرة." />
            ) : (
              <OverdueDecisionsContent data={overdueQuery.data} />
            )}
          </TabsContent>

          <TabsContent value="archive">
            {archiveQuery.isLoading ? (
              <LoadingBlock />
            ) : archiveQuery.isError ? (
              <ErrorState message="تعذّر تحميل أرشيف الاجتماعات." />
            ) : (
              <ArchiveContent data={archiveQuery.data} />
            )}
          </TabsContent>

          <TabsContent value="activity">
            {activityQuery.isLoading ? (
              <LoadingBlock />
            ) : activityQuery.isError ? (
              <ErrorState message="تعذّر تحميل تقرير النشاط." />
            ) : (
              <ActivityContent data={activityQuery.data} />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function MeetingSummaryContent({ data }: { data: unknown }) {
  const d = data as CouncilReportMeetingSummary;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="إجمالي الاجتماعات" value={d.total_meetings} />
        <MetricCard label="مجدولة" value={d.by_status?.scheduled ?? 0} />
        <MetricCard label="مؤرشفة" value={d.by_status?.archived ?? 0} />
      </div>
      {d.meetings?.length === 0 ? (
        <EmptyState text="لا توجد اجتماعات ضمن الفترة المحددة." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs text-right">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">الرقم</th>
                <th className="p-2 font-medium">العنوان</th>
                <th className="p-2 font-medium">الموعد</th>
                <th className="p-2 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {d.meetings?.map((m) => (
                <tr key={m.meeting_id}>
                  <td className="p-2 font-mono">{m.meeting_number}</td>
                  <td className="p-2 font-medium">{m.title}</td>
                  <td className="p-2">{formatDateTime(m.scheduled_at)}</td>
                  <td className="p-2">
                    <Badge variant="outline" className="text-[10px]">
                      {m.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AttendanceContent({ data }: { data: unknown }) {
  const d = data as CouncilReportAttendanceRate;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard label="متوسط نسبة الحضور" value={`${Math.round((d.average_attendance_rate ?? 0) * 100)}%`} />
        <MetricCard label="الجلسات المُقيّمة" value={d.total_evaluated_sessions} />
      </div>
      {d.meetings?.length === 0 ? (
        <EmptyState text="لا توجد بيانات حضور مسجلة." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs text-right">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">الاجتماع</th>
                <th className="p-2 font-medium">المؤهلين</th>
                <th className="p-2 font-medium">الحاضرون</th>
                <th className="p-2 font-medium">النسبة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {d.meetings?.map((m) => (
                <tr key={m.meeting_id}>
                  <td className="p-2 font-medium">{m.meeting_number} — {formatDateTime(m.scheduled_at)}</td>
                  <td className="p-2">{m.eligible}</td>
                  <td className="p-2">{m.present}</td>
                  <td className="p-2">{Math.round(m.rate * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function QuorumHistoryContent({ data }: { data: unknown }) {
  const d = data as { quorum_checks?: Array<{ meeting_id: string; meeting_number: number; scheduled_at: string; quorum_met: boolean; required: number; present: number; evaluated_at: string; is_final: boolean }> };
  return (
    <div className="space-y-4">
      {d.quorum_checks?.length === 0 ? (
        <EmptyState text="لا توجد تقييمات نصاب مسجلة." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs text-right">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">الاجتماع</th>
                <th className="p-2 font-medium">النصاب</th>
                <th className="p-2 font-medium">المطلوب</th>
                <th className="p-2 font-medium">الحاضرون</th>
                <th className="p-2 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {d.quorum_checks?.map((q) => (
                <tr key={q.meeting_id + q.evaluated_at}>
                  <td className="p-2 font-medium">{q.meeting_number} — {formatDateTime(q.scheduled_at)}</td>
                  <td className="p-2">{q.is_final ? "نهائي" : "مبدئي"}</td>
                  <td className="p-2">{q.required}</td>
                  <td className="p-2">{q.present}</td>
                  <td className="p-2">
                    <Badge variant={q.quorum_met ? "secondary" : "destructive"} className="text-[10px]">
                      {q.quorum_met ? "مكتمل" : "غير مكتمل"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TopicDispositionContent({ data }: { data: unknown }) {
  const d = data as CouncilReportTopicDisposition;
  const entries = Object.entries(d.by_status ?? {});
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="إجمالي الموضوعات" value={d.total_topics} />
        {entries.map(([status, count]) => (
          <MetricCard key={status} label={status} value={count} />
        ))}
      </div>
      {d.topics?.length === 0 ? (
        <EmptyState text="لا توجد موضوعات ضمن الفترة المحددة." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs text-right">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">العنوان</th>
                <th className="p-2 font-medium">الحالة</th>
                <th className="p-2 font-medium">تاريخ التقديم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {d.topics?.map((t) => (
                <tr key={t.topic_id}>
                  <td className="p-2 font-medium">{t.title}</td>
                  <td className="p-2">
                    <Badge variant="outline" className="text-[10px]">
                      {t.status}
                    </Badge>
                  </td>
                  <td className="p-2">{formatDateTime(t.submitted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AgendaCompletionContent({ data }: { data: unknown }) {
  const d = data as {
    meetings_with_agenda?: Array<{
      meeting_id: string;
      meeting_number: number;
      title: string;
      total_items: number;
      approved_items: number;
      completion_rate: number;
    }>;
  };
  return (
    <div className="space-y-4">
      {d.meetings_with_agenda?.length === 0 ? (
        <EmptyState text="لا توجد اجتماعات بجدول أعمال." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs text-right">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">الاجتماع</th>
                <th className="p-2 font-medium">إجمالي البنود</th>
                <th className="p-2 font-medium">المعتمدة</th>
                <th className="p-2 font-medium">نسبة الاكتمال</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {d.meetings_with_agenda?.map((m) => (
                <tr key={m.meeting_id}>
                  <td className="p-2 font-medium">{m.meeting_number} — {m.title}</td>
                  <td className="p-2">{m.total_items}</td>
                  <td className="p-2">{m.approved_items}</td>
                  <td className="p-2">{Math.round(m.completion_rate * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VotingSummaryContent({ data }: { data: unknown }) {
  const d = data as {
    total_voted_items?: number;
    by_outcome?: Record<string, number>;
    items?: Array<{ agenda_item_id: string; meeting_id: string; title: string; outcome: string; yes: number; no: number; abstain: number; total: number }>;
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="إجمالي البنود المُصوّت عليها" value={d.total_voted_items ?? 0} />
        {Object.entries(d.by_outcome ?? {}).map(([outcome, count]) => (
          <MetricCard key={outcome} label={outcome} value={count} />
        ))}
      </div>
      {d.items?.length === 0 ? (
        <EmptyState text="لا توجد نتائج تصويت مسجلة." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs text-right">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">البند</th>
                <th className="p-2 font-medium">موافق</th>
                <th className="p-2 font-medium">معارض</th>
                <th className="p-2 font-medium">ممتنع</th>
                <th className="p-2 font-medium">النتيجة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {d.items?.map((item) => (
                <tr key={item.agenda_item_id}>
                  <td className="p-2 font-medium">{item.title}</td>
                  <td className="p-2">{item.yes}</td>
                  <td className="p-2">{item.no}</td>
                  <td className="p-2">{item.abstain}</td>
                  <td className="p-2">
                    <Badge variant="outline" className="text-[10px]">
                      {item.outcome}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DecisionStatusContent({ data }: { data: unknown }) {
  const d = data as {
    summary?: Record<string, number>;
    decisions?: Array<{ decision_id: string; canonical_number: string; title: string; status: string; responsible_user_id: string | null; responsible_unit: string | null; due_date: string | null; completed_at: string | null }>;
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(d.summary ?? {}).map(([key, value]) => (
          <MetricCard key={key} label={key} value={value} />
        ))}
      </div>
      {d.decisions?.length === 0 ? (
        <EmptyState text="لا توجد قرارات مسجلة." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs text-right">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">الرقم</th>
                <th className="p-2 font-medium">العنوان</th>
                <th className="p-2 font-medium">الحالة</th>
                <th className="p-2 font-medium">تاريخ الاستحقاق</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {d.decisions?.map((dec) => (
                <tr key={dec.decision_id}>
                  <td className="p-2 font-mono">{dec.canonical_number}</td>
                  <td className="p-2 font-medium">{dec.title}</td>
                  <td className="p-2">
                    <Badge variant="outline" className="text-[10px]">
                      {dec.status}
                    </Badge>
                  </td>
                  <td className="p-2">{formatDate(dec.due_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OverdueDecisionsContent({ data }: { data: unknown }) {
  const d = data as { overdue_decisions?: Array<{ decision_id: string; canonical_number: string; title: string; status: string; responsible_user_id: string | null; responsible_unit: string | null; due_date: string }> };
  return (
    <div className="space-y-4">
      {d.overdue_decisions?.length === 0 ? (
        <EmptyState text="لا توجد قرارات متأخرة." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs text-right">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">الرقم</th>
                <th className="p-2 font-medium">العنوان</th>
                <th className="p-2 font-medium">تاريخ الاستحقاق</th>
                <th className="p-2 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {d.overdue_decisions?.map((dec) => (
                <tr key={dec.decision_id}>
                  <td className="p-2 font-mono">{dec.canonical_number}</td>
                  <td className="p-2 font-medium">{dec.title}</td>
                  <td className="p-2 text-destructive">{formatDate(dec.due_date)}</td>
                  <td className="p-2">
                    <Badge variant="destructive" className="text-[10px]">
                      {dec.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ArchiveContent({ data }: { data: unknown }) {
  const d = data as { total_archived_meetings?: number; archived_meetings?: Array<{ meeting_id: string; meeting_number: number; title: string; scheduled_at: string; closed_at: string | null; status: string }> };
  return (
    <div className="space-y-4">
      <MetricCard label="إجمالي الاجتماعات المؤرشفة" value={d.total_archived_meetings ?? 0} />
      {d.archived_meetings?.length === 0 ? (
        <EmptyState text="لا توجد اجتماعات مؤرشفة." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs text-right">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">الرقم</th>
                <th className="p-2 font-medium">العنوان</th>
                <th className="p-2 font-medium">الموعد</th>
                <th className="p-2 font-medium">تاريخ الإغلاق</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {d.archived_meetings?.map((m) => (
                <tr key={m.meeting_id}>
                  <td className="p-2 font-mono">{m.meeting_number}</td>
                  <td className="p-2 font-medium">{m.title}</td>
                  <td className="p-2">{formatDateTime(m.scheduled_at)}</td>
                  <td className="p-2">{formatDateTime(m.closed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ActivityContent({ data }: { data: unknown }) {
  const d = data as {
    meetings_count?: number;
    topics_count?: number;
    decisions_count?: number;
    votes_count?: number;
    archived_meetings_count?: number;
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="الاجتماعات" value={d.meetings_count ?? 0} />
        <MetricCard label="الموضوعات" value={d.topics_count ?? 0} />
        <MetricCard label="القرارات" value={d.decisions_count ?? 0} />
        <MetricCard label="الأصوات" value={d.votes_count ?? 0} />
        <MetricCard label="المؤرشفة" value={d.archived_meetings_count ?? 0} />
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
      <div className="text-lg font-bold text-primary">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
