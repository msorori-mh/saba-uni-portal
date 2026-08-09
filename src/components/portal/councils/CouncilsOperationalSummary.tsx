import { Users2, CalendarClock, FilePlus2, AlertCircle } from "lucide-react";
import type { CouncilsOperationalSummary } from "@/lib/faculty-portal/councils-operational";

export function CouncilsOperationalSummaryStrip({
  summary,
}: {
  summary: CouncilsOperationalSummary;
}) {
  return (
    <div
      data-testid="councils-operational-summary"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2"
    >
      <SummaryCard
        testId="councils-summary-current"
        icon={Users2}
        label="مجالسي الحالية"
        value={String(summary.currentCouncilsCount)}
      />
      <SummaryCard
        testId="councils-summary-next-meeting"
        icon={CalendarClock}
        label="الاجتماع القادم"
        value={summary.nextMeetingLabel}
        truncate
      />
      <SummaryCard
        testId="councils-summary-my-topics"
        icon={FilePlus2}
        label="موضوعاتي المقدمة"
        value={String(summary.mySubmittedTopicsCount)}
      />
      <SummaryCard
        testId="councils-summary-action-required"
        icon={AlertCircle}
        label="يحتاج إجراء مني"
        value={summary.actionRequiredLabel}
        truncate
        emphasize={summary.actionRequiredLabel !== "لا توجد إجراءات حالية"}
      />
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  testId,
  truncate,
  emphasize,
}: {
  icon: typeof Users2;
  label: string;
  value: string;
  testId: string;
  truncate?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div
      data-testid={testId}
      className={`rounded-lg border bg-card px-3 py-2.5 flex items-start gap-2 min-w-0 ${
        emphasize ? "border-gold/40 bg-gold/5" : ""
      }`}
    >
      <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] sm:text-xs text-muted-foreground">{label}</div>
        <div
          className={`mt-0.5 text-sm font-bold text-primary ${truncate ? "truncate" : ""}`}
          title={truncate ? value : undefined}
        >
          {value}
        </div>
      </div>
    </div>
  );
}
