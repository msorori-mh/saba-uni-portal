/**
 * Fee workflow contract (01A) — dry-run validation for assess_fee / confirm_payment paths.
 * No DB writes; mirrors assess_student_request_fee / confirm_student_request_fee_payment rules.
 */

export const FEE_PAYMENT_STATUSES = [
  "not_required",
  "pending_payment",
  "paid",
  "waived",
  "cancelled",
] as const;

export type FeePaymentStatus = (typeof FEE_PAYMENT_STATUSES)[number];

export type FeeAssessmentInput = {
  requestId: string;
  amount: number;
  notes?: string | null;
  currentStepKey: string;
  currentActionType: string;
};

export type FeePaymentConfirmationInput = {
  requestId: string;
  paymentReference: string;
  notes?: string | null;
  currentStepKey: string;
  currentActionType: string;
  existingPaymentStatus?: FeePaymentStatus | null;
};

export type FeeWorkflowDryRunStatus = "VALID" | "INVALID" | "EXECUTION_UNAVAILABLE";

export type FeeWorkflowValidationIssue = {
  severity: "error" | "warning";
  code: string;
  messageAr: string;
};

export type FeeAssessmentDryRunResult = {
  status: FeeWorkflowDryRunStatus;
  valid: boolean;
  paymentStatus: FeePaymentStatus | null;
  actionResult: "fee_not_required" | "payment_required" | null;
  nextStepKey: string | null;
  notifyStudent: boolean;
  issues: FeeWorkflowValidationIssue[];
  summaryAr: string;
  executed: false;
};

export type FeePaymentConfirmationDryRunResult = {
  status: FeeWorkflowDryRunStatus;
  valid: boolean;
  paymentStatus: FeePaymentStatus | null;
  actionResult: "payment_confirmed" | null;
  nextStepKey: string | null;
  notifyStudent: boolean;
  issues: FeeWorkflowValidationIssue[];
  summaryAr: string;
  executed: false;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pushIssue(
  issues: FeeWorkflowValidationIssue[],
  issue: FeeWorkflowValidationIssue,
): void {
  issues.push(issue);
}

export function dryRunAssessStudentRequestFee(
  input: FeeAssessmentInput,
): FeeAssessmentDryRunResult {
  const issues: FeeWorkflowValidationIssue[] = [];

  if (!UUID_RE.test(input.requestId)) {
    pushIssue(issues, {
      severity: "error",
      code: "invalid_request_id",
      messageAr: "معرّف الطلب غير صالح.",
    });
  }

  if (input.amount < 0) {
    pushIssue(issues, {
      severity: "error",
      code: "negative_amount",
      messageAr: "المبلغ يجب أن يكون >= 0.",
    });
  }

  if (input.currentActionType !== "assess_fee") {
    pushIssue(issues, {
      severity: "error",
      code: "wrong_step_action",
      messageAr: "الخطوة الحالية ليست assess_fee.",
    });
  }

  if (input.currentStepKey !== "fee_assessment") {
    pushIssue(issues, {
      severity: "warning",
      code: "unexpected_step_key",
      messageAr: "يُفضّل تنفيذ assess_fee على fee_assessment.",
    });
  }

  const valid = !issues.some((i) => i.severity === "error");
  const amount = input.amount ?? 0;

  if (amount === 0) {
    return {
      status: valid ? "VALID" : "INVALID",
      valid,
      paymentStatus: valid ? "not_required" : null,
      actionResult: valid ? "fee_not_required" : null,
      nextStepKey: valid ? "registrar_signature" : null,
      notifyStudent: false,
      issues,
      summaryAr: valid
        ? "لا رسوم — انتقال مباشر إلى registrar_signature."
        : "تقييم الرسوم غير صالح.",
      executed: false,
    };
  }

  return {
    status: valid ? "VALID" : "INVALID",
    valid,
    paymentStatus: valid ? "pending_payment" : null,
    actionResult: valid ? "payment_required" : null,
    nextStepKey: valid ? "payment_confirmation" : null,
    notifyStudent: valid,
    issues,
    summaryAr: valid
      ? `رسوم ${amount} YER — انتقال إلى payment_confirmation مع إشعار الطالب.`
      : "تقييم الرسوم غير صالح.",
    executed: false,
  };
}

export function dryRunConfirmStudentRequestFeePayment(
  input: FeePaymentConfirmationInput,
): FeePaymentConfirmationDryRunResult {
  const issues: FeeWorkflowValidationIssue[] = [];

  if (!UUID_RE.test(input.requestId)) {
    pushIssue(issues, {
      severity: "error",
      code: "invalid_request_id",
      messageAr: "معرّف الطلب غير صالح.",
    });
  }

  if (!input.paymentReference?.trim()) {
    pushIssue(issues, {
      severity: "error",
      code: "missing_reference",
      messageAr: "مرجع الدفع مطلوب.",
    });
  }

  if (input.currentActionType !== "confirm_payment") {
    pushIssue(issues, {
      severity: "error",
      code: "wrong_step_action",
      messageAr: "الخطوة الحالية ليست confirm_payment.",
    });
  }

  if (input.existingPaymentStatus === "paid") {
    pushIssue(issues, {
      severity: "error",
      code: "duplicate_confirmation",
      messageAr: "تم تأكيد الدفع مسبقاً.",
    });
  }

  if (input.existingPaymentStatus && input.existingPaymentStatus !== "pending_payment") {
    pushIssue(issues, {
      severity: "error",
      code: "not_pending_payment",
      messageAr: "لا يوجد تقييم رسوم بانتظار الدفع.",
    });
  }

  const valid = !issues.some((i) => i.severity === "error");

  return {
    status: valid ? "VALID" : "INVALID",
    valid,
    paymentStatus: valid ? "paid" : null,
    actionResult: valid ? "payment_confirmed" : null,
    nextStepKey: valid ? "registrar_signature" : null,
    notifyStudent: valid,
    issues,
    summaryAr: valid
      ? "تأكيد الدفع — انتقال إلى registrar_signature مع إشعار الطالب."
      : "تأكيد الدفع غير صالح.",
    executed: false,
  };
}
