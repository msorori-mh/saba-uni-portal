/**
 * غياب بعذر — قرار الرسوم لدى مسجل الكلية، والإرجاع/الرفض، وشرط القسم.
 *
 * Source contract mirrored by docs/migration-drafts/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.sql.
 *
 * - The registrar records exactly one of two engine outcomes per request:
 *   FEE_REQUIRED (the student pays in the university's main system, then the
 *   revenue officer confirms) or FEE_NOT_REQUIRED (free service / exemption,
 *   mandatory reason) which bypasses `payment_confirmation`.
 * - The portal processes NO payment and stores NO amount or currency.
 * - Reject / return exist for THIS service only, on the steps listed below,
 *   with the same authorization as acting on the step and a mandatory reason.
 */

import {
  B1_WORKFLOWS,
  canActOnB1RuntimeStep,
  type B1RuntimeAuthorizationContext,
  type B1WorkflowStep,
} from "./request-service-adapter";
import { normalizeStudentRequestTypeCode } from "./request-type-registry";

// ---------------------------------------------------------------------------
// Fee decision
// ---------------------------------------------------------------------------

export const EXCUSED_ABSENCE_FEE_DECISION_STEP_KEY = "registrar_fee_referral" as const;
export const EXCUSED_ABSENCE_PAYMENT_STEP_KEY = "payment_confirmation" as const;
export const EXCUSED_ABSENCE_STEP_AFTER_PAYMENT_KEY = "department_head_signature" as const;

export const EXCUSED_ABSENCE_FEE_DECISIONS = ["FEE_REQUIRED", "FEE_NOT_REQUIRED"] as const;
export type ExcusedAbsenceFeeDecision = (typeof EXCUSED_ABSENCE_FEE_DECISIONS)[number];

export const EXCUSED_ABSENCE_FEE_EXEMPTION_REASONS = ["FREE_SERVICE", "EXEMPTION"] as const;
export type ExcusedAbsenceFeeExemptionReason = (typeof EXCUSED_ABSENCE_FEE_EXEMPTION_REASONS)[number];

export const EXCUSED_ABSENCE_FEE_DECISION_LABELS_AR: Readonly<Record<ExcusedAbsenceFeeDecision, string>> = {
  FEE_REQUIRED: "رسوم مستحقة — يسدد الطالب في النظام الجامعي الرئيسي",
  FEE_NOT_REQUIRED: "لا رسوم مستحقة",
};

export const EXCUSED_ABSENCE_FEE_EXEMPTION_REASON_LABELS_AR: Readonly<
  Record<ExcusedAbsenceFeeExemptionReason, string>
> = {
  FREE_SERVICE: "خدمة مجانية",
  EXEMPTION: "إعفاء",
};

export const EXCUSED_ABSENCE_FEE_DECISION_NOTE_MAX = 500;

/** Transition-condition catalog code that bypasses the payment step. */
export const EXCUSED_ABSENCE_FEE_NOT_REQUIRED_CONDITION = "EXCUSED_ABSENCE_FEE_NOT_REQUIRED" as const;

export type ExcusedAbsenceFeeDecisionInput = {
  stepId: string;
  decision: string;
  exemptionReason?: string | null;
  note?: string | null;
};

export type ExcusedAbsenceFeeDecisionInputError =
  | "step_id_required"
  | "decision_invalid"
  | "exemption_reason_required"
  | "exemption_reason_forbidden"
  | "note_too_long";

export type NormalizedExcusedAbsenceFeeDecisionInput = {
  stepId: string;
  decision: ExcusedAbsenceFeeDecision;
  exemptionReason: ExcusedAbsenceFeeExemptionReason | null;
  note: string | null;
};

export function isExcusedAbsenceFeeDecision(value: unknown): value is ExcusedAbsenceFeeDecision {
  return (
    typeof value === "string" && (EXCUSED_ABSENCE_FEE_DECISIONS as readonly string[]).includes(value)
  );
}

