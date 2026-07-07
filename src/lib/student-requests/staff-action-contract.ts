/**
 * Staff action contract foundation (P11).
 * Pure normalization/validation — no DB writes, no act_on RPC, no runtime execution.
 * Workflow step expectations: request-workflow-preview-registry.ts (P7).
 */

import {
  getCanonicalWorkflowPreview,
  type CanonicalWorkflowStepDef,
} from "@/lib/student-requests/request-workflow-preview-registry";
import { APPROVED_WORKFLOW_ROLE_KEYS } from "@/lib/student-requests/request-workflow-save-contract";
import { normalizeStudentRequestTypeCode } from "@/lib/student-requests/request-type-registry";

export const STAFF_ACTION_TYPES = [
  "approve",
  "reject",
  "return_to_student",
  "request_completion",
  "forward_to_next_step",
  "add_note",
] as const;

export type StudentRequestActionType = (typeof STAFF_ACTION_TYPES)[number];

export type StudentRequestActionCapabilityReason =
  | "workflow_runtime_unavailable"
  | "execution_disabled"
  | "ready_for_staging_execution";

export type StudentRequestActionCapability = {
  available: boolean;
  canValidate: boolean;
  canExecute: boolean;
  reason: StudentRequestActionCapabilityReason;
  messageAr: string;
};

export type StudentRequestActionValidationSeverity = "error" | "warning" | "info";

export type StudentRequestActionValidationIssue = {
  severity: StudentRequestActionValidationSeverity;
  code: string;
  messageAr: string;
  stepKey?: string;
  action?: StudentRequestActionType;
};

export type StudentRequestActorContext = {
  userId: string;
  appRoles: readonly string[];
  processingRoleKeys: readonly string[];
  departmentIds: readonly string[];
  isStaffInboxAuthorized: boolean;
  stepKey: string | null;
  stepRoleKey: string | null;
  stepStatus: string | null;
  isCentralSignatoryStep: boolean;
  isParallelStep: boolean;
  parallelGroupKey: string | null;
  parallelGroupComplete: boolean | null;
  requestTypeCode: string | null;
  requestStatus: string | null;
  requestUpdatedAt: string | null;
};

export type StudentRequestConcurrencyContext = {
  expectedUpdatedAt: string | null;
  expectedStepStatus: string | null;
  expectedRequestStatus: string | null;
  clientActionId: string | null;
  seenClientActionIds: readonly string[];
};

export type StudentRequestStaffActionInput = {
  requestId: string;
  workflowStepId?: string | null;
  action: string;
  note?: string | null;
  completionRequirements?: string[] | null;
  expectedRequestStatus?: string | null;
  expectedStepStatus?: string | null;
  expectedUpdatedAt?: string | null;
  clientActionId?: string | null;
  attachmentReferences?: readonly string[] | null;
  actorUserId?: never;
  actorRole?: never;
  nextActorId?: never;
};

export type StaffActionDryRunStatus =
  | "VALID"
  | "VALID_WITH_WARNINGS"
  | "INVALID"
  | "EXECUTION_UNAVAILABLE"
  | "UNAUTHORIZED";

export type StudentRequestStaffActionResult = {
  status: StaffActionDryRunStatus;
  valid: boolean;
  action: StudentRequestActionType | null;
  capability: StudentRequestActionCapability;
  issues: StudentRequestActionValidationIssue[];
  summaryAr: string;
  executed: false;
  wouldChangeRequestStatus: boolean;
  wouldChangeStepStatus: boolean;
  allowedActionsForStep: StudentRequestActionType[];
};

const APPROVED_ROLE_SET = new Set<string>(APPROVED_WORKFLOW_ROLE_KEYS);

const NOTE_REQUIRED_ACTIONS = new Set<StudentRequestActionType>([
  "reject",
  "return_to_student",
  "request_completion",
]);

