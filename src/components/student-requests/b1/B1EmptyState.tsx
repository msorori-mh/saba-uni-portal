import { Inbox } from "lucide-react";

type Props = {
  titleAr: string;
  bodyAr?: string;
  actionLabelAr?: string;
  onAction?: () => void;
};

/** Empty-list placeholder with an optional call to action. */
export function B1EmptyState({ titleAr, bodyAr, actionLabelAr, onAction }: Props) {
  return (
    <div
      dir="rtl"
      data-testid="b1-empty-state"
      className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center"
    >
      <Inbox className="h-10 w-10 text-muted-foreground" />
      <div className="space-y-1">
        <div className="font-display text-base font-extrabold text-primary">{titleAr}</div>
        {bodyAr && <p className="text-sm text-muted-foreground">{bodyAr}</p>}
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
