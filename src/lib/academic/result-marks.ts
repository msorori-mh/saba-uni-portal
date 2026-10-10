// Official result marks recorded by the university's main system instead of a
// numeric grade (CYB-HISTORY-RESULT-MARKS-01). They are stored verbatim on the
// enrollment (`student_enrollments.result_mark`) and shown verbatim in the
// academic record.
//
//   fail      — counts as a failed attempt (score 0 is also recorded)
//   excluded  — the attempt is not counted: no grade, no average, no hours

export const RESULT_MARKS = {
  "غ ض": { effect: "fail", description: "غائب" },
  "م ح ض": { effect: "fail", description: "محروم" },
  "غ ب ض": { effect: "excluded", description: "غائب بعذر" },
  "ق ض": { effect: "excluded", description: "رمز من النظام الرسمي" },
} as const;

export type ResultMark = keyof typeof RESULT_MARKS;

export const RESULT_MARK_VALUES = Object.keys(RESULT_MARKS) as ResultMark[];

/** Normalizes spacing; returns null for empty input and "invalid" for unknown marks. */
export function parseResultMark(raw: unknown): ResultMark | null | "invalid" {
  if (raw == null) return null;
  const value = String(raw).replace(/\s+/g, " ").trim();
  if (!value) return null;
  return (RESULT_MARK_VALUES as string[]).includes(value) ? (value as ResultMark) : "invalid";
}

export function isExcludedResultMark(mark: string | null | undefined): boolean {
  return mark != null && (RESULT_MARKS as Record<string, { effect: string }>)[mark]?.effect === "excluded";
}

export function isResultMark(mark: string | null | undefined): mark is ResultMark {
  return mark != null && (RESULT_MARK_VALUES as string[]).includes(mark);
}
