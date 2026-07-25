import { CheckCircle2 } from "lucide-react";

type Props = {
  titleAr: string;
  bodyAr?: string;
  actionLabelAr?: string;
  onAction?: () => void;
};

/** Success confirmation block (e.g. after a request is submitted). */
export function B1SuccessState({ titleAr, bodyAr, actionLabelAr, onAction }: Props) {
  return (
    <div
      dir="rtl"
      data-testid="b1-success-state"
      role="status"
      className="flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center"
    >
      <CheckCircle2 className="h-10 w-10 text-emerald-600" />
      <div className="space-y-1">
        <div className="font-display text-base font-extrabold text-emerald-900">{titleAr}</div>
        {bodyAr && <p className="text-sm leading-relaxed text-emerald-900">{bodyAr}</p>}
      </div>
      {actionLabelAr && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
        >
          {actionLabelAr}
        </button>
      )}
    </div>
  );
}
