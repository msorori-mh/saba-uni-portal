import { describe, expect, it } from "bun:test";
import { ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE } from "../../src/lib/admin-request-workflow-rpc";
import {
  getCanonicalDraftTransitionsForType,
  getCanonicalWorkflowPreview,
} from "../../src/lib/student-requests/request-workflow-preview-registry";
import { validateCanonicalPreviewRegistry } from "../../src/lib/student-requests/request-workflow-validation";
import {
  buildWorkflowSaveInputFromPreview,
  validateAllCanonicalWorkflowSaveContracts,
  validateWorkflowSaveInput,
} from "../../src/lib/student-requests/request-workflow-save-contract";
import {
  dryRunAssessStudentRequestFee,
  dryRunConfirmStudentRequestFeePayment,
} from "../../src/lib/student-requests/request-fee-workflow-contract";

const TYPE_ID = "00000000-0000-4000-8000-000000000001";
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

describe("enrollment certificate workflow foundation 01A", () => {
  it("1 — ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE is true", () => {
    expect(ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE).toBe(true);
  });

  it("2 — enrollment_certificate preview has 7 steps", () => {
    const preview = getCanonicalWorkflowPreview("enrollment_certificate");
    expect(preview?.steps.length).toBe(7);
    expect(preview?.steps[0]?.key).toBe("initial_review");
    expect(preview?.steps[1]?.actionType).toBe("assess_fee");
    expect(preview?.steps[6]?.key).toBe("archive");
  });

  it("3 — canonical draft transitions include fee branches", () => {
    const transitions = getCanonicalDraftTransitionsForType("enrollment_certificate");
    expect(transitions.some((t) => t.action_result === "fee_not_required")).toBe(true);
    expect(transitions.some((t) => t.action_result === "payment_required")).toBe(true);
    expect(transitions.some((t) => t.action_result === "payment_confirmed")).toBe(true);
  });

  it("4 — build save input from preview for enrollment_certificate", () => {
    const built = buildWorkflowSaveInputFromPreview(TYPE_ID, "enrollment_certificate");
    expect(built).not.toBeNull();
    expect(built!.steps.length).toBe(7);
    expect(built!.transitions.length).toBeGreaterThanOrEqual(7);
  });

  it("5 — validate enrollment_certificate save contract", () => {
    const built = buildWorkflowSaveInputFromPreview(TYPE_ID, "enrollment_certificate")!;
    const result = validateWorkflowSaveInput(built);
    expect(result.valid).toBe(true);
    expect(result.capability.canSave).toBe(true);
    expect(result.issues.filter((i) => i.code === "assess_fee_dual_transitions")).toHaveLength(0);
  });

  it("6 — registry validation accepts enrollment_certificate 7-step path", () => {
    const report = validateCanonicalPreviewRegistry();
    const cert = report.types.find((t) => t.code === "enrollment_certificate");
    expect(cert?.stepCount).toBe(7);
    expect(cert?.valid).toBe(true);
  });

  it("7 — assess_fee amount=0 skips payment", () => {
    const result = dryRunAssessStudentRequestFee({
      requestId: REQUEST_ID,
      amount: 0,
      currentStepKey: "fee_assessment",
      currentActionType: "assess_fee",
    });
    expect(result.valid).toBe(true);
    expect(result.paymentStatus).toBe("not_required");
    expect(result.actionResult).toBe("fee_not_required");
    expect(result.nextStepKey).toBe("registrar_signature");
    expect(result.notifyStudent).toBe(false);
  });

  it("8 — assess_fee amount>0 requires payment_confirmation", () => {
    const result = dryRunAssessStudentRequestFee({
      requestId: REQUEST_ID,
      amount: 5000,
      currentStepKey: "fee_assessment",
      currentActionType: "assess_fee",
    });
    expect(result.valid).toBe(true);
    expect(result.paymentStatus).toBe("pending_payment");
    expect(result.actionResult).toBe("payment_required");
    expect(result.nextStepKey).toBe("payment_confirmation");
    expect(result.notifyStudent).toBe(true);
  });

  it("9 — confirm payment transitions to registrar_signature", () => {
    const result = dryRunConfirmStudentRequestFeePayment({
      requestId: REQUEST_ID,
      paymentReference: "HAF-2026-001",
      currentStepKey: "payment_confirmation",
      currentActionType: "confirm_payment",
      existingPaymentStatus: "pending_payment",
    });
    expect(result.valid).toBe(true);
    expect(result.paymentStatus).toBe("paid");
    expect(result.nextStepKey).toBe("registrar_signature");
    expect(result.notifyStudent).toBe(true);
  });

  it("10 — duplicate payment confirmation rejected", () => {
    const result = dryRunConfirmStudentRequestFeePayment({
      requestId: REQUEST_ID,
      paymentReference: "HAF-2026-001",
      currentStepKey: "payment_confirmation",
      currentActionType: "confirm_payment",
      existingPaymentStatus: "paid",
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "duplicate_confirmation")).toBe(true);
  });

  it("11 — wrong step action rejected for assess_fee", () => {
    const result = dryRunAssessStudentRequestFee({
      requestId: REQUEST_ID,
      amount: 100,
      currentStepKey: "initial_review",
      currentActionType: "review",
    });
    expect(result.valid).toBe(false);
  });

  it("12 — all eight canonical types still buildable", () => {
    const matrix = validateAllCanonicalWorkflowSaveContracts(TYPE_ID);
    expect(matrix.length).toBe(8);
    const cert = matrix.find((m) => m.code === "enrollment_certificate");
    expect(cert?.buildable).toBe(true);
    expect(cert?.stepCount).toBe(7);
  });
});
