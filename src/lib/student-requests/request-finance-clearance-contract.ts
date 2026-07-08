/**
 * Finance clearance contract foundation (P12 — aligned model).
 * Student affairs sets amount manually; revenue confirms receipt only.
 * Pure normalization/validation — no DB writes, no payment execution, no file upload.
 */

import {
  getStudentRequestTypeDefinition,
  normalizeStudentRequestTypeCode,
} from "@/lib/student-requests/request-type-registry";
import {
  getCanonicalWorkflowPreview,
  type CanonicalWorkflowStepDef,
} from "@/lib/student-requests/request-workflow-preview-registry";
import {
  buildDefaultClearanceGroup,
  normalizeParallelClearanceGroup,
  type StudentRequestClearanceActorContext,
  type StudentRequestParallelClearanceGroup,
  type StudentRequestParallelClearanceMember,
  validateParallelClearanceGroup,
} from "@/lib/student-requests/parallel-clearance-contract";

export type { StudentRequestParallelClearanceGroup as ParallelClearanceGroup };
export type { StudentRequestParallelClearanceMember as ParallelClearanceMember };

export const FINANCE_CLEARANCE_STATUSES = [
  "amount_pending",
  "amount_set",
  "awaiting_off_portal_payment",
  "receipt_pending",
  "receipt_confirmed",
  "not_required",
  "unavailable",
] as const;

export type FinanceClearanceStatus = (typeof FINANCE_CLEARANCE_STATUSES)[number];

export type FinanceClearanceCapabilityReason = "finance_clearance_runtime_unavailable";

export type FinanceClearanceCapability = {
  canValidate: boolean;
  canSetStudentAffairsAmount: boolean;
  canConfirmRevenueReceipt: boolean;
  canExecuteClearance: boolean;
  reason: FinanceClearanceCapabilityReason;
  messageAr: string;
};

export type FinanceClearanceValidationSeverity = "error" | "warning" | "info";

export type FinanceClearanceValidationIssue = {
  severity: FinanceClearanceValidationSeverity;
  code: string;
  messageAr: string;
  field?: string;
};

export type FinanceClearanceDryRunStatus =
  | "VALID"
  | "VALID_WITH_WARNINGS"
  | "INVALID"
  | "UNAUTHORIZED"
  | "EXECUTION_UNAVAILABLE"
  | "UNSUPPORTED_ACTION";

export const APPROVED_FINANCE_CLEARANCE_ACTIONS = [
  "set_student_affairs_amount",
  "confirm_revenue_received",
  "approve_clearance",
  "reject_clearance",
  "request_clearance_completion",
  "mark_parallel_member_complete",
  "evaluate_parallel_group_completion",
] as const;

export const DISAPPROVED_FINANCE_CLEARANCE_ACTIONS = [
  "assess_fee",
  "confirm_fee_assessment",
  "mark_fee_not_required",
  "submit_payment_proof",
  "verify_payment",
  "reject_payment_proof",
] as const;

/** Student affairs manually sets amount — no auto calculation, no client-trusted actors. */
export type StudentAffairsAmountInput = {
  requestId: string;
  requestTypeCode: string;
  amount: number;
  note?: string | null;
  expectedUpdatedAt?: string | null;
  expectedStepStatus?: string | null;
  clientActionId?: string | null;
  /** Client must NOT supply these. */
  studentId?: never;
  actorUserId?: never;
  actorRole?: never;
  currency?: never;
};

export type StudentAffairsAmountResult = {
  status: FinanceClearanceDryRunStatus;
  valid: boolean;
  capability: FinanceClearanceCapability;
  issues: FinanceClearanceValidationIssue[];
  summaryAr: string;
  financeStatus: FinanceClearanceStatus;
  amountYer: number | null;
  executed: false;
};

/** Revenue confirms receipt — MUST NOT accept amount, hafiza, proof, or attachments. */
export type RevenueReceiptConfirmationInput = {
  requestId: string;
  requestTypeCode: string;
  note?: string | null;
  expectedUpdatedAt?: string | null;
  expectedStepStatus?: string | null;
  clientActionId?: string | null;
  /** Rejected fields — revenue cannot modify amount or accept proof. */
  amount?: never;
  hafizaNumber?: never;
  paymentProofReference?: never;
  file?: never;
  fileBase64?: never;
  actorUserId?: never;
};

