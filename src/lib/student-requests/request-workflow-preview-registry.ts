/**
 * Canonical workflow preview registry (P7).
 * Single source for expected lifecycle paths — preview/display only, no DB seed.
 * Spec: docs/STUDENT-REQUESTS-WORKFLOW-CANONICAL-SPEC-01.md §6
 */

import type { WorkflowActionType } from "@/lib/admin-request-workflow-rpc";
import {
  getStudentRequestTypeDefinition,
  normalizeStudentRequestTypeCode,
} from "@/lib/student-requests/request-type-registry";
import { B1_WORKFLOWS, type B1CanonicalCode } from "@/lib/student-requests/request-service-adapter";

export type PreviewWorkflowTimelineStep = {
  id: string;
  stepKey: string;
  labelAr: string;
  roleKey: string | null;
  roleLabelAr: string | null;
  status: "completed" | "current" | "upcoming" | "expected" | "skipped";
  isParallel?: boolean;
  isCentralSignatory?: boolean;
  isPreview?: boolean;
  enteredAt: string | null;
  completedAt: string | null;
  notes: string | null;
};

export type CanonicalWorkflowStepDef = {
  key: string;
  labelAr: string;
  roleKey?: string;
  processingUnitCode?: string;
  actionType?: WorkflowActionType;
  isParallel?: boolean;
  parallelGroupId?: string;
  isCentralSignatory?: boolean;
  centralSignatoryKey?: string;
  requiresFee?: boolean;
  issuesDocument?: boolean;
  isArchiveStep?: boolean;
  studentVisibleLabelAr?: string;
  notesAr?: string;
};

export type CanonicalWorkflowPreview = {
  requestTypeCode: string;
  requestTypeNameAr: string;
  steps: readonly CanonicalWorkflowStepDef[];
  specNotesAr: readonly string[];
};

const ROLE_LABELS_AR: Readonly<Record<string, string>> = {
  student: "الطالب",
  department_head: "رئيس القسم",
  dean: "العميد",
  student_affairs: "شؤون الطلاب",
  student_affairs_manager: "مدير شؤون الطلاب",
  student_affairs_specialist: "مختص شؤون الطلاب",
  graduate_affairs_manager: "مدير شؤون الخريجين",
  registrar_general: "مسجل الكلية",
  revenue_finance_officer: "مسؤول الإيرادات والمالية",
  archive_officer: "مسؤول الأرشيف",
  library_officer: "مسؤول المكتبة",
  labs_manager: "مدير المعامل",
};

const CENTRAL_LABELS_AR: Readonly<Record<string, string>> = {
  university_registrar_general: "مسجل الجامعة العام (جهة مركزية)",
  university_vp_student_affairs: "نائب رئيس الجامعة لشؤون الطلاب (جهة مركزية)",
};

/** Shown when workflow schema/RPC is unavailable — preview remains static. */
export const WORKFLOW_SCHEMA_UNAVAILABLE_MSG =
  "تفعيل وحفظ دورة الحياة يحتاج تطبيق مخطط طلبات الطلاب أولاً.";

/** Official eight canonical codes — aliases resolve via normalizeStudentRequestTypeCode. */
export const OFFICIAL_WORKFLOW_PREVIEW_CODES = [
  "enrollment_suspension",
  "grade_statement_non_graduate",
  "enrollment_certificate",
  "file_withdrawal",
  "excused_absence",
  "grade_appeal",
  "department_transfer",
  "october_exam_entry_form",
] as const;

export type OfficialWorkflowPreviewCode = (typeof OFFICIAL_WORKFLOW_PREVIEW_CODES)[number];

