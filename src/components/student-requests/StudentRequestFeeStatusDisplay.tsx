import { Wallet } from "lucide-react";
import type { FeePaymentStatus } from "@/lib/student-requests/request-fee-workflow-contract";
import { feeStatusDisplayModel } from "@/lib/student-requests/fee-processing-ui-policy";

type Props = {
  amountYer: number;
  paymentStatus: FeePaymentStatus;
  currency?: string;
  paymentReference?: string | null;
};

export function StudentRequestFeeStatusDisplay({
  amountYer,
  paymentStatus,
  currency = "YER",
  paymentReference = null,
}: Props) {
  const model = feeStatusDisplayModel({
    amount: amountYer,
    paymentStatus,
    paymentReference,
    currency,
  });

  return (
    <div dir="rtl" className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm" data-testid="fee-status-display">
      <div className="flex items-center gap-2 font-bold text-primary">
        <Wallet className="h-4 w-4" />
        حالة الرسوم
      </div>
      <div className="text-muted-foreground">
        المبلغ:{" "}
        <span className="font-mono font-bold text-foreground">{model.amountLabelAr}</span>
      </div>
      <div className="text-muted-foreground">
        الحالة: <span className="font-bold text-foreground">{model.statusLabelAr}</span>
      </div>
      {model.showPaidReference && paymentReference && (
        <div className="text-muted-foreground">
          المرجع:{" "}
          <span className="font-mono font-bold text-foreground" dir="ltr">
            {paymentReference}
          </span>
        </div>
      )}
      {model.showFinanceForm && (
        <p className="text-xs text-amber-800 bg-amber-50 rounded p-2">
          يُرجى التوجّه إلى الإيرادات والمالية لسداد المبلغ خارج البوابة.
        </p>
      )}
      {(amountYer === 0 || paymentStatus === "not_required") && (
        <p className="text-xs text-muted-foreground">
          لا يلزم سداد رسوم لهذا الطلب.
        </p>
      )}
    </div>
  );
}
