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