export type RevenueReceiptConfirmationResult = {
  status: FinanceClearanceDryRunStatus;
  valid: boolean;
  capability: FinanceClearanceCapability;
  issues: FinanceClearanceValidationIssue[];
  summaryAr: string;
  financeStatus: FinanceClearanceStatus;
  executed: false;
};

export type FinanceClearanceActorContext = {
  userId: string;
  appRoles: readonly string[];
  processingRoleKeys: readonly string[];
  isStaffInboxAuthorized: boolean;
  requestTypeCode: string | null;
};

export type FinanceClearanceDryRunResult =
  | StudentAffairsAmountResult
  | RevenueReceiptConfirmationResult;

const STUDENT_AFFAIRS_ROLES = new Set([
  "student_affairs_manager",
  "student_affairs_specialist",
]);

const REVENUE_ROLE = "revenue_finance_officer";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const FINANCE_CLEARANCE_EXECUTION_UNAVAILABLE_MSG =
  "تحديد المبلغ وتأكيد الاستلام يحتاج تطبيق مخطط طلبات الطلاب على بيئة آمنة أولاً.";

export const FINANCE_CLEARANCE_DRY_RUN_SUCCESS_MSG =
  "تم التحقق فقط. لم يتم حفظ مبلغ أو تأكيد استلام أو إخلاء طرف في قاعدة البيانات.";

export const STUDENT_AMOUNT_DISPLAY_MSG =
  "المبلغ المطلوب سداده — يُسدَّد خارج البوابة. لا دفع ولا رفع إثبات داخل البوابة.";

export const STUDENT_AFFAIRS_AMOUNT_SET_MSG =
  "يتم تحديد المبلغ من شؤون الطلاب — الطالب يرى «المبلغ المطلوب سداده» فقط.";

function pushIssue(
  issues: FinanceClearanceValidationIssue[],
  issue: FinanceClearanceValidationIssue,
): void {
  issues.push(issue);
}

function findFeeSteps(requestTypeCode: string): CanonicalWorkflowStepDef[] {
  const normalized = normalizeStudentRequestTypeCode(requestTypeCode);
  if (!normalized) return [];
  const preview = getCanonicalWorkflowPreview(normalized);
  if (!preview) return [];
  return preview.steps.filter((s) => s.requiresFee);
}

export function getFinanceRequirementForRequestType(
  requestTypeCode: string | null | undefined,
): {
  financeRequired: boolean;
  studentAffairsRoleKeys: string[];
  revenueRoleKey: string;
  feeStepKeys: string[];
} {
  const normalized = normalizeStudentRequestTypeCode(requestTypeCode);
  const def = getStudentRequestTypeDefinition(normalized);
  const feeSteps = normalized ? findFeeSteps(normalized) : [];
  const financeRequired = Boolean(def?.requiresFee) || feeSteps.length > 0;

  return {
    financeRequired,
    studentAffairsRoleKeys: ["student_affairs_manager", "student_affairs_specialist"],
    revenueRoleKey: REVENUE_ROLE,
    feeStepKeys: feeSteps.map((s) => s.key),
  };
}

export function validateFinanceClearanceCapability(): FinanceClearanceCapability {
  return {
    canValidate: true,
    canSetStudentAffairsAmount: false,
    canConfirmRevenueReceipt: false,
    canExecuteClearance: false,
    reason: "finance_clearance_runtime_unavailable",
    messageAr: FINANCE_CLEARANCE_EXECUTION_UNAVAILABLE_MSG,
  };
}

