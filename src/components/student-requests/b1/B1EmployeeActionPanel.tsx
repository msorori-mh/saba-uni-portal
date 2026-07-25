import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  B1_STAFF_ACTIONS_REQUIRING_COMMENT,
  b1AdapterErrorMessageAr,
  type B1StaffAction,
} from "@/lib/student-requests/b1-ui/adapter.types";

type Props = {
  /** The single legal action for the current step (backend-authoritative). */
  allowedAction: B1StaffAction;
  stepLabelAr: string;
  /** True while the parent is executing the action call. */
  acting?: boolean;
  onAct: (action: B1StaffAction, comment?: string) => Promise<void> | void;
  /** Defaults to the contract list (return/reject require a comment). */
  requireComment?: boolean;
};

type ExecutableAction = Exclude<B1StaffAction, "confirm_payment">;

const ACTION_META: Record<
  ExecutableAction,
  { labelAr: string; buttonClass: string }
> = {
  approve: {
    labelAr: "اعتماد",
    buttonClass: "bg-primary text-primary-foreground hover:opacity-90",
  },
  review: {
    labelAr: "تمت المراجعة",
    buttonClass: "bg-primary text-primary-foreground hover:opacity-90",
  },
  return: {
    labelAr: "إرجاع للاستكمال",
    buttonClass: "border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100",
  },
  reject: {
    labelAr: "رفض",
    buttonClass: "bg-destructive text-destructive-foreground hover:opacity-90",
  },
};

function ActionIcon({ action }: { action: ExecutableAction }) {
  const cls = "h-4 w-4";
  if (action === "reject") return <XCircle className={cls} />;
  if (action === "return") return <RotateCcw className={cls} />;
  return <CheckCircle2 className={cls} />;
}

/**
 * Staff action panel for a B1 step. Renders exactly one action — the one the
 * backend says is legal for this step — with a mandatory comment for
 * return/reject, an internal double-submit guard, and sanitized adapter
 * error messages (no optimistic state changes).
 *
 * Revenue receipt confirmation is intentionally NOT rendered here; it lives
 * on the dedicated revenue card.
 */
export function B1EmployeeActionPanel({
  allowedAction,
  stepLabelAr,
  acting = false,
  onAct,
  requireComment,
}: Props) {
  const [comment, setComment] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlightRef = useRef(false);

  if (allowedAction === "confirm_payment") {
    return (
      <section
        dir="rtl"
        data-testid="b1-employee-action-panel"
        className="rounded-xl border border-border bg-card p-4 shadow-card"
      >
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            إجراء تأكيد استلام الإيراد لهذه المرحلة يُنفَّذ من بطاقة الإيرادات المخصصة،
            وليس من لوحة الإجراءات هذه.
          </span>
        </div>
      </section>
    );
  }

  const commentRequired =
    requireComment ?? B1_STAFF_ACTIONS_REQUIRING_COMMENT.includes(allowedAction);
  const meta = ACTION_META[allowedAction];
  const controlsDisabled = busy || acting;

  const handleAct = async () => {
    if (inFlightRef.current || controlsDisabled) return;

    const trimmedComment = comment.trim();
    if (commentRequired && !trimmedComment) {
      setValidationError("التعليق إلزامي لتنفيذ هذا الإجراء.");
      return;
    }
    setValidationError(null);
    setActionError(null);

    inFlightRef.current = true;
    setBusy(true);
    try {
      await onAct(allowedAction, trimmedComment || undefined);
      toast.success("تم تنفيذ الإجراء بنجاح.");
      setComment("");
    } catch (error) {
      const messageAr = b1AdapterErrorMessageAr(error);
      setActionError(messageAr);
      toast.error(messageAr);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  };

  return (
    <section
      dir="rtl"
      data-testid="b1-employee-action-panel"
      className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card"
    >
      <h3 className="font-display text-sm font-extrabold text-primary">
        إجراء المرحلة: {stepLabelAr}
      </h3>

      <div className="space-y-1.5">
        <label
          htmlFor="b1-employee-action-comment"
          className="block text-xs font-bold text-muted-foreground"
        >
          التعليق {commentRequired ? "(إلزامي)" : "(اختياري)"}
        </label>
        <textarea
          id="b1-employee-action-comment"
          value={comment}
          onChange={(event) => {
            setComment(event.target.value);
            if (validationError) setValidationError(null);
          }}
          rows={3}
          disabled={controlsDisabled}
          placeholder="اكتب تعليقاً يظهر في سجل الطلب…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
        />
        {validationError && (
          <p role="alert" className="text-xs font-bold text-destructive">
            {validationError}
          </p>
        )}
      </div>

      <div>
        <button
          type="button"
          disabled={controlsDisabled}
          onClick={() => void handleAct()}
          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 ${meta.buttonClass}`}
        >
          {busy || acting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ActionIcon action={allowedAction} />
          )}
          {busy || acting ? "جارٍ التنفيذ…" : meta.labelAr}
        </button>
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {actionError}
        </div>
      )}
    </section>
  );
}