const TERMINAL_STEP_STATUSES = new Set(["completed", "rejected", "skipped", "cancelled"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ACTION_ALIASES: Readonly<Record<string, StudentRequestActionType>> = {
  forward: "forward_to_next_step",
  return: "return_to_student",
};

export const STAFF_ACTION_EXECUTION_UNAVAILABLE_MSG =
  "تنفيذ إجراءات الموظفين يحتاج تطبيق مخطط دورة الحياة على بيئة آمنة أولاً.";

export const STAFF_ACTION_DRY_RUN_SUCCESS_MSG =
  "تم التحقق من الإجراء فقط. لم يتم تنفيذ أي تغيير على الطلب.";

function pushIssue(
  issues: StudentRequestActionValidationIssue[],
  issue: StudentRequestActionValidationIssue,
): void {
  issues.push(issue);
}

export function validateStaffActionCapability(): StudentRequestActionCapability {
  return {
    available: false,
    canValidate: true,
    canExecute: false,
    reason: "workflow_runtime_unavailable",
    messageAr: STAFF_ACTION_EXECUTION_UNAVAILABLE_MSG,
  };
}

export function normalizeStaffActionInput(
  raw: Partial<StudentRequestStaffActionInput> & { action: string },
): {
  requestId: string;
  workflowStepId: string | null;
  action: StudentRequestActionType | null;
  note: string | null;
  completionRequirements: string[];
  expectedRequestStatus: string | null;
  expectedStepStatus: string | null;
  expectedUpdatedAt: string | null;
  clientActionId: string | null;
  attachmentReferences: string[];
} {
  const actionRaw = (raw.action ?? "").trim().toLowerCase();
  const action =
    ACTION_ALIASES[actionRaw] ??
    (STAFF_ACTION_TYPES.includes(actionRaw as StudentRequestActionType)
      ? (actionRaw as StudentRequestActionType)
      : null);

  return {
    requestId: (raw.requestId ?? "").trim(),
    workflowStepId: raw.workflowStepId?.trim() || null,
    action,
    note: raw.note?.trim() || null,
    completionRequirements: Array.isArray(raw.completionRequirements)
      ? raw.completionRequirements.filter((s) => typeof s === "string" && s.trim())
      : [],
    expectedRequestStatus: raw.expectedRequestStatus?.trim() || null,
    expectedStepStatus: raw.expectedStepStatus?.trim() || null,
    expectedUpdatedAt: raw.expectedUpdatedAt?.trim() || null,
    clientActionId: raw.clientActionId?.trim() || null,
    attachmentReferences: Array.isArray(raw.attachmentReferences)
      ? raw.attachmentReferences.filter((s) => typeof s === "string")
      : [],
  };
}

function findPreviewStep(
  requestTypeCode: string | null,
  stepKey: string | null,
): CanonicalWorkflowStepDef | null {
  if (!requestTypeCode || !stepKey) return null;
  const normalized = normalizeStudentRequestTypeCode(requestTypeCode);
  if (!normalized) return null;
  const preview = getCanonicalWorkflowPreview(normalized);
  if (!preview) return null;
  return preview.steps.find((s) => s.key === stepKey) ?? null;
}

export function getAllowedActionsForPreviewStep(
  step: CanonicalWorkflowStepDef | null,
): StudentRequestActionType[] {
  if (!step) return [];
  if (step.roleKey === "student") return [];
  if (step.isCentralSignatory) return [];

  if (step.isArchiveStep || step.actionType === "archive") {
    return ["forward_to_next_step", "add_note"];
  }

  if (step.actionType === "complete") {
    return ["approve", "reject", "return_to_student", "add_note"];
  }

  return [
    "approve",
    "reject",
    "return_to_student",
    "request_completion",
    "add_note",
  ];
}

export function getAllowedActionsForStepContext(
  actor: StudentRequestActorContext,
): StudentRequestActionType[] {
  const previewStep = findPreviewStep(actor.requestTypeCode, actor.stepKey);
  if (previewStep) return getAllowedActionsForPreviewStep(previewStep);
  if (actor.isCentralSignatoryStep || actor.stepRoleKey === "student") return [];
  if (actor.stepKey) {
    return ["approve", "reject", "return_to_student", "request_completion", "add_note"];
  }
  return [];
}

export function validateStaffActionForRole(
  action: StudentRequestActionType,
  actor: StudentRequestActorContext,
  issues: StudentRequestActionValidationIssue[],
): void {
  if (!actor.isStaffInboxAuthorized) {
    pushIssue(issues, {
      severity: "error",
      code: "inbox_unauthorized",
      messageAr: "المستخدم غير مخول للوصول إلى صندوق المعالجة.",
      action,
    });
    return;
  }

  if (actor.isCentralSignatoryStep) {
    pushIssue(issues, {
      severity: "error",
      code: "central_signatory_staff_forbidden",
      messageAr: "الجهات المركزية لا تُنفَّذ بواسطة موظفي الكلية.",
      stepKey: actor.stepKey ?? undefined,
      action,
    });
  }

  const stepRole = actor.stepRoleKey;
  if (!stepRole || stepRole === "student") {
    if (action !== "add_note") {
      pushIssue(issues, {
        severity: "error",
        code: "student_step_no_staff_action",
        messageAr: "خطوة الطالب — لا إجراءات موظف.",
        stepKey: actor.stepKey ?? undefined,
        action,
      });
    }
    return;
  }

  if (stepRole === "student_affairs" && actor.stepKey?.includes("activities")) {
    pushIssue(issues, {
      severity: "warning",
      code: "student_activities_role_gap",
      messageAr:
        "الأنشطة الطلابية — لا يوجد app_role مخصص؛ يُفضّل تعيين processing assignment مستقبلي.",
      stepKey: actor.stepKey,
      action,
    });
  }

  if (!APPROVED_ROLE_SET.has(stepRole) && stepRole !== "student_affairs") {
    pushIssue(issues, {
      severity: "error",
      code: "unapproved_step_role",
      messageAr: `دور الخطوة غير معتمد: ${stepRole}`,
      stepKey: actor.stepKey ?? undefined,
      action,
    });
  }

  const roleMatch =
    actor.processingRoleKeys.includes(stepRole) ||
    actor.appRoles.includes("admin") ||
    actor.appRoles.includes("system_admin") ||
    actor.appRoles.includes("registrar");

  if (!roleMatch && stepRole === "department_head") {
    pushIssue(issues, {
      severity: "error",
      code: "dept_head_scope",
      messageAr: "رئيس القسم — يجب أن يكون ضمن نطاق القسم (يُتحقق عند التنفيذ).",
      action,
    });
  } else if (!roleMatch) {
    pushIssue(issues, {
      severity: "error",
      code: "actor_role_mismatch",
      messageAr: "الموظف الحالي غير مخول لهذا الدور على هذه الخطوة.",
      action,
    });
  }
}

export function validateStaffActionForWorkflowStep(
  action: StudentRequestActionType,
  actor: StudentRequestActorContext,
  issues: StudentRequestActionValidationIssue[],
): void {
  if (actor.stepStatus && TERMINAL_STEP_STATUSES.has(actor.stepStatus)) {
    pushIssue(issues, {
      severity: "error",
      code: "step_terminal",
      messageAr: `لا يمكن تنفيذ إجراء على خطوة ${actor.stepStatus}.`,
      stepKey: actor.stepKey ?? undefined,
      action,
    });
  }

  const allowed = getAllowedActionsForStepContext(actor);
  if (allowed.length > 0 && !allowed.includes(action)) {
    pushIssue(issues, {
      severity: "error",
      code: "action_not_allowed_for_step",
      messageAr: `الإجراء «${action}» غير متاح لهذه الخطوة.`,
      stepKey: actor.stepKey ?? undefined,
      action,
    });
  }

  if (actor.isParallelStep && actor.parallelGroupComplete === false) {
    if (action === "forward_to_next_step" || action === "approve") {
      pushIssue(issues, {
        severity: "warning",
        code: "parallel_group_incomplete",
        messageAr: "مجموعة التوازي غير مكتملة — لا يُغلق المسار حتى اكتمال جميع الأعضاء.",
        stepKey: actor.stepKey ?? undefined,
        action,
      });
    }
  }

  const previewStep = findPreviewStep(actor.requestTypeCode, actor.stepKey);
  if (previewStep?.requiresFee && action === "approve") {
    pushIssue(issues, {
      severity: "info",
      code: "fee_verification_future",
      messageAr: "خطوة مالية — سيُتحقق من الدفع عند تفعيل runtime.",
      stepKey: actor.stepKey ?? undefined,
      action,
    });
  }
}

export function validateStaffActionTransition(
  action: StudentRequestActionType,
  actor: StudentRequestActorContext,
  issues: StudentRequestActionValidationIssue[],
): void {
  if (action === "approve") {
    pushIssue(issues, {
      severity: "info",
      code: "approve_no_client_next",
      messageAr: "الموافقة — next step يُستنتج من workflow runtime وليس من العميل.",
      action,
    });
  }

  if (action === "reject") {
    pushIssue(issues, {
      severity: "info",
      code: "reject_not_final_approval",
      messageAr: "الرفض — لا يُعامل كموافقة نهائية.",
      action,
    });
  }

  if (action === "return_to_student") {
    pushIssue(issues, {
      severity: "info",
      code: "return_completion_path",
      messageAr: "إعادة للطالب — مسار استكمال (returned_for_completion) عند التنفيذ.",
      action,
    });
  }

  if (action === "forward_to_next_step") {
    pushIssue(issues, {
      severity: "info",
      code: "forward_no_manual_actor",
      messageAr: "الإحالة — لا يقبل اختيار actor يدوي من العميل.",
      action,
    });
  }

  if (action === "approve" && actor.requestStatus === "completed") {
    pushIssue(issues, {
      severity: "error",
      code: "already_completed",
      messageAr: "لا يمكن الموافقة — الطلب مكتمل.",
      action,
    });
  }
}

export function validateStaffActionConcurrency(
  concurrency: StudentRequestConcurrencyContext,
  actor: StudentRequestActorContext,
  issues: StudentRequestActionValidationIssue[],
): void {
  if (
    concurrency.expectedUpdatedAt &&
    actor.requestUpdatedAt &&
    concurrency.expectedUpdatedAt !== actor.requestUpdatedAt
  ) {
    pushIssue(issues, {
      severity: "warning",
      code: "stale_expected_updated_at",
      messageAr: "expectedUpdatedAt لا يطابق الطلب — إجراء قديم محتمل.",
    });
  }

  if (
    concurrency.expectedStepStatus &&
    actor.stepStatus &&
    concurrency.expectedStepStatus !== actor.stepStatus
  ) {
    pushIssue(issues, {
      severity: "warning",
      code: "stale_step_status",
      messageAr: "حالة الخطوة تغيرت — أعد تحميل التفاصيل.",
    });
  }

  if (
    concurrency.clientActionId &&
    concurrency.seenClientActionIds.includes(concurrency.clientActionId)
  ) {
    pushIssue(issues, {
      severity: "warning",
      code: "duplicate_client_action_id",
      messageAr: "clientActionId مكرر — foundation لمنع التكرار (غير persisted).",
    });
  }

  pushIssue(issues, {
    severity: "info",
    code: "concurrency_foundation",
    messageAr: "سيتم تفعيل حماية التزامن الكاملة بعد توصيل RPC التنفيذ.",
  });
}

export function validateStaffActionInput(
  raw: Partial<StudentRequestStaffActionInput> & { action: string },
  actor: StudentRequestActorContext,
  concurrency: StudentRequestConcurrencyContext = {
    expectedUpdatedAt: raw.expectedUpdatedAt ?? null,
    expectedStepStatus: raw.expectedStepStatus ?? null,
    expectedRequestStatus: raw.expectedRequestStatus ?? null,
    clientActionId: raw.clientActionId ?? null,
    seenClientActionIds: [],
  },
): StudentRequestStaffActionResult {
  const capability = validateStaffActionCapability();
  const issues: StudentRequestActionValidationIssue[] = [];
  const normalized = normalizeStaffActionInput(raw);

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

  if (!normalized.action) {
    pushIssue(issues, {
      severity: "error",
      code: "invalid_action",
      messageAr: "نوع الإجراء غير معتمد.",
    });
    return buildStaffActionDryRunResult(null, capability, issues, actor);
  }

  const action = normalized.action;

  if (NOTE_REQUIRED_ACTIONS.has(action) && !normalized.note) {
    pushIssue(issues, {
      severity: "error",
      code: "note_required",
      messageAr: "الملاحظة إلزامية لهذا الإجراء.",
      action,
    });
  }

  if (
    action === "request_completion" &&
    !normalized.note &&
    normalized.completionRequirements.length === 0
  ) {
    pushIssue(issues, {
      severity: "error",
      code: "completion_requirements_required",
      messageAr: "طلب الاستكمال يتطلب ملاحظة أو قائمة استكمال.",
      action,
    });
  }

  validateStaffActionForRole(action, actor, issues);
  validateStaffActionForWorkflowStep(action, actor, issues);
  validateStaffActionTransition(action, actor, issues);
  validateStaffActionConcurrency(concurrency, actor, issues);

  if (action === "add_note" && !normalized.note) {
    pushIssue(issues, {
      severity: "error",
      code: "note_empty",
      messageAr: "أدخل نص الملاحظة.",
      action,
    });
  }

  return buildStaffActionDryRunResult(action, capability, issues, actor);
}

export function buildStaffActionDryRunResult(
  action: StudentRequestActionType | null,
  capability: StudentRequestActionCapability,
  issues: StudentRequestActionValidationIssue[],
  actor: StudentRequestActorContext,
): StudentRequestStaffActionResult {
  const hasErrors = issues.some((i) => i.severity === "error");
  const hasWarnings = issues.some((i) => i.severity === "warning");
  const unauthorized = issues.some(
    (i) => i.code === "inbox_unauthorized" || i.code === "actor_role_mismatch",
  );

  let status: StaffActionDryRunStatus;
  if (unauthorized && hasErrors) {
    status = "UNAUTHORIZED";
  } else if (hasErrors) {
    status = "INVALID";
  } else if (!capability.canExecute) {
    status = hasWarnings ? "VALID_WITH_WARNINGS" : "EXECUTION_UNAVAILABLE";
  } else if (hasWarnings) {
    status = "VALID_WITH_WARNINGS";
  } else {
    status = "VALID";
  }

  const wouldChangeRequestStatus =
    action != null && action !== "add_note" && !hasErrors;

  let summaryAr: string;
  if (status === "UNAUTHORIZED") {
    summaryAr = "غير مصرح — لا يمكن تنفيذ هذا الإجراء.";
  } else if (status === "INVALID") {
    summaryAr = "الإجراء غير صالح — راجع الأخطاء.";
  } else if (action === "add_note") {
    summaryAr = "ملاحظة محلية — لا تغيير في حالة الطلب.";
  } else if (!capability.canExecute) {
    summaryAr = `${STAFF_ACTION_DRY_RUN_SUCCESS_MSG} ${capability.messageAr}`;
  } else {
    summaryAr = STAFF_ACTION_DRY_RUN_SUCCESS_MSG;
  }

  return {
    status,
    valid: !hasErrors && status !== "UNAUTHORIZED",
    action,
    capability,
    issues,
    summaryAr,
    executed: false,
    wouldChangeRequestStatus,
    wouldChangeStepStatus: wouldChangeRequestStatus,
    allowedActionsForStep: getAllowedActionsForStepContext(actor),
  };
}

export function mapAppRolesToProcessingRoleKeys(appRoles: readonly string[]): string[] {
  const keys = new Set<string>();
  for (const r of appRoles) {
    if (APPROVED_ROLE_SET.has(r)) keys.add(r);
    if (r === "dean") keys.add("dean");
    if (r === "department_head") keys.add("department_head");
    if (r === "registrar") keys.add("registrar_general");
    if (r === "student_affairs") {
      keys.add("student_affairs_manager");
      keys.add("student_affairs_specialist");
    }
    if (r === "admin" || r === "system_admin") {
      keys.add("registrar_general");
      keys.add("dean");
    }
  }
  return [...keys];
}

export type StaffActionScenarioResult = {
  id: number;
  name: string;
  expected: string;
  actual: StaffActionDryRunStatus;
  valid: boolean;
};

export function runStaffActionScenarioMatrix(): StaffActionScenarioResult[] {
  const authorizedActor: StudentRequestActorContext = {
    userId: "server-user",
    appRoles: ["dean"],
    processingRoleKeys: ["dean"],
    departmentIds: [],
    isStaffInboxAuthorized: true,
    stepKey: "dean",
    stepRoleKey: "dean",
    stepStatus: "active",
    isCentralSignatoryStep: false,
    isParallelStep: false,
    parallelGroupKey: null,
    parallelGroupComplete: null,
    requestTypeCode: "excused_absence",
    requestStatus: "under_review",
    requestUpdatedAt: "2026-07-07T12:00:00.000Z",
  };

  const unauthorizedActor: StudentRequestActorContext = {
    ...authorizedActor,
    appRoles: ["library_officer"],
    processingRoleKeys: [],
  };

  const centralStepActor: StudentRequestActorContext = {
    ...authorizedActor,
    stepKey: "uni_registrar",
    stepRoleKey: null,
    isCentralSignatoryStep: true,
  };

  const parallelActor: StudentRequestActorContext = {
    ...authorizedActor,
    stepKey: "parallel_finance",
    stepRoleKey: "revenue_finance_officer",
    appRoles: ["student_affairs"],
    processingRoleKeys: ["revenue_finance_officer"],
    isParallelStep: true,
    parallelGroupKey: "clearance",
    parallelGroupComplete: false,
    requestTypeCode: "file_withdrawal",
  };

  const scenarios: Array<{
    id: number;
    name: string;
    expected: string;
    input: Partial<StudentRequestStaffActionInput> & { action: string };
    actor: StudentRequestActorContext;
    concurrency?: StudentRequestConcurrencyContext;
  }> = [
    {
      id: 1,
      name: "approve على خطوة مراجعة",
      expected: "EXECUTION_UNAVAILABLE",
      input: { requestId: "00000000-0000-4000-8000-000000000001", action: "approve" },
      actor: authorizedActor,
    },
    {
      id: 2,
      name: "reject بلا ملاحظة",
      expected: "INVALID",
      input: { requestId: "00000000-0000-4000-8000-000000000001", action: "reject" },
      actor: authorizedActor,
    },
    {
      id: 3,
      name: "reject مع ملاحظة",
      expected: "EXECUTION_UNAVAILABLE",
      input: {
        requestId: "00000000-0000-4000-8000-000000000001",
        action: "reject",
        note: "سبب الرفض",
      },
      actor: authorizedActor,
    },
    {
      id: 4,
      name: "return_to_student بلا ملاحظة",
      expected: "INVALID",
      input: { requestId: "00000000-0000-4000-8000-000000000001", action: "return_to_student" },
      actor: authorizedActor,
    },
    {
      id: 5,
      name: "add_note دون تغيير status",
      expected: "EXECUTION_UNAVAILABLE",
      input: {
        requestId: "00000000-0000-4000-8000-000000000001",
        action: "add_note",
        note: "ملاحظة مراجعة",
      },
      actor: authorizedActor,
    },
    {
      id: 6,
      name: "actor غير مخول",
      expected: "UNAUTHORIZED",
      input: { requestId: "00000000-0000-4000-8000-000000000001", action: "approve" },
      actor: unauthorizedActor,
    },
    {
      id: 7,
      name: "stale expectedUpdatedAt",
      expected: "VALID_WITH_WARNINGS",
      input: {
        requestId: "00000000-0000-4000-8000-000000000001",
        action: "approve",
        expectedUpdatedAt: "2026-07-01T00:00:00.000Z",
      },
      actor: authorizedActor,
      concurrency: {
        expectedUpdatedAt: "2026-07-01T00:00:00.000Z",
        expectedStepStatus: null,
        expectedRequestStatus: null,
        clientActionId: null,
        seenClientActionIds: [],
      },
    },
    {
      id: 8,
      name: "duplicate clientActionId",
      expected: "VALID_WITH_WARNINGS",
      input: {
        requestId: "00000000-0000-4000-8000-000000000001",
        action: "approve",
        clientActionId: "dup-1",
      },
      actor: authorizedActor,
      concurrency: {
        expectedUpdatedAt: null,
        expectedStepStatus: null,
        expectedRequestStatus: null,
        clientActionId: "dup-1",
        seenClientActionIds: ["dup-1"],
      },
    },
    {
      id: 9,
      name: "central_signatory بواسطة موظف كلية",
      expected: "INVALID",
      input: { requestId: "00000000-0000-4000-8000-000000000001", action: "approve" },
      actor: centralStepActor,
    },
    {
      id: 10,
      name: "parallel group غير مكتمل",
      expected: "VALID_WITH_WARNINGS",
      input: { requestId: "00000000-0000-4000-8000-000000000001", action: "approve" },
      actor: parallelActor,
    },
  ];

  return scenarios.map((s) => {
    const result = validateStaffActionInput(
      s.input,
      s.actor,
      s.concurrency ?? {
        expectedUpdatedAt: s.input.expectedUpdatedAt ?? null,
        expectedStepStatus: s.input.expectedStepStatus ?? null,
        expectedRequestStatus: s.input.expectedRequestStatus ?? null,
        clientActionId: s.input.clientActionId ?? null,
        seenClientActionIds: [],
      },
    );
    return {
      id: s.id,
      name: s.name,
      expected: s.expected,
      actual: result.status,
      valid: result.valid,
    };
  });
}
