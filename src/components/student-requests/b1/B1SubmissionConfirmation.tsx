import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleAr: string;
  bodyAr: string;
  confirmLabelAr?: string;
  /** When true, the student must tick the acknowledgment before confirming. */
  requireAcknowledgment?: boolean;
  acknowledgmentLabelAr?: string;
  /** True while the submit call is in flight — blocks double submission. */
  submitting?: boolean;
  onConfirm: () => void;
};

const DEFAULT_CONFIRM_LABEL = "تأكيد التقديم";
const SUBMITTING_LABEL = "جارٍ الإرسال…";

/**
 * Generic pre-submit confirmation dialog for B1 student services. Optional
 * acknowledgment checkbox gates the confirm button; the confirm button is a
 * plain Button (not AlertDialogAction) so the dialog does not auto-close
 * before the async submit resolves.
 */
export function B1SubmissionConfirmation({
  open,
  onOpenChange,
  titleAr,
  bodyAr,
  confirmLabelAr = DEFAULT_CONFIRM_LABEL,
  requireAcknowledgment = false,
  acknowledgmentLabelAr,
  submitting = false,
  onConfirm,
}: Props) {
  const [acknowledged, setAcknowledged] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setAcknowledged(false);
    onOpenChange(nextOpen);
  };

  const confirmDisabled = submitting || (requireAcknowledgment && !acknowledged);

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent dir="rtl" data-testid="b1-submission-confirmation">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-lg font-extrabold text-primary">
            {titleAr}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            {bodyAr}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {requireAcknowledgment && acknowledgmentLabelAr && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <Checkbox
              id="b1-submission-acknowledgment"
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked === true)}
              disabled={submitting}
              aria-label={acknowledgmentLabelAr}
            />
            <Label
              htmlFor="b1-submission-acknowledgment"
              className="cursor-pointer text-xs leading-relaxed text-amber-900"
            >
              {acknowledgmentLabelAr}
            </Label>
          </div>
        )}

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel
            disabled={submitting}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-bold hover:bg-muted"
          >
            إلغاء
          </AlertDialogCancel>
          <Button
            type="button"
            disabled={confirmDisabled}
            onClick={onConfirm}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? SUBMITTING_LABEL : confirmLabelAr}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