export function isExcusedAbsenceFeeExemptionReason(
  value: unknown,
): value is ExcusedAbsenceFeeExemptionReason {
  return (
    typeof value === "string" &&
    (EXCUSED_ABSENCE_FEE_EXEMPTION_REASONS as readonly string[]).includes(value)
  );
}

/** Fail closed: anything that is not exactly one of the two outcomes is invalid. */
export function validateExcusedAbsenceFeeDecisionInput(
  input: ExcusedAbsenceFeeDecisionInput,
):
  | { valid: true; normalized: NormalizedExcusedAbsenceFeeDecisionInput }
  | { valid: false; error: ExcusedAbsenceFeeDecisionInputError } {
  const stepId = (input.stepId ?? "").trim();
  if (!stepId) return { valid: false, error: "step_id_required" };
  if (!isExcusedAbsenceFeeDecision(input.decision)) return { valid: false, error: "decision_invalid" };

  const rawReason = input.exemptionReason ?? null;
  const note = input.note?.trim() || null;
  if (note && note.length > EXCUSED_ABSENCE_FEE_DECISION_NOTE_MAX) {
    return { valid: false, error: "note_too_long" };
  }

  if (input.decision === "FEE_REQUIRED") {
    if (rawReason !== null && rawReason !== "") return { valid: false, error: "exemption_reason_forbidden" };
    return { valid: true, normalized: { stepId, decision: "FEE_REQUIRED", exemptionReason: null, note } };
  }
  if (!isExcusedAbsenceFeeExemptionReason(rawReason)) {
    return { valid: false, error: "exemption_reason_required" };
  }
  return {
    valid: true,
    normalized: { stepId, decision: "FEE_NOT_REQUIRED", exemptionReason: rawReason, note },
  };
}

export const EXCUSED_ABSENCE_FEE_DECISION_INPUT_MESSAGES_AR: Readonly<
  Record<ExcusedAbsenceFeeDecisionInputError, string>
> = {
  step_id_required: "تعذر تحديد خطوة قرار الرسوم.",
  decision_invalid: "اختر قرار الرسوم: رسوم مستحقة أو لا رسوم مستحقة.",
  exemption_reason_required: "اختر سبب عدم استحقاق الرسوم: خدمة مجانية أو إعفاء.",
  exemption_reason_forbidden: "لا يُحدَّد سبب الإعفاء عندما تكون الرسوم مستحقة.",
  note_too_long: "الملاحظة أطول من الحد المسموح.",
};

/** The step that becomes active once the registrar's decision is recorded. */
export function resolveStepAfterExcusedAbsenceFeeDecision(
  decision: ExcusedAbsenceFeeDecision,
): typeof EXCUSED_ABSENCE_PAYMENT_STEP_KEY | typeof EXCUSED_ABSENCE_STEP_AFTER_PAYMENT_KEY {
  return decision === "FEE_NOT_REQUIRED"
    ? EXCUSED_ABSENCE_STEP_AFTER_PAYMENT_KEY
    : EXCUSED_ABSENCE_PAYMENT_STEP_KEY;
}

/**
 * The steps a request actually goes through for a given decision. Without a
 * decision the full cycle applies (payment is never assumed away).
 */
export function excusedAbsenceStepsForFeeDecision(
  decision: ExcusedAbsenceFeeDecision | null | undefined,
): readonly B1WorkflowStep[] {
  const steps = B1_WORKFLOWS.excused_absence;
  return decision === "FEE_NOT_REQUIRED"
    ? steps.filter((step) => step.key !== EXCUSED_ABSENCE_PAYMENT_STEP_KEY)
    : steps;
}

/** Finance may confirm only a payment the registrar actually required. */
export function canConfirmExcusedAbsencePayment(
  decision: ExcusedAbsenceFeeDecision | null | undefined,
): boolean {
  return decision === "FEE_REQUIRED";
}

/**
 * Who may record the fee decision: exactly the direct assignee of the active
 * registrar step, with the step's own unit and role. Identical to acting on it.
 */
