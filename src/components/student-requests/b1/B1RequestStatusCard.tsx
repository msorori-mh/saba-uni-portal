import { formatB1DateTimeAr } from "./b1-datetime";

type Props = {
  requestNumber: string;
  serviceTitleAr: string;
  statusAr: string;
  currentStepLabelAr?: string;
  updatedAt: string;
};

/** Compact card summarizing a submitted B1 request's current state. */
export function B1RequestStatusCard({
  requestNumber,
  serviceTitleAr,
  statusAr,
  currentStepLabelAr,
  updatedAt,
}: Props) {
  return (
    <section
      dir="rtl"
      data-testid="b1-request-status-card"
      className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold text-muted-foreground">رقم الطلب</div>
          <div dir="ltr" className="font-mono text-sm font-extrabold text-primary">
            {requestNumber}
          </div>
        </div>
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
          {statusAr}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 border-t border-border pt-3 text-xs sm:grid-cols-2">
        <div>
          <div className="font-bold text-muted-foreground">نوع الخدمة</div>
          <div className="mt-0.5 font-bold">{serviceTitleAr}</div>
        </div>
        {currentStepLabelAr && (
          <div>
            <div className="font-bold text-muted-foreground">المرحلة الحالية</div>
            <div className="mt-0.5 font-bold">{currentStepLabelAr}</div>
          </div>
        )}
        <div>
          <div className="font-bold text-muted-foreground">آخر تحديث</div>
          <div className="mt-0.5">{formatB1DateTimeAr(updatedAt)}</div>
        </div>
      </div>
    </section>
  );
}
