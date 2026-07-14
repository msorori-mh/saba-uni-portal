/**
 * Post–zero-fee execution contract for enrollment-certificate-style steps.
 * Pure policy — mirrors the migration remapping; does not call RPCs or write DB.
 *
 * Superseded gating (issuance/archive-01): schema link + details prepared, but
 * issue/archive stay blocked on HOLD_ENROLLMENT_CERTIFICATE_PDF_GENERATION_CONTRACT_MISSING.
 * Signature remapping remains ready.
 */
import {
  PDF_GENERATION_HOLD_CODE,
  PDF_GENERATION_HOLD_MSG_AR,
} from "@/lib/student-requests/enrollment-certificate-document-issuance-archive-contract";

export const WORKFLOW_ACTOR_ACTIONS = [
  "approve",
  "reject",
  "return",
  "comment",
  "request_attachment",
  "request_payment",
  "sign",
  "archive",
  "issue_document",
  "complete",
  "skip",
] as const;

export type WorkflowActorAction = (typeof WORKFLOW_ACTOR_ACTIONS)[number];

export const ACTION_TO_TRANSITION_RESULT: Record<
  Exclude<WorkflowActorAction, "comment">,
  string
> = {
  approve: "approve",
  reject: "reject",
  return: "return",
  request_attachment: "request_attachment",
  request_payment: "request_payment",
  skip: "skip",
  complete: "complete",
  sign: "signed",
  issue_document: "issued",
  archive: "archived",
};

export const ACTION_TO_EVENT_TYPE: Partial<Record<WorkflowActorAction, string>> = {
  approve: "approved",
  reject: "rejected",
  return: "returned",
  comment: "commented",
  request_attachment: "attachment_requested",
  request_payment: "payment_requested",
  sign: "signed",
  archive: "archived",
  issue_document: "document_issued",
  complete: "completed",
  skip: "approved",
};

/** Required action_type on the config step for specialized mutating actions. */
export const ACTION_REQUIRES_STEP_ACTION_TYPE: Partial<Record<WorkflowActorAction, string>> = {
  sign: "sign",
  issue_document: "issue_document",
  archive: "archive",
};

/** @deprecated Prefer PDF_GENERATION_HOLD_CODE — kept for migration review compatibility. */
export const DOCUMENT_ISSUANCE_CONTRACT_MISSING_CODE = PDF_GENERATION_HOLD_CODE;

export const DOCUMENT_ISSUANCE_CONTRACT_MISSING_MSG_AR = PDF_GENERATION_HOLD_MSG_AR;

export const ARCHIVE_CONTRACT_GATED_CODE = PDF_GENERATION_HOLD_CODE;

export const ARCHIVE_CONTRACT_GATED_MSG_AR = PDF_GENERATION_HOLD_MSG_AR;

export type PostZeroFeeExecutionGate =
  | { allowed: true; actionResult: string; eventType: string }
  | {
      allowed: false;
      reason:
        | "invalid_action"
        | "action_type_mismatch"
        | "approve_on_sign_step"
        | "document_issuance_contract_missing"
        | "archive_contract_gated"
        | "pdf_generation_contract_missing"
        | "transition_missing"
        | "step_not_active";
      messageAr: string;
    };

export function isValidWorkflowActorAction(action: string): action is WorkflowActorAction {
  return (WORKFLOW_ACTOR_ACTIONS as readonly string[]).includes(action);
}

export function mapActorActionToTransitionResult(action: WorkflowActorAction): string | null {
  if (action === "comment") return null;
  return ACTION_TO_TRANSITION_RESULT[action] ?? null;
}

/**
 * Fail-closed gate for actor actions.
 * issue_document / archive require storageSagaReady (Prepare→Finalize path).
 * Generic workflow mutation without saga stays blocked.
 */
export function evaluatePostZeroFeeActorAction(input: {
  action: string;
  stepStatus: string;
  stepActionType: string | null;
  hasMatchingTransition: boolean;
  /** When true, issue_document/archive follow signed→issued→archived mapping. */
  storageSagaReady?: boolean;
}): PostZeroFeeExecutionGate {
  if (!isValidWorkflowActorAction(input.action)) {
    return {
      allowed: false,
      reason: "invalid_action",
      messageAr: "إجراء غير مدعوم في عقد التنفيذ الحالي",
    };
  }

  if (input.action === "comment") {
    return { allowed: true, actionResult: "", eventType: "commented" };
  }

  if (input.stepStatus !== "active") {
    return {
      allowed: false,
      reason: "step_not_active",
      messageAr: "الخطوة ليست نشطة — لا يمكن تنفيذ الإجراء",
    };
  }

  if (input.action === "approve" && input.stepActionType === "sign") {
    return {
      allowed: false,
      reason: "approve_on_sign_step",
      messageAr: "خطوة التوقيع تتطلب إجراء sign وليس approve",
    };
  }

  const requiredType = ACTION_REQUIRES_STEP_ACTION_TYPE[input.action];
  if (requiredType && input.stepActionType !== requiredType) {
    return {
      allowed: false,
      reason: "action_type_mismatch",
      messageAr: `الإجراء ${input.action} غير متوافق مع نوع الخطوة ${input.stepActionType ?? "null"}`,
    };
  }

  if (
    (input.action === "issue_document" || input.action === "archive") &&
    !input.storageSagaReady
  ) {
    return {
      allowed: false,
      reason: "pdf_generation_contract_missing",
      messageAr:
        input.action === "archive"
          ? ARCHIVE_CONTRACT_GATED_MSG_AR
          : DOCUMENT_ISSUANCE_CONTRACT_MISSING_MSG_AR,
    };
  }

  const actionResult = mapActorActionToTransitionResult(input.action);
  if (!actionResult) {
    return {
      allowed: false,
      reason: "invalid_action",
      messageAr: "تعذر حساب نتيجة الانتقال",
    };
  }

  if (!input.hasMatchingTransition) {
    return {
      allowed: false,
      reason: "transition_missing",
      messageAr: `لا يوجد انتقال للنتيجة: ${actionResult}`,
    };
  }

  return {
    allowed: true,
    actionResult,
    eventType: ACTION_TO_EVENT_TYPE[input.action] ?? "commented",
  };
}

/** Enrollment certificate post-fee transition expectations from the canonical registry. */
export const ENROLLMENT_CERTIFICATE_POST_FEE_TRANSITIONS = [
  {
    from: "registrar_signature",
    to: "dean_signature",
    action: "sign" as const,
    actionResult: "signed",
  },
  {
    from: "dean_signature",
    to: "document_issuance",
    action: "sign" as const,
    actionResult: "signed",
  },
  {
    from: "document_issuance",
    to: "archive",
    action: "issue_document" as const,
    actionResult: "issued",
  },
  {
    from: "archive",
    to: null,
    action: "archive" as const,
    actionResult: "archived",
  },
] as const;
