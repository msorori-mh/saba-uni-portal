/**
 * 02R_SOURCE_ONLY_B1_ACTION_ERROR_PROVENANCE
 *
 * Contract: an UNCLASSIFIED error in a B1 staff action must never render as
 * «لا تملك صلاحية تنفيذ هذا الإجراء على هذا الطلب.» — that text is reserved
 * for genuine authorization rejections (42501 / explicit denial codes).
 * Unknown errors surface as the safe technical adapter code and are logged
 * server-side with structured, redacted provenance (no DB/audit writes).
 */
import { describe, expect, it } from "bun:test";

import { createLiveB1UiAdapter } from "@/lib/student-requests/b1-ui/adapter.live";
import {
  B1AdapterError,
  b1AdapterErrorMessageAr,
} from "@/lib/student-requests/b1-ui/adapter.types";
import {
  B1_BUSINESS_GENERIC_MESSAGE_AR,
  B1_UNCLASSIFIED_ERROR_ADAPTER_CODE,
  isB1KnownOperationalError,
  logB1UnclassifiedActionError,
  redactB1ErrorMessageForLog,
} from "@/lib/student-requests/b1-ui/b1-business-error-mapping";

const PERMISSION_TEXT = "لا تملك صلاحية تنفيذ هذا الإجراء على هذا الطلب.";
const FINAL_CHANCE_TEXT =
  "لا يمكن تطبيق الفرصة النهائية لأن حالة الطالب الأكاديمية ليست نشطة للسنة والفصل المحددين.";
const STEP_ID = "33333333-3333-4333-8333-333333333333";

function actAdapterThrowing(message: string) {
  return createLiveB1UiAdapter({
    async actOnB1RequestStep() {
      throw new Error(message);
    },
    async confirmB1RevenueReceipt() {
      throw new Error(message);
    },
  });
}