function rejectClientTrustedFields(
  raw: Record<string, unknown>,
  issues: FinanceClearanceValidationIssue[],
): void {
  if ("studentId" in raw && raw.studentId != null) {
    pushIssue(issues, {
      severity: "error",
      code: "client_student_id_rejected",
      messageAr: "studentId لا يُقبل من العميل.",
      field: "studentId",
    });
  }
  if ("actorUserId" in raw && raw.actorUserId != null) {
    pushIssue(issues, {
      severity: "error",
      code: "client_actor_rejected",
      messageAr: "هوية المُنفّذ لا تُقبل من العميل.",
      field: "actorUserId",
    });
  }
  if ("actorRole" in raw && raw.actorRole != null) {
    pushIssue(issues, {
      severity: "error",
      code: "client_role_rejected",
      messageAr: "دور المُنفّذ لا يُقبل من العميل.",
      field: "actorRole",
    });
  }
  if ("file" in raw && raw.file != null) {
    pushIssue(issues, {
      severity: "error",
      code: "file_object_rejected",
      messageAr: "لا يُقبل File في JSON.",
      field: "file",
    });
  }
  if ("fileBase64" in raw && raw.fileBase64 != null) {
    pushIssue(issues, {
      severity: "error",
      code: "base64_rejected",
      messageAr: "لا يُقبل base64 في JSON.",
      field: "fileBase64",
    });
  }
  if ("hafizaNumber" in raw && raw.hafizaNumber != null) {
    pushIssue(issues, {
      severity: "error",
      code: "hafiza_rejected",
      messageAr: "رقم الحافظة غير مقبول — لا رفع إثبات دفع في البوابة.",
      field: "hafizaNumber",
    });
  }
  if ("paymentProofReference" in raw && raw.paymentProofReference != null) {
    pushIssue(issues, {
      severity: "error",
      code: "payment_proof_rejected",
      messageAr: "إثبات الدفع غير مقبول — لا دفع داخل البوابة.",
      field: "paymentProofReference",
    });
  }
}

function isStudentAffairsActor(actor: FinanceClearanceActorContext): boolean {
  if (actor.appRoles.includes("admin") || actor.appRoles.includes("system_admin")) {
    return true;
  }
  return actor.processingRoleKeys.some((r) => STUDENT_AFFAIRS_ROLES.has(r));
}

function isRevenueActor(actor: FinanceClearanceActorContext): boolean {
  if (actor.appRoles.includes("admin") || actor.appRoles.includes("system_admin")) {
    return true;
  }
  return actor.processingRoleKeys.includes(REVENUE_ROLE);
}

export function normalizeStudentAffairsAmountInput(
  raw: Partial<StudentAffairsAmountInput> & { requestId: string },
): StudentAffairsAmountInput {
  return {
    requestId: (raw.requestId ?? "").trim(),
    requestTypeCode:
      normalizeStudentRequestTypeCode(raw.requestTypeCode) ??
      (raw.requestTypeCode ?? "").trim(),
    amount: typeof raw.amount === "number" ? raw.amount : Number.NaN,
    note: raw.note?.trim() || null,
    expectedUpdatedAt: raw.expectedUpdatedAt?.trim() || null,
    expectedStepStatus: raw.expectedStepStatus?.trim() || null,
    clientActionId: raw.clientActionId?.trim() || null,
  };
}

