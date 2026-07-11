import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmStudentRequestFeePayment } from "@/lib/student-request-fee.functions";
import {
  dryRunConfirmStudentRequestFeePayment,
  type FeePaymentConfirmationDryRunResult,
  type FeePaymentStatus,
} from "@/lib/student-requests/request-fee-workflow-contract";

type Props = {
  requestId: string;
  currentStepKey?: string;
  existingPaymentStatus?: FeePaymentStatus | null;
  disabled?: boolean;
  onValidated?: (result: FeePaymentConfirmationDryRunResult) => void;
  onConfirmed?: () => void;
};

export function StudentRequestPaymentConfirmationForm({
  requestId,
  currentStepKey = "payment_confirmation",
  existingPaymentStatus = "pending_payment",
  disabled = false,
  onValidated,
  onConfirmed,
}: Props) {
  const queryClient = useQueryClient();
  const confirmFn = useServerFn(confirmStudentRequestFeePayment);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [result, setResult] = useState<FeePaymentConfirmationDryRunResult | null>(null);

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    const dryRun = dryRunConfirmStudentRequestFeePayment({
      requestId,
      paymentReference: reference.trim(),
      notes: notes.trim() || null,
      currentStepKey,
      currentActionType: "confirm_payment",
      existingPaymentStatus,
    });
    setResult(dryRun);
    onValidated?.(dryRun);
    if (!dryRun.valid) {
      setError(dryRun.summaryAr);
      setLoading(false);
      return;
    }

    try {
      const confirmed = window.confirm(
        `تأكيد استلام الدفع بالمرجع ${reference.trim()}؟`,
      );
      if (!confirmed) {
        setLoading(false);
        return;
      }

      const res = await confirmFn({
        data: {
          requestId,
          paymentReference: reference.trim(),
          notes: notes.trim() || null,
        },
      });
      setSuccess(`تم تأكيد الدفع (مرجع: ${res.paymentReference}).`);
      await queryClient.invalidateQueries({ queryKey: ["student-request", requestId] });
      await queryClient.invalidateQueries({ queryKey: ["admin-student-request", requestId] });
      onConfirmed?.();
    } catch (e) {
      setError((e as Error).message || "تعذر تأكيد الدفع");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 font-bold text-sm text-primary">
        <CheckCircle2 className="h-4 w-4" />
        تأكيد الدفع (الإيرادات والمالية)
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">مرجع الدفع / الحافظة</Label>
          <Input
            dir="ltr"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            disabled={disabled || loading}
            placeholder="REF-2026-001"
          />
        </div>
        <div>
          <Label className="text-xs">ملاحظات (اختياري)</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={disabled || loading}
          />
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        disabled={disabled || loading}
        onClick={handleSubmit}
        className="gap-1"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        تأكيد الاستلام
      </Button>
      {error && (
        <p className="text-xs rounded p-2 bg-destructive/10 text-destructive">{error}</p>
      )}
      {success && (
        <p className="text-xs rounded p-2 bg-emerald-50 text-emerald-900">{success}</p>
      )}
      {result && !success && !error && (
        <p
          className={`text-xs rounded p-2 ${
            result.valid ? "bg-emerald-50 text-emerald-900" : "bg-destructive/10 text-destructive"
          }`}
        >
          {result.summaryAr}
        </p>
      )}
    </div>
  );
}