const PREVIEW_BY_CODE: Readonly<Record<string, CanonicalWorkflowPreview>> = {
  enrollment_suspension: {
    requestTypeCode: "enrollment_suspension",
    requestTypeNameAr: "وقف القيد",
    specNotesAr: ["رسوم عند مدير شؤون الطلاب", "اعتماد نهائي عند مسجل الكلية"],
    steps: [
      { key: "student", labelAr: "الطالب", roleKey: "student", actionType: "review" },
      { key: "dept_head", labelAr: "رئيس القسم", roleKey: "department_head", processingUnitCode: "department_chair", actionType: "review" },
      { key: "dean", labelAr: "العميد", roleKey: "dean", processingUnitCode: "dean", actionType: "approve" },
      { key: "sa_mgr", labelAr: "مدير شؤون الطلاب", roleKey: "student_affairs_manager", processingUnitCode: "student_affairs", actionType: "request_payment", requiresFee: true },
      { key: "finance", labelAr: "المالية", roleKey: "revenue_finance_officer", processingUnitCode: "finance", actionType: "review" },
      { key: "registrar", labelAr: "مسجل الكلية", roleKey: "registrar_general", processingUnitCode: "registrar", actionType: "approve", issuesDocument: true },
      { key: "archive", labelAr: "الأرشيف", roleKey: "archive_officer", processingUnitCode: "archive", actionType: "archive", isArchiveStep: true },
    ],
  },
  grade_statement_non_graduate: {
    requestTypeCode: "grade_statement_non_graduate",
    requestTypeNameAr: "شهادة تقديرات لغير الخريجين",
    specNotesAr: ["جهة مركزية: مسجل الجامعة العام", "توقيع نائب رئيس الجامعة لشؤون الطلاب على النموذج"],
    steps: [
      { key: "student", labelAr: "الطالب", roleKey: "student" },
      { key: "sa_mgr", labelAr: "مدير شؤون الطلاب", roleKey: "student_affairs_manager", requiresFee: true },
      { key: "finance", labelAr: "المالية", roleKey: "revenue_finance_officer" },
      { key: "grad_mgr", labelAr: "مدير شؤون الخريجين", roleKey: "graduate_affairs_manager" },
      {
        key: "uni_registrar",
        labelAr: "مسجل الجامعة العام",
        isCentralSignatory: true,
        centralSignatoryKey: "university_registrar_general",
      },
      { key: "dean", labelAr: "العميد", roleKey: "dean", notesAr: "اعتماد آلي" },
      { key: "registrar", labelAr: "مسجل الكلية", roleKey: "registrar_general", actionType: "issue_document", issuesDocument: true },
      { key: "archive", labelAr: "الأرشيف", roleKey: "archive_officer", actionType: "archive", isArchiveStep: true },
    ],
  },
  enrollment_certificate: {
    requestTypeCode: "enrollment_certificate",
    requestTypeNameAr: "شهادة قيد",
    specNotesAr: [
      "الاعتماد داخل الكلية فقط — بدون مسجل الجامعة العام",
      "تقييم الرسوم: fee_not_required يتخطى payment_confirmation",
    ],
    steps: [
      {
        key: "initial_review",
        labelAr: "المراجعة الأولية",
        roleKey: "student_affairs_specialist",
        processingUnitCode: "student_affairs",
        actionType: "review",
      },
      {
        key: "fee_assessment",
        labelAr: "تقييم الرسوم",
        roleKey: "student_affairs_manager",
        processingUnitCode: "student_affairs",
        actionType: "assess_fee",
        requiresFee: true,
      },
      {
        key: "payment_confirmation",
        labelAr: "تأكيد الدفع",
        roleKey: "revenue_finance_officer",
        processingUnitCode: "finance",
        actionType: "confirm_payment",
      },
      {
        key: "registrar_signature",
        labelAr: "توقيع مسجل الكلية",
        roleKey: "registrar_general",
        processingUnitCode: "registrar",
        actionType: "sign",
      },
      {
        key: "dean_signature",
        labelAr: "توقيع العميد",
        roleKey: "dean",
        processingUnitCode: "dean",
        actionType: "sign",
        notesAr: "اعتماد آلي",
      },
      {
        key: "document_issuance",
        labelAr: "إصدار الوثيقة",
        roleKey: "student_affairs_specialist",
        processingUnitCode: "student_affairs",
        actionType: "issue_document",
        issuesDocument: true,
      },
      {
        key: "archive",
        labelAr: "الأرشيف",
        roleKey: "archive_officer",
        processingUnitCode: "archive",
        actionType: "archive",
        isArchiveStep: true,
      },
    ],
  },
  file_withdrawal: {
    requestTypeCode: "file_withdrawal",
    requestTypeNameAr: "سحب ملف",
    specNotesAr: [
      "المخالصات متتابعة، وكل خطوة مقيدة بالتعيين المباشر والوحدة والدور المحددين.",
      "الخدمة مجانية ولا تنشئ وثيقة أو PDF أو ملف تخزين.",
    ],
    steps: [
      { key: "student_affairs_intake", labelAr: "استلام شؤون الطلاب", roleKey: "student_affairs_specialist", processingUnitCode: "student_affairs", actionType: "review" },
      { key: "library_clearance", labelAr: "مخالصة المكتبة", roleKey: "library_officer", processingUnitCode: "library", actionType: "clear" },
      { key: "labs_clearance", labelAr: "مخالصة المعامل", roleKey: "labs_manager", processingUnitCode: "labs", actionType: "clear" },
      { key: "activities_clearance", labelAr: "مخالصة الأنشطة الطلابية", roleKey: "student_affairs_manager", processingUnitCode: "student_affairs", actionType: "clear" },
      { key: "finance_clearance", labelAr: "المخالصة المالية", roleKey: "revenue_finance_officer", processingUnitCode: "finance", actionType: "clear" },
      { key: "registrar_apply", labelAr: "تطبيق قرار المسجل", roleKey: "registrar_general", processingUnitCode: "registrar", actionType: "apply_decision" },
      { key: "archive", labelAr: "الأرشيف", roleKey: "archive_officer", processingUnitCode: "archive", actionType: "archive", isArchiveStep: true },
    ],
  },
  excused_absence: {
    requestTypeCode: "excused_absence",
    requestTypeNameAr: "غياب بعذر",
    specNotesAr: ["مرفقات إلزامية من الطالب"],
    steps: [
      { key: "student", labelAr: "الطالب", roleKey: "student" },
      { key: "dean", labelAr: "العميد", roleKey: "dean" },
      { key: "sa", labelAr: "شؤون الطلاب", roleKey: "student_affairs", requiresFee: true },
      { key: "finance", labelAr: "المالية", roleKey: "revenue_finance_officer" },
      { key: "registrar", labelAr: "مسجل الكلية", roleKey: "registrar_general", actionType: "issue_document", issuesDocument: true },
      { key: "archive", labelAr: "الأرشيف", roleKey: "archive_officer", actionType: "archive", isArchiveStep: true },
    ],
  },
  grade_appeal: {
    requestTypeCode: "grade_appeal",
    requestTypeNameAr: "تظلم",
    specNotesAr: ["كشف تظلمات جماعي في نهاية الفترة"],
    steps: [
      { key: "student", labelAr: "الطالب", roleKey: "student" },
      { key: "sa", labelAr: "شؤون الطلاب", roleKey: "student_affairs", requiresFee: true },
      { key: "finance", labelAr: "المالية", roleKey: "revenue_finance_officer" },
      { key: "registrar", labelAr: "مسجل الكلية", roleKey: "registrar_general", actionType: "complete", issuesDocument: true },
    ],
  },
  department_transfer: {
    requestTypeCode: "department_transfer",
    requestTypeNameAr: "تحويل من قسم إلى قسم",
    specNotesAr: ["واجهة مقاصة عند رئيس القسم الهدف", "تحديث القسم/البرنامج عند مسجل الكلية"],
    steps: [
      { key: "student", labelAr: "الطالب", roleKey: "student" },
      { key: "target_dept", labelAr: "رئيس القسم المطلوب", roleKey: "department_head" },
      { key: "dean", labelAr: "العميد", roleKey: "dean" },
      { key: "equiv_dept", labelAr: "رئيس القسم المطلوب (معادلة)", roleKey: "department_head" },
      { key: "current_dept", labelAr: "رئيس القسم الحالي", roleKey: "department_head" },
      { key: "sa", labelAr: "شؤون الطلاب", roleKey: "student_affairs", requiresFee: true },
      { key: "finance", labelAr: "المالية", roleKey: "revenue_finance_officer" },
      { key: "registrar", labelAr: "مسجل الكلية", roleKey: "registrar_general", issuesDocument: true },
      { key: "archive", labelAr: "الأرشيف", roleKey: "archive_officer", actionType: "archive", isArchiveStep: true },
    ],
  },
  october_exam_entry_form: {
    requestTypeCode: "october_exam_entry_form",
    requestTypeNameAr: "استمارة دخول دور أكتوبر",
    specNotesAr: ["تصدير تقارير لرؤساء الأقسام في نهاية الفترة"],
    steps: [
      { key: "student", labelAr: "الطالب", roleKey: "student" },
      { key: "sa_1", labelAr: "شؤون الطلاب", roleKey: "student_affairs", requiresFee: true },
      { key: "finance", labelAr: "المالية", roleKey: "revenue_finance_officer" },
      { key: "sa_2", labelAr: "شؤون الطلاب (مراجعة)", roleKey: "student_affairs" },
      { key: "registrar", labelAr: "مسجل الكلية", roleKey: "registrar_general", actionType: "issue_document", issuesDocument: true },
      { key: "archive", labelAr: "الأرشيف", roleKey: "archive_officer", actionType: "archive", isArchiveStep: true },
    ],
  },
};

