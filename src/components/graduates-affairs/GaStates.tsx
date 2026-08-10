import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Presentational loading / error / empty shells for Graduates Affairs.
 * No network calls. Authorization remains AUTH-04 + continuity — these
 * shells never imply access.
 */
export function GaLoading({
  label = "جارٍ تحميل شؤون الخريجين…",
}: {
  label?: string;
}) {
  return (
    <div
      dir="rtl"
      role="status"
      className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground"
    >
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function GaError({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div
      dir="rtl"
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
    >
      <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
      <p className="flex-1 text-sm">{message}</p>
      {retry ? (
        <Button type="button" variant="outline" onClick={retry}>
          إعادة المحاولة
        </Button>
      ) : null}
    </div>
  );
}

export function GaEmpty({ message }: { message: string }) {
  return (
    <div
      dir="rtl"
      role="status"
      className="rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground"
    >
      {message}
    </div>
  );
}