export function validateStudentAffairsAmountInput(
  raw: Partial<StudentAffairsAmountInput> & { requestId: string },
  actor: FinanceClearanceActorContext,
  rawExtras: Record<string, unknown> = {},
): StudentAffairsAmountResult {
  const capability = validateFinanceClearanceCapability();
  const issues: FinanceClearanceValidationIssue[] = [];
  rejectClientTrustedFields(rawExtras, issues);

  const normalized = normalizeStudentAffairsAmountInput(raw);
  const financeReq = getFinanceRequirementForRequestType(normalized.requestTypeCode);

  if (!normalized.requestId) {
    pushIssue(issues, {
      severity: "error",
      code: "missing_request_id",
      messageAr: "requestId مطلوب.",
    });
  } else if (!UUID_RE.test(normalized.requestId)) {
    pushIssue(issues, {
      severity: "error",
      code: "invalid_request_id",
      messageAr: "requestId غير صالح.",
    });
  }

  if (!normalized.requestTypeCode) {
    pushIssue(issues, {
      severity: "error",
      code: "missing_request_type",
      messageAr: "نوع الطلب مطلوب.",
    });
  }

  if (raw.amount == null || Number.isNaN(normalized.amount)) {
    pushIssue(issues, {
      severity: "error",
      code: "missing_amount",
      messageAr: "المبلغ مطلوب — يُحدَّد يدوياً من شؤون الطلاب.",
      field: "amount",
    });
  } else if (normalized.amount <= 0) {
    pushIssue(issues, {
      severity: "error",
      code: "invalid_amount",
      messageAr: "المبلغ يجب أن يكون موجباً.",
      field: "amount",
    });
  }

  if ("currency" in rawExtras && rawExtras.currency != null) {
    pushIssue(issues, {
      severity: "info",
      code: "currency_display_only",
      messageAr: "العملة للعرض فقط (YER افتراضياً) — لا إلزام في الإدخال.",
    });
  }

  if (!actor.isStaffInboxAuthorized) {
    pushIssue(issues, {
      severity: "error",
      code: "inbox_unauthorized",
      messageAr: "المستخدم غير مخول.",
    });
  } else if (!isStudentAffairsActor(actor)) {
    pushIssue(issues, {
      severity: "error",
      code: "student_affairs_role_required",
      messageAr: "تحديد المبلغ يتطلب دور student_affairs_manager أو student_affairs_specialist.",
    });
  }

  pushIssue(issues, {
    severity: "info",
    code: "amount_manual_no_calculation",
    messageAr: STUDENT_AFFAIRS_AMOUNT_SET_MSG,
  });

  pushIssue(issues, {
    severity: "info",
    code: "student_off_portal_payment",
    messageAr: STUDENT_AMOUNT_DISPLAY_MSG,
  });

  return buildStudentAffairsAmountResult(
    capability,
    issues,
    financeReq.financeRequired ? "amount_set" : "not_required",
    Number.isFinite(normalized.amount) && normalized.amount > 0 ? normalized.amount : null,
  );
}

export function normalizeRevenueReceiptConfirmationInput(
  raw: Partial<RevenueReceiptConfirmationInput> & { requestId: string },
): RevenueReceiptConfirmationInput {
  return {
    requestId: (raw.requestId ?? "").trim(),
    requestTypeCode:
      normalizeStudentRequestTypeCode(raw.requestTypeCode) ??
      (raw.requestTypeCode ?? "").trim(),
    note: raw.note?.trim() || null,
    expectedUpdatedAt: raw.expectedUpdatedAt?.trim() || null,
    expectedStepStatus: raw.expectedStepStatus?.trim() || null,
    clientActionId: raw.clientActionId?.trim() || null,
  };
}

export function validateRevenueReceiptConfirmation(
  raw: Partial<RevenueReceiptConfirmationInput> & { requestId: string },
  actor: FinanceClearanceActorContext,
  rawExtras: Record<string, unknown> = {},
): RevenueReceiptConfirmationResult {
  const capability = validateFinanceClearanceCapability();
  const issues: FinanceClearanceValidationIssue[] = [];
  rejectClientTrustedFields(rawExtras, issues);

  const normalized = normalizeRevenueReceiptConfirmationInput(raw);
  const financeReq = getFinanceRequirementForRequestType(normalized.requestTypeCode);

  if (!normalized.requestId || !UUID_RE.test(normalized.requestId)) {
    pushIssue(issues, {
      severity: "error",
      code: "invalid_request_id",
      messageAr: "requestId غير صالح.",
    });
  }

  if ("amount" in rawExtras && rawExtras.amount != null) {
    pushIssue(issues, {
      severity: "error",
      code: "revenue_cannot_modify_amount",
      messageAr: "مسؤول الإيرادات لا يمكنه تعديل المبلغ — يؤكد الاستلام فقط.",
      field: "amount",
    });
  }

  if (!actor.isStaffInboxAuthorized) {
    pushIssue(issues, {
      severity: "error",
      code: "inbox_unauthorized",
      messageAr: "المستخدم غير مخول.",
    });
  } else if (!isRevenueActor(actor)) {
    pushIssue(issues, {
      severity: "error",
      code: "revenue_role_required",
      messageAr: "تأكيد الاستلام يتطلب دور revenue_finance_officer.",
    });
  }

  pushIssue(issues, {
    severity: "info",
    code: "revenue_confirm_only",
    messageAr: "مسؤول الإيرادات يؤكد استلام المبلغ المحدد من شؤون الطلاب — لا تعديل للمبلغ.",
  });

  return buildRevenueReceiptResult(
    capability,
    issues,
    financeReq.financeRequired ? "receipt_confirmed" : "not_required",
  );
}

