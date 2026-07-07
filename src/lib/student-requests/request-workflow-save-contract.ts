/**
 * Workflow save contract foundation (P10).
 * Pure normalization/validation — no DB writes, no RPC save, no runtime activation.
 * Preview source: request-workflow-preview-registry.ts (P7).
 */

import type { DraftWorkflowStep, DraftWorkflowTransition } from "@/lib/admin-request-workflow-rpc";
import { ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE } from "@/lib/admin-request-workflow-rpc";
import {
  getCanonicalWorkflowPreview,
  hasCanonicalWorkflowPreview,
  OFFICIAL_WORKFLOW_PREVIEW_CODES,
  type CanonicalWorkflowStepDef,
} from "@/lib/student-requests/request-workflow-preview-registry";
import {
  isLegacyStudentRequestTypeAlias,
  normalizeStudentRequestTypeCode,
} from "@/lib/student-requests/request-type-registry";

/** Approved processing role keys for college staff (not central signatories). */
export const APPROVED_WORKFLOW_ROLE_KEYS = [
  "department_head",
  "dean",
  "student_affairs_manager",
  "student_affairs_specialist",
  "graduate_affairs_manager",
  "graduate_affairs_specialist",
  "registrar_general",
  "revenue_finance_officer",
  "archive_officer",
  "library_officer",
  "labs_manager",
  "lab_custodian",
] as const;

export type ApprovedWorkflowRoleKey = (typeof APPROVED_WORKFLOW_ROLE_KEYS)[number];

export type WorkflowActorType = "student" | "staff" | "central_signatory";

export type WorkflowDepartmentScope = "current" | "target" | null;

export type StudentRequestWorkflowStepInput = {
  stepKey: string;
  sequence: number;
  labelAr: string;
  actorType: WorkflowActorType;
  roleKey: string | null;
  centralSignatoryKey?: string | null;
  departmentScope?: WorkflowDepartmentScope;
  isParallel: boolean;
  parallelGroupKey: string | null;
  requiresFee: boolean;
  requiresAttachmentReview: boolean;
  producesDocument: boolean;
  isFinalApproval: boolean;
  allowsReject: boolean;
  allowsReturn: boolean;
  allowsRequestCompletion: boolean;
  notesAr: string | null;
};

export type StudentRequestWorkflowTransitionInput = {
  fromStepKey: string;
  toStepKey: string;
  action: string;
  conditionKey?: string | null;
  isDefault: boolean;
};

export type StudentRequestWorkflowParallelGroupInput = {
  groupKey: string;
  stepKeys: string[];
  minSteps: number;
};

export type StudentRequestWorkflowSaveInput = {
  requestTypeId: string;
  requestTypeCode: string;
  workflowNameAr: string;
  isActive: boolean;
  configVersion: number;
  expectedUpdatedAt?: string | null;
  steps: StudentRequestWorkflowStepInput[];
  transitions: StudentRequestWorkflowTransitionInput[];
  parallelGroups: StudentRequestWorkflowParallelGroupInput[];
};

export type WorkflowSaveCapabilityReason =
  | "workflow_schema_unavailable"
  | "save_rpc_unavailable"
  | "activation_disabled"
  | "ready_for_staging_save";

export type WorkflowSaveCapability = {
  available: boolean;
  canValidate: boolean;
  canSave: boolean;
  canActivate: boolean;
  reason: WorkflowSaveCapabilityReason;
  messageAr: string;
};

export type WorkflowSaveValidationSeverity = "error" | "warning" | "info";

export type StudentRequestWorkflowValidationIssue = {
  severity: WorkflowSaveValidationSeverity;
  code: string;
  messageAr: string;
  stepKey?: string;
  transitionFrom?: string;
  transitionTo?: string;
};

export type WorkflowSaveDryRunStatus =
  | "VALID"
  | "VALID_WITH_WARNINGS"
  | "INVALID"
  | "SAVE_UNAVAILABLE";

