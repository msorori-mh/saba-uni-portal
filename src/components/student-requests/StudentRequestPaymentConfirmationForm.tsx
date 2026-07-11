import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
};

export function StudentRequestPaymentConfirmationForm({
  requestId,
  currentStepKey = "payment_confirmation",
  existingPaymentStatus = "pending_payment",
  disabled = false,
  onValidated,
}: Props) {
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FeePaymentConfirmationDryRunResult | null>(null);

  const handleSubmit = () => {
    setLoading(true);
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
    setLoading(false);
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
        تأكيد الاستلام (dry-run)
      </Button>
      {result && (
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
