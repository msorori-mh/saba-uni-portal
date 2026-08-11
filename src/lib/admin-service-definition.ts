/** Client-safe types + pure helpers for the admin service definition surface. */

export type ServiceEligibilityRule = {
  id?: string;
  rule_code: string;
  params: Record<string, unknown>;
  message_ar: string;
  is_active: boolean;
  sort_order: number;
};

export type EligibilityRuleCatalogItem = {
  code: string;
  name_ar: string;
  description_ar: string | null;
  param_schema: Record<string, unknown>;
  default_message_ar: string;
  sort_order: number;
};

export type ServiceActionCatalogItem = {
  code: string;
  name_ar: string;
  description_ar: string | null;
  kind: "neutral" | "effect" | "document";
  effect_function: string | null;
  restricted_request_type_code: string | null;
  sort_order: number;
};

export type ServiceWorkflowVersion = {
  id: string;
  code: string;
  name_ar: string;
  version: number;
  status: string;
  is_active: boolean;
  published_at: string | null;
  superseded_at: string | null;
  change_note: string | null;
  pinned_requests: number;
};

export type ServiceStepAction = {
  workflow_id: string;
  step_key: string;
  step_name_ar: string;
  step_order: number;
  action_code: string | null;
};

export type ServiceChangeLogEntry = {
  id: string;
  change_kind: string;
  change_note: string | null;
  version: number | null;
  created_at: string;
};

export type AdminServiceDefinition = {
  request_type: Record<string, unknown> | null;
  eligibility_rules: ServiceEligibilityRule[];
  rule_catalog: EligibilityRuleCatalogItem[];
  action_catalog: ServiceActionCatalogItem[];
  workflow_versions: ServiceWorkflowVersion[];
  step_actions: ServiceStepAction[];
  change_log: ServiceChangeLogEntry[];
};

export const SERVICE_CHANGE_KIND_LABEL: Record<string, string> = {
  eligibility_rules_saved: "تحديث قواعد الأهلية",
  step_actions_saved: "ربط الإجراءات بالخطوات",
  workflow_saved: "حفظ دورة الإجراءات",
};

export const ACTION_KIND_LABEL: Record<string, string> = {
  neutral: "إجرائي",
  effect: "أثر أكاديمي",
  document: "إصدار وثيقة",
};

/** Actions a given service may bind — unrestricted actions plus its own effects. */
export function actionsAllowedForService(
  catalog: ServiceActionCatalogItem[],
  requestTypeCode: string | null,
): ServiceActionCatalogItem[] {
  return catalog.filter(
    (a) =>
      a.restricted_request_type_code === null ||
      a.restricted_request_type_code === requestTypeCode,
  );
}

/** Builds an editable rule row from a catalog entry, using its default message. */
export function ruleFromCatalog(
  item: EligibilityRuleCatalogItem,
  sortOrder: number,
): ServiceEligibilityRule {
  return {
    rule_code: item.code,
    params: defaultParamsFor(item),
    message_ar: item.default_message_ar,
    is_active: true,
    sort_order: sortOrder,
  };
}

function defaultParamsFor(item: EligibilityRuleCatalogItem): Record<string, unknown> {
  switch (item.code) {
    case "STUDENT_STUDY_STATUS_IN":
      return { values: [] };
    case "MAX_CONSECUTIVE_SUSPENSION_YEARS":
      return { max: 2 };
    case "MAX_SUSPENSION_SEMESTERS":
      return { max: 4 };
    default:
      return {};
  }
}

/** Validates rules before save; returns Arabic errors (empty array = valid). */
export function validateEligibilityRules(rules: ServiceEligibilityRule[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const rule of rules) {
    if (seen.has(rule.rule_code)) {
      errors.push(`القاعدة «${rule.rule_code}» مكررة.`);
    }
    seen.add(rule.rule_code);

    if (!rule.message_ar.trim()) {
      errors.push(`القاعدة «${rule.rule_code}» بحاجة إلى رسالة رفض بالعربية.`);
    }

    if (rule.rule_code === "STUDENT_STUDY_STATUS_IN") {
      const values = rule.params["values"];
      if (!Array.isArray(values) || values.length === 0) {
        errors.push("قاعدة حالة الدراسة تحتاج قيمة واحدة على الأقل.");
      }
    }

    if (
      rule.rule_code === "MAX_CONSECUTIVE_SUSPENSION_YEARS" ||
      rule.rule_code === "MAX_SUSPENSION_SEMESTERS"
    ) {
      const max = Number(rule.params["max"]);
      if (!Number.isInteger(max) || max < 1) {
        errors.push(`القاعدة «${rule.rule_code}» تحتاج حدًا صحيحًا أكبر من صفر.`);
      }
    }
  }

  return errors;
}