export type StudentRequestWorkflowSaveResult = {
  status: WorkflowSaveDryRunStatus;
  valid: boolean;
  requestTypeCode: string | null;
  capability: WorkflowSaveCapability;
  issues: StudentRequestWorkflowValidationIssue[];
  normalized: StudentRequestWorkflowSaveInput | null;
  summaryAr: string;
};

const APPROVED_ROLE_SET = new Set<string>(APPROVED_WORKFLOW_ROLE_KEYS);

const EXPECTED_ENDING: Readonly<Record<string, "archive" | "registrar">> = {
  enrollment_suspension: "archive",
  grade_statement_non_graduate: "archive",
  enrollment_certificate: "archive",
  file_withdrawal: "archive",
  excused_absence: "archive",
  grade_appeal: "registrar",
  department_transfer: "archive",
  october_exam_entry_form: "archive",
};

/** Preview-only role keys not in approved staff list — documented gaps. */
const PREVIEW_ROLE_GAPS: Readonly<Record<string, string>> = {
  student_affairs: "يُستخدم في المعاينة كتسمية عامة — يُفضّل student_affairs_manager أو student_affairs_specialist عند الحفظ.",
};

function pushIssue(
  issues: StudentRequestWorkflowValidationIssue[],
  issue: StudentRequestWorkflowValidationIssue,
): void {
  issues.push(issue);
}

function inferDepartmentScope(stepKey: string): WorkflowDepartmentScope {
  if (stepKey === "target_dept" || stepKey.includes("target")) return "target";
  if (stepKey === "current_dept" || stepKey.includes("current")) return "current";
  return null;
}

function mapPreviewStepToInput(
  def: CanonicalWorkflowStepDef,
  sequence: number,
): StudentRequestWorkflowStepInput {
  const actorType: WorkflowActorType = def.isCentralSignatory
    ? "central_signatory"
    : def.roleKey === "student"
      ? "student"
      : "staff";

  const isFinalApproval =
    def.roleKey === "registrar_general" &&
    (def.actionType === "approve" || def.actionType === "complete");

  return {
    stepKey: def.key,
    sequence,
    labelAr: def.labelAr,
    actorType,
    roleKey: def.isCentralSignatory ? null : (def.roleKey ?? null),
    centralSignatoryKey: def.centralSignatoryKey ?? null,
    departmentScope: inferDepartmentScope(def.key),
    isParallel: Boolean(def.isParallel),
    parallelGroupKey: def.parallelGroupId ?? null,
    requiresFee: Boolean(def.requiresFee),
    requiresAttachmentReview: def.roleKey === "student" && def.key === "student",
    producesDocument: Boolean(def.issuesDocument),
    isFinalApproval,
    allowsReject: def.roleKey !== "student" && !def.isCentralSignatory,
    allowsReturn: def.roleKey === "student",
    allowsRequestCompletion: def.roleKey === "student",
    notesAr: def.notesAr ?? null,
  };
}

function buildTransitionsFromSteps(steps: StudentRequestWorkflowStepInput[]): StudentRequestWorkflowTransitionInput[] {
  if (steps.length <= 1) return [];

  const transitions: StudentRequestWorkflowTransitionInput[] = [];
  const sorted = [...steps].sort((a, b) => a.sequence - b.sequence || a.stepKey.localeCompare(b.stepKey));

  let i = 0;
  while (i < sorted.length - 1) {
    const current = sorted[i];
    if (current.isParallel && current.parallelGroupKey) {
      const groupKey = current.parallelGroupKey;
      const groupSteps: StudentRequestWorkflowStepInput[] = [];
      while (i < sorted.length && sorted[i].parallelGroupKey === groupKey) {
        groupSteps.push(sorted[i]);
        i++;
      }
      const prev = sorted.find((s) => s.sequence < groupSteps[0].sequence && !s.isParallel) ??
        sorted.find((s) => s.sequence < groupSteps[0].sequence);
      const next = sorted[i];
      if (prev && next) {
        for (const gs of groupSteps) {
          transitions.push({
            fromStepKey: prev.stepKey,
            toStepKey: gs.stepKey,
            action: "approve",
            isDefault: true,
          });
          transitions.push({
            fromStepKey: gs.stepKey,
            toStepKey: next.stepKey,
            action: "approve",
            isDefault: true,
          });
        }
      }
      continue;
    }

    const next = sorted[i + 1];
    if (next && !(next.isParallel && next.parallelGroupKey === current.parallelGroupKey)) {
      transitions.push({
        fromStepKey: current.stepKey,
        toStepKey: next.stepKey,
        action: "approve",
        isDefault: true,
      });
    }
    i++;
  }

  return transitions;
}