async function captureActError(message: string): Promise<B1AdapterError> {
  const adapter = actAdapterThrowing(message);
  try {
    await adapter.actOnB1RequestStep(STEP_ID, "approve", "ok");
    throw new Error("expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(B1AdapterError);
    return error as B1AdapterError;
  }
}

async function captureConfirmError(message: string): Promise<B1AdapterError> {
  const adapter = actAdapterThrowing(message);
  try {
    await adapter.confirmB1RevenueReceipt(STEP_ID, "note");
    throw new Error("expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(B1AdapterError);
    return error as B1AdapterError;
  }
}

describe("02R — B1 action error provenance", () => {
  it("state 1: known business codes keep their precise Arabic messages", async () => {
    const precise = await captureActError("B1_FINAL_CHANCE_ACADEMIC_STATUS_REQUIRED");
    expect(precise.code).toBe("BUSINESS_RULE_BLOCKED");
    expect(b1AdapterErrorMessageAr(precise)).toBe(FINAL_CHANCE_TEXT);

    const generic = await captureActError("B1_TARGET_PROGRAM_REQUIRED");
    expect(generic.code).toBe("BUSINESS_RULE_BLOCKED");
    expect(b1AdapterErrorMessageAr(generic)).toBe(B1_BUSINESS_GENERIC_MESSAGE_AR);
  });

  it("state 2: genuine authorization rejections stay PERMISSION_DENIED", async () => {
    for (const raw of [
      "42501: permission denied for function act_on_b1_student_request_step_atomic",
      "B1_DIRECT_ASSIGNEE_REQUIRED_PERMISSION_DENIED",
    ]) {
      const actError = await captureActError(raw);
      expect(actError.code).toBe("PERMISSION_DENIED");
      expect(b1AdapterErrorMessageAr(actError)).toBe(PERMISSION_TEXT);

      const confirmError = await captureConfirmError(raw);
      expect(confirmError.code).toBe("PERMISSION_DENIED");
      expect(b1AdapterErrorMessageAr(confirmError)).toBe(PERMISSION_TEXT);
    }
  });

  it("state 3: unclassified errors become the safe technical code, never permission text", async () => {
    for (const raw of [
      "deadlock detected while locking tuple (42,7) in relation workflow_steps",
      "unexpected server fault: null pointer in jsonb payload",
      "duplicate key value violates unique constraint \"uq_step_transition\"",
    ]) {
      const actError = await captureActError(raw);
      expect(actError.code).toBe(B1_UNCLASSIFIED_ERROR_ADAPTER_CODE);
      expect(actError.code).not.toBe("PERMISSION_DENIED");
      const rendered = b1AdapterErrorMessageAr(actError);
      expect(rendered).not.toBe(PERMISSION_TEXT);
      expect(rendered).not.toContain("صلاحية");
      expect(rendered).not.toContain(raw); // raw backend text never reaches the user

      const confirmError = await captureConfirmError(raw);
      expect(confirmError.code).toBe(B1_UNCLASSIFIED_ERROR_ADAPTER_CODE);
      expect(b1AdapterErrorMessageAr(confirmError)).not.toContain("صلاحية");
    }
  });

  it("network failures on the act path stay NETWORK_ERROR", async () => {
    const error = await captureActError("TypeError: Failed to fetch");
    expect(error.code).toBe("NETWORK_ERROR");
    expect(b1AdapterErrorMessageAr(error)).toContain("تعذر الاتصال بالخادم");
  });

  it("confirm_payment wiring guard stays PERMISSION_DENIED with the specialized hint", async () => {
    const adapter = actAdapterThrowing("unreachable");
    try {
      await adapter.actOnB1RequestStep(STEP_ID, "confirm_payment", "nope");
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(B1AdapterError);
      expect((error as B1AdapterError).code).toBe("PERMISSION_DENIED");
      expect((error as B1AdapterError).message).toContain("confirmB1RevenueReceipt");
    }
  });

  it("known operational and authorization messages are not treated as unclassified", () => {
    for (const known of [
      "B1_COMMENT_REQUIRED",
      "B1_ACTIVE_STEP_REQUIRED",
      "B1_ACTION_FAILED",
      "B1_DETAILS_ROW_MISSING: …",
      "PAYMENT_CONFIRMATION_FAILED",
      "B1_FINAL_CHANCE_ACADEMIC_STATUS_REQUIRED",
      "42501: permission denied",
      "B1_READ_ACCESS_DENIED",
      "TypeError: Failed to fetch",
    ]) {
      expect(isB1KnownOperationalError(known)).toBe(true);
    }
    for (const unknown of [
      "deadlock detected while locking tuple",
      "unexpected server fault",
      "",
    ]) {
      expect(isB1KnownOperationalError(unknown)).toBe(false);
    }
  });

  it("server log captures structured redacted provenance for unclassified errors only", () => {
    const original = console.error;
    const entries: string[] = [];
    console.error = (...args: unknown[]) => {
      entries.push(args.map(String).join(" "));
    };
    try {
      const logged = logB1UnclassifiedActionError({
        operation: "act_on_b1_student_request_step_atomic",
        action: "approve",
        stepId: STEP_ID,
        error: new Error("deadlock detected for student omar@example.edu phone 777123456"),
      });
      expect(logged).toBe(true);
      expect(entries).toHaveLength(1);
      const payload = JSON.parse(entries[0]) as Record<string, string>;
      expect(payload.event).toBe("b1_unclassified_action_error");
      expect(payload.operation).toBe("act_on_b1_student_request_step_atomic");
      expect(payload.action).toBe("approve");
      expect(payload.stepId).toBe(STEP_ID);
      expect(payload.code).toBe("UNCLASSIFIED");
      expect(payload.message).toContain("deadlock detected");
      expect(payload.message).not.toContain("omar@example.edu");
      expect(payload.message).not.toContain("777123456");
      expect(payload.message).toContain("[email]");
      expect(payload.message).toContain("[num]");

      // Known errors produce no log entry.
      entries.length = 0;
      for (const knownRaw of [
        "B1_FINAL_CHANCE_ACADEMIC_STATUS_REQUIRED",
        "42501: permission denied for function act_on_b1_student_request_step_atomic",
        "B1_COMMENT_REQUIRED",
      ]) {
        const result = logB1UnclassifiedActionError({
          operation: "act_on_b1_student_request_step_atomic",
          action: "approve",
          stepId: STEP_ID,
          error: new Error(knownRaw),
        });
        expect(result).toBe(false);
      }
      expect(entries).toHaveLength(0);
    } finally {
      console.error = original;
    }
  });

  it("redaction bounds length and strips PII-shaped tokens", () => {
    const longMessage = `x@y.edu ${"7".repeat(400)} ${"a".repeat(400)}`;
    const redacted = redactB1ErrorMessageForLog(longMessage);
    expect(redacted.length).toBeLessThanOrEqual(240);
    expect(redacted).not.toContain("x@y.edu");
    expect(redacted).not.toContain("7".repeat(40));
  });
});
