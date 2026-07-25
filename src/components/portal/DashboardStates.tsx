import { AlertCircle, RefreshCw } from "lucide-react";

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
  return (
    <div
      dir="rtl"
      role="alert"
      data-testid="dashboard-query-error"
      className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-center text-sm text-destructive"
    >
      <AlertCircle className="mx-auto mb-1.5 h-5 w-5" />
      <p>{messageAr}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-destructive/40 bg-background px-3 text-xs font-bold text-destructive hover:bg-destructive/5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          إعادة المحاولة
        </button>
      ) : null}
    </div>
  );
}