function buildParallelGroups(steps: StudentRequestWorkflowStepInput[]): StudentRequestWorkflowParallelGroupInput[] {
  const byGroup = new Map<string, string[]>();
  for (const s of steps) {
    if (!s.parallelGroupKey) continue;
    const list = byGroup.get(s.parallelGroupKey) ?? [];
    list.push(s.stepKey);
    byGroup.set(s.parallelGroupKey, list);
  }
  return [...byGroup.entries()].map(([groupKey, stepKeys]) => ({
    groupKey,
    stepKeys,
    minSteps: 2,
  }));
}

/** Build future save payload from P7 preview registry — no duplicate path definitions. */
export function buildWorkflowSaveInputFromPreview(
  requestTypeId: string,
  requestTypeCode: string,
): StudentRequestWorkflowSaveInput | null {
  const normalized = normalizeStudentRequestTypeCode(requestTypeCode);
  if (!normalized || !hasCanonicalWorkflowPreview(normalized)) return null;

  const preview = getCanonicalWorkflowPreview(normalized);
  if (!preview) return null;

  let seq = 0;
  let lastParallelGroup: string | null = null;
  const steps: StudentRequestWorkflowStepInput[] = [];

  for (const def of preview.steps) {
    if (def.isParallel && def.parallelGroupId) {
      if (def.parallelGroupId !== lastParallelGroup) {
        seq += 1;
        lastParallelGroup = def.parallelGroupId;
      }
    } else {
      seq += 1;
      lastParallelGroup = null;
    }
    steps.push(mapPreviewStepToInput(def, seq));
  }

  const transitions = buildTransitionsFromSteps(steps);
  const parallelGroups = buildParallelGroups(steps);

  return {
    requestTypeId,
    requestTypeCode: normalized,
    workflowNameAr: `دورة حياة — ${preview.requestTypeNameAr}`,
    isActive: false,
    configVersion: 1,
    expectedUpdatedAt: null,
    steps,
    transitions,
    parallelGroups,
  };
}

export function buildWorkflowSaveInputFromDraft(
  requestTypeId: string,
  requestTypeCode: string,
  draftSteps: DraftWorkflowStep[],
  draftTransitions: DraftWorkflowTransition[],
): StudentRequestWorkflowSaveInput {
  const normalized = normalizeStudentRequestTypeCode(requestTypeCode) ?? requestTypeCode.trim();
  const sorted = [...draftSteps].sort((a, b) => a.step_order - b.step_order);

  const steps: StudentRequestWorkflowStepInput[] = sorted.map((d) => ({
    stepKey: d.step_key,
    sequence: d.step_order,
    labelAr: d.step_name_ar,
    actorType: d.step_key === "student" || d.step_order === 1 ? "student" : "staff",
    roleKey: null,
    departmentScope: inferDepartmentScope(d.step_key),
    isParallel: false,
    parallelGroupKey: null,
    requiresFee: d.action_type === "request_payment",
    requiresAttachmentReview: false,
    producesDocument: d.action_type === "issue_document",
    isFinalApproval: d.action_type === "approve" || d.action_type === "complete",
    allowsReject: d.can_reject,
    allowsReturn: d.can_return_to_student,
    allowsRequestCompletion: d.can_return_to_student,
    notesAr: null,
  }));

  const transitions: StudentRequestWorkflowTransitionInput[] = draftTransitions
    .filter((t) => t.from_step_key && t.to_step_key)
    .map((t) => ({
      fromStepKey: t.from_step_key!,
      toStepKey: t.to_step_key!,
      action: t.action_result || "approve",
      isDefault: t.is_default,
    }));

  if (transitions.length === 0 && steps.length > 1) {
    transitions.push(
      ...buildTransitionsFromSteps(steps),
    );
  }

  return {
    requestTypeId,
    requestTypeCode: normalized,
    workflowNameAr: `دورة حياة — ${normalized}`,
    isActive: false,
    configVersion: 1,
    steps,
    transitions,
    parallelGroups: buildParallelGroups(steps),
  };
}

