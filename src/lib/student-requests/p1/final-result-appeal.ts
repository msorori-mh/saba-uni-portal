/**
 * P1 — SERVICE 3: تظلم على النتيجة النهائية (final result appeal)
 *
 * Canonical mapping: the existing `grade_appeal` request type IS the official
 * final-result appeal. No second competing official service is created.
 *
 * COURSEWORK APPEAL (P2) is a DIFFERENT domain: student grade page → instructor
 * accept/reject → coursework component correction. It never enters this
 * student-affairs/registrar workflow and is intentionally absent here.
 */

export const FINAL_RESULT_APPEAL_CODE = "grade_appeal" as const;
export const FINAL_RESULT_APPEAL_TITLE_AR = "تظلم على النتيجة النهائية";
export const FINAL_RESULT_APPEAL_WINDOW_DAYS = 7 as const;

export const FINAL_RESULT_APPEAL_DENY_REASONS = {
  RESULT_NOT_PUBLISHED: "FRA_RESULT_NOT_PUBLISHED",
  WINDOW_EXPIRED: "FRA_APPEAL_WINDOW_EXPIRED",
  NOT_OWN_RESULT: "FRA_NOT_OWN_RESULT",
  NO_ENROLLMENT: "FRA_NO_ENROLLMENT_FOR_RESULT",
  DUPLICATE_OPEN_APPEAL: "FRA_DUPLICATE_OPEN_APPEAL",
} as const;

export type FinalResultAppealDenyReason =
  (typeof FINAL_RESULT_APPEAL_DENY_REASONS)[keyof typeof FINAL_RESULT_APPEAL_DENY_REASONS];

export const FINAL_RESULT_APPEAL_MESSAGES_AR: Readonly<
  Record<FinalResultAppealDenyReason, string>
> = {
  [FINAL_RESULT_APPEAL_DENY_REASONS.RESULT_NOT_PUBLISHED]:
    "لا يمكن التظلم قبل إعلان النتيجة النهائية رسمياً.",
  [FINAL_RESULT_APPEAL_DENY_REASONS.WINDOW_EXPIRED]:
    "انتهت مهلة التظلم وهي 7 أيام من تاريخ إعلان النتيجة النهائية.",
  [FINAL_RESULT_APPEAL_DENY_REASONS.NOT_OWN_RESULT]:
    "لا يمكنك التظلم على نتيجة طالب آخر.",
  [FINAL_RESULT_APPEAL_DENY_REASONS.NO_ENROLLMENT]:
    "لا يوجد تسجيل معتمد لك في هذا المقرر.",
  [FINAL_RESULT_APPEAL_DENY_REASONS.DUPLICATE_OPEN_APPEAL]:
    "لديك تظلم قائم على نفس النتيجة قيد المعالجة.",
};

export const FINAL_RESULT_APPEAL_OPEN_STATUSES: readonly string[] = [
  "draft",
  "submitted",
  "in_review",
  "in_progress",
  "returned",
];

export type PublishedFinalResult = {
  resultId: string;
  studentId: string;
  courseId: string;
  courseNameAr: string;
  finalGradeDisplay: string;
  /** Authoritative FINAL RESULT publication timestamp (ISO). null = unpublished. */
  finalResultPublishedAt: string | null;
  hasEnrollment: boolean;
};

export function getAppealWindowEnd(publishedAtIso: string): Date {
  const end = new Date(publishedAtIso);
  end.setUTCDate(end.getUTCDate() + FINAL_RESULT_APPEAL_WINDOW_DAYS);
  return end;
}

export type FinalResultAppealEligibility = {
  eligible: boolean;
  denyReason: FinalResultAppealDenyReason | null;
  messageAr: string | null;
  windowEndIso: string | null;
};

/**
 * Boundary contract: the window is CLOSED-INCLUSIVE up to and including
 * publishedAt + 7 days. `now > publishedAt + 7d` → DENY.
 */
export function evaluateFinalResultAppealEligibility(input: {
  result: PublishedFinalResult;
  requestingStudentId: string;
  now: Date;
  existingAppealStatusesForResult: readonly string[];
}): FinalResultAppealEligibility {
  const { result } = input;

  if (result.studentId !== input.requestingStudentId) {
    return deny(FINAL_RESULT_APPEAL_DENY_REASONS.NOT_OWN_RESULT, null);
  }
  if (!result.finalResultPublishedAt) {
    return deny(FINAL_RESULT_APPEAL_DENY_REASONS.RESULT_NOT_PUBLISHED, null);
  }
  const windowEnd = getAppealWindowEnd(result.finalResultPublishedAt);
  const windowEndIso = windowEnd.toISOString();

  if (!result.hasEnrollment) {
    return deny(FINAL_RESULT_APPEAL_DENY_REASONS.NO_ENROLLMENT, windowEndIso);
  }
  if (input.now.getTime() > windowEnd.getTime()) {
    return deny(FINAL_RESULT_APPEAL_DENY_REASONS.WINDOW_EXPIRED, windowEndIso);
  }
  const hasOpen = input.existingAppealStatusesForResult.some((s) =>
    FINAL_RESULT_APPEAL_OPEN_STATUSES.includes((s ?? "").trim()),
  );
  if (hasOpen) {
    return deny(FINAL_RESULT_APPEAL_DENY_REASONS.DUPLICATE_OPEN_APPEAL, windowEndIso);
  }
  return { eligible: true, denyReason: null, messageAr: null, windowEndIso };
}

function deny(
  reason: FinalResultAppealDenyReason,
  windowEndIso: string | null,
): FinalResultAppealEligibility {
  return {
    eligible: false,
    denyReason: reason,
    messageAr: FINAL_RESULT_APPEAL_MESSAGES_AR[reason],
    windowEndIso,
  };
}

/**
 * Decision on the historical grade-appeal approval trigger
 * (`apply_grade_appeal_on_approval`), which proportionally redistributed grade
 * components from an approved total.
 *
 * DECISION = REPLACE.
 * Rationale: an official FINAL RESULT change must be an explicit, auditable
 * registrar-applied value traceable to the approved appeal decision. Silent
 * proportional redistribution of coursework components is not a defensible
 * representation of a final-result decision and overlaps the P2 coursework
 * domain. The forward-only migration draft replaces it with an explicit
 * before/after audited result change applied at the registrar step.
 */
export const OLD_GRADE_APPEAL_TRIGGER_DECISION = "REPLACE" as const;

export const FINAL_RESULT_APPEAL_DETAIL_CONTRACT = {
  table: "grade_appeal_details",
  clientWriteAllowed: false,
  columns: [
    "request_id",
    "course_id",
    "result_id",
    "final_result_published_at",
    "appeal_window_end",
    "appeal_reason",
    "previous_final_result",
    "approved_final_result",
    "result_change_applied_at",
    "result_change_applied_by",
  ],
} as const;

/** P2 boundary marker — coursework appeals must never route through P1. */
export const COURSEWORK_APPEAL_DOMAIN = {
  phase: "P2",
  code: "coursework_grade_appeal",
  usesStudentAffairsWorkflow: false,
  usesRegistrarWorkflow: false,
  implementedInP1: false,
} as const;
