import { CheckCircle2, FileText } from "lucide-react";
import type { B1AttachmentMeta } from "@/lib/student-requests/b1-ui/adapter.types";

type Props = {
  serviceTitleAr: string;
  items: readonly { labelAr: string; valueAr: string }[];
  attachments: readonly B1AttachmentMeta[];
  acknowledgmentsAr?: readonly string[];
};

/**
 * Pre-submission summary card: entered data, attachment names (never links)
 * and the acknowledgments the student agreed to.
 */
export function B1RequestSummary({
  serviceTitleAr,
  items,
  attachments,
  acknowledgmentsAr,
}: Props) {
  return (
    <section
      dir="rtl"
      data-testid="b1-request-summary"
      className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-card"
    >
      <h2 className="font-display text-lg font-extrabold text-primary">
        ملخص الطلب — {serviceTitleAr}
      </h2>

      {items.length > 0 && (
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.labelAr} className="rounded-lg border border-border bg-muted/20 p-2.5">
              <dt className="text-[11px] font-bold text-muted-foreground">{item.labelAr}</dt>
              <dd className="mt-0.5 text-sm font-bold">{item.valueAr}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="space-y-1.5">
        <h3 className="text-xs font-bold text-muted-foreground">
          المرفقات ({attachments.length})
        </h3>
        {attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد مرفقات.</p>
        ) : (
          <ul className="space-y-1">
            {attachments.map((attachment) => (
              <li key={attachment.attachmentId} className="flex items-center gap-2 text-xs">
                <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">{attachment.fileName}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {acknowledgmentsAr && acknowledgmentsAr.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <h3 className="text-xs font-bold text-muted-foreground">الإقرارات</h3>
          <ul className="space-y-1">
            {acknowledgmentsAr.map((acknowledgment) => (
              <li key={acknowledgment} className="flex items-start gap-2 text-xs">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span>{acknowledgment}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