export function normalizeWorkflowSaveInput(
  raw: Partial<StudentRequestWorkflowSaveInput>,
): StudentRequestWorkflowSaveInput {
  const requestTypeCode =
    normalizeStudentRequestTypeCode(raw.requestTypeCode) ?? (raw.requestTypeCode ?? "").trim();

  const steps = (raw.steps ?? []).map((s) => ({
    stepKey: s.stepKey.trim(),
    sequence: s.sequence,
    labelAr: s.labelAr.trim(),
    actorType: s.actorType,
    roleKey: s.roleKey?.trim() || null,
    centralSignatoryKey: s.centralSignatoryKey?.trim() || null,
    departmentScope: s.departmentScope ?? inferDepartmentScope(s.stepKey),
    isParallel: Boolean(s.isParallel),
    parallelGroupKey: s.parallelGroupKey?.trim() || null,
    requiresFee: Boolean(s.requiresFee),
    requiresAttachmentReview: Boolean(s.requiresAttachmentReview),
    producesDocument: Boolean(s.producesDocument),
    isFinalApproval: Boolean(s.isFinalApproval),
    allowsReject: Boolean(s.allowsReject),
    allowsReturn: Boolean(s.allowsReturn),
    allowsRequestCompletion: Boolean(s.allowsRequestCompletion),
    notesAr: s.notesAr?.trim() || null,
  }));

  const transitions = (raw.transitions ?? []).map((t) => ({
    fromStepKey: t.fromStepKey.trim(),
    toStepKey: t.toStepKey.trim(),
    action: (t.action ?? "approve").trim(),
    conditionKey: t.conditionKey?.trim() || null,
    isDefault: Boolean(t.isDefault),
  }));

  return {
    requestTypeId: (raw.requestTypeId ?? "").trim(),
    requestTypeCode,
    workflowNameAr: (raw.workflowNameAr ?? "").trim() || `دورة حياة — ${requestTypeCode}`,
    isActive: Boolean(raw.isActive),
    configVersion: raw.configVersion ?? 1,
    expectedUpdatedAt: raw.expectedUpdatedAt ?? null,
    steps,
    transitions,
    parallelGroups: raw.parallelGroups ?? buildParallelGroups(steps),
  };
}

export function validateWorkflowSaveCapability(): WorkflowSaveCapability {
  if (!ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE) {
    return {
      available: false,
      canValidate: true,
      canSave: false,
      canActivate: false,
      reason: "save_rpc_unavailable",
      messageAr:
        "حفظ دورة الحياة يحتاج تطبيق مخطط طلبات الطلاب على بيئة آمنة أولاً.",
    };
  }
  return {
    available: true,
    canValidate: true,
    canSave: true,
    canActivate: false,
    reason: "activation_disabled",
    messageAr: "التحقق متاح — التفعيل معطّل في هذه المرحلة.",
  };
}

