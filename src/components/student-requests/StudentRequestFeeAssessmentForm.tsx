import { useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  dryRunAssessStudentRequestFee,
  type FeeAssessmentDryRunResult,
} from "@/lib/student-requests/request-fee-workflow-contract";

type Props = {
  requestId: string;
  currentStepKey?: string;
  disabled?: boolean;
  onValidated?: (result: FeeAssessmentDryRunResult) => void;
};

export function StudentRequestFeeAssessmentForm({
  requestId,
  currentStepKey = "fee_assessment",
  disabled = false,
  onValidated,
}: Props) {
  const [amount, setAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FeeAssessmentDryRunResult | null>(null);

  const handleSubmit = () => {
    setLoading(true);
    const parsed = Number(amount);
    const dryRun = dryRunAssessStudentRequestFee({
      requestId,
      amount: Number.isFinite(parsed) ? parsed : 0,
      notes: notes.trim() || null,
      currentStepKey,
      currentActionType: "assess_fee",
    });
    setResult(dryRun);
    onValidated?.(dryRun);
    setLoading(false);
  };

  return (
    <div dir="rtl" className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 font-bold text-sm text-primary">
        <Wallet className="h-4 w-4" />
        تقييم الرسوم (مدير شؤون الطلاب)
      </div>
      <p className="text-xs text-muted-foreground">
        المبلغ بالريال اليمني (YER). صفر = لا رسوم — يتخطى تأكيد الدفع.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">المبلغ (YER)</Label>
          <Input
            type="number"
            min={0}
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={disabled || loading}
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
        تأكيد التقييم (dry-run)
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
