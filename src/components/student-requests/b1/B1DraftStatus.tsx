import { CheckCircle2, FileEdit, Loader2, XCircle } from "lucide-react";
import { formatB1DateTimeAr } from "./b1-datetime";

export type B1DraftSaveState = "draft" | "saving" | "saved" | "save_failed";

type Props = {
  state: B1DraftSaveState;
  updatedAt?: string;
};

const STATE_CONFIG: Record<
  B1DraftSaveState,
  { labelAr: string; chipClass: string }
> = {
  draft: {
    labelAr: "مسودة",
    chipClass: "border-border bg-muted text-muted-foreground",
  },
  saving: {
    labelAr: "جارٍ الحفظ…",
    chipClass: "border-blue-200 bg-blue-50 text-blue-900",
  },
  saved: {
    labelAr: "محفوظ",
    chipClass: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  save_failed: {
    labelAr: "فشل الحفظ",
    chipClass: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

function StateIcon({ state }: { state: B1DraftSaveState }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (state === "saving") return <Loader2 className={`${cls} animate-spin`} />;
  if (state === "saved") return <CheckCircle2 className={cls} />;
  if (state === "save_failed") return <XCircle className={cls} />;
  return <FileEdit className={cls} />;
}

/** Draft autosave status badge with a polite live region. */
export function B1DraftStatus({ state, updatedAt }: Props) {
  const config = STATE_CONFIG[state];
  return (
    <div
      dir="rtl"
      data-testid="b1-draft-status"
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center gap-2"
    >
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${config.chipClass}`}
      >
        <StateIcon state={state} />
        {config.labelAr}
      </span>
      {updatedAt && (
        <span className="text-[11px] text-muted-foreground">
          آخر تحديث: {formatB1DateTimeAr(updatedAt)}
        </span>
      )}
    </div>
  );
}