export function validateWorkflowActors(
  input: StudentRequestWorkflowSaveInput,
  issues: StudentRequestWorkflowValidationIssue[],
): void {
  for (const step of input.steps) {
    if (step.actorType === "student") {
      if (step.roleKey && step.roleKey !== "student") {
        pushIssue(issues, {
          severity: "warning",
          code: "student_step_role",
          messageAr: `خطوة الطالب لا تحتاج roleKey — ${step.stepKey}`,
          stepKey: step.stepKey,
        });
      }
      continue;
    }

    if (step.actorType === "central_signatory") {
      if (step.roleKey) {
        pushIssue(issues, {
          severity: "error",
          code: "central_has_staff_role",
          messageAr: `الجهة المركزية «${step.labelAr}» لا يجب أن تُربط بدور موظف داخل الكلية.`,
          stepKey: step.stepKey,
        });
      }
      if (!step.centralSignatoryKey) {
        pushIssue(issues, {
          severity: "error",
          code: "missing_central_key",
          messageAr: `خطوة جهة مركزية بلا مرجع: ${step.labelAr}`,
          stepKey: step.stepKey,
        });
      }
      continue;
    }

    if (!step.roleKey) {
      pushIssue(issues, {
        severity: "error",
        code: "missing_role_key",
        messageAr: `خطوة الموظف «${step.labelAr}» بلا roleKey.`,
        stepKey: step.stepKey,
      });
      continue;
    }

    if (step.roleKey === "student") {
      pushIssue(issues, {
        severity: "error",
        code: "student_as_staff_role",
        messageAr: "لا يُسمح بدور student كموظف معالج.",
        stepKey: step.stepKey,
      });
    }

    if (!APPROVED_ROLE_SET.has(step.roleKey)) {
      const gap = PREVIEW_ROLE_GAPS[step.roleKey];
      pushIssue(issues, {
        severity: gap ? "warning" : "error",
        code: gap ? "preview_role_gap" : "unapproved_role_key",
        messageAr: gap ?? `roleKey غير معتمد: ${step.roleKey}`,
        stepKey: step.stepKey,
      });
    }
  }
}

export function validateParallelGroups(
  input: StudentRequestWorkflowSaveInput,
  issues: StudentRequestWorkflowValidationIssue[],
): void {
  for (const group of input.parallelGroups) {
    if (group.stepKeys.length < group.minSteps) {
      pushIssue(issues, {
        severity: "error",
        code: "parallel_group_too_small",
        messageAr: `مجموعة التوازي «${group.groupKey}» تحتاج ${group.minSteps} خطوات على الأقل (الموجود: ${group.stepKeys.length}).`,
      });
    }
  }

  const seqByKey = new Map(input.steps.map((s) => [s.stepKey, s.sequence]));
  for (const step of input.steps.filter((s) => s.isParallel)) {
    const peers = input.steps.filter(
      (p) => p.parallelGroupKey === step.parallelGroupKey && p.isParallel,
    );
    const seqs = new Set(peers.map((p) => p.sequence));
    if (seqs.size > 1) {
      pushIssue(issues, {
        severity: "error",
        code: "parallel_sequence_mismatch",
        messageAr: `خطوات المجموعة «${step.parallelGroupKey}» يجب أن تشترك في نفس الترتيب.`,
        stepKey: step.stepKey,
      });
      break;
    }
    if (!seqByKey.has(step.stepKey)) {
      pushIssue(issues, {
        severity: "error",
        code: "parallel_orphan",
        messageAr: `خطوة توازي بلا تعريف: ${step.stepKey}`,
        stepKey: step.stepKey,
      });
    }
  }
}

