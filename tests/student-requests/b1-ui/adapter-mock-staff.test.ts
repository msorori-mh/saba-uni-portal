import { describe, expect, it } from "bun:test";
import { createMockB1UiAdapter } from "@/lib/student-requests/b1-ui/adapter.mock";
import { B1AdapterError, type B1AssignedRequest } from "@/lib/student-requests/b1-ui/adapter.types";

async function expectAdapterError(
  promise: Promise<unknown>,
  code: string,
): Promise<B1AdapterError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(B1AdapterError);
    expect((error as B1AdapterError).code).toBe(code);
    return error as B1AdapterError;
  }
  throw new Error(`Expected B1AdapterError(${code}) but the call succeeded`);
}

async function inbox(adapter: ReturnType<typeof createMockB1UiAdapter>) {
  return adapter.getAssignedB1Requests();
}

function findByService(items: readonly B1AssignedRequest[], code: string): B1AssignedRequest {
  const found = items.find((item) => item.serviceCode === code);
  if (!found) throw new Error(`No assigned request for ${code}`);
  return found;
}

describe("mock B1 UI adapter — staff inbox", () => {
  it("seeds a suspension request at initial_review and a transfer at payment_confirmation", async () => {
    const adapter = createMockB1UiAdapter();
    const items = await inbox(adapter);

    const suspension = findByService(items, "enrollment_suspension");
    expect(suspension.stepKey).toBe("initial_review");
    expect(suspension.allowedAction).toBe("review");
    expect(suspension.studentNameAr).toContain("تجريبي");
    expect(suspension.stepLabelAr).toBe("المراجعة الأولية");

    const transfer = findByService(items, "department_transfer");
    expect(transfer.stepKey).toBe("payment_confirmation");
    expect(transfer.allowedAction).toBe("confirm_payment");
  });

  it("requires a comment for return/reject (VALIDATION_ERROR)", async () => {
    const adapter = createMockB1UiAdapter();
    const suspension = findByService(await inbox(adapter), "enrollment_suspension");

    const returnError = await expectAdapterError(
      adapter.actOnB1RequestStep(suspension.stepId, "return"),
      "VALIDATION_ERROR",
    );
    expect(returnError.fieldErrors!.comment).toBe("comment_required");

    await expectAdapterError(
      adapter.actOnB1RequestStep(suspension.stepId, "reject", "   "),
      "VALIDATION_ERROR",
    );
  });

  it("rejects an action that is not the step's allowed action (PERMISSION_DENIED)", async () => {
    const adapter = createMockB1UiAdapter();
    const suspension = findByService(await inbox(adapter), "enrollment_suspension");

    // initial_review expects "review" — approve/confirm_payment are illegal here.
    await expectAdapterError(
      adapter.actOnB1RequestStep(suspension.stepId, "approve"),
      "PERMISSION_DENIED",
    );
    await expectAdapterError(
      adapter.actOnB1RequestStep(suspension.stepId, "confirm_payment"),
      "PERMISSION_DENIED",
    );
  });

  it("advances the workflow after a successful action", async () => {
    const adapter = createMockB1UiAdapter();
    const suspension = findByService(await inbox(adapter), "enrollment_suspension");

    const result = await adapter.actOnB1RequestStep(suspension.stepId, "review", "مراجعة تجريبية");
    expect(result.requestId).toBe(suspension.requestId);
    expect(result).toMatchObject({ accepted: true, action: "review" });

    const details = await adapter.getAssignedB1RequestDetails(suspension.requestId);
    expect(details.steps[0]!.status).toBe("completed");
    expect(details.steps[0]!.actedAt).toBeTruthy();
    expect(details.steps[1]!.status).toBe("active");
    expect(details.steps[1]!.key).toBe("manager_approval");
    expect(details.stepKey).toBe("manager_approval");
    expect(details.formDataSummary.length).toBeGreaterThan(0);
  });

  it("returns a request to the student with a student-visible message", async () => {
    const adapter = createMockB1UiAdapter();
    const suspension = findByService(await inbox(adapter), "enrollment_suspension");

    await adapter.actOnB1RequestStep(suspension.stepId, "return", "أرفق ما يثبت الظرف");

    const details = await adapter.getB1RequestDetails(suspension.requestId);
    expect(details.status).toBe("returned");
    expect(details.studentVisibleMessages.some((m) => m.bodyAr.includes("أرفق"))).toBe(true);

    // Returned requests leave the staff inbox.
    const items = await inbox(adapter);
    expect(items.find((item) => item.requestId === suspension.requestId)).toBeUndefined();
  });

  it("confirmB1RevenueReceipt succeeds only on the active confirm_payment step", async () => {
    const adapter = createMockB1UiAdapter();
    const items = await inbox(adapter);
    const suspension = findByService(items, "enrollment_suspension");
    const transfer = findByService(items, "department_transfer");

    // Not a payment step → denied.
    await expectAdapterError(
      adapter.confirmB1RevenueReceipt(suspension.stepId),
      "PERMISSION_DENIED",
    );

    // Active payment step → succeeds, no amount/currency involved.
    const result = await adapter.confirmB1RevenueReceipt(
      transfer.stepId,
      "تم التحقق من السداد خارجيًا",
    );
    expect(result).toMatchObject({ accepted: true, action: "confirm_payment" });

    const details = await adapter.getAssignedB1RequestDetails(transfer.requestId);
    const paymentStep = details.steps.find((step) => step.key === "payment_confirmation");
    expect(paymentStep!.status).toBe("completed");
    expect(details.steps.find((step) => step.key === "registrar_apply")!.status).toBe("active");

    // Already completed → no longer confirmable.
    await expectAdapterError(adapter.confirmB1RevenueReceipt(transfer.stepId), "PERMISSION_DENIED");
  });
});
