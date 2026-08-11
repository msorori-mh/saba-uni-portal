import { describe, expect, it } from "bun:test";
import {
  actionsAllowedForService,
  ruleFromCatalog,
  validateEligibilityRules,
  type EligibilityRuleCatalogItem,
  type ServiceActionCatalogItem,
} from "@/lib/admin-service-definition";

const catalogItem: EligibilityRuleCatalogItem = {
  code: "MAX_SUSPENSION_SEMESTERS",
  name_ar: "حد فصول وقف القيد",
  description_ar: null,
  param_schema: {},
  default_message_ar: "تجاوزت الحد المسموح.",
  sort_order: 10,
};

const actions: ServiceActionCatalogItem[] = [
  {
    code: "REVIEW",
    name_ar: "مراجعة",
    description_ar: null,
    kind: "neutral",
    effect_function: null,
    restricted_request_type_code: null,
    sort_order: 10,
  },
  {
    code: "APPLY_ENROLLMENT_SUSPENSION",
    name_ar: "وقف القيد",
    description_ar: null,
    kind: "effect",
    effect_function: "apply_b1_enrollment_suspension_effect",
    restricted_request_type_code: "enrollment_suspension",
    sort_order: 20,
  },
];

describe("actionsAllowedForService", () => {
  it("keeps unrestricted actions for every service", () => {
    expect(actionsAllowedForService(actions, "file_withdrawal").map((a) => a.code)).toEqual([
      "REVIEW",
    ]);
  });

  it("exposes an effect action only to its own service", () => {
    expect(actionsAllowedForService(actions, "enrollment_suspension").map((a) => a.code)).toEqual([
      "REVIEW",
      "APPLY_ENROLLMENT_SUSPENSION",
    ]);
  });
});

describe("ruleFromCatalog", () => {
  it("seeds defaults and the catalog message", () => {
    const rule = ruleFromCatalog(catalogItem, 0);
    expect(rule.params).toEqual({ max: 4 });
    expect(rule.message_ar).toBe("تجاوزت الحد المسموح.");
    expect(rule.is_active).toBe(true);
  });
});

describe("validateEligibilityRules", () => {
  it("accepts a well-formed rule set", () => {
    expect(validateEligibilityRules([ruleFromCatalog(catalogItem, 0)])).toEqual([]);
  });

  it("rejects duplicates, empty messages and bad params", () => {
    const errors = validateEligibilityRules([
      { rule_code: "MAX_SUSPENSION_SEMESTERS", params: { max: 0 }, message_ar: "", is_active: true, sort_order: 0 },
      { rule_code: "MAX_SUSPENSION_SEMESTERS", params: { max: 4 }, message_ar: "رسالة", is_active: true, sort_order: 1 },
      { rule_code: "STUDENT_STUDY_STATUS_IN", params: { values: [] }, message_ar: "رسالة", is_active: true, sort_order: 2 },
    ]);
    expect(errors.length).toBe(4);
  });
});
