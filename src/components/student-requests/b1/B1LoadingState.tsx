import { Loader2 } from "lucide-react";

type Props = {
  labelAr?: string;
};

/** Centered loading indicator with a busy live region. */
export function B1LoadingState({ labelAr = "جارٍ التحميل…" }: Props) {
  return (
    <div
      dir="rtl"
      data-testid="b1-loading-state"
      role="status"
      aria-busy="true"
      className="flex items-center justify-center gap-2 p-6"
    >
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <span className="text-sm font-bold text-muted-foreground">{labelAr}</span>
    </div>
  );
}
