/**
 * B1_STAGE3_FIX_B1_BUSINESS_ERROR_MAPPING_SOURCE_ONLY-120
 *
 * Source-only mapping seam that separates B1 backend *business precondition*
 * errors from *authorization* errors.
 *
 * Backend business rejections such as `B1_FINAL_CHANCE_ACADEMIC_STATUS_REQUIRED`
 * were previously funnelled into the staff action fallback code
 * `PERMISSION_DENIED` and rendered as
 * «لا تملك صلاحية تنفيذ هذا الإجراء على هذا الطلب.» — misleading, because the
 * actor is authorized and only the data precondition is unmet.
 *
 * This module changes presentation/classification only. It never changes
 * backend authorization, RPC behaviour, workflow configuration, or effects.
 */

/**
 * `B1_*_REQUIRED` codes that intentionally keep their existing (non-business)
 * classification and must NOT be re-mapped here.
 */
const B1_BUSINESS_EXCLUDED_CODES = [
  "B1_ACTIVE_STEP_REQUIRED", // routing/not-found semantics
  "B1_COMMENT_REQUIRED", // client-side field validation
  "COMMENT_REQUIRED", // client-side field validation
  "B1_SPECIALIZED_ACTION_RPC_REQUIRED", // wiring guard, not a business rule
  "B1_ATTACHMENT_REQUIRED", // form validation
] as const;

/** Explicit business code → Arabic message. */
const B1_BUSINESS_MESSAGES_AR: Readonly<Record<string, string>> = {
  B1_FINAL_CHANCE_ACADEMIC_STATUS_REQUIRED:
    "لا يمكن تطبيق الفرصة النهائية لأن حالة الطالب الأكاديمية ليست نشطة للسنة والفصل المحددين.",
};

/** Safe generic Arabic fallback for any other `B1_*_REQUIRED` business error. */
export const B1_BUSINESS_GENERIC_MESSAGE_AR =
  "تعذر تنفيذ هذا الإجراء لأن أحد شروط الطلب غير مستوفٍ حالياً. راجع بيانات الطلب ثم أعد المحاولة.";

const B1_BUSINESS_REQUIRED_PATTERN = /\bB1_[A-Z0-9_]*_REQUIRED\b/;

/** Extracts the first recognised B1 business precondition code from a message. */
export function extractB1BusinessRuleCode(message: string): string | null {
  if (!message) return null;
  const upper = message.toUpperCase();
  for (const excluded of B1_BUSINESS_EXCLUDED_CODES) {
    if (upper.includes(excluded)) return null;
  }
  const explicit = Object.keys(B1_BUSINESS_MESSAGES_AR).find((code) => upper.includes(code));
  if (explicit) return explicit;
  const generic = upper.match(B1_BUSINESS_REQUIRED_PATTERN);
  return generic ? generic[0] : null;
}

/** True when the backend message is a B1 business precondition rejection. */
export function isB1BusinessRuleError(message: string): boolean {
  return extractB1BusinessRuleCode(message) !== null;
}

/** Arabic business message for a B1 precondition failure (never permission text). */
export function b1BusinessRuleMessageAr(message: string): string {
  const code = extractB1BusinessRuleCode(message);
  if (!code) return B1_BUSINESS_GENERIC_MESSAGE_AR;
  return B1_BUSINESS_MESSAGES_AR[code] ?? B1_BUSINESS_GENERIC_MESSAGE_AR;
}

/**
 * True only for genuine authorization failures:
 * SQLSTATE 42501 / 28000, or explicit denial codes.
 */
const B1_AUTHORIZATION_PATTERN =
  /\b42501\b|\b28000\b|PERMISSION_DENIED|AUTHORIZATION_DENIED|ACCESS_DENIED|NOT_AUTHORIZED|B1_DIRECT_ASSIGNEE|B1_OWNED|B1_SPECIALIZED|INSUFFICIENT_PRIVILEGE/i;

export function isB1AuthorizationError(message: string): boolean {
  if (!message) return false;
  if (isB1BusinessRuleError(message)) return false;
  return B1_AUTHORIZATION_PATTERN.test(message);
}

export const B1_BUSINESS_EXCLUDED_CODE_LIST: readonly string[] = B1_BUSINESS_EXCLUDED_CODES;
export const B1_BUSINESS_MAPPED_CODES: readonly string[] = Object.keys(B1_BUSINESS_MESSAGES_AR);
