import { CheckCircle2, Circle, CircleDot, RotateCcw, XCircle } from "lucide-react";
import type { B1WorkflowStepView } from "@/lib/student-requests/b1-ui/adapter.types";
import { formatB1DateTimeAr } from "./b1-datetime";

type Props = {
  steps: readonly B1WorkflowStepView[];
};

type StepStatus = B1WorkflowStepView["status"];

const STATUS_CONFIG: Record<StepStatus, { labelAr: string; rowClass: string; iconClass: string }> =
  {
    completed: {
      labelAr: "مكتملة",
      rowClass: "border-emerald-200 bg-emerald-50/60",
      iconClass: "text-emerald-600",
    },
    active: {
      labelAr: "المرحلة الحالية",
      rowClass: "border-primary/40 bg-primary/5 ring-1 ring-primary/20",
      iconClass: "text-primary",
    },
    pending: {
      labelAr: "معلقة",
      rowClass: "border-border bg-muted/30",
      iconClass: "text-muted-foreground",
    },
    returned: {
      labelAr: "معادة",
      rowClass: "border-amber-300 bg-amber-50",
      iconClass: "text-amber-600",
    },
    rejected: {
      labelAr: "مرفوضة",
      rowClass: "border-destructive/30 bg-destructive/5",
      iconClass: "text-destructive",
    },
  };

function StatusIcon({ status }: { status: StepStatus }) {
  const cls = `h-5 w-5 shrink-0 ${STATUS_CONFIG[status].iconClass}`;
  if (status === "completed") return <CheckCircle2 className={cls} />;
  if (status === "active") return <CircleDot className={cls} />;
  if (status === "returned") return <RotateCcw className={cls} />;
  if (status === "rejected") return <XCircle className={cls} />;
  return <Circle className={cls} />;
}

/**
 * Vertical read-only timeline of the B1 workflow stages for a request.
 * Renders semantic ol/li; shows comment and action time when present.
 */
export function B1WorkflowTimeline({ steps }: Props) {
  return (
    <ol dir="rtl" data-testid="b1-workflow-timeline" className="space-y-2">
      {steps.map((step) => {
        const config = STATUS_CONFIG[step.status];
        return (
          <li
            key={step.key}
            aria-current={step.status === "active" ? "step" : undefined}
            className={`rounded-xl border p-3 ${config.rowClass}`}
          >
            <div className="flex items-center gap-2.5">
              <StatusIcon status={step.status} />
              <span className="flex-1 text-sm font-bold">{step.labelAr}</span>
              <span className="rounded-full border border-current/20 px-2 py-0.5 text-[11px] font-bold opacity-80">
                {config.labelAr}
              </span>
            </div>
            {step.actedAt && (
              <div className="mt-1.5 pr-8 text-[11px] text-muted-foreground">
                بتاريخ: {formatB1DateTimeAr(step.actedAt)}
              </div>
            )}
            {step.commentAr && (
              <div className="mt-1.5 mr-8 rounded-lg border border-current/10 bg-white/50 p-2 text-xs leading-relaxed">
                {step.commentAr}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
