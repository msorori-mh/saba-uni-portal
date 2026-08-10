// Canonical academic council topic lifecycle helpers (pure logic).
// Keep this module free of Supabase/client imports so it can be unit-tested.

export const TOPIC_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "needs_completion",
  "accepted_for_agenda",
  "rejected",
] as const;

export type CouncilTopicStatus = (typeof TOPIC_STATUSES)[number];

export const REVIEW_PREPARE_STATUSES = ["under_review", "needs_completion"] as const;
export const REVIEW_FINAL_STATUSES = ["accepted_for_agenda", "rejected"] as const;

/** Mission-tightened transitions (no submitted→needs_completion / submitted→rejected). */
export const CANONICAL_TOPIC_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["submitted"],
  submitted: ["under_review"],
  under_review: ["needs_completion", "accepted_for_agenda", "rejected"],
  needs_completion: ["submitted"],
};

export function isAllowedTopicTransition(from: string, to: string): boolean {
  return CANONICAL_TOPIC_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isPrepareReviewStatus(status: string): boolean {
  return (REVIEW_PREPARE_STATUSES as readonly string[]).includes(status);
}

export function isFinalReviewStatus(status: string): boolean {
  return (REVIEW_FINAL_STATUSES as readonly string[]).includes(status);
}

export type IntakeCheckInput = {
  meetingStatus: string;
  intakeOpensAt: string | null;
  intakeClosesAt: string | null;
  nowIso: string;
  memberRole: string | null;
  isActiveMember: boolean;
};

export const INTAKE_ERRORS = {
  NOT_ACTIVE_MEMBER: "لا يمكن تقديم موضوع لاجتماع مجلس لست عضواً فعّالاً فيه بدور يسمح بالتقديم.",
  VIEWER_DENIED: "دور المطّلع لا يسمح بتقديم موضوعات للمجلس.",
  NOT_INTAKE_OPEN: "استقبال الموضوعات مغلق لهذا الاجتماع حالياً.",
  WINDOW_NOT_OPENED: "لم تبدأ نافذة استقبال الموضوعات لهذا الاجتماع بعد.",
  WINDOW_CLOSED: "انتهت نافذة استقبال الموضوعات لهذا الاجتماع.",
} as const;

export function getIntakeValidationError(input: IntakeCheckInput): string | null {
  if (!input.isActiveMember) {
    return INTAKE_ERRORS.NOT_ACTIVE_MEMBER;
  }
  if (!input.memberRole || input.memberRole === "viewer") {
    return INTAKE_ERRORS.VIEWER_DENIED;
  }
  if (input.meetingStatus !== "intake_open") {
    return INTAKE_ERRORS.NOT_INTAKE_OPEN;
  }
  if (input.intakeOpensAt && input.intakeOpensAt > input.nowIso) {
    return INTAKE_ERRORS.WINDOW_NOT_OPENED;
  }
  if (input.intakeClosesAt && input.intakeClosesAt < input.nowIso) {
    return INTAKE_ERRORS.WINDOW_CLOSED;
  }
  return null;
}

export type ReviewAuthorityInput = {
  role: string | null;
  isActiveMember: boolean;
  targetStatus: string;
};

export const REVIEW_ERRORS = {
  NOT_ACTIVE_MEMBER: "لا تملك صلاحية مراجعة هذا الموضوع.",
  PREPARE_DENIED: "لا تملك صلاحية تحضير هذا الموضوع للمراجعة.",
  FINAL_DENIED: "قرار القبول النهائي أو الرفض يعود لرئيس المجلس فقط.",
} as const;

export const TOPIC_STATUS_SKIP_MESSAGE =
  "انتقال الحالة غير مسموح به في دورة حياة الموضوع.";

export function getReviewAuthorityError(input: ReviewAuthorityInput): string | null {
  if (!input.isActiveMember || !input.role) {
    return REVIEW_ERRORS.NOT_ACTIVE_MEMBER;
  }
  if (isPrepareReviewStatus(input.targetStatus)) {
    if (input.role !== "chair" && input.role !== "secretary") {
      return REVIEW_ERRORS.PREPARE_DENIED;
    }
    return null;
  }
  if (isFinalReviewStatus(input.targetStatus)) {
    if (input.role !== "chair") {
      return REVIEW_ERRORS.FINAL_DENIED;
    }
    return null;
  }
  return REVIEW_ERRORS.NOT_ACTIVE_MEMBER;
}