export function canRecordExcusedAbsenceFeeDecision(
  context: Omit<B1RuntimeAuthorizationContext, "step" | "attemptedAction"> & { stepKey: string },
): boolean {
  if (context.stepKey !== EXCUSED_ABSENCE_FEE_DECISION_STEP_KEY) return false;
  const step = B1_WORKFLOWS.excused_absence.find(
    (candidate) => candidate.key === EXCUSED_ABSENCE_FEE_DECISION_STEP_KEY,
  );
  if (!step) return false;
  return canActOnB1RuntimeStep({ ...context, step, attemptedAction: step.action });
}

export type ExcusedAbsenceFeeDecisionRecord = {
  requestId: string;
  decision: ExcusedAbsenceFeeDecision;
  exemptionReason: ExcusedAbsenceFeeExemptionReason | null;
  decidedAt: string | null;
};

/** Parses the read RPC payload; anything inconsistent yields null (fail closed). */
export function parseExcusedAbsenceFeeDecisionRecord(
  raw: unknown,
): ExcusedAbsenceFeeDecisionRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const decision: unknown = row.decision;
  if (!isExcusedAbsenceFeeDecision(decision)) return null;
  const reason: unknown = row.exemptionReason ?? null;
  let exemptionReason: ExcusedAbsenceFeeExemptionReason | null = null;
  if (decision === "FEE_REQUIRED") {
    if (reason !== null) return null;
  } else {
    if (!isExcusedAbsenceFeeExemptionReason(reason)) return null;
    exemptionReason = reason;
  }
  return {
    requestId: typeof row.requestId === "string" ? row.requestId : "",
    decision,
    exemptionReason,
    decidedAt: typeof row.decidedAt === "string" ? row.decidedAt : null,
  };
}

/** What the student reads in the request detail view. */
export function excusedAbsenceFeeDecisionStudentMessageAr(
  record: Pick<ExcusedAbsenceFeeDecisionRecord, "decision" | "exemptionReason">,
): string {
  if (record.decision === "FEE_REQUIRED") {
    return "قرّر مسجل الكلية أن طلبك يستلزم سداد رسوم الخدمة. سدّد الرسوم في النظام الجامعي الرئيسي، وبعد أن يؤكد موظف الإيرادات الاستلام يُستكمل الطلب. لا يتم أي سداد داخل هذه البوابة.";
  }
  const reasonAr = record.exemptionReason
    ? EXCUSED_ABSENCE_FEE_EXEMPTION_REASON_LABELS_AR[record.exemptionReason]
    : "";
  return `قرّر مسجل الكلية أن طلبك لا يستلزم سداد رسوم${reasonAr ? ` (${reasonAr})` : ""}، ولا توجد خطوة سداد لهذا الطلب.`;
}

// ---------------------------------------------------------------------------
// Reject / return (this service only)
// ---------------------------------------------------------------------------

export type B1StepExitAction = "reject" | "return";

/**
 * Which steps may close the request. Payment confirmation, recording the
 * excuse and archiving can do neither; signatures can reject but not return.
 */
export const EXCUSED_ABSENCE_STEP_EXIT_ACTIONS: Readonly<Record<string, readonly B1StepExitAction[]>> = {
  dean_review: ["return", "reject"],
  registrar_fee_referral: ["return", "reject"],
  payment_confirmation: [],
  department_head_signature: ["reject"],
  dean_signature: ["reject"],
  student_affairs_manager_signature: ["reject"],
  record_apply: [],
  archive: [],
};

export const B1_STEP_EXIT_REASON_MIN_LENGTH = 5;
export const B1_STEP_EXIT_REASON_MAX_LENGTH = 2000;

/** Exit actions offered for a step. Empty for every other service (unchanged behaviour). */
export function getB1StepExitActions(
  requestTypeCode: string | null | undefined,
  stepKey: string | null | undefined,
): readonly B1StepExitAction[] {
  if (normalizeStudentRequestTypeCode(requestTypeCode) !== "excused_absence") return [];
  return EXCUSED_ABSENCE_STEP_EXIT_ACTIONS[(stepKey ?? "").trim()] ?? [];
}

