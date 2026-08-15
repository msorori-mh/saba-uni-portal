/**
 * Canonical academic pass policy — SINGLE SOURCE OF TRUTH.
 *
 * Approved university policy: COURSE_PASS_MARK = 48 / 100.
 *   percentage >= 48.00 → PASSED
 *   percentage <  48.00 → FAILED
 *
 * All application code (web portal, mobile surfaces, progress/graduation
 * engine, reports, October eligibility) MUST use these helpers. Backend SQL
 * duplicates the same numeric value; every duplication site is pinned by
 * tests/academic/pass-threshold-48.test.ts.
 */

export const COURSE_PASS_PERCENT = 48 as const;

/** Same policy expressed as a 0..1 ratio, for total/max_total comparisons. */
export const COURSE_PASS_RATIO = COURSE_PASS_PERCENT / 100;

/** true when a normalized percentage (0..100) meets the approved pass mark. */
export function isCoursePassed(percentage: number | null | undefined): boolean {
  if (percentage == null || Number.isNaN(Number(percentage))) return false;
  return Number(percentage) >= COURSE_PASS_PERCENT;
}

/**
 * Normalizes a raw total against its component maximum, then applies the pass
 * mark. Used when grade-component totals do not sum to exactly 100.
 */
export function isCoursePassedRaw(total: number, maxTotal: number): boolean {
  if (!(maxTotal > 0)) return false;
  return total / maxTotal >= COURSE_PASS_RATIO;
}

/** Normalized percentage (0..100, one decimal) or null when not gradable. */
export function normalizePercentage(total: number, maxTotal: number): number | null {
  if (!(maxTotal > 0)) return null;
  return Math.round((total / maxTotal) * 1000) / 10;
}
