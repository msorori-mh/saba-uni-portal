import { useRef, useState } from "react";
import { AlertCircle, Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { executeStudentRequestSignAction } from "@/lib/student-requests/staff-inbox.functions";

/**
 * Reusable panel for workflow steps whose config.action_type = 'sign'.
 * Currently used by registrar_signature and dean_signature; label is
 * derived from `stepKey` so any additional sign step (e.g. vice-president)
 * only needs a new entry in SIGN_STEP_LABELS.
 *
 * The panel never creates PDFs or documents — issuance stays in
 * document_issuance. Execution goes through act_on_student_request_step
 * under the caller's session, so DB `can_current_user_act_on_step` still
 * gates the actor + step-status invariants server-side.
 */
const SIGN_STEP_LABELS: Record<string, string> = {
  registrar_signature: "توقيع مسجل الكلية واعتماد الطلب",
  dean_signature: "توقيع عميد الكلية واعتماد الطلب",
};

const FALLBACK_SIGN_LABEL = "توقيع واعتماد الطلب";

export function getSignStepButtonLabel(stepKey: string | null): string {
  if (!stepKey) return FALLBACK_SIGN_LABEL;
  return SIGN_STEP_LABELS[stepKey] ?? FALLBACK_SIGN_LABEL;
}

export function StaffRequestSignaturePanel({
  requestId,
  workflowStepRuntimeId,
  stepKey,
  actionType,
  isActionable,
  workflowRuntimeAvailable,
}: {
  requestId: string;
  workflowStepRuntimeId: string | null;
  stepKey: string | null;
  actionType: string | null;
  isActionable: boolean;
  workflowRuntimeAvailable: boolean;
}) {
  const executeFn = useServerFn(executeStudentRequestSignAction);
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [signing, setSigning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const canSign =
    workflowRuntimeAvailable &&
    actionType === "sign" &&
    isActionable &&
    !!workflowStepRuntimeId &&
    !signing;

  const gate = !workflowRuntimeAvailable
    ? "تنفيذ التوقيع غير متاح — دورة الحياة الفعلية غير مطبقة."
    : actionType !== "sign"
      ? null
      : !isActionable
        ? "لست المُسنَد لهذه الخطوة — لا يمكنك التوقيع."
        : !workflowStepRuntimeId
          ? "لا يمكن تنفيذ التوقيع بدون معرّف خطوة تشغيلي."
          : null;

  const handleSign = async () => {
    if (!canSign || !workflowStepRuntimeId) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSigning(true);
    setErrorMsg(null);
    try {
      const result = await executeFn({
        data: {
          requestId,
          workflowStepRuntimeId,
          comment: comment.trim() || null,
        },
      });
      toast.success(
        result.terminal
          ? "تم إنهاء دورة حياة الطلب"
          : result.nextStepId
            ? "تم توقيع الخطوة وتفعيل الخطوة التالية"
            : "تم توقيع الخطوة",
      );
      setComment("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["staff-inbox-detail", requestId] }),
        queryClient.invalidateQueries({ queryKey: ["staff-inbox"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    } catch (e) {
      const msg = (e as Error).message;
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      inFlightRef.current = false;
      setSigning(false);
    }
  };

  if (actionType !== "sign") return null;

  const label = getSignStepButtonLabel(stepKey);

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="text-xs font-bold text-primary">توقيع الخطوة</div>

      {gate && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{gate}</span>
        </div>
      )}

      <div>
        <label className="text-[11px] font-bold text-muted-foreground block mb-1">
          ملاحظة (اختياري)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="ملاحظة تُرفق مع التوقيع..."
          className="w-full rounded border bg-background px-2 py-1.5 text-xs"
        />
      </div>

      <button
        type="button"
        data-testid="execute-sign-action"
        disabled={!canSign}
        onClick={handleSign}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {signing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <PenLine className="h-3.5 w-3.5" />
        )}
        {label}
      </button>

      <p className="text-[11px] text-muted-foreground">
        التوقيع يستدعي RPC act_on_student_request_step (p_action='sign') تحت جلسة المستخدم. لا يتم إنشاء أي مستند هنا — الإصدار يتم في خطوة document_issuance.
      </p>

      {errorMsg && (
        <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{errorMsg}</p>
      )}
    </div>
  );
}