export const CANONICAL_WORKFLOW_PREVIEW_CODES = Object.freeze(
  [...new Set([...Object.keys(PREVIEW_BY_CODE), ...Object.keys(B1_WORKFLOWS)])],
) as readonly string[];

const B1_LABELS_AR: Readonly<Record<string, string>> = {
  initial_review: "المراجعة الأولية",
  manager_approval: "اعتماد مدير شؤون الطلاب",
  registrar_apply: "تطبيق قرار المسجل",
  student_affairs_intake: "استقبال شؤون الطلاب",
  manager_review: "مراجعة مدير شؤون الطلاب",
  record_apply: "تطبيق العذر في السجل",
  library_clearance: "مخالصة المكتبة",
  labs_clearance: "مخالصة المعامل",
  activities_clearance: "مخالصة الأنشطة",
  finance_clearance: "المخالصة المالية الخارجية",
  archive: "الأرشفة",
  source_department_head_approval: "اعتماد رئيس القسم الحالي",
  target_department_head_approval: "اعتماد رئيس القسم المطلوب",
  dean_approval: "اعتماد العميد",
  dean_decision: "قرار العميد",
  fee_assessment: "تحديد استحقاق الرسم الخارجي",
  payment_confirmation: "تأكيد السداد الخارجي",
};

