/**
 * Stable mobile public API error contract (v1).
 * Never leak SQL, stack traces, or storage credentials to Flutter.
 */

export const MOBILE_API_ERROR_FAMILIES = [
  "AUTH_REQUIRED",
  "STUDENT_CONTEXT_REQUIRED",
  "NOT_FOUND",
  "NOT_ALLOWED",
  "INVALID_STATE",
  "VALIDATION_ERROR",
  "SERVICE_UNAVAILABLE",
  "RATE_LIMITED",
] as const;

export type MobileApiErrorFamily = (typeof MOBILE_API_ERROR_FAMILIES)[number];

export type MobileApiErrorBody = {
  ok: false;
  error: {
    family: MobileApiErrorFamily;
    code: string;
    message: string;
    message_ar?: string;
  };
};

const HTTP_BY_FAMILY: Record<MobileApiErrorFamily, number> = {
  AUTH_REQUIRED: 401,
  STUDENT_CONTEXT_REQUIRED: 403,
  NOT_FOUND: 404,
  NOT_ALLOWED: 403,
  INVALID_STATE: 409,
  VALIDATION_ERROR: 400,
  SERVICE_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
};

export class MobileApiError extends Error {
  readonly family: MobileApiErrorFamily;
  readonly code: string;
  readonly messageAr?: string;
  readonly httpStatus: number;

  constructor(
    family: MobileApiErrorFamily,
    code: string,
    message: string,
    messageAr?: string,
  ) {
    super(message);
    this.name = "MobileApiError";
    this.family = family;
    this.code = code;
    this.messageAr = messageAr;
    this.httpStatus = HTTP_BY_FAMILY[family];
  }

  toBody(): MobileApiErrorBody {
    return {
      ok: false,
      error: {
        family: this.family,
        code: this.code,
        message: this.message,
        ...(this.messageAr ? { message_ar: this.messageAr } : {}),
      },
    };
  }
}

const SENSITIVE_PATTERNS: RegExp[] = [
  /service[_\s-]?role/i,
  /SUPABASE_SERVICE_ROLE/i,
  /password/i,
  /stack\s*trace/i,
  /at\s+\S+\s+\(/i,
  /postgres(ql)?\s+error/i,
  /PGRST\d+/i,
  /permission denied for/i,
  /relation\s+"[^"]+"/i,
  /column\s+"[^"]+"/i,
  /storage\/v1\/object\/sign/i,
];

/** Strip internal/SQL/stack details before any client-facing message. */
export function sanitizeClientMessage(raw: string, fallback: string): string {
  const text = String(raw ?? "").trim();
  if (!text) return fallback;
  if (text.length > 280) return fallback;
  for (const re of SENSITIVE_PATTERNS) {
    if (re.test(text)) return fallback;
  }
  // Block multiline stack-like payloads
  if (text.includes("\n") && /Error:|Exception|Traceback/i.test(text)) {
    return fallback;
  }
  return text;
}

export function mapUnknownToMobileError(err: unknown): MobileApiError {
  if (err instanceof MobileApiError) return err;

  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Unexpected error";

  const lower = raw.toLowerCase();

  if (
    lower.includes("unauthorized") ||
    lower.includes("no authorization") ||
    lower.includes("invalid token") ||
    lower.includes("no token") ||
    lower.includes("bearer")
  ) {
    return new MobileApiError(
      "AUTH_REQUIRED",
      "AUTH_REQUIRED",
      "Authentication required",
      "يجب تسجيل الدخول",
    );
  }

  if (
    lower.includes("student profile not found") ||
    lower.includes("لا يوجد ملف طالب") ||
    lower.includes("ملف طالب")
  ) {
    return new MobileApiError(
      "STUDENT_CONTEXT_REQUIRED",
      "STUDENT_CONTEXT_REQUIRED",
      "Student profile required",
      "لا يوجد ملف طالب مرتبط بالحساب",
    );
  }

  if (
    lower.includes("غير موجود") ||
    lower.includes("not found") ||
    lower.includes("الملف غير موجود")
  ) {
    return new MobileApiError(
      "NOT_FOUND",
      "NOT_FOUND",
      sanitizeClientMessage(raw, "Resource not found"),
      sanitizeClientMessage(raw, "غير موجود"),
    );
  }

  if (
    lower.includes("ملغاة") ||
    lower.includes("cancelled") ||
    lower.includes("غير متاحة للتنزيل") ||
    lower.includes("غير متاح بعد") ||
    lower.includes("invalid state") ||
    lower.includes("حالتها الحالية")
  ) {
    return new MobileApiError(
      "INVALID_STATE",
      "INVALID_STATE",
      sanitizeClientMessage(raw, "Resource not available in current state"),
      sanitizeClientMessage(raw, "العنصر غير متاح في حالته الحالية"),
    );
  }

  if (
    lower.includes("غير مصرح") ||
    lower.includes("forbidden") ||
    lower.includes("ليس لديك صلاحية") ||
    lower.includes("لا يمكنك الوصول")
  ) {
    return new MobileApiError(
      "NOT_ALLOWED",
      "NOT_ALLOWED",
      sanitizeClientMessage(raw, "Not allowed"),
      sanitizeClientMessage(raw, "غير مصرح"),
    );
  }

  if (
    lower.includes("uuid") ||
    lower.includes("validation") ||
    lower.includes("required") ||
    lower.includes("invalid input")
  ) {
    return new MobileApiError(
      "VALIDATION_ERROR",
      "VALIDATION_ERROR",
      sanitizeClientMessage(raw, "Invalid input"),
      sanitizeClientMessage(raw, "بيانات غير صالحة"),
    );
  }

  return new MobileApiError(
    "SERVICE_UNAVAILABLE",
    "SERVICE_UNAVAILABLE",
    "Service temporarily unavailable",
    "الخدمة غير متاحة مؤقتاً",
  );
}