function detectTransitionCycles(
  transitions: StudentRequestWorkflowTransitionInput[],
  stepKeys: Set<string>,
): string[][] {
  const adj = new Map<string, string[]>();
  for (const t of transitions) {
    if (!stepKeys.has(t.fromStepKey) || !stepKeys.has(t.toStepKey)) continue;
    const list = adj.get(t.fromStepKey) ?? [];
    list.push(t.toStepKey);
    adj.set(t.fromStepKey, list);
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): void {
    visited.add(node);
    stack.add(node);
    path.push(node);
    for (const next of adj.get(node) ?? []) {
      if (!visited.has(next)) {
        dfs(next);
      } else if (stack.has(next)) {
        const idx = path.indexOf(next);
        if (idx >= 0) cycles.push([...path.slice(idx), next]);
      }
    }
    path.pop();
    stack.delete(node);
  }

  for (const key of stepKeys) {
    if (!visited.has(key)) dfs(key);
  }
  return cycles;
}

export function validateWorkflowTransitions(
  input: StudentRequestWorkflowSaveInput,
  issues: StudentRequestWorkflowValidationIssue[],
): void {
  const stepKeys = new Set(input.steps.map((s) => s.stepKey));

  for (const t of input.transitions) {
    if (!stepKeys.has(t.fromStepKey)) {
      pushIssue(issues, {
        severity: "error",
        code: "transition_from_missing",
        messageAr: `انتقال من خطوة غير موجودة: ${t.fromStepKey}`,
        transitionFrom: t.fromStepKey,
      });
    }
    if (!stepKeys.has(t.toStepKey)) {
      pushIssue(issues, {
        severity: "error",
        code: "transition_to_missing",
        messageAr: `انتقال إلى خطوة غير موجودة: ${t.toStepKey}`,
        transitionTo: t.toStepKey,
      });
    }
  }

  const cycles = detectTransitionCycles(input.transitions, stepKeys);
  for (const cycle of cycles) {
    if (cycle.length > 2) {
      pushIssue(issues, {
        severity: "error",
        code: "transition_cycle",
        messageAr: `انتقال دائري غير مقصود: ${cycle.join(" → ")}`,
      });
    }
  }
}

function validateTypeSpecificRules(
  input: StudentRequestWorkflowSaveInput,
  issues: StudentRequestWorkflowValidationIssue[],
): void {
  const code = input.requestTypeCode;
  const keys = new Set(input.steps.map((s) => s.stepKey));

  if (code === "file_withdrawal") {
    const clearance = input.steps.filter((s) => s.parallelGroupKey === "clearance");
    if (clearance.length < 4) {
      pushIssue(issues, {
        severity: "error",
        code: "file_withdrawal_clearance",
        messageAr: `سحب الملف يتطلب 4 جهات توازي في مجموعة clearance (الموجود: ${clearance.length}).`,
      });
    }
    const activities = clearance.find((s) => s.stepKey.includes("activities"));
    if (activities?.roleKey && !APPROVED_ROLE_SET.has(activities.roleKey)) {
      pushIssue(issues, {
        severity: "warning",
        code: "student_activities_role_gap",
        messageAr:
          "الأنشطة الطلابية في إخلاء الطرف — لا يوجد app_role مخصص؛ يُستخدم student_affairs كتسمية مؤقتة.",
        stepKey: activities.stepKey,
      });
    }
  }

  if (code === "grade_statement_non_graduate") {
    const hasCentral = input.steps.some(
      (s) =>
        s.actorType === "central_signatory" &&
        s.centralSignatoryKey === "university_registrar_general",
    );
    if (!hasCentral) {
      pushIssue(issues, {
        severity: "error",
        code: "grade_statement_central",
        messageAr: "شهادة التقديرات تتطلب جهة مركزية: مسجل الجامعة العام.",
      });
    }
  }

  if (code === "department_transfer") {
    if (!keys.has("target_dept")) {
      pushIssue(issues, {
        severity: "error",
        code: "transfer_target_dept",
        messageAr: "تحويل القسم يتطلب خطوة رئيس القسم المطلوب.",
      });
    }
    if (!keys.has("current_dept")) {
      pushIssue(issues, {
        severity: "error",
        code: "transfer_current_dept",
        messageAr: "تحويل القسم يتطلب خطوة رئيس القسم الحالي.",
      });
    }
  }

  const expectedEnd = EXPECTED_ENDING[code];
  if (expectedEnd) {
    const last = [...input.steps].sort((a, b) => b.sequence - a.sequence)[0];
    if (last) {
      if (expectedEnd === "archive" && last.roleKey !== "archive_officer" && last.stepKey !== "archive") {
        pushIssue(issues, {
          severity: "warning",
          code: "unexpected_ending",
          messageAr: "المسار المرجعي ينتهي بالأرشيف — تحقق من الخطوة الأخيرة.",
          stepKey: last.stepKey,
        });
      }
      if (expectedEnd === "registrar" && last.roleKey !== "registrar_general") {
        pushIssue(issues, {
          severity: "warning",
          code: "unexpected_ending_registrar",
          messageAr: "مسار التظلم ينتهي عند مسجل الكلية.",
          stepKey: last.stepKey,
        });
      }
    }
  }
}

