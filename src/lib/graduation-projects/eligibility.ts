/**
 * Canonical Graduation Projects student Level-4 eligibility helpers (UI capability only).
 * Backend SQL predicate remains authoritative — never trust client-supplied level.
 */
export const GP_FOURTH_ACADEMIC_LEVEL_NUMBER = 4 as const;

export const GP_STUDENT_LEVEL4_REQUIRED_MSG =
  "مشاريع التخرج متاحة فقط لطلاب المستوى الرابع الحاليين.";

/** Fail-closed: only an explicit current level_number === 4 is eligible. */
export function isCurrentFourthAcademicLevel(
  levelNumber: number | null | undefined,
): boolean {
  return levelNumber === GP_FOURTH_ACADEMIC_LEVEL_NUMBER;
}

export type AcademicLevelLike = {
  level_number?: number | null;
} | null | undefined;

export function isGpStudentLevel4EligibleFromStatus(status: {
  level?: AcademicLevelLike;
} | null | undefined): boolean {
  return isCurrentFourthAcademicLevel(status?.level?.level_number ?? null);
}
