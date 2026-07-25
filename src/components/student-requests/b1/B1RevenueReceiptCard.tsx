import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { b1AdapterErrorMessageAr } from "@/lib/student-requests/b1-ui";

export function B1RevenueReceiptCard({
  stepId,
  acting = false,
  onConfirm,
}: {
  stepId: string;
  acting?: boolean;
  onConfirm: (stepId: string, optionalNote?: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const confirm = async () => {
    if (lock.current || busy || acting) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(stepId, note.trim() || undefined);
      setNote("");
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
      data-testid="b1-revenue-receipt-card"
      className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card"
    >
      <h3 className="font-display text-base font-extrabold text-primary">تأكيد استلام الرسوم</h3>
      <p className="text-xs leading-5 text-muted-foreground">
        تحقق من بيانات الطالب والطلب والمرفقات المعروضة، ثم أكد الاستلام المسجل في النظام الجامعي
        الرئيسي.
      </p>
      <label className="block space-y-1">
        <span className="text-xs font-bold text-muted-foreground">ملاحظة اختيارية</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={note}
          disabled={busy || acting}
          onChange={(event) => setNote(event.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <button
        type="button"
        disabled={busy || acting}
        onClick={() => void confirm()}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {busy || acting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        تأكيد استلام الرسوم
      </button>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