function getB1WorkflowPreview(code: string): CanonicalWorkflowPreview | undefined {
  const steps = B1_WORKFLOWS[code as B1CanonicalCode];
  if (!steps) return undefined;
  return {
    requestTypeCode: code,
    requestTypeNameAr: getStudentRequestTypeDefinition(code)?.nameAr ?? code,
    steps: steps.map((step) => ({
      key: step.key,
      labelAr: B1_LABELS_AR[step.key] ?? step.key,
      roleKey: step.role,
      processingUnitCode: step.unit,
      actionType: step.action,
      requiresFee: step.key === "fee_assessment" || step.key === "payment_confirmation",
      isArchiveStep: step.action === "archive",
    })),
    specNotesAr: B1_WORKFLOWS[code as B1CanonicalCode] === B1_WORKFLOWS.department_transfer
      || B1_WORKFLOWS[code as B1CanonicalCode] === B1_WORKFLOWS.final_chance
      ? ["السداد خارجي والتأكيد يدوي؛ التفعيل محجوز حتى اعتماد fee_type.code"]
      : ["لا رسوم ولا مستندات لهذه الخدمة"],
  };
}

/** Alias codes must not have standalone preview entries. */
export function isAliasOnlyRequestTypeCode(code: string): boolean {
  const normalized = normalizeStudentRequestTypeCode(code);
  return normalized != null && normalized !== code.trim() && !(code.trim() in PREVIEW_BY_CODE);
}

export function hasCanonicalWorkflowPreview(code: string | null | undefined): boolean {
  const normalized = normalizeStudentRequestTypeCode(code);
  return normalized != null && (normalized in PREVIEW_BY_CODE || normalized in B1_WORKFLOWS);
}

export function getCanonicalWorkflowPreview(
  code: string | null | undefined,
): CanonicalWorkflowPreview | undefined {
  const normalized = normalizeStudentRequestTypeCode(code);
  if (!normalized) return undefined;
  const b1 = getB1WorkflowPreview(normalized);
  if (b1) return b1;
  const base = PREVIEW_BY_CODE[normalized];
  if (!base) return undefined;
  const def = getStudentRequestTypeDefinition(normalized);
  return {
    ...base,
    requestTypeNameAr: def?.nameAr ?? base.requestTypeNameAr,
  };
}

