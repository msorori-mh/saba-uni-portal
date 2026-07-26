/**
 * Unified UI config for the five B1 student services.
 *
 * Derived from `request-service-adapter` (workflows, fee policies, activation
 * blockers) and `request-form-registry` (Arabic titles/descriptions) — nothing
 * is duplicated here that can be imported from those sources.
 */

import {
  B1_CANONICAL_CODES,
  B1_FEE_POLICIES,
  B1_SERVICE_ADAPTERS,
  B1_WORKFLOWS,
  type B1CanonicalCode,
  type B1FeePolicy,
  type B1WorkflowStep,
} from "@/lib/student-requests/request-service-adapter";
import { getStudentRequestFormDefinition } from "@/lib/student-requests/request-form-registry";
import { normalizeStudentRequestTypeCode } from "@/lib/student-requests/request-type-registry";

// ---------------------------------------------------------------------------
// Step labels
// ---------------------------------------------------------------------------

export const B1_STEP_LABELS_AR: Readonly<Record<string, string>> = {
  initial_review: "المراجعة الأولية",
  manager_approval: "اعتماد مدير شؤون الطلاب",
  registrar_apply: "تطبيق القرار من المسجل",
  student_affairs_intake: "المراجعة الأولية",
  manager_review: "مراجعة مدير شؤون الطلاب",
  record_apply: "تطبيق القرار",
  library_clearance: "إخلاء طرف المكتبة",
  labs_clearance: "إخلاء طرف المعامل",
  activities_clearance: "إخلاء طرف الأنشطة الطلابية",
  finance_clearance: "إخلاء طرف الشؤون المالية",
  archive: "الأرشفة",
  source_department_head_approval: "موافقة رئيس القسم الحالي",
  target_department_head_approval: "موافقة رئيس القسم المطلوب",
  dean_approval: "اعتماد العمادة",
  payment_confirmation: "تأكيد استلام الرسوم",
  dean_decision: "قرار العمادة",
};

// ---------------------------------------------------------------------------
// Fee policy copy (no amounts/currency anywhere in the portal)
// ---------------------------------------------------------------------------

export const B1_FEE_POLICY_LABELS_AR: Readonly<Record<B1FeePolicy, string>> = {
  FREE_NO_PAYMENT: "خدمة مجانية — لا توجد رسوم داخل البوابة",
  EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION:
    "السداد يتم في النظام الجامعي الرئيسي ويؤكده موظف الإيرادات — لا تسجّل البوابة مبلغًا أو عملة",
};

/**
 * Arabic display labels for known readonly contract slugs that appear in form
 * definitions (e.g. final_chance.chance_type). Presentation-only mapping of
 * values that already exist in the backend contract — nothing is invented.
 */
export const B1_KNOWN_VALUE_LABELS_AR: Readonly<Record<string, string>> = {
  final_chance: "فرصة نهائية",
};

// ---------------------------------------------------------------------------
// Config shape
// ---------------------------------------------------------------------------

export type B1WorkflowStepConfig = B1WorkflowStep & { labelAr: string };

export type B1ServiceConfig = {
  code: B1CanonicalCode;
  titleAr: string;
  descriptionAr: string;
  feePolicy: B1FeePolicy;
  feePolicyLabelAr: string;
  requiresAttachments: boolean;
  activationBlockedReason?: string;
  workflowSteps: readonly B1WorkflowStepConfig[];
};

function buildServiceConfig(code: B1CanonicalCode): B1ServiceConfig {
  const form = getStudentRequestFormDefinition(code);
  const adapter = B1_SERVICE_ADAPTERS[code];
  const feePolicy = B1_FEE_POLICIES[code];
  const workflowSteps = B1_WORKFLOWS[code].map((step) => ({
    ...step,
    labelAr: B1_STEP_LABELS_AR[step.key] ?? step.key,
  }));
  return {
    code,
    titleAr: form?.titleAr ?? code,
    descriptionAr: form?.descriptionAr ?? "",
    feePolicy,
    feePolicyLabelAr: B1_FEE_POLICY_LABELS_AR[feePolicy],
    requiresAttachments: (form?.requiredAttachments ?? []).length > 0,
    ...(adapter.activationBlockedReason
      ? { activationBlockedReason: adapter.activationBlockedReason }
      : {}),
    workflowSteps,
  };
}

export const B1_UI_SERVICES: readonly B1ServiceConfig[] =
  B1_CANONICAL_CODES.map(buildServiceConfig);

/** Type guard: accepts canonical codes and legacy aliases (transfer, absence_excuse, extra_chance). */
export function isB1ServiceCode(code: string | null | undefined): code is B1CanonicalCode {
  const normalized = normalizeStudentRequestTypeCode(code);
  return (B1_CANONICAL_CODES as readonly string[]).includes(normalized);
}

export function getB1ServiceConfig(code: string | null | undefined): B1ServiceConfig | undefined {
  const normalized = normalizeStudentRequestTypeCode(code);
  return B1_UI_SERVICES.find((service) => service.code === normalized);
}
