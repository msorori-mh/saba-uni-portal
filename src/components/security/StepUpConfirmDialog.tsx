import { Fingerprint, Loader2, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getStepUpDescriptor } from "@/lib/security/step-up-contract";

/**
 * Sensitive-action confirmation: shows the action summary and its effects,
 * then requires a biometric step-up. Cancelling here performs ZERO RPC calls.
 */
export function StepUpConfirmDialog({
  open,
  onOpenChange,
  serviceCode,
  busy,
  errorAr,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceCode: string;
  busy: boolean;
  errorAr?: string | null;
  onConfirm: () => void;
}) {
  const descriptor = getStepUpDescriptor(serviceCode);
  if (!descriptor) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent dir="rtl" data-testid="step-up-confirm-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <ShieldAlert className="h-5 w-5 text-gold" aria-hidden />
            {descriptor.titleAr}
          </DialogTitle>
          <DialogDescription>{descriptor.summaryAr}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3 text-[12px] font-bold text-foreground">
          {descriptor.consequencesAr.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden className="text-gold">
                •
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        {errorAr && (
          <p className="text-[11px] font-bold text-destructive" role="alert">
            {errorAr}
          </p>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            data-testid="step-up-cancel"
            className="min-h-11 rounded-lg border border-primary px-4 text-sm font-bold text-primary disabled:opacity-60"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            data-testid="step-up-confirm"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
            تأكيد بالبصمة
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
