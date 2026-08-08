import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  CalendarClock,
  Users,
  ListChecks,
  Vote,
  Scale,
  AlertCircle,
  Clock,
  Archive,
  Activity,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getCouncilReportMeetingsByPeriodFn,
  getCouncilReportAttendanceRateFn,
  getCouncilReportQuorumHistoryFn,
  getCouncilReportTopicDispositionFn,
  getCouncilReportAgendaCompletionFn,
  getCouncilReportVoteResultSummaryFn,
  getCouncilReportDecisionExecutionStatusFn,
  getCouncilReportOverdueDecisionsFn,
  getCouncilReportMeetingDurationFn,
  getCouncilReportArchiveStatusFn,
  getCouncilReportCouncilActivityFn,
} from "@/lib/councils-c9.functions";

interface CouncilReportsViewProps {
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
  passed: "مرّ",
  rejected: "لم يمرّ",
  tied: "تعادل",
  pending: "معلّق",
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

export function CouncilReportsView({ councilId, councilName }: CouncilReportsViewProps) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const reportFns = {
    meetings: useServerFn(getCouncilReportMeetingsByPeriodFn),
    attendance: useServerFn(getCouncilReportAttendanceRateFn),
    quorum: useServerFn(getCouncilReportQuorumHistoryFn),
    topics: useServerFn(getCouncilReportTopicDispositionFn),
    agenda: useServerFn(getCouncilReportAgendaCompletionFn),
    votes: useServerFn(getCouncilReportVoteResultSummaryFn),
    decisions: useServerFn(getCouncilReportDecisionExecutionStatusFn),
    overdue: useServerFn(getCouncilReportOverdueDecisionsFn),
    duration: useServerFn(getCouncilReportMeetingDurationFn),
    archive: useServerFn(getCouncilReportArchiveStatusFn),
    activity: useServerFn(getCouncilReportCouncilActivityFn),
  };

  const reports: Array<{
    key: keyof typeof reportFns;
    label: string;
    icon: typeof BarChart3;
  }> = [
    { key: "meetings", label: "الاجتماعات حسب الفترة", icon: CalendarClock },
    { key: "attendance", label: "معدل الحضور", icon: Users },
    { key: "quorum", label: "تاريخ النصاب", icon: Activity },
    { key: "topics", label: "توزيع حالات الموضوعات", icon: ListChecks },
    { key: "agenda", label: "إنجاز جدول الأعمال", icon: ListChecks },
    { key: "votes", label: "ملخص نتائج التصويت", icon: Vote },
    { key: "decisions", label: "حالة تنفيذ القرارات", icon: Scale },
    { key: "overdue", label: "القرارات المتأخرة", icon: AlertCircle },
    { key: "duration", label: "مدة الاجتماعات", icon: Clock },
    { key: "archive", label: "حالة الأرشفة", icon: Archive },
    { key: "activity", label: "نشاط المجلس", icon: Activity },
  ];

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h2 className="font-bold text-primary">تقارير المجلس — {councilName}</h2>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">من</label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">إلى</label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {reports.map((r) => (
          <ReportCard
            key={r.key}
            reportKey={r.key}
            label={r.label}
            icon={r.icon}
            runFn={reportFns[r.key]}
            councilId={councilId}
            from={from}
            to={to}
          />
        ))}
      </div>
    </div>
  );
}

