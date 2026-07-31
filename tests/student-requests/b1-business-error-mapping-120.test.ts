/**
 * B1_STAGE3_FIX_B1_BUSINESS_ERROR_MAPPING_SOURCE_ONLY-120
 *
 * Proves B1 backend business precondition errors are surfaced as business
 * messages, never as "permission denied", while genuine authorization errors
 * (42501 / 28000 / explicit denial codes) keep permission-denied text.
 */
import { describe, expect, it } from "bun:test";

import {
  B1_BUSINESS_GENERIC_MESSAGE_AR,
  b1BusinessRuleMessageAr,
  extractB1BusinessRuleCode,
  isB1AuthorizationError,
  isB1BusinessRuleError,
} from "@/lib/student-requests/b1-ui/b1-business-error-mapping";
import {
  B1_ADAPTER_ERROR_CODES,
  B1AdapterError,
  b1AdapterErrorMessageAr,
} from "@/lib/student-requests/b1-ui/adapter.types";

const PERMISSION_TEXT = "لا تملك صلاحية تنفيذ هذا الإجراء على هذا الطلب.";
const FINAL_CHANCE_TEXT =
  "لا يمكن تطبيق الفرصة النهائية لأن حالة الطالب الأكاديمية ليست نشطة للسنة والفصل المحددين.";

describe("B1 business vs authorization error mapping", () => {
  it("exposes a dedicated business-rule adapter error code", () => {
    expect(B1_ADAPTER_ERROR_CODES).toContain("BUSINESS_RULE_BLOCKED");
  });

  it("maps B1_FINAL_CHANCE_ACADEMIC_STATUS_REQUIRED to the business precondition message", () => {
    const raw = "B1_FINAL_CHANCE_ACADEMIC_STATUS_REQUIRED";
    expect(isB1BusinessRuleError(raw)).toBe(true);
    expect(extractB1BusinessRuleCode(raw)).toBe("B1_FINAL_CHANCE_ACADEMIC_STATUS_REQUIRED");
    expect(b1BusinessRuleMessageAr(raw)).toBe(FINAL_CHANCE_TEXT);
    expect(b1AdapterErrorMessageAr(new B1AdapterError("BUSINESS_RULE_BLOCKED", raw))).toBe(
      FINAL_CHANCE_TEXT,
    );
  });

  it("never presents the final-chance precondition as permission denied", () => {
    const message = b1AdapterErrorMessageAr(
      new B1AdapterError(
        "BUSINESS_RULE_BLOCKED",
        'ERROR: B1_FINAL_CHANCE_ACADEMIC_STATUS_REQUIRED (SQLSTATE P0001)',
      ),
    );
    expect(message).not.toBe(PERMISSION_TEXT);
    expect(message).not.toContain("صلاحية");
    expect(
      isB1AuthorizationError("B1_FINAL_CHANCE_ACADEMIC_STATUS_REQUIRED"),
    ).toBe(false);
  });

  it("gives a safe non-permission generic Arabic fallback for other B1_*_REQUIRED codes", () => {
    for (const code of [
      "B1_PAYMENT_CONFIRMATION_REQUIRED",
      "B1_PREDECESSOR_STEP_REQUIRED",
      "B1_TARGET_PROGRAM_REQUIRED",
    ]) {
      expect(isB1BusinessRuleError(code)).toBe(true);
      expect(b1BusinessRuleMessageAr(code)).toBe(B1_BUSINESS_GENERIC_MESSAGE_AR);
      expect(b1AdapterErrorMessageAr(new B1AdapterError("BUSINESS_RULE_BLOCKED", code))).not.toBe(
        PERMISSION_TEXT,
      );
    }
  });

  it("keeps genuine authorization errors mapped to permission denied", () => {
    for (const raw of [
      "42501: permission denied for function act_on_b1_student_request_step_atomic",
      "28000: invalid authorization specification",
      "B1_DIRECT_ASSIGNEE_REQUIRED_PERMISSION_DENIED",
      "AUTHORIZATION_DENIED",
      "B1_READ_ACCESS_DENIED",
    ]) {
      expect(b1AdapterErrorMessageAr(new B1AdapterError("PERMISSION_DENIED", raw))).toBe(
        PERMISSION_TEXT,
      );
    }
    expect(isB1AuthorizationError("42501: permission denied")).toBe(true);
    expect(isB1AuthorizationError("28000: invalid authorization specification")).toBe(true);
    expect(isB1AuthorizationError("ACCESS_DENIED")).toBe(true);
  });

  it("does not reclassify codes that intentionally keep other semantics", () => {
    for (const excluded of [
      "B1_ACTIVE_STEP_REQUIRED",
      "COMMENT_REQUIRED",
      "B1_COMMENT_REQUIRED",
      "B1_SPECIALIZED_ACTION_RPC_REQUIRED: use confirmB1RevenueReceipt(stepId, note?) only.",
      "B1_ATTACHMENT_REQUIRED",
    ]) {
      expect(isB1BusinessRuleError(excluded)).toBe(false);
    }
  });

  it("leaves unrelated error codes and success paths untouched", () => {
    expect(isB1BusinessRuleError("")).toBe(false);
    expect(isB1BusinessRuleError("B1_STALE_REQUEST_VERSION")).toBe(false);
    expect(isB1BusinessRuleError("B1_INPUT_VALIDATION_FAILED:field:invalid")).toBe(false);
    expect(b1AdapterErrorMessageAr(new B1AdapterError("STALE_VERSION", "x"))).toContain(
      "تغيّرت حالة الطلب",
    );
    expect(b1AdapterErrorMessageAr(new B1AdapterError("NOT_FOUND", "x"))).toContain(
      "تعذر العثور على الطلب",
    );
    // No adapter error is raised for successful actions, so the mapper must not
    // interfere with approve/review/clear/apply_decision/archive results.
    for (const action of ["approve", "review", "clear", "apply_decision", "archive"]) {
      expect(isB1BusinessRuleError(action)).toBe(false);
      expect(isB1AuthorizationError(action)).toBe(false);
    }
  });
});
