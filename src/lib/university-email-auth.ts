/** Shared helpers for university-email-only portal login. */

export const UNIVERSITY_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const KNOWN_UNIVERSITY_EMAIL_SUFFIXES = [
  "@students.usr.edu.ye",
  "@faculty.usr.edu.ye",
  "@staff.usr.edu.ye",
  "@usr.edu.ye",
] as const;

export function normalizeUniversityLoginEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUniversityLoginEmail(raw: string): boolean {
  const email = normalizeUniversityLoginEmail(raw);
  return UNIVERSITY_EMAIL_REGEX.test(email);
}

/** Canonical student university email suffix — the only domain allowed for student logins. */
export const STUDENT_UNIVERSITY_EMAIL_SUFFIX = "@students.usr.edu.ye";

export function isStudentUniversityEmail(raw: string): boolean {
  const email = normalizeUniversityLoginEmail(raw);
  return isValidUniversityLoginEmail(email) && email.endsWith(STUDENT_UNIVERSITY_EMAIL_SUFFIX);
}

/** Returns Arabic validation message, or null when valid. */
export function validateStudentUniversityEmailInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "الإيميل الجامعي للطالب مطلوب.";
  if (!isValidUniversityLoginEmail(trimmed)) {
    return "صيغة الإيميل الجامعي غير صحيحة.";
  }
  if (!isStudentUniversityEmail(trimmed)) {
    return `يجب أن ينتهي الإيميل الجامعي للطالب بـ ${STUDENT_UNIVERSITY_EMAIL_SUFFIX} — لا تُقبل النطاقات الأخرى.`;
  }
  return null;
}

/** Returns Arabic validation message, or null when valid. */
export function validateUniversityLoginEmailInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "الإيميل الجامعي مطلوب.";
  if (!trimmed.includes("@")) {
    return "يتم تسجيل الدخول باستخدام الإيميل الجامعي فقط — لا يُقبل الرقم الأكاديمي أو الوظيفي كاسم دخول.";
  }
  if (!isValidUniversityLoginEmail(trimmed)) {
    return "صيغة الإيميل الجامعي غير صحيحة.";
  }
  return null;
}

/** Faculty temporary password: prefer academic number when provided, else employee number. */
export function facultyTemporaryPassword(
  academicNumber?: string | null,
  employeeNumber?: string | null,
): string {
  const ac = academicNumber?.trim();
  if (ac) return ac;
  return employeeNumber?.trim() ?? "";
}
