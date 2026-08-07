/**
 * Canonical Graduation Projects student Level-4 eligibility helpers (UI capability).
 * Backend SQL predicate remains authoritative — never trust client-supplied level.
 *
 * Ordering / uniqueness must match public.student_is_current_fourth_academic_level:
 *   updated_at DESC NULLS LAST, created_at DESC
 * Exactly one authoritative current row; any top-rank tie / ambiguity denies.
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

export type AcademicStatusTimestampRow = {
  id?: string | null;
  level_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  level?: AcademicLevelLike;
};

/**
 * Compare two status rows using the canonical backend ordering.
 * Returns < 0 when `a` is more current than `b`.
 */
export function compareAcademicStatusCurrency(
  a: AcademicStatusTimestampRow,
  b: AcademicStatusTimestampRow,
): number {
  const aUpdated = a.updated_at ?? "";
  const bUpdated = b.updated_at ?? "";
  if (aUpdated !== bUpdated) {
    // DESC: missing/empty sorts last (less current)
    if (!aUpdated) return 1;
    if (!bUpdated) return -1;
    return aUpdated > bUpdated ? -1 : 1;
  }
  const aCreated = a.created_at ?? "";
  const bCreated = b.created_at ?? "";
  if (aCreated !== bCreated) {
    if (!aCreated) return 1;
    if (!bCreated) return -1;
    return aCreated > bCreated ? -1 : 1;
  }
  return 0;
}

/**
 * Resolve whether the student is currently Level-4 from status rows.
 * Fail-closed on missing, null level, orphan level join, or ambiguous top ties
 * (including duplicate L4/L4 rows with identical timestamps).
 */
export function resolveCanonicalCurrentFourthLevelEligibility(
  rows: AcademicStatusTimestampRow[] | null | undefined,
): {
  eligible: boolean;
  levelNumber: number | null;
  ambiguous: boolean;
  current: AcademicStatusTimestampRow | null;
} {
  if (!rows || rows.length === 0) {
    return { eligible: false, levelNumber: null, ambiguous: false, current: null };
  }

  const sorted = [...rows].sort(compareAcademicStatusCurrency);
  const top = sorted[0]!;
  const tied = sorted.filter((row) => compareAcademicStatusCurrency(row, top) === 0);

  if (tied.length !== 1) {
    return { eligible: false, levelNumber: null, ambiguous: true, current: null };
  }

  const levelNumber = top.level?.level_number ?? null;
  if (typeof levelNumber !== "number") {
    return { eligible: false, levelNumber: null, ambiguous: false, current: top };
  }

  return {
    eligible: isCurrentFourthAcademicLevel(levelNumber),
    levelNumber,
    ambiguous: false,
    current: top,
  };
}

export function isGpStudentLevel4EligibleFromStatus(status: {
  level?: AcademicLevelLike;
} | null | undefined): boolean {
  return isCurrentFourthAcademicLevel(status?.level?.level_number ?? null);
}

/** Presentation helper: hide GP nav unless canonical eligibility is true. */
export function shouldShowStudentGpNav(eligible: boolean | null | undefined): boolean {
  return eligible === true;
}