export function validateWorkflowSaveInput(
  raw: Partial<StudentRequestWorkflowSaveInput>,
): StudentRequestWorkflowSaveResult {
  const capability = validateWorkflowSaveCapability();
  const issues: StudentRequestWorkflowValidationIssue[] = [];

  if (!raw.requestTypeId?.trim()) {
    pushIssue(issues, {
      severity: "error",
      code: "missing_request_type_id",
      messageAr: "معرّف نوع الطلب مطلوب.",
    });
  }

  const normalized = normalizeWorkflowSaveInput(raw);

  if (isLegacyStudentRequestTypeAlias(normalized.requestTypeCode)) {
    pushIssue(issues, {
      severity: "error",
      code: "alias_workflow",
      messageAr: "لا يُنشأ workflow مستقل لأكواد alias — استخدم الكود المعياري.",
    });
  }

  if (!hasCanonicalWorkflowPreview(normalized.requestTypeCode)) {
    pushIssue(issues, {
      severity: "warning",
      code: "no_canonical_preview",
      messageAr: "نوع الطلب خارج الأنواع الثمانية — لا يوجد مسار مرجعي.",
    });
  }

  if (normalized.steps.length === 0) {
    pushIssue(issues, {
      severity: "error",
      code: "empty_steps",
      messageAr: "لا توجد خطوات في التكوين.",
    });
  }

  const stepKeys = new Set<string>();
  const sequences = new Map<number, string[]>();

  for (const step of normalized.steps) {
    if (!step.stepKey) {
      pushIssue(issues, {
        severity: "error",
        code: "empty_step_key",
        messageAr: "مفتاح خطوة فارغ.",
      });
      continue;
    }
    if (stepKeys.has(step.stepKey)) {
      pushIssue(issues, {
        severity: "error",
        code: "duplicate_step_key",
        messageAr: `مفتاح خطوة مكرر: ${step.stepKey}`,
        stepKey: step.stepKey,
      });
    }
    stepKeys.add(step.stepKey);

    const list = sequences.get(step.sequence) ?? [];
    list.push(step.stepKey);
    sequences.set(step.sequence, list);

    if (!step.labelAr) {
      pushIssue(issues, {
        severity: "error",
        code: "empty_label",
        messageAr: `الخطوة ${step.stepKey} بلا تسمية عربية.`,
        stepKey: step.stepKey,
      });
    }
  }

  const sorted = [...normalized.steps].sort((a, b) => a.sequence - b.sequence);
  const first = sorted[0];
  if (first && first.actorType !== "student" && first.roleKey !== "student") {
    pushIssue(issues, {
      severity: "error",
      code: "must_start_with_student",
      messageAr: "يجب أن تبدأ دورة الحياة بخطوة الطالب.",
      stepKey: first.stepKey,
    });
  }

  for (const [seq, keys] of sequences) {
    if (keys.length > 1) {
      const parallelOk = keys.every((k) => {
        const s = normalized.steps.find((x) => x.stepKey === k);
        return s?.isParallel && s.parallelGroupKey;
      });
      if (!parallelOk) {
        pushIssue(issues, {
          severity: "error",
          code: "duplicate_sequence",
          messageAr: `ترتيب ${seq} مكرر خارج مجموعة توازي صحيحة.`,
        });
      }
    }
  }

  const finalApprovals = normalized.steps.filter((s) => s.isFinalApproval);
  if (finalApprovals.length === 0) {
    pushIssue(issues, {
      severity: "warning",
      code: "no_final_approval",
      messageAr: "لا توجد خطوة اعتماد نهائي واضحة (isFinalApproval).",
    });
  } else if (finalApprovals.length > 1) {
    pushIssue(issues, {
      severity: "warning",
      code: "multiple_final_approval",
      messageAr: `عدة خطوات اعتماد نهائي: ${finalApprovals.map((s) => s.labelAr).join("، ")}`,
    });
  }

  validateWorkflowActors(normalized, issues);
  validateParallelGroups(normalized, issues);
  validateWorkflowTransitions(normalized, issues);
  validateTypeSpecificRules(normalized, issues);

  const hasErrors = issues.some((i) => i.severity === "error");
  const hasWarnings = issues.some((i) => i.severity === "warning");

  let status: WorkflowSaveDryRunStatus;
  if (!capability.canSave) {
    status = hasErrors ? "INVALID" : hasWarnings ? "VALID_WITH_WARNINGS" : "SAVE_UNAVAILABLE";
  } else if (hasErrors) {
    status = "INVALID";
  } else if (hasWarnings) {
    status = "VALID_WITH_WARNINGS";
  } else {
    status = "VALID";
  }

  const valid = !hasErrors;

  const summaryAr = !capability.canSave
    ? hasErrors
      ? "التكوين غير صالح — الحفظ غير متاح حالياً."
      : hasWarnings
        ? "التكوين صالح مع تحذيرات — الحفظ غير متاح حالياً."
        : "التكوين صالح — الحفظ غير متاح حتى تطبيق المخطط على بيئة آمنة."
    : hasErrors
      ? "التكوين غير صالح."
      : hasWarnings
        ? "التكوين صالح مع تحذيرات."
        : "التكوين صالح.";

  return {
    status,
    valid,
    requestTypeCode: normalized.requestTypeCode || null,
    capability,
    issues,
    normalized: valid || !hasErrors ? normalized : normalized,
    summaryAr,
  };
}

