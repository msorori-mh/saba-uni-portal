import { AlertCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { formatDashboardMetric } from "./dashboard-metrics";

/** Accessible metric output: unavailable is announced instead of exposed as punctuation only. */
export function DashboardMetricValue({ value }: { value: number | null }) {
  if (value === null) {
    return <span aria-label="القيمة غير متاحة">—</span>;
  }
  return <span>{formatDashboardMetric(value)}</span>;
}

/**
 * Shared dashboard query-error block. Never renders the raw backend error —
 * only a safe Arabic message with an optional retry. Using the generic
 * fallback means no SQL/RLS/PostgREST detail can leak into the UI.
 */
export function DashboardQueryError({
  messageAr = "تعذّر تحميل هذه البيانات. تحقق من الاتصال ثم أعد المحاولة.",
  onRetry,
}: {
  messageAr?: string;
  onRetry?: () => void;
}) {
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    alertRef.current?.focus();
  }, []);

  return (
    <div
      ref={alertRef}
      dir="rtl"
      role="alert"
      aria-live="assertive"
      tabIndex={-1}
      data-testid="dashboard-query-error"
      className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-center text-sm text-destructive"
    >
      <AlertCircle className="mx-auto mb-1.5 h-5 w-5" />
      <p>{messageAr}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          aria-label="إعادة محاولة تحميل بيانات اللوحة"
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-destructive/40 bg-background px-3 text-xs font-bold text-destructive hover:bg-destructive/5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          إعادة المحاولة
        </button>
      ) : null}
    </div>
  );
}