export function isValidB1StepExitReason(reason: string | null | undefined): boolean {
  const trimmed = (reason ?? "").trim();
  return (
    trimmed.length >= B1_STEP_EXIT_REASON_MIN_LENGTH && trimmed.length <= B1_STEP_EXIT_REASON_MAX_LENGTH
  );
}

/**
 * Authorization for reject / return is IDENTICAL to acting on the step: the
 * exact direct assignee of the active step with its unit and role — plus the
 * step must allow that exit and the reason must be real.
 */
export function canExitExcusedAbsenceStep(
  context: Omit<B1RuntimeAuthorizationContext, "attemptedAction"> & {
    exitAction: string;
    reason: string | null | undefined;
  },
): boolean {
  const allowed = EXCUSED_ABSENCE_STEP_EXIT_ACTIONS[context.step.key] ?? [];
  if (!(allowed as readonly string[]).includes(context.exitAction)) return false;
  if (!isValidB1StepExitReason(context.reason)) return false;
  if (!B1_WORKFLOWS.excused_absence.some((step) => step === context.step)) return false;
  return canActOnB1RuntimeStep({ ...context, attemptedAction: context.step.action });
}

/** Existing status vocabulary — nothing new is introduced. */
export function resolveRequestStatusAfterB1StepExit(
  action: B1StepExitAction,
): "rejected" | "returned_for_completion" {
  return action === "reject" ? "rejected" : "returned_for_completion";
}

/** A returned request restarts here, on the same workflow version. */
export const EXCUSED_ABSENCE_RESUBMIT_RESTART_STEP_KEY = "dean_review" as const;

/** A rejected request is terminal: no step can act and it cannot be resubmitted. */
export function canResubmitExcusedAbsenceRequest(status: string): boolean {
  return status === "returned" || status === "returned_for_completion";
}

// ---------------------------------------------------------------------------
// Department prerequisite
// ---------------------------------------------------------------------------

export const EXCUSED_ABSENCE_DEPARTMENT_REQUIRED_CODE =
  "B1_EXCUSED_ABSENCE_STUDENT_DEPARTMENT_REQUIRED" as const;
export const EXCUSED_ABSENCE_DEPARTMENT_REQUIRED_MESSAGE_AR =
  "لا يمكن تقديم طلب غياب بعذر قبل تسجيل قسمك العلمي في ملفك الطلابي. راجع شؤون الطلاب لاستكمال بيانات القسم ثم أعد المحاولة.";

export const EXCUSED_ABSENCE_DEPARTMENT_HEAD_REQUIRED_CODE =
  "B1_EXCUSED_ABSENCE_DEPARTMENT_HEAD_ASSIGNMENT_REQUIRED" as const;
/** Staff-facing: the student's department has no single effective head assignment. */
export const EXCUSED_ABSENCE_DEPARTMENT_HEAD_REQUIRED_MESSAGE_AR =
  "تعذر قبول الطلب لأن قسم الطالب لا يملك رئيس قسم واحداً فعّالاً معيّناً على معالجة الطلبات. يُعالج ذلك من إدارة الكلية ثم يُعاد التقديم.";

/**
 * Pre-submission check. A student without a department cannot apply: the
 * absence form is signed by the head of the student's own department.
 */
export function evaluateExcusedAbsenceDepartmentEligibility(input: {
  departmentId?: string | null;
  departmentLabelAr?: string | null;
}):
  | { eligible: true }
  | { eligible: false; code: typeof EXCUSED_ABSENCE_DEPARTMENT_REQUIRED_CODE; messageAr: string } {
  const hasDepartment =
    Boolean((input.departmentId ?? "").trim()) || Boolean((input.departmentLabelAr ?? "").trim());
  if (hasDepartment) return { eligible: true };
  return {
    eligible: false,
    code: EXCUSED_ABSENCE_DEPARTMENT_REQUIRED_CODE,
    messageAr: EXCUSED_ABSENCE_DEPARTMENT_REQUIRED_MESSAGE_AR,
  };
}