function ReportCard({
  reportKey,
  label,
  icon: Icon,
  runFn,
  councilId,
  from,
  to,
}: {
  reportKey: string;
  label: string;
  icon: typeof BarChart3;
  runFn: (payload: { data: Record<string, unknown> }) => Promise<unknown>;
  councilId: string;
  from: string;
  to: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const query = useQuery({
    queryKey: ["council-report", reportKey, councilId, from, to],
    queryFn: () =>
      runFn({
        data:
          reportKey === "meetings"
            ? { council_id: councilId, from: from || null, to: to || null }
            : { council_id: councilId },
      }),
    enabled: expanded,
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between"
          aria-expanded={expanded}
        >
          <CardTitle className="text-sm flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {label}
          </CardTitle>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </CardHeader>
      {expanded ? (
        <CardContent>
          {query.isLoading ? (
            <div className="grid place-items-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : query.isError ? (
            <div className="text-xs text-destructive">تعذر تحميل التقرير.</div>
          ) : (
            <ReportBody reportKey={reportKey} data={query.data} />
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

function ReportBody({ reportKey, data }: { reportKey: string; data: unknown }) {
  switch (reportKey) {
    case "meetings": {
      const items = (data as any[]) ?? [];
      return items.length === 0 ? (
        <EmptyItem text="لا توجد اجتماعات في الفترة." />
      ) : (
        <ul className="space-y-2 max-h-60 overflow-auto">
          {items.map((m: any) => (
            <li key={m.meeting_id} className="rounded-md border border-border p-2 text-xs">
              <p className="font-bold">{m.title}</p>
              <p className="text-muted-foreground mt-0.5">{formatDateTime(m.scheduled_at)}</p>
              <Badge variant="secondary" className="mt-1">
                {statusLabel(m.status)}
              </Badge>
            </li>
          ))}
        </ul>
      );
    }
    case "attendance": {
      const r = (data as any) ?? {};
      return (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-border p-2">
            <p className="text-muted-foreground">إجمالي المدعوين</p>
            <p className="font-bold text-lg">{r.total_eligible ?? 0}</p>
          </div>
          <div className="rounded-md border border-border p-2">
            <p className="text-muted-foreground">نسبة الحضور</p>
            <p className="font-bold text-lg">{r.attendance_rate ?? 0}%</p>
          </div>
          <div className="rounded-md border border-border p-2">
            <p className="text-muted-foreground">حاضر</p>
            <p className="font-bold">{r.present_count ?? 0}</p>
          </div>
          <div className="rounded-md border border-border p-2">
            <p className="text-muted-foreground">غائب</p>
            <p className="font-bold">{r.absent_count ?? 0}</p>
          </div>
        </div>
      );
    }
    case "quorum": {
      const items = (data as any[]) ?? [];
      return items.length === 0 ? (
        <EmptyItem text="لا يوجد تاريخ نصاب مسجل." />
      ) : (
        <ul className="space-y-2 max-h-60 overflow-auto">
          {items.map((q: any) => (
            <li key={q.meeting_id} className="rounded-md border border-border p-2 text-xs">
              <p className="font-bold">اجتماع رقم {q.meeting_number}</p>
              <p className="text-muted-foreground mt-0.5">
                حضور {q.present_count} من {q.required_count} ·{" "}
                {q.quorum_met ? "النصاب متحقق" : "النصاب غير متحقق"}
              </p>
            </li>
          ))}
        </ul>
      );
    }
    case "topics": {
      const r = (data as any) ?? {};
      const byStatus = r.by_status ?? {};
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">إجمالي الموضوعات: {r.total ?? 0}</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byStatus).map(([status, count]) => (
              <Badge key={status} variant="secondary">
                {statusLabel(status)}: {count as number}
              </Badge>
            ))}
          </div>
        </div>
      );
    }
    case "agenda": {
      const items = (data as any[]) ?? [];
      return items.length === 0 ? (
        <EmptyItem text="لا توجد اجتماعات ببنود جدول أعمال." />
      ) : (
        <ul className="space-y-2 max-h-60 overflow-auto">
          {items.map((m: any) => (
            <li key={m.meeting_id} className="rounded-md border border-border p-2 text-xs">
              <p className="font-bold">{m.title}</p>
              <p className="text-muted-foreground mt-0.5">
                {m.total_items} بند · {m.approved_items} معتمد · {m.resolved_items} مُبت فيه
              </p>
            </li>
          ))}
        </ul>
      );
    }
    case "votes": {
      const items = (data as any[]) ?? [];
      return items.length === 0 ? (
        <EmptyItem text="لا توجد نتائج تصويت مسجلة." />
      ) : (
        <ul className="space-y-2 max-h-60 overflow-auto">
          {items.map((v: any) => (
            <li key={v.agenda_item_id} className="rounded-md border border-border p-2 text-xs">
              <p className="font-bold">{v.title}</p>
              <p className="text-muted-foreground mt-0.5">
                موافق {v.yes_count} · رافض {v.no_count} · محايد {v.abstain_count} ·{" "}
                {statusLabel(v.outcome)}
              </p>
            </li>
          ))}
        </ul>
      );
    }
    case "decisions": {
      const r = (data as any) ?? {};
      return (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: "إجمالي", value: r.total ?? 0 },
            { label: "صادر", value: r.issued ?? 0 },
            { label: "قيد التنفيذ", value: r.in_progress ?? 0 },
            { label: "مكتمل", value: r.completed ?? 0 },
            { label: "معطّل", value: r.blocked ?? 0 },
            { label: "متأخر", value: r.overdue ?? 0 },
          ].map((item) => (
            <div key={item.label} className="rounded-md border border-border p-2">
              <p className="text-muted-foreground">{item.label}</p>
              <p className="font-bold text-lg">{item.value}</p>
            </div>
          ))}
        </div>
      );
    }
    case "overdue": {
      const items = (data as any[]) ?? [];
      return items.length === 0 ? (
        <EmptyItem text="لا توجد قرارات متأخرة." />
      ) : (
        <ul className="space-y-2 max-h-60 overflow-auto">
          {items.map((d: any) => (
            <li
              key={d.decision_id}
              className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs"
            >
              <p className="font-bold text-destructive">{d.title}</p>
              <p className="text-muted-foreground mt-0.5">
                متأخر بـ {d.days_overdue} يوم · الموعد: {formatDateTime(d.due_date)}
              </p>
            </li>
          ))}
        </ul>
      );
    }
    case "duration": {
      const items = (data as any[]) ?? [];
      return items.length === 0 ? (
        <EmptyItem text="لا توجد اجتماعات بمدة محسوبة." />
      ) : (
        <ul className="space-y-2 max-h-60 overflow-auto">
          {items.map((m: any) => (
            <li key={m.meeting_id} className="rounded-md border border-border p-2 text-xs">
              <p className="font-bold">{m.title}</p>
              <p className="text-muted-foreground mt-0.5">
                {m.duration_minutes
                  ? `مدة ${Math.round(m.duration_minutes)} دقيقة`
                  : "لم تُحسب المدة"}
              </p>
            </li>
          ))}
        </ul>
      );
    }
    case "archive": {
      const r = (data as any) ?? {};
      return (
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "إجمالي", value: r.total_meetings ?? 0 },
              { label: "مؤرشف", value: r.archived ?? 0 },
              { label: "ملغى", value: r.cancelled ?? 0 },
            ].map((item) => (
              <div key={item.label} className="rounded-md border border-border p-2 text-center">
                <p className="text-muted-foreground">{item.label}</p>
                <p className="font-bold text-lg">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "activity": {
      const r = (data as any) ?? {};
      return (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: "الأعضاء النشطين", value: r.active_member_count ?? 0 },
            { label: "الاجتماعات", value: r.total_meetings ?? 0 },
            { label: "الموضوعات", value: r.total_topics ?? 0 },
            { label: "القرارات", value: r.total_decisions ?? 0 },
            { label: "الأصوات", value: r.total_votes ?? 0 },
          ].map((item) => (
            <div key={item.label} className="rounded-md border border-border p-2">
              <p className="text-muted-foreground">{item.label}</p>
              <p className="font-bold text-lg">{item.value}</p>
            </div>
          ))}
        </div>
      );
    }
    default:
      return <EmptyItem text="لا توجد بيانات." />;
  }
}
