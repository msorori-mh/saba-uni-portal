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

// ---------------------------------------------------------------------------
// 02R_SOURCE_ONLY_B1_ACTION_ERROR_PROVENANCE
//
// Unclassified B1 action errors must NEVER fall back to the permission-denied
// Arabic message. They surface as the safe technical-error adapter code
// ("UNEXPECTED_ERROR" — owned by adapter.types.ts, outside this change scope)
// and are logged server-side with structured, redacted provenance.
// ---------------------------------------------------------------------------

/**
 * The adapter code used for unclassified/unknown B1 action errors. Its Arabic
 * rendering (adapter.types.ts) is a safe technical message with no permission
 * wording and no raw backend text.
 */
export const B1_UNCLASSIFIED_ERROR_ADAPTER_CODE = "UNEXPECTED_ERROR" as const;

/**
 * Backend/client messages that are already classified and therefore must NOT
 * be logged as "unclassified". Business-rule and authorization errors are
 * known by definition (handled above); this list covers the remaining wired
 * operational codes.
 */
const B1_KNOWN_OPERATIONAL_PATTERNS: readonly RegExp[] = [
  /\bB1_COMMENT_REQUIRED\b|\bCOMMENT_REQUIRED\b/,
  /\bB1_ACTIVE_STEP_REQUIRED\b/,
  /\bB1_SPECIALIZED_ACTION_RPC_REQUIRED\b/,
  /\bB1_ACTION_NOT_SUPPORTED\b/,
  /\bB1_ACTION_TYPE_MISMATCH\b/,
  /\bB1_ACTION_FAILED\b/,
  /\bB1_DETAILS_ROW_MISSING\b/,
  /\bB1_STALE_REQUEST_VERSION\b/,
  /\bB1_INPUT_VALIDATION_FAILED\b/,
  /\bB1_[A-Z0-9_]*INPUT_INVALID\b|\bB1_DRAFT_FIELD_TYPE_INVALID\b/,
  /\bPAYMENT_CONFIRMATION_FAILED\b|\bPAYMENT_CONFIRMATION_STEP_NOT_FOUND\b/,
  /\bB1_READ_ACCESS_DENIED\b|\bB1_DRAFT_ACCESS_DENIED\b/,
  /\bB1_ATTACHMENT_REQUIRED\b|\bATTACHMENT_[A-Z_]+\b/,
  /\bNOT_FOUND\b|\bP0002\b/,
  /\bB1_OWNED[A-Z0-9_]*\b/,
  /failed to fetch|networkerror|fetch failed|load failed|err_network|err_internet_disconnected|connection (refused|reset)|aborted/i,
];

/**
 * True when the message maps to an already-classified B1 error (business rule,
 * authorization, or a wired operational code). Unclassified = false.
 */
export function isB1KnownOperationalError(message: string): boolean {
  if (!message) return false;
  if (isB1BusinessRuleError(message)) return true;
  if (isB1AuthorizationError(message)) return true;
  return B1_KNOWN_OPERATIONAL_PATTERNS.some((pattern) => pattern.test(message));
}

const B1_LOG_MESSAGE_MAX = 240;

/**
 * Redact potential PII (emails, long digit sequences such as phone/national
 * numbers) and bound length before a message reaches the server log.
 */
export function redactB1ErrorMessageForLog(message: string): string {
  return message
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b\d{6,}\b/g, "[num]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, B1_LOG_MESSAGE_MAX);
}

export type B1UnclassifiedActionLogInput = {
  /** Stable operation identifier, e.g. the RPC name. */
  operation: string;
  /** Staff action attempted (approve/review/…/confirm_payment). */
  action: string;
  /** Runtime workflow step UUID (not student PII). */
  stepId: string;
  error: unknown;
};

/**
 * 02R — structured server-side log for UNCLASSIFIED B1 action errors only.
 *
 * - Logs exclusively on the server (no-op in the browser bundle at runtime).
 * - Never writes to DB/audit; console transport only.
 * - Payload keys: event, operation, action, stepId, code, message (redacted).
 * - Returns true when an entry was emitted (test hook).
 */
export function logB1UnclassifiedActionError(input: B1UnclassifiedActionLogInput): boolean {
  const raw = input.error instanceof Error ? input.error.message : String(input.error ?? "");
  if (isB1KnownOperationalError(raw)) return false;
  if (typeof window !== "undefined") return false;
  console.error(
    JSON.stringify({
      event: "b1_unclassified_action_error",
      operation: input.operation,
      action: input.action,
      stepId: input.stepId,
      code: "UNCLASSIFIED",
      message: redactB1ErrorMessageForLog(raw),
    }),
  );
  return true;
}
