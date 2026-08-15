/**
 * Official university grading scale — SINGLE SOURCE OF TRUTH.
 *
 * APPROVED POLICY (no GPA / 4.0 scale exists anywhere in this system):
 *
 *   RAW < 48                  -> FAIL, Arabic grade "ضعيف", official result = raw
 *   48 <= RAW < 50            -> PASS, official result NORMALIZES TO 50, "مقبول"
 *   50 <= OFFICIAL < 65       -> "مقبول"
 *   65 <= OFFICIAL < 80       -> "جيد"
 *   80 <= OFFICIAL < 90       -> "جيد جدًا"
 *   90 <= OFFICIAL <= 100     -> "ممتاز"
 *
 * No grade points, no alternative scale, no invented averages on a 0..4 range.
 * Aggregate reporting uses credit-weighted OFFICIAL PERCENTAGE only.
 */

import { COURSE_PASS_PERCENT } from "./pass-threshold";

/** Passing results are never reported below this official floor. */
export const OFFICIAL_PASS_FLOOR = 50 as const;

/** Upper (exclusive) bounds of the official Arabic grade bands. */
export const OFFICIAL_GRADE_BANDS = [
  { min: 90, label: "ممتاز" },
  { min: 80, label: "جيد جدًا" },
  { min: 65, label: "جيد" },
  { min: OFFICIAL_PASS_FLOOR, label: "مقبول" },
] as const;

export const FAIL_GRADE_LABEL = "ضعيف" as const;

/** Raw percentage (0..100) -> official reported result (0..100, one decimal). */
export function normalizeOfficialResult(raw: number | null | undefined): number | null {
  if (raw == null || Number.isNaN(Number(raw))) return null;
  const value = Number(raw);
  if (value >= COURSE_PASS_PERCENT && value < OFFICIAL_PASS_FLOOR) return OFFICIAL_PASS_FLOOR;
  return Math.round(value * 10) / 10;
}

/** Arabic grade label for a RAW percentage, applying the normalization rule. */
export function gradeArabicLabel(raw: number | null | undefined): string | null {
  const official = normalizeOfficialResult(raw);
  if (official == null) return null;
  if (Number(raw) < COURSE_PASS_PERCENT) return FAIL_GRADE_LABEL;
  for (const band of OFFICIAL_GRADE_BANDS) {
    if (official >= band.min) return band.label;
  }
  return FAIL_GRADE_LABEL;
}

/** Convenience: official result + Arabic label + pass flag in one call. */
export function officialCourseResult(raw: number | null | undefined): {
  official: number | null;
  label: string | null;
  passed: boolean;
} {
  const official = normalizeOfficialResult(raw);
  const passed = raw != null && Number(raw) >= COURSE_PASS_PERCENT;
  return { official, label: gradeArabicLabel(raw), passed };
}

/**
 * Credit-weighted average of OFFICIAL results (0..100).
 * This is the ONLY approved aggregate academic indicator — it is not a GPA.
 */
export function officialWeightedAverage(
  items: Array<{ raw: number | null | undefined; creditHours: number }>,
): number {
  let points = 0;
  let hours = 0;
  for (const it of items) {
    const official = normalizeOfficialResult(it.raw);
    if (official == null || !(it.creditHours > 0)) continue;
    points += official * it.creditHours;
    hours += it.creditHours;
  }
  return hours > 0 ? Math.round((points / hours) * 10) / 10 : 0;
}

/** Academic-standing thresholds expressed on the official percentage scale. */
export const STANDING_PROBATION_BELOW = COURSE_PASS_PERCENT; // < 48 official average
export const STANDING_WARNING_BELOW = 65; // below "جيد"
