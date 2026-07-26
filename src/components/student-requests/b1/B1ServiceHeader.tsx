import { AlertTriangle, Info } from "lucide-react";

type Props = {
  titleAr: string;
  descriptionAr: string;
  /** Amber requirements/eligibility alert shown under the service title. */
  requirementsAlertAr?: string;
  /** Neutral note about the fee policy (external payment / free service). */
  feePolicyNoteAr?: string;
};

/**
 * Header for a B1 student service form: service name, description, optional
 * requirements alert and fee-policy note.
 */
export function B1ServiceHeader({
  titleAr,
  descriptionAr,
  requirementsAlertAr,
  feePolicyNoteAr,
}: Props) {
  return (
    <header dir="rtl" data-testid="b1-service-header" className="space-y-3">
      <div className="space-y-1">
        <h1 className="font-display text-lg font-extrabold text-primary">{titleAr}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{descriptionAr}</p>
      </div>

      {requirementsAlertAr && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{requirementsAlertAr}</span>
        </div>
      )}

      {feePolicyNoteAr && (
        <div
          role="note"
          className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{feePolicyNoteAr}</span>
        </div>
      )}
    </header>
  );
}
