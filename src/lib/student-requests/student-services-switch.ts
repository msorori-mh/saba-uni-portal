/**
 * STUDENT-SERVICES-GLOBAL-SWITCH-01 — client/server contract (pure, no I/O).
 *
 * One admin-only switch pauses every NEW student-service request. The database
 * is the enforcement point (trigger `trg_00_student_services_switch_guard` on
 * `student_requests`, draft docs/migration-drafts/STUDENT-SERVICES-GLOBAL-SWITCH-01.sql);
 * this module only describes the contract and maps the server error for people.
 *
 * While disabled a student still can: read requests, timelines and documents,
 * download issued documents, edit or cancel an own draft, and resubmit a
 * request staff RETURNED (that is not a new service). A student cannot start a
 * new request nor submit a draft. Staff processing is never affected.
 */

/** Error code raised by the database guard (and by the server-side gate). */
export const STUDENT_SERVICES_DISABLED_ERROR_CODE = "STUDENT_SERVICES_TEMPORARILY_DISABLED";

/** Default student-facing notice when the admin wrote no message. */
export const STUDENT_SERVICES_DISABLED_DEFAULT_MESSAGE_AR =
  "الخدمات الطلابية متوقفة مؤقتًا. يمكنك متابعة طلباتك السابقة.";

/** What stays available — shown next to the notice so the pause is explicit. */
export const STUDENT_SERVICES_DISABLED_SCOPE_NOTE_AR =
  "لا يمكن حاليًا بدء طلب جديد أو إرسال مسودة. ما زال بإمكانك متابعة طلباتك السابقة وحالتها، وتنزيل وثائقك الصادرة، وإعادة إرسال طلب أُعيد إليك للاستكمال.";

/** Friendly message for a submit that raced the switch. */
export const STUDENT_SERVICES_DISABLED_SUBMIT_MESSAGE_AR =
  "تعذر إرسال الطلب: الخدمات الطلابية متوقفة مؤقتًا من إدارة الكلية. لم يُرسل طلبك، ويمكنك متابعة طلباتك السابقة والمحاولة لاحقًا.";

/** Shown when the switch state could not be read and a submit must fail closed. */
export const STUDENT_SERVICES_STATUS_UNAVAILABLE_MESSAGE_AR =
  "تعذر التحقق من حالة الخدمات الطلابية الآن. لم يُرسل طلبك؛ حاول مرة أخرى بعد قليل.";

/** Same bound as the database CHECK constraint. */
export const STUDENT_SERVICES_MESSAGE_MAX_LENGTH = 500;

/** Roles allowed to flip the switch — identical to `assertAdmin()`. */
export const STUDENT_SERVICES_SWITCH_ADMIN_ROLES = ["admin", "system_admin"] as const;

/** Statuses a student may still (re)submit from while the services are paused. */
export const STUDENT_SERVICES_RESUBMITTABLE_STATUSES = [
  "returned",
  "returned_for_completion",
] as const;

export type StudentServicesStatus = {
  /** false = new requests are paused. */
  enabled: boolean;
  /** Student-facing notice, already defaulted; null while enabled. */
  messageAr: string | null;
  updatedAt: string | null;
  /**
   * false when the switch is not installed in this database yet (draft not
   * applied): the feature is simply absent and nothing is paused.
   */
  installed: boolean;
};

export const STUDENT_SERVICES_STATUS_NOT_INSTALLED: StudentServicesStatus = {
  enabled: true,
  messageAr: null,
  updatedAt: null,
  installed: false,
};

// Control characters other than a line feed — same set the database rejects.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0001-\u0009\u000B-\u001F\u007F]/;

export type StudentServicesMessageValidation =
  | { ok: true; value: string | null }
  | { ok: false; messageAr: string };

/** Plain text only, trimmed, bounded. Empty means "use the default notice". */
export function validateStudentServicesMessage(raw: unknown): StudentServicesMessageValidation {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, messageAr: "نص الرسالة غير صالح." };
  const value = raw.replace(/\r\n?/g, "\n").trim();
  if (!value) return { ok: true, value: null };
  if (value.length > STUDENT_SERVICES_MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      messageAr: `الرسالة أطول من الحد المسموح (${STUDENT_SERVICES_MESSAGE_MAX_LENGTH} حرفًا).`,
    };
  }
  if (/[<>]/.test(value) || CONTROL_CHARS.test(value)) {
    return { ok: false, messageAr: "الرسالة نص عادي فقط: لا يُسمح بالرموز < و > أو بمحارف التحكم." };
  }
  return { ok: true, value };
}

/** Notice a student sees while disabled: the admin text, else the default. */
export function resolveStudentServicesNoticeAr(messageAr: string | null | undefined): string {
  const trimmed = typeof messageAr === "string" ? messageAr.trim() : "";
  return trimmed || STUDENT_SERVICES_DISABLED_DEFAULT_MESSAGE_AR;
}

/**
 * Parses the `get_student_services_status()` payload. Anything that is not an
 * explicit `enabled: true` is treated as paused (fail closed).
 */
export function parseStudentServicesStatus(raw: unknown): StudentServicesStatus {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const enabled = row.enabled === true;
  return {
    enabled,
    messageAr: enabled
      ? null
      : resolveStudentServicesNoticeAr(typeof row.message_ar === "string" ? row.message_ar : null),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    installed: true,
  };
}

type ErrorLike = { message?: string; code?: string } | null | undefined;

/** True only when the RPC itself does not exist yet (draft not applied). */
export function isStudentServicesSwitchNotInstalled(error: ErrorLike): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  const code = error.code ?? "";
  return (
    code === "42883" ||
    code === "PGRST202" ||
    /function .* does not exist/i.test(message) ||
    /could not find the function/i.test(message)
  );
}

/** Recognises the pause in any error shape (Error, string, RPC error object). */
export function isStudentServicesDisabledError(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";
  return (
    message.includes(STUDENT_SERVICES_DISABLED_ERROR_CODE) ||
    message.includes(STUDENT_SERVICES_DISABLED_SUBMIT_MESSAGE_AR)
  );
}

/** Arabic message for a paused-services error, or null when it is another error. */
export function studentServicesDisabledMessageAr(error: unknown): string | null {
  return isStudentServicesDisabledError(error) ? STUDENT_SERVICES_DISABLED_SUBMIT_MESSAGE_AR : null;
}

/**
 * May the student go on with this request while the services are paused?
 * Only a request staff returned can still be (re)submitted.
 */
export function isResubmissionAllowedWhilePaused(status: string | null | undefined): boolean {
  return (STUDENT_SERVICES_RESUBMITTABLE_STATUSES as readonly string[]).includes(status ?? "");
}

export type StudentServicesAdminView = {
  enabled: boolean;
  /** Raw admin text (not defaulted). */
  messageAr: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
  /** false while the row still holds the state the migration seeded. */
  hasBeenChanged: boolean;
  /** The draft is applied and the switch can be used. */
  installed: boolean;
  /** Caller may flip the switch (admin | system_admin). */
  canManage: boolean;
};
