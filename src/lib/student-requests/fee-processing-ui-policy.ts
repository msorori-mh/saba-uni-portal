/**
 * Fee processing UI + auth dry-run helpers (01A remediation round 2).
 * Pure — no DB access. Mirrors RPC authorization intent for unit tests.
 */

import type { FeePaymentStatus } from "@/lib/student-requests/request-fee-workflow-contract";

export type FeeProcessingActionType = "assess_fee" | "confirm_payment" | string;

export type FeeAuthAction = "assess" | "confirm";

export type FeeAuthDecisionInput = {
  hasSession: boolean;
  /** App roles from user_roles / user_role_assignments. */
  appRoles: string[];
  /** Processing role codes from current_user_processing_assignments(). */
  processingRoleCodes: string[];
  action: FeeAuthAction;
};

export type FeeAuthDecision = {
  /** New TS path: only requireSupabaseAuth — never false-deny on missing app role. */
  tsPrecheckAllows: boolean;
  /** What assert_can_* + RPC role checks would allow. */
  rpcWouldAllow: boolean;
  /** Documents that assertAnyRole must not gate fee RPCs. */
  usesAssertAnyRolePrecheck: false;
  reasonAr: string;
};

const ASSESS_APP_ROLES = new Set(["admin", "system_admin", "student_affairs_manager"]);
const CONFIRM_APP_ROLES = new Set([
  "admin",
  "system_admin",
  "revenue_finance_officer",
  "finance_officer",
]);
const ASSESS_PROCESSING_ROLES = new Set(["student_affairs_manager"]);
const CONFIRM_PROCESSING_ROLES = new Set(["revenue_finance_officer", "finance_officer"]);

/**
 * Mirrors post-remediation fee auth:
 * - TS: session only (requireSupabaseAuth)
 * - RPC: admin/system_admin OR processing assignment OR matching app role
 * - student_affairs specialist cannot assess
 * - student_affairs_manager cannot confirm payment
 * - finance cannot change fee amount (assess path)
 */
export function dryRunFeeAuthorization(input: FeeAuthDecisionInput): FeeAuthDecision {
  if (!input.hasSession) {
    return {
      tsPrecheckAllows: false,
      rpcWouldAllow: false,
      usesAssertAnyRolePrecheck: false,
      reasonAr: "يجب تسجيل الدخول",
    };
  }

  const app = new Set(input.appRoles);
  const proc = new Set(input.processingRoleCodes);

  if (input.action === "assess") {
    const rpcWouldAllow =
      [...app].some((r) => ASSESS_APP_ROLES.has(r)) ||
      [...proc].some((r) => ASSESS_PROCESSING_ROLES.has(r));
    return {
      tsPrecheckAllows: true,
      rpcWouldAllow,
      usesAssertAnyRolePrecheck: false,
      reasonAr: rpcWouldAllow
        ? "مسموح بتقييم الرسوم عبر RPC"
        : "غير مصرح بتقييم الرسوم",
    };
  }

  const rpcWouldAllow =
    [...app].some((r) => CONFIRM_APP_ROLES.has(r)) ||
    [...proc].some((r) => CONFIRM_PROCESSING_ROLES.has(r));
  return {
    tsPrecheckAllows: true,
    rpcWouldAllow,
    usesAssertAnyRolePrecheck: false,
    reasonAr: rpcWouldAllow
      ? "مسموح بتأكيد الدفع عبر RPC"
      : "غير مصرح بتأكيد الدفع",
  };
}

export type FeeAssessmentFormVisibilityInput = {
  actionType: FeeProcessingActionType | null | undefined;
  stepStatus: string | null | undefined;
  canExecuteStep: boolean;
  hasActiveFeeAssessment: boolean;
};

export function shouldShowFeeAssessmentForm(
  input: FeeAssessmentFormVisibilityInput,
): boolean {
  return (
    input.actionType === "assess_fee" &&
    input.stepStatus === "active" &&
    input.canExecuteStep &&
    !input.hasActiveFeeAssessment
  );
}

export type PaymentConfirmationFormVisibilityInput = {
  actionType: FeeProcessingActionType | null | undefined;
  stepStatus: string | null | undefined;
  canExecuteStep: boolean;
  paymentStatus: FeePaymentStatus | null | undefined;
};

export function shouldShowPaymentConfirmationForm(
  input: PaymentConfirmationFormVisibilityInput,
): boolean {
  return (
    input.actionType === "confirm_payment" &&
    input.stepStatus === "active" &&
    input.canExecuteStep &&
    input.paymentStatus === "pending_payment"
  );
}

export function shouldShowFeeStatusDisplay(
  hasFeeAssessment: boolean,
): boolean {
  return hasFeeAssessment;
}

export function feeStatusDisplayModel(input: {
  amount: number;
  paymentStatus: FeePaymentStatus;
  paymentReference?: string | null;
  currency?: string;
}): {
  amountLabelAr: string;
  statusLabelAr: string;
  showFinanceForm: boolean;
  showPaidReference: boolean;
  allowConfirmAgain: boolean;
} {
  const currency = input.currency ?? "YER";
  if (input.amount === 0 || input.paymentStatus === "not_required") {
    return {
      amountLabelAr: "لا رسوم مطلوبة",
      statusLabelAr: "لا رسوم مطلوبة",
      showFinanceForm: false,
      showPaidReference: false,
      allowConfirmAgain: false,
    };
  }

  if (input.paymentStatus === "paid") {
    return {
      amountLabelAr: `${input.amount.toLocaleString("ar-YE")} ${currency}`,
      statusLabelAr: "تم تأكيد السداد",
      showFinanceForm: false,
      showPaidReference: Boolean(input.paymentReference),
      allowConfirmAgain: false,
    };
  }

  if (input.paymentStatus === "pending_payment") {
    return {
      amountLabelAr: `${input.amount.toLocaleString("ar-YE")} ${currency}`,
      statusLabelAr: "بانتظار السداد",
      showFinanceForm: true,
      showPaidReference: false,
      allowConfirmAgain: true,
    };
  }

  return {
    amountLabelAr: `${input.amount.toLocaleString("ar-YE")} ${currency}`,
    statusLabelAr: input.paymentStatus,
    showFinanceForm: false,
    showPaidReference: false,
    allowConfirmAgain: false,
  };
}
