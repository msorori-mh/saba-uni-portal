import { Fingerprint, Loader2, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { getStepUpDescriptor } from "@/lib/security/step-up-contract";

/**
 * Sensitive-action confirmation: shows the action summary and its effects, then
 * requires a step-up proof. Native uses a biometric signing; web uses a fresh
 * password re-authentication verified server-side. Cancelling here performs
 * ZERO submit RPC calls.
 */
export function StepUpConfirmDialog({
  open,
  onOpenChange,
  serviceCode,
  channel,
  password,
  onPasswordChange,
  busy,
  errorAr,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceCode: string;
  channel: "native" | "web";
  password: string;
  onPasswordChange: (value: string) => void;
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

        {channel === "web" && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-muted-foreground">
              أدخل كلمة المرور الحالية لتأكيد هويتك قبل إرسال هذا الطلب.
            </p>
            <PasswordInput
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="كلمة المرور"
              autoComplete="current-password"
            />
          </div>
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
            disabled={busy || (channel === "web" && password.length === 0)}
            onClick={onConfirm}
            data-testid="step-up-confirm"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
            {channel === "native" ? "تأكيد بالبصمة" : "تأكيد وإرسال"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