export function validateUnsupportedFinanceAction(
  action: string,
  rawExtras: Record<string, unknown> = {},
): StudentAffairsAmountResult {
  const capability = validateFinanceClearanceCapability();
  const issues: FinanceClearanceValidationIssue[] = [];
  rejectClientTrustedFields(rawExtras, issues);

  const disapproved = DISAPPROVED_FINANCE_CLEARANCE_ACTIONS as readonly string[];
  if (disapproved.includes(action)) {
    pushIssue(issues, {
      severity: "error",
      code: "unsupported_action",
      messageAr: `الإجراء «${action}» غير معتمد — لا دفع ولا إثبات داخل البوابة.`,
    });
  } else {
    pushIssue(issues, {
      severity: "error",
      code: "unknown_action",
      messageAr: "إجراء غير معروف.",
    });
  }

  return buildStudentAffairsAmountResult(capability, issues, "unavailable", null, "UNSUPPORTED_ACTION");
}

function buildStudentAffairsAmountResult(
  capability: FinanceClearanceCapability,
  issues: FinanceClearanceValidationIssue[],
  financeStatus: FinanceClearanceStatus,
  amountYer: number | null,
  forceStatus?: FinanceClearanceDryRunStatus,
): StudentAffairsAmountResult {
  const hasErrors = issues.some((i) => i.severity === "error");
  const hasWarnings = issues.some((i) => i.severity === "warning");
  const unauthorized = issues.some(
    (i) =>
      i.code === "inbox_unauthorized" ||
      i.code === "student_affairs_role_required" ||
      i.code === "revenue_role_required",
  );

  let status: FinanceClearanceDryRunStatus;
  if (forceStatus) {
    status = forceStatus;
  } else if (unauthorized && hasErrors) {
    status = "UNAUTHORIZED";
  } else if (hasErrors) {
    status = "INVALID";
  } else if (!capability.canSetStudentAffairsAmount && !capability.canConfirmRevenueReceipt) {
    status = hasWarnings ? "VALID_WITH_WARNINGS" : "EXECUTION_UNAVAILABLE";
  } else if (hasWarnings) {
    status = "VALID_WITH_WARNINGS";
  } else {
    status = "VALID";
  }

  let summaryAr: string;
  if (status === "UNAUTHORIZED") {
    summaryAr = "غير مصرح — لا يمكن تنفيذ إجراء المالية/الإخلاء.";
  } else if (status === "INVALID" || status === "UNSUPPORTED_ACTION") {
    summaryAr = "المدخلات غير صالحة — راجع الأخطاء.";
  } else {
    summaryAr = `${FINANCE_CLEARANCE_DRY_RUN_SUCCESS_MSG} ${capability.messageAr}`;
  }

  return {
    status,
    valid: !hasErrors && status !== "UNAUTHORIZED" && status !== "UNSUPPORTED_ACTION",
    capability,
    issues,
    summaryAr,
    financeStatus,
    amountYer,
    executed: false,
  };
}