export function getPreviewRoleLabelAr(roleKey: string | null | undefined): string {
  const k = (roleKey ?? "").trim();
  if (!k) return "—";
  return ROLE_LABELS_AR[k] ?? k;
}

export function getPreviewCentralLabelAr(key: string | null | undefined): string {
  const k = (key ?? "").trim();
  if (!k) return "—";
  return CENTRAL_LABELS_AR[k] ?? k;
}

export function getPreviewStepActorLabel(step: CanonicalWorkflowStepDef): string {
  if (step.isCentralSignatory && step.centralSignatoryKey) {
    return getPreviewCentralLabelAr(step.centralSignatoryKey);
  }
  if (step.roleKey) return getPreviewRoleLabelAr(step.roleKey);
  return step.labelAr;
}

/** Map canonical preview to staff inbox timeline steps (P6 unified). */
export function buildStaffInboxWorkflowStepsFromPreview(
  requestTypeCode: string,
  options?: { highlightIndex?: number },
): PreviewWorkflowTimelineStep[] {
  const preview = getCanonicalWorkflowPreview(requestTypeCode);
  if (!preview) return [];
  const hi = options?.highlightIndex ?? 0;
  return preview.steps.map((d, idx) => ({
    id: `preview:${preview.requestTypeCode}:${d.key}`,
    stepKey: d.key,
    labelAr: d.labelAr,
    roleKey: d.roleKey ?? null,
    roleLabelAr: getPreviewStepActorLabel(d),
    status: idx < hi ? "completed" : idx === hi ? "current" : "expected",
    isParallel: d.isParallel,
    isCentralSignatory: d.isCentralSignatory,
    isPreview: true,
    enteredAt: null,
    completedAt: null,
    notes: d.notesAr ?? null,
  }));
}

/** Build explicit transitions for types with conditional fee branches. */
export function getCanonicalDraftTransitionsForType(
  requestTypeCode: string,
): Array<{
  from_step_key: string | null;
  to_step_key: string | null;
  action_result: string;
  is_default: boolean;
}> {
  const normalized = normalizeStudentRequestTypeCode(requestTypeCode);
  if (normalized === "enrollment_certificate") {
    return [
      { from_step_key: null, to_step_key: "initial_review", action_result: "submit", is_default: true },
      { from_step_key: "initial_review", to_step_key: "fee_assessment", action_result: "approve", is_default: true },
      { from_step_key: "fee_assessment", to_step_key: "payment_confirmation", action_result: "payment_required", is_default: true },
      { from_step_key: "fee_assessment", to_step_key: "registrar_signature", action_result: "fee_not_required", is_default: false },
      { from_step_key: "payment_confirmation", to_step_key: "registrar_signature", action_result: "payment_confirmed", is_default: true },
      { from_step_key: "registrar_signature", to_step_key: "dean_signature", action_result: "signed", is_default: true },
      { from_step_key: "dean_signature", to_step_key: "document_issuance", action_result: "signed", is_default: true },
      { from_step_key: "document_issuance", to_step_key: "archive", action_result: "issued", is_default: true },
      { from_step_key: "archive", to_step_key: null, action_result: "archived", is_default: true },
    ];
  }
  return [];
}

/** Suggested draft steps for admin workflow editor (local only — not persisted). */
export function canonicalPreviewToSuggestedDraftSteps(
  requestTypeCode: string,
): Array<{
  step_key: string;
  step_name_ar: string;
  step_order: number;
  action_type: WorkflowActionType;
  processing_unit_code: string | null;
  role_key: string | null;
  is_parallel: boolean;
  is_central_signatory: boolean;
}> {
  const preview = getCanonicalWorkflowPreview(requestTypeCode);
  if (!preview) return [];
  return preview.steps.map((s, i) => ({
    step_key: s.key,
    step_name_ar: s.labelAr,
    step_order: i + 1,
    action_type: s.actionType ?? "review",
    processing_unit_code: s.processingUnitCode ?? null,
    role_key: s.roleKey ?? null,
    is_parallel: Boolean(s.isParallel),
    is_central_signatory: Boolean(s.isCentralSignatory),
  }));
}
