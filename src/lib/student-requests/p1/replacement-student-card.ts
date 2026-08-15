/**
 * P1 — SERVICE 2: بطاقة طالب بدل فاقد (replacement_student_card)
 *
 * Lifecycle:
 *  student → student_affairs_review → payment_confirmation (revenue)
 *          → card_issuance (student affairs) → completed → notify
 *
 * The portal never computes a fee amount. Revenue confirmation is the
 * operational gate before card issuance / completion.
 */

export const REPLACEMENT_CARD_CODE = "replacement_student_card" as const;
export const REPLACEMENT_CARD_TITLE_AR = "بطاقة طالب بدل فاقد";

export const REPLACEMENT_CARD_DENY_REASONS = {
  NOT_ACTIVE_STUDENT: "REPLACEMENT_CARD_STUDENT_NOT_ACTIVE",
  DUPLICATE_OPEN_REQUEST: "REPLACEMENT_CARD_DUPLICATE_OPEN_REQUEST",
  DECLARATION_REQUIRED: "REPLACEMENT_CARD_DECLARATION_REQUIRED",
  LOSS_REASON_REQUIRED: "REPLACEMENT_CARD_LOSS_REASON_REQUIRED",
} as const;

export type ReplacementCardDenyReason =
  (typeof REPLACEMENT_CARD_DENY_REASONS)[keyof typeof REPLACEMENT_CARD_DENY_REASONS];

export const REPLACEMENT_CARD_MESSAGES_AR: Readonly<
  Record<ReplacementCardDenyReason, string>
> = {
  [REPLACEMENT_CARD_DENY_REASONS.NOT_ACTIVE_STUDENT]:
    "هذه الخدمة متاحة للطلاب النشطين فقط.",
  [REPLACEMENT_CARD_DENY_REASONS.DUPLICATE_OPEN_REQUEST]:
    "لديك طلب بطاقة بدل فاقد قيد المعالجة، لا يمكن تقديم طلب جديد قبل اكتماله.",
  [REPLACEMENT_CARD_DENY_REASONS.DECLARATION_REQUIRED]:
    "يجب الإقرار بصحة بيانات الفقد.",
  [REPLACEMENT_CARD_DENY_REASONS.LOSS_REASON_REQUIRED]:
    "يجب إدخال سبب الفقد.",
};

/** Statuses that keep a replacement-card request "open". */
export const REPLACEMENT_CARD_OPEN_STATUSES: readonly string[] = [
  "draft",
  "submitted",
  "in_review",
  "in_progress",
  "returned",
  "awaiting_payment",
  "payment_confirmed",
];

export type ReplacementCardEligibilityInput = {
  studentStatus: string | null | undefined;
  /** Statuses of the student's existing replacement-card requests. */
  existingRequestStatuses: readonly string[];
};

export function evaluateReplacementCardEligibility(
  input: ReplacementCardEligibilityInput,
): { eligible: boolean; denyReason: ReplacementCardDenyReason | null; messageAr: string | null } {
  if ((input.studentStatus ?? "").trim() !== "active") {
    return fail(REPLACEMENT_CARD_DENY_REASONS.NOT_ACTIVE_STUDENT);
  }
  const hasOpen = input.existingRequestStatuses.some((s) =>
    REPLACEMENT_CARD_OPEN_STATUSES.includes((s ?? "").trim()),
  );
  if (hasOpen) return fail(REPLACEMENT_CARD_DENY_REASONS.DUPLICATE_OPEN_REQUEST);
  return { eligible: true, denyReason: null, messageAr: null };
}

function fail(reason: ReplacementCardDenyReason) {
  return { eligible: false, denyReason: reason, messageAr: REPLACEMENT_CARD_MESSAGES_AR[reason] };
}

export function validateReplacementCardForm(
  values: Record<string, unknown>,
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (String(values.loss_reason ?? "").trim().length < 3) {
    errors.loss_reason = REPLACEMENT_CARD_DENY_REASONS.LOSS_REASON_REQUIRED;
  }
  if (values.loss_declaration_ack !== true) {
    errors.loss_declaration_ack = REPLACEMENT_CARD_DENY_REASONS.DECLARATION_REQUIRED;
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export const REPLACEMENT_CARD_DETAIL_CONTRACT = {
  table: "replacement_card_details",
  clientWriteAllowed: false,
  columns: [
    "request_id",
    "loss_reason",
    "loss_declaration_ack",
    "previous_card_number",
    "issued_card_number",
    "card_issued_at",
  ],
} as const;

export const REPLACEMENT_CARD_COMPLETION_MESSAGE_AR =
  "تم إصدار البطاقة البديلة، يرجى مراجعة شؤون الطلاب للاستلام.";
