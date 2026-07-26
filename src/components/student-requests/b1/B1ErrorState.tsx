import { AlertCircle, RefreshCw } from "lucide-react";

type Props = {
  titleAr?: string;
  messageAr: string;
  onRetry?: () => void;
};

/** Error block with an optional retry action. */
export function B1ErrorState({ titleAr = "حدث خطأ", messageAr, onRetry }: Props) {
  return (
    <div
      dir="rtl"
      data-testid="b1-error-state"
      role="alert"
      className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="space-y-1">
          <div className="text-sm font-extrabold text-destructive">{titleAr}</div>
          <p className="text-sm leading-relaxed text-destructive">{messageAr}</p>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-background px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}
