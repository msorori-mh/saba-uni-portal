/**
 * P1 — SERVICE 1: استمارة دخول دور أكتوبر (october_exam_entry_form)
 *
 * Approved eligibility contract:
 *   LEVEL == 4  AND  1 <= REMAINING_REQUIRED_COURSES <= 4  → ELIGIBLE
 *   otherwise → DENY
 *
 * REMAINING_REQUIRED_COURSES is derived ONLY from the authoritative academic
 * model (study plan ∖ approved passed results), never from what the student
 * selects in the form. The server recomputes at submission time; any client
 * supplied list that is not a subset of the authoritative remaining set is
 * rejected (OCT-06).
 */

export const OCTOBER_EXAM_ENTRY_CODE = "october_exam_entry_form" as const;
export const OCTOBER_REQUIRED_LEVEL = 4 as const;
export const OCTOBER_MAX_REMAINING_COURSES = 4 as const;

export const OCTOBER_DENY_REASONS = {
  NOT_LEVEL_4: "OCTOBER_NOT_LEVEL_4",
  TOO_MANY_REMAINING: "OCTOBER_REMAINING_COURSES_EXCEEDS_LIMIT",
  NOTHING_REMAINING: "OCTOBER_NO_REMAINING_REQUIRED_COURSES",
  SELECTION_NOT_AUTHORITATIVE: "OCTOBER_SELECTION_NOT_AUTHORITATIVE",
} as const;

export type OctoberDenyReason =
  (typeof OCTOBER_DENY_REASONS)[keyof typeof OCTOBER_DENY_REASONS];

export const OCTOBER_DENY_MESSAGES_AR: Readonly<Record<OctoberDenyReason, string>> = {
  [OCTOBER_DENY_REASONS.NOT_LEVEL_4]:
    "خدمة دور أكتوبر متاحة لطلاب المستوى الرابع فقط.",
  [OCTOBER_DENY_REASONS.TOO_MANY_REMAINING]:
    "لا يمكنك التقديم لدور أكتوبر لأن عدد المقررات المتبقية لديك يتجاوز الحد المسموح وهو 4 مقررات.",
  [OCTOBER_DENY_REASONS.NOTHING_REMAINING]:
    "لا توجد لديك مقررات متبقية مطلوبة لاستكمال الخطة الدراسية.",
  [OCTOBER_DENY_REASONS.SELECTION_NOT_AUTHORITATIVE]:
    "المقررات المختارة لا تطابق المقررات المتبقية المعتمدة في سجلك الأكاديمي.",
};

/** One authoritative study-plan requirement row (server-resolved). */
export type StudyPlanRequirement = {
  /** study_plan_courses.id — stable requirement identity. */
  requirementId: string;
  courseId: string;
  courseCodeAr: string;
  courseNameAr: string;
  isRequired: boolean;
};

/** One approved academic result row (approved/published only). */
export type ApprovedCourseResult = {
  courseId: string;
  /** true only when the attempt is an approved pass. */
  passed: boolean;
};

export type OctoberAcademicSnapshot = {
  /** Canonical numeric academic level order (never Arabic display text). */
  academicLevelOrder: number | null;
  studyPlanRequirements: readonly StudyPlanRequirement[];
  approvedResults: readonly ApprovedCourseResult[];
};

export type OctoberRemainingComputation = {
  remaining: readonly StudyPlanRequirement[];
  remainingCount: number;
  passedCourseIds: readonly string[];
};

/**
 * Authoritative remaining-course algorithm.
 *  - source: study plan required courses
 *  - minus: any course with at least one APPROVED PASSED result
 *  - de-duplicated by courseId so repeated attempts never count twice
 */
export function computeRemainingRequiredCourses(
  snapshot: OctoberAcademicSnapshot,
): OctoberRemainingComputation {
  const passed = new Set(
    snapshot.approvedResults.filter((r) => r.passed).map((r) => r.courseId),
  );
  const seen = new Set<string>();
  const remaining: StudyPlanRequirement[] = [];
  for (const req of snapshot.studyPlanRequirements) {
    if (!req.isRequired) continue;
    if (passed.has(req.courseId)) continue;
    if (seen.has(req.courseId)) continue;
    seen.add(req.courseId);
    remaining.push(req);
  }
  return {
    remaining,
    remainingCount: remaining.length,
    passedCourseIds: [...passed],
  };
}

export type OctoberEligibility = {
  eligible: boolean;
  denyReason: OctoberDenyReason | null;
  messageAr: string | null;
  remainingCount: number;
  remainingCourses: readonly StudyPlanRequirement[];
};

export function evaluateOctoberExamEligibility(
  snapshot: OctoberAcademicSnapshot,
): OctoberEligibility {
  const { remaining, remainingCount } = computeRemainingRequiredCourses(snapshot);
  const base = { remainingCount, remainingCourses: remaining };

  if (snapshot.academicLevelOrder !== OCTOBER_REQUIRED_LEVEL) {
    return deny(OCTOBER_DENY_REASONS.NOT_LEVEL_4, base);
  }
  if (remainingCount < 1) {
    return deny(OCTOBER_DENY_REASONS.NOTHING_REMAINING, base);
  }
  if (remainingCount > OCTOBER_MAX_REMAINING_COURSES) {
    return deny(OCTOBER_DENY_REASONS.TOO_MANY_REMAINING, base);
  }
  return { eligible: true, denyReason: null, messageAr: null, ...base };
}

function deny(
  reason: OctoberDenyReason,
  base: { remainingCount: number; remainingCourses: readonly StudyPlanRequirement[] },
): OctoberEligibility {
  return {
    eligible: false,
    denyReason: reason,
    messageAr: OCTOBER_DENY_MESSAGES_AR[reason],
    ...base,
  };
}

/**
 * OCT-06 — server-side submission guard.
 * The submitted selection must be a NON-EMPTY SUBSET of the authoritative
 * remaining set. Manipulated / stale / foreign requirement ids are denied.
 */
export function validateOctoberSubmission(input: {
  snapshot: OctoberAcademicSnapshot;
  selectedRequirementIds: readonly string[];
}): { ok: true } | { ok: false; error: OctoberDenyReason; messageAr: string } {
  const eligibility = evaluateOctoberExamEligibility(input.snapshot);
  if (!eligibility.eligible) {
    return {
      ok: false,
      error: eligibility.denyReason as OctoberDenyReason,
      messageAr: eligibility.messageAr as string,
    };
  }
  const authoritative = new Set(eligibility.remainingCourses.map((c) => c.requirementId));
  const selected = [...new Set(input.selectedRequirementIds)];
  const invalid =
    selected.length === 0
    || selected.length > OCTOBER_MAX_REMAINING_COURSES
    || selected.some((id) => !authoritative.has(id));
  if (invalid) {
    return {
      ok: false,
      error: OCTOBER_DENY_REASONS.SELECTION_NOT_AUTHORITATIVE,
      messageAr: OCTOBER_DENY_MESSAGES_AR[OCTOBER_DENY_REASONS.SELECTION_NOT_AUTHORITATIVE],
    };
  }
  return { ok: true };
}

/**
 * Canonical detail model (october_exam_entry_details) — server-written only.
 */
export const OCTOBER_EXAM_DETAIL_CONTRACT = {
  table: "october_exam_entry_details",
  clientWriteAllowed: false,
  columns: [
    "request_id",
    "academic_year_id",
    "semester_id",
    "academic_level_order",
    "remaining_courses_count",
    "eligible_requirement_ids",
    "selected_requirement_ids",
    "eligibility_snapshot",
    "approved_list_generated_at",
  ],
} as const;
