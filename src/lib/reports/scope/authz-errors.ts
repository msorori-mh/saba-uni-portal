/**
 * Authorization / scope denial errors for beneficiary reports.
 * Must NEVER be coerced into DATA_INCOMPLETE metric presence.
 */

export const REPORT_AUTHZ_ERROR_CODE = "REPORT_AUTHZ_DENIED" as const;
export const REPORT_SCOPE_ERROR_CODE = "REPORT_SCOPE_DENIED" as const;
export const REPORT_NOT_CONFIGURED_CODE = "REPORT_NOT_CONFIGURED" as const;

export type ReportDenialCode =
  | typeof REPORT_AUTHZ_ERROR_CODE
  | typeof REPORT_SCOPE_ERROR_CODE
  | typeof REPORT_NOT_CONFIGURED_CODE;

export class ReportAuthorizationError extends Error {
  readonly code: ReportDenialCode;
  readonly arabicMessage: string;

  constructor(
    arabicMessage: string,
    code: ReportDenialCode = REPORT_AUTHZ_ERROR_CODE,
  ) {
    super(arabicMessage);
    this.name = "ReportAuthorizationError";
    this.code = code;
    this.arabicMessage = arabicMessage;
  }
}

export function isReportAuthorizationError(
  error: unknown,
): error is ReportAuthorizationError {
  if (error instanceof ReportAuthorizationError) return true;
  if (!error || typeof error !== "object") return false;
  const maybe = error as { name?: string; code?: string };
  return (
    maybe.name === "ReportAuthorizationError" ||
    maybe.code === REPORT_AUTHZ_ERROR_CODE ||
    maybe.code === REPORT_SCOPE_ERROR_CODE ||
    maybe.code === REPORT_NOT_CONFIGURED_CODE
  );
}

/** True when an Error message is an auth/scope denial (legacy throw sites). */
export function isAuthorizationDenialMessage(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  return (
    m.includes("غير مصرح") ||
    m.includes("ليس لديك صلاحية") ||
    (m.includes("نطاق") &&
      (m.includes("مرفوض") || m.includes("مفقود") || m.includes("بلا"))) ||
    m.includes("لا يرى") ||
    m.includes("NOT_CONFIGURED") ||
    m.includes("غير مكوّن") ||
    m.includes("غير مكون") ||
    (m.includes("ربط") && (m.includes("مفقود") || m.includes("غير")))
  );
}

export function denyAuthz(messageAr: string): never {
  throw new ReportAuthorizationError(messageAr, REPORT_AUTHZ_ERROR_CODE);
}

export function denyScope(messageAr: string): never {
  throw new ReportAuthorizationError(messageAr, REPORT_SCOPE_ERROR_CODE);
}

export function denyNotConfigured(messageAr: string): never {
  throw new ReportAuthorizationError(messageAr, REPORT_NOT_CONFIGURED_CODE);
}

/** Rethrow auth/scope denials; wrap unknown as generic Error for callers. */
export function rethrowIfAuthorizationDenial(error: unknown): void {
  if (isReportAuthorizationError(error)) throw error;
  if (error instanceof Error && isAuthorizationDenialMessage(error.message)) {
    throw new ReportAuthorizationError(error.message, REPORT_AUTHZ_ERROR_CODE);
  }
}
