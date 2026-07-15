// FACULTY_ACCOUNTS_EXISTING_EMAIL_UPDATE_IMPORTER_REMEDIATION_01
// Pure, dependency-free classification helpers for the explicit
// "UPDATE_EXISTING_FACULTY_ACCOUNT_EMAILS" mode. Kept in a .core.ts file so
// tests can import it without pulling any server-only module.

export type EmailUpdateOutcome =
  | "READY_AUTH_AND_FACULTY_EMAIL_UPDATE"
  | "READY_FACULTY_EMAIL_BACKFILL_ONLY"
  | "ALREADY_MATCHED"
  | "EMAIL_CONFLICT"
  | "FACULTY_NOT_FOUND"
  | "FACULTY_DUPLICATE"
  | "AUTH_USER_NOT_FOUND"
  | "ACCOUNT_LINK_AMBIGUOUS"
  | "INVALID_EMAIL"
  | "FAILED";

export const DEFAULT_UNIVERSITY_EMAIL_DOMAINS = [
  "usr.edu.ye",
  "students.usr.edu.ye",
  "faculty.usr.edu.ye",
  "staff.usr.edu.ye",
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= 160;
}

export function emailDomainAllowed(
  email: string,
  allowedDomains: readonly string[] = DEFAULT_UNIVERSITY_EMAIL_DOMAINS,
): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return allowedDomains.some((d) => domain === d.toLowerCase());
}

/** Mask an email for safe display: keep 1st char + last char of local + full domain. */
export function maskEmail(email: string | null | undefined): string {
  const norm = normalizeEmail(email);
  if (!norm) return "—";
  const at = norm.indexOf("@");
  if (at <= 0) return "***";
  const local = norm.slice(0, at);
  const domain = norm.slice(at);
  if (local.length <= 2) return `${local[0] ?? "*"}***${domain}`;
  return `${local[0]}***${local[local.length - 1]}${domain}`;
}

/** Input shape for pure classification (all lookups already resolved). */
export type EmailUpdateClassifyInput = {
  employeeNumberRaw: string;
  newEmailRaw: string;
  /** Faculty profiles found by employee_number. */
  profiles: Array<{ id: string; user_id: string | null; employee_number: string; full_name_ar: string }>;
  /** Auth user linked to profile.user_id (if resolvable). */
  linkedAuth: { id: string; email: string | null } | null;
  /** Any OTHER auth user that already owns the new email (id != linkedAuth.id). */
  emailOwnerAuth: { id: string; email: string | null } | null;
  /** Any OTHER faculty profile linking that owner auth id. */
  emailOwnerProfile: { id: string; employee_number: string } | null;
  /** Faculty table row (public.faculty) email for backfill decisions. */
  facultyTableEmail?: string | null;
  allowedDomains?: readonly string[];
};

export type EmailUpdateClassifyResult = {
  outcome: EmailUpdateOutcome;
  message?: string;
  currentAuthEmail: string | null;
  currentFacultyEmail: string | null;
  newEmail: string;
  needsAuthUpdate: boolean;
  needsFacultyUpdate: boolean;
};

/**
 * Classify a single row for the explicit email-update mode.
 * No side effects, no I/O.
 */
export function classifyEmailUpdate(input: EmailUpdateClassifyInput): EmailUpdateClassifyResult {
  const newEmail = normalizeEmail(input.newEmailRaw);
  const base = {
    currentAuthEmail: input.linkedAuth?.email ? normalizeEmail(input.linkedAuth.email) : null,
    currentFacultyEmail: input.facultyTableEmail ? normalizeEmail(input.facultyTableEmail) : null,
    newEmail,
    needsAuthUpdate: false,
    needsFacultyUpdate: false,
  };

  if (!newEmail || !isValidEmailFormat(newEmail)) {
    return { ...base, outcome: "INVALID_EMAIL", message: "صيغة البريد غير صالحة" };
  }
  if (!emailDomainAllowed(newEmail, input.allowedDomains)) {
    return { ...base, outcome: "INVALID_EMAIL", message: "نطاق البريد غير معتمد" };
  }

  if (input.profiles.length === 0) {
    return { ...base, outcome: "FACULTY_NOT_FOUND", message: "الرقم الوظيفي غير موجود" };
  }
  if (input.profiles.length > 1) {
    return { ...base, outcome: "FACULTY_DUPLICATE", message: "أكثر من سجل بنفس الرقم الوظيفي" };
  }
  const profile = input.profiles[0];
  if (!profile.user_id) {
    return {
      ...base,
      outcome: "ACCOUNT_LINK_AMBIGUOUS",
      message: "الملف غير مرتبط بحساب Auth — استخدم وضع الإنشاء/الربط",
    };
  }
  if (!input.linkedAuth) {
    return { ...base, outcome: "AUTH_USER_NOT_FOUND", message: "الحساب المرتبط غير موجود في Auth" };
  }

  // Email owned by another user?
  if (input.emailOwnerAuth && input.emailOwnerAuth.id !== input.linkedAuth.id) {
    const other = input.emailOwnerProfile
      ? `${input.emailOwnerProfile.employee_number}`
      : "حساب آخر";
    return {
      ...base,
      outcome: "EMAIL_CONFLICT",
      message: `البريد مرتبط بـ ${other}`,
    };
  }

  const authMatches = base.currentAuthEmail === newEmail;
  const facultyMatches = base.currentFacultyEmail === newEmail;

  if (authMatches && facultyMatches) {
    return { ...base, outcome: "ALREADY_MATCHED" };
  }
  if (authMatches && !facultyMatches) {
    return {
      ...base,
      outcome: "READY_FACULTY_EMAIL_BACKFILL_ONLY",
      needsFacultyUpdate: true,
    };
  }
  return {
    ...base,
    outcome: "READY_AUTH_AND_FACULTY_EMAIL_UPDATE",
    needsAuthUpdate: true,
    needsFacultyUpdate: base.currentFacultyEmail !== newEmail,
  };
}

export const READY_OUTCOMES: ReadonlySet<EmailUpdateOutcome> = new Set([
  "READY_AUTH_AND_FACULTY_EMAIL_UPDATE",
  "READY_FACULTY_EMAIL_BACKFILL_ONLY",
]);

export function isReadyOutcome(o: EmailUpdateOutcome): boolean {
  return READY_OUTCOMES.has(o);
}
