/**
 * Level 1 — يحتاج انتباهك الآن
 * Proven attention items only; empty → neutral compact message.
 */

import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import {
  ATTENTION_EMPTY_MESSAGE_AR,
  ATTENTION_SECTION_TITLE_AR,
  type ReportAttentionItem,
  type ReportAttentionSeverity,
} from "@/lib/reports/attention";

const SEVERITY_LABEL_AR: Record<ReportAttentionSeverity, string> = {
  critical: "حرج",
  warning: "تنبيه",
  info: "معلومة",
};

function SeverityIcon({ severity }: { severity: ReportAttentionSeverity }) {
  const cls = "h-4 w-4 shrink-0";
  if (severity === "critical") {
    return <OctagonAlert className={cls} aria-hidden />;
  }
  if (severity === "warning") {
    return <AlertTriangle className={cls} aria-hidden />;
  }
  return <Info className={cls} aria-hidden />;
}

function severityClass(severity: ReportAttentionSeverity): string {
  switch (severity) {
    case "critical":
      return "border-destructive/40 bg-destructive/5 text-destructive";
    case "warning":
      return "border-amber-600/30 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100";
    default:
      return "border-border bg-muted/40 text-foreground";
  }
}

export interface ReportsAttentionSectionProps {
  readonly items: readonly ReportAttentionItem[];
  readonly title?: string;
}

export function ReportsAttentionSection({
  items,
  title = ATTENTION_SECTION_TITLE_AR,
}: ReportsAttentionSectionProps) {
  return (
    <section
      className="space-y-3"
      aria-labelledby="reports-attention-heading"
      data-reports-level="attention"
    >
      <h2
        id="reports-attention-heading"
        className="text-base font-semibold text-foreground"
      >
        {title}
      </h2>

      {items.length === 0 ? (
        <p
          className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground"
          role="status"
          data-attention-empty="true"
        >
          {ATTENTION_EMPTY_MESSAGE_AR}
        </p>
      ) : (
        <ul className="grid gap-2" role="list">
          {items.map((item) => (
            <li key={item.id}>
              <article
                className={`flex flex-col gap-2 rounded-md border px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${severityClass(item.severity)}`}
                data-attention-id={item.id}
                data-attention-severity={item.severity}
                data-source-code={item.sourceCode}
                aria-label={`${SEVERITY_LABEL_AR[item.severity]}: ${item.titleAr}`}
              >
                <div className="flex min-w-0 items-start gap-2">
                  <SeverityIcon severity={item.severity} />
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium opacity-80">
                        {SEVERITY_LABEL_AR[item.severity]}
                      </span>
                      {typeof item.count === "number" ? (
                        <span className="text-xs tabular-nums opacity-80">
                          ({item.count})
                        </span>
                      ) : null}
                    </div>
                    <h3 className="text-sm font-bold leading-snug">
                      {item.titleAr}
                    </h3>
                    {item.descriptionAr ? (
                      <p className="text-xs opacity-90">{item.descriptionAr}</p>
                    ) : null}
                  </div>
                </div>
                {item.actionTo && item.actionLabelAr ? (
                  <a
                    href={item.actionTo}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-current/20 bg-background/80 px-3 text-sm font-bold text-primary hover:border-gold"
                  >
                    {item.actionLabelAr}
                  </a>
                ) : null}
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
