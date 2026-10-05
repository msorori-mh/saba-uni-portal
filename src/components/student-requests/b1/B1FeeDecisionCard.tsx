import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { b1AdapterErrorMessageAr } from "@/lib/student-requests/b1-ui";
import type { B1ExcusedAbsenceFeeDecisionSubmission } from "@/lib/student-requests/b1-ui/adapter.types";
import {
  EXCUSED_ABSENCE_AMOUNT_DUE_UNIT_AR,
  EXCUSED_ABSENCE_FEE_DECISIONS,
  EXCUSED_ABSENCE_FEE_DECISION_INPUT_MESSAGES_AR,
  EXCUSED_ABSENCE_FEE_DECISION_LABELS_AR,
  EXCUSED_ABSENCE_FEE_DECISION_NOTE_MAX,
  EXCUSED_ABSENCE_FEE_EXEMPTION_REASONS,
  EXCUSED_ABSENCE_FEE_EXEMPTION_REASON_LABELS_AR,
  validateExcusedAbsenceFeeDecisionInput,
  type ExcusedAbsenceFeeDecision,
  type ExcusedAbsenceFeeExemptionReason,
} from "@/lib/student-requests/excused-absence-fee-decision-contract";

/**
 * غياب بعذر — بطاقة قرار الرسوم لمسجل الكلية.
 *
 * Collects exactly one of the two engine outcomes (plus the mandatory reason
 * when no fee is due, or the display-only value due when a fee is due) and
 * hands it to the dedicated fee-decision executor. That value is only shown
 * to the student (owner-approved exception); nothing is paid or computed here.
 */
export function B1FeeDecisionCard({
  stepId,
  stepLabelAr,
  acting = false,
  onDecide,
}: {
  stepId: string;
  stepLabelAr: string;
  acting?: boolean;
  onDecide: (stepId: string, submission: B1ExcusedAbsenceFeeDecisionSubmission) => Promise<void>;
}) {
  const [decision, setDecision] = useState<ExcusedAbsenceFeeDecision | "">("");
  const [reason, setReason] = useState<ExcusedAbsenceFeeExemptionReason | "">("");
  const [amountDue, setAmountDue] = useState("");
  const [note, setNote] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const disabled = busy || acting;

  const submit = async () => {
    if (lock.current || disabled) return;
    const validated = validateExcusedAbsenceFeeDecisionInput({
      stepId,
      decision,
      exemptionReason: decision === "FEE_NOT_REQUIRED" ? reason || null : null,
      amountDue: decision === "FEE_REQUIRED" ? amountDue : null,
      note,
    });
    if (!validated.valid) {
      setValidationError(EXCUSED_ABSENCE_FEE_DECISION_INPUT_MESSAGES_AR[validated.error]);
      return;
    }
    setValidationError(null);
    setError(null);
    lock.current = true;
    setBusy(true);
    try {
      await onDecide(stepId, {
        decision: validated.normalized.decision,
        exemptionReason: validated.normalized.exemptionReason,
        amountDue: validated.normalized.amountDue,
        note: validated.normalized.note,
      });
      setNote("");
      setAmountDue("");
    } catch (caught) {
      setError(b1AdapterErrorMessageAr(caught));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <section
      dir="rtl"
      data-testid="b1-fee-decision-card"
      className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card"
    >
      <h3 className="font-display text-base font-extrabold text-primary">
        إجراء المرحلة: {stepLabelAr}
      </h3>
      <p className="text-xs leading-5 text-muted-foreground">
        حدّد إن كان هذا الطلب يستلزم رسوماً. عند استحقاق الرسوم يسدد الطالب في النظام الجامعي
        الرئيسي ثم يؤكد موظف الإيرادات الاستلام، وعند عدم استحقاقها ينتقل الطلب مباشرة إلى توقيع
        رئيس القسم. لا يتم أي سداد داخل البوابة.
      </p>

      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-xs font-bold text-muted-foreground">قرار الرسوم (إلزامي)</legend>
        {EXCUSED_ABSENCE_FEE_DECISIONS.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`b1-fee-decision-${stepId}`}
              value={option}
              checked={decision === option}
              onChange={() => {
                setDecision(option);
                if (option === "FEE_REQUIRED") setReason("");
                else setAmountDue("");
                setValidationError(null);
              }}
            />
            <span>{EXCUSED_ABSENCE_FEE_DECISION_LABELS_AR[option]}</span>
          </label>
        ))}
      </fieldset>

      {decision === "FEE_NOT_REQUIRED" ? (
        <label className="block space-y-1">
          <span className="text-xs font-bold text-muted-foreground">
            سبب عدم استحقاق الرسوم (إلزامي)
          </span>
          <select
            data-testid="b1-fee-decision-reason"
            value={reason}
            disabled={disabled}
            onChange={(event) => {
              setReason(event.target.value as ExcusedAbsenceFeeExemptionReason | "");
              setValidationError(null);
            }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">اختر السبب…</option>
            {EXCUSED_ABSENCE_FEE_EXEMPTION_REASONS.map((option) => (
              <option key={option} value={option}>
                {EXCUSED_ABSENCE_FEE_EXEMPTION_REASON_LABELS_AR[option]}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {decision === "FEE_REQUIRED" ? (
        <label className="block space-y-1">
          <span className="text-xs font-bold text-muted-foreground">
            المبلغ المستحق ({EXCUSED_ABSENCE_AMOUNT_DUE_UNIT_AR}) — إلزامي، للعرض على الطالب فقط
          </span>
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            autoComplete="off"
            maxLength={10}
            data-testid="b1-fee-decision-due"
            value={amountDue}
            disabled={disabled}
            onChange={(event) => {
              setAmountDue(event.target.value);
              setValidationError(null);
            }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <span className="block text-xs leading-5 text-muted-foreground">
            يظهر هذا المبلغ للطالب في الإشعار وتفاصيل الطلب مع توجيهه للسداد في النظام الجامعي
            الرئيسي. لا يُحصَّل ولا يُحسب أي مبلغ داخل البوابة.
          </span>
        </label>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs font-bold text-muted-foreground">ملاحظة اختيارية</span>
        <textarea
          rows={2}
          maxLength={EXCUSED_ABSENCE_FEE_DECISION_NOTE_MAX}
          value={note}
          disabled={disabled}
          onChange={(event) => setNote(event.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </label>

      {validationError ? (
        <p role="alert" className="text-xs font-bold text-destructive">
          {validationError}
        </p>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        onClick={() => void submit()}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {busy || acting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        تسجيل قرار الرسوم
      </button>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
