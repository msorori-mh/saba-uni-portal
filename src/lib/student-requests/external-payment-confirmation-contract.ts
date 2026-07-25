export const EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION = "EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION" as const;

/** Ordinary revenue-officer confirm_payment step. Actor, time, and optional note only. */
export type ExternalPaymentConfirmationStatus =
  | "awaiting_payment_confirmation"
  | "payment_confirmed";

export type ExternalPaymentConfirmationRecord = {
  requestId: string;
  stepId: string;
  status: ExternalPaymentConfirmationStatus;
  confirmedBy: string | null;
  confirmedAt: string | null;
  note: string | null;
};

/** Matches record_external_university_payment_confirmation(p_step_id, p_note). */
export type ExternalPaymentConfirmationInput = {
  stepId: string;
  note?: string | null;
};

export function canAdvanceAfterExternalPaymentConfirmation(
  status: ExternalPaymentConfirmationStatus,
): boolean {
  return status === "payment_confirmed";
}

export function validateExternalPaymentConfirmationInput(
  input: ExternalPaymentConfirmationInput,
): { valid: true; normalized: { stepId: string; note: string | null } } | { valid: false; error: string } {
  if (!input.stepId.trim()) return { valid: false, error: "step_id_required" };
  const note = input.note?.trim() || null;
  if (note && note.length > 2000) return { valid: false, error: "note_too_long" };
  return { valid: true, normalized: { stepId: input.stepId.trim(), note } };
}