function buildRevenueReceiptResult(
  capability: FinanceClearanceCapability,
  issues: FinanceClearanceValidationIssue[],
  financeStatus: FinanceClearanceStatus,
): RevenueReceiptConfirmationResult {
  const hasErrors = issues.some((i) => i.severity === "error");
  const hasWarnings = issues.some((i) => i.severity === "warning");
  const unauthorized = issues.some(
    (i) =>
      i.code === "inbox_unauthorized" ||
      i.code === "revenue_role_required",
  );

  let status: FinanceClearanceDryRunStatus;
  if (unauthorized && hasErrors) {
    status = "UNAUTHORIZED";
  } else if (hasErrors) {
    status = "INVALID";
  } else if (!capability.canConfirmRevenueReceipt) {
    status = hasWarnings ? "VALID_WITH_WARNINGS" : "EXECUTION_UNAVAILABLE";
  } else if (hasWarnings) {
    status = "VALID_WITH_WARNINGS";
  } else {
    status = "VALID";
  }

  let summaryAr: string;
  if (status === "UNAUTHORIZED") {
    summaryAr = "غير مصرح — لا يمكن تأكيد الاستلام.";
  } else if (status === "INVALID") {
    summaryAr = "المدخلات غير صالحة — راجع الأخطاء.";
  } else {
    summaryAr = `${FINANCE_CLEARANCE_DRY_RUN_SUCCESS_MSG} ${capability.messageAr}`;
  }

  return {
    status,
    valid: !hasErrors && status !== "UNAUTHORIZED",
    capability,
    issues,
    summaryAr,
    financeStatus,
    executed: false,
  };
}

export type FinanceClearanceScenarioResult = {
  id: number;
  name: string;
  expected: string;
  actual: FinanceClearanceDryRunStatus;
  valid: boolean;
};