export type CanonicalTypeSaveValidation = {
  code: string;
  buildable: boolean;
  valid: boolean;
  status: WorkflowSaveDryRunStatus;
  stepCount: number;
  errorCount: number;
  warningCount: number;
  issues: string[];
};

/** Validate save contract build + rules for all eight official types from preview. */
export function validateAllCanonicalWorkflowSaveContracts(
  placeholderRequestTypeId = "00000000-0000-4000-8000-000000000001",
): CanonicalTypeSaveValidation[] {
  return OFFICIAL_WORKFLOW_PREVIEW_CODES.map((code) => {
    const built = buildWorkflowSaveInputFromPreview(placeholderRequestTypeId, code);
    if (!built) {
      return {
        code,
        buildable: false,
        valid: false,
        status: "INVALID" as const,
        stepCount: 0,
        errorCount: 1,
        warningCount: 0,
        issues: ["تعذر بناء العقد من المعاينة"],
      };
    }
    const result = validateWorkflowSaveInput(built);
    return {
      code,
      buildable: true,
      valid: result.valid,
      status: result.status,
      stepCount: built.steps.length,
      errorCount: result.issues.filter((i) => i.severity === "error").length,
      warningCount: result.issues.filter((i) => i.severity === "warning").length,
      issues: result.issues.map((i) => `[${i.severity}] ${i.messageAr}`),
    };
  });
}
