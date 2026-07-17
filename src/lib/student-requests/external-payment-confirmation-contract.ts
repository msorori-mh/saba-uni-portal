export const EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION = "EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION" as const;

export type ExternalPaymentConfirmationStatus =
  | "awaiting_payment_confirmation"
  | "payment_confirmed"
  | "payment_not_confirmed";

export type ExternalPaymentConfirmationRecord = {
  requestId: string;
  status: ExternalPaymentConfirmationStatus;
  confirmedBy: string | null;
  confirmedAt: string | null;
  note: string | null;
};

export type ExternalPaymentConfirmationInput = {
  requestId: string;
  note?: string | null;
};

export function canAdvanceAfterExternalPaymentConfirmation(
  status: ExternalPaymentConfirmationStatus,
): boolean {
  return status === "payment_confirmed";
}

export function validateExternalPaymentConfirmationInput(
  input: ExternalPaymentConfirmationInput,
): { valid: true; normalized: { requestId: string; note: string | null } } | { valid: false; error: string } {
  if (!input.requestId.trim()) return { valid: false, error: "request_id_required" };
  const note = input.note?.trim() || null;
  if (note && note.length > 2000) return { valid: false, error: "note_too_long" };
  return { valid: true, normalized: { requestId: input.requestId.trim(), note } };
}