export function runFinanceClearanceScenarioMatrix(): FinanceClearanceScenarioResult[] {
  const requestId = "00000000-0000-4000-8000-000000000001";

  const saActor: FinanceClearanceActorContext = {
    userId: "server-user",
    appRoles: [],
    processingRoleKeys: ["student_affairs_manager"],
    isStaffInboxAuthorized: true,
    requestTypeCode: "enrollment_certificate",
  };

  const revenueActor: FinanceClearanceActorContext = {
    userId: "server-user",
    appRoles: [],
    processingRoleKeys: ["revenue_finance_officer"],
    isStaffInboxAuthorized: true,
    requestTypeCode: "enrollment_certificate",
  };

  const libraryActor: FinanceClearanceActorContext = {
    userId: "server-user",
    appRoles: [],
    processingRoleKeys: ["library_officer"],
    isStaffInboxAuthorized: true,
    requestTypeCode: "file_withdrawal",
  };

  const clearanceGroupActor: StudentRequestClearanceActorContext = {
    userId: "server",
    appRoles: ["admin"],
    processingRoleKeys: [],
    isStaffInboxAuthorized: true,
    requestTypeCode: "file_withdrawal",
    targetMemberKey: null,
    targetRoleKey: null,
  };

  const baseGroup = buildDefaultClearanceGroup(requestId, "file_withdrawal")!;

  const scenarios: Array<{
    id: number;
    name: string;
    expected: string;
    fn: () => { status: FinanceClearanceDryRunStatus };
  }> = [
    {
      id: 1,
      name: "set_student_affairs_amount — بلا مبلغ",
      expected: "INVALID",
      fn: () =>
        validateStudentAffairsAmountInput(
          {
            requestId,
            requestTypeCode: "enrollment_certificate",
            amount: undefined as unknown as number,
          },
          saActor,
        ),
    },
    {
      id: 2,
      name: "set_student_affairs_amount — مبلغ موجب",
      expected: "EXECUTION_UNAVAILABLE",
      fn: () =>
        validateStudentAffairsAmountInput(
          {
            requestId,
            requestTypeCode: "enrollment_certificate",
            amount: 5000,
            note: "رسوم شهادة قيد",
          },
          saActor,
        ),
    },
    {
      id: 3,
      name: "set_student_affairs_amount — مبلغ سالب",
      expected: "INVALID",
      fn: () =>
        validateStudentAffairsAmountInput(
          {
            requestId,
            requestTypeCode: "enrollment_certificate",
            amount: -100,
          },
          saActor,
        ),
    },
    {
      id: 4,
      name: "set_student_affairs_amount — دور غير SA",
      expected: "UNAUTHORIZED",
      fn: () =>
        validateStudentAffairsAmountInput(
          {
            requestId,
            requestTypeCode: "enrollment_certificate",
            amount: 5000,
          },
          libraryActor,
        ),
    },
    {
      id: 5,
      name: "confirm_revenue_received — revenue_finance_officer",
      expected: "EXECUTION_UNAVAILABLE",
      fn: () =>
        validateRevenueReceiptConfirmation(
          {
            requestId,
            requestTypeCode: "enrollment_certificate",
            note: "تم الاستلام",
          },
          revenueActor,
        ),
    },
    {
      id: 6,
      name: "confirm_revenue_received — دور غير revenue",
      expected: "UNAUTHORIZED",
      fn: () =>
        validateRevenueReceiptConfirmation(
          {
            requestId,
            requestTypeCode: "enrollment_certificate",
          },
          saActor,
        ),
    },
    {
      id: 7,
      name: "confirm_revenue — amount مرفوض",
      expected: "INVALID",
      fn: () =>
        validateRevenueReceiptConfirmation(
          {
            requestId,
            requestTypeCode: "enrollment_certificate",
          },
          revenueActor,
          { amount: 9999 },
        ),
    },
    {
      id: 8,
      name: "submit_payment_proof — غير معتمد",
      expected: "UNSUPPORTED_ACTION",
      fn: () => validateUnsupportedFinanceAction("submit_payment_proof"),
    },
    {
      id: 9,
      name: "File/base64 في payload — مرفوض",
      expected: "UNSUPPORTED_ACTION",
      fn: () =>
        validateUnsupportedFinanceAction("submit_payment_proof", {
          fileBase64: "data:image/png;base64,abc",
        }),
    },
    {
      id: 10,
      name: "file_withdrawal — جميع الأعضاء",
      expected: "VALID_WITH_WARNINGS",
      fn: () => {
        const result = validateParallelClearanceGroup(baseGroup, clearanceGroupActor);
        return { status: result.status as FinanceClearanceDryRunStatus };
      },
    },
    {
      id: 11,
      name: "file_withdrawal — student_activities role gap",
      expected: "VALID_WITH_WARNINGS",
      fn: () => {
        const result = validateParallelClearanceGroup(baseGroup, clearanceGroupActor);
        const hasGap = result.issues.some((i) => i.code === "student_activities_role_gap");
        return {
          status: (hasGap ? result.status : "INVALID") as FinanceClearanceDryRunStatus,
        };
      },
    },
    {
      id: 12,
      name: "complete group قبل الأعضاء — INVALID",
      expected: "INVALID",
      fn: () => {
        const premature = {
          ...baseGroup,
          status: "cleared" as const,
          members: baseGroup.members.map((m) => ({ ...m, status: "pending" as const })),
        };
        const result = validateParallelClearanceGroup(premature, clearanceGroupActor);
        return { status: result.status as FinanceClearanceDryRunStatus };
      },
    },
    {
      id: 13,
      name: "central_signatory كعضو clearance — INVALID",
      expected: "INVALID",
      fn: () => {
        const badGroup = normalizeParallelClearanceGroup({
          ...baseGroup,
          members: [
            ...baseGroup.members,
            {
              memberKey: "registrar",
              labelAr: "مسجل الكلية",
              roleKey: "central_signatory",
              unitKey: "registrar",
              status: "pending" as const,
              notes: null,
            },
          ],
        });
        const result = validateParallelClearanceGroup(badGroup, clearanceGroupActor);
        return { status: result.status as FinanceClearanceDryRunStatus };
      },
    },
    {
      id: 14,
      name: "labs_manager/lab_custodian — mapping موثّق",
      expected: "EXECUTION_UNAVAILABLE",
      fn: () => {
        const issues: FinanceClearanceValidationIssue[] = [];
        pushIssue(issues, {
          severity: "info",
          code: "labs_role_alternatives",
          messageAr:
            "عضو المعامل: labs_manager أو lab_custodian — كلاهما مقبول لإجراء labs.",
        });
        const result = buildStudentAffairsAmountResult(
          validateFinanceClearanceCapability(),
          issues,
          "not_required",
          null,
        );
        return { status: result.status };
      },
    },
  ];

  return scenarios.map((s) => {
    const result = s.fn();
    return {
      id: s.id,
      name: s.name,
      expected: s.expected,
      actual: result.status,
      valid: result.status === s.expected,
    };
  });
}
