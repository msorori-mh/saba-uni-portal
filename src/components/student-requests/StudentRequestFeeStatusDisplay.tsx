import { Wallet } from "lucide-react";
import type { FeePaymentStatus } from "@/lib/student-requests/request-fee-workflow-contract";

type Props = {
  amountYer: number;
  paymentStatus: FeePaymentStatus;
  currency?: string;
};

const STATUS_LABEL: Record<FeePaymentStatus, string> = {
  not_required: "لا رسوم مطلوبة",
  pending_payment: "بانتظار السداد",
  paid: "تم السداد",
  waived: "معفى",
  cancelled: "ملغى",
};

export function StudentRequestFeeStatusDisplay({
  amountYer,
  paymentStatus,
  currency = "YER",
}: Props) {
  const showPaymentCta = amountYer > 0 && paymentStatus === "pending_payment";

  return (
    <div dir="rtl" className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
      <div className="flex items-center gap-2 font-bold text-primary">
        <Wallet className="h-4 w-4" />
        حالة الرسوم
      </div>
      <div className="text-muted-foreground">
        المبلغ:{" "}
        <span className="font-mono font-bold text-foreground">
          {amountYer.toLocaleString("ar-YE")} {currency}
        </span>
      </div>
      <div className="text-muted-foreground">
        الحالة: <span className="font-bold text-foreground">{STATUS_LABEL[paymentStatus]}</span>
      </div>
      {showPaymentCta && (
        <p className="text-xs text-amber-800 bg-amber-50 rounded p-2">
          يُرجى التوجّه إلى الإيرادات والمالية لسداد المبلغ خارج البوابة.
        </p>
      )}
      {amountYer === 0 && (
        <p className="text-xs text-muted-foreground">
          لا يلزم سداد رسوم لهذا الطلب.
        </p>
      )}
    </div>
  );
}
