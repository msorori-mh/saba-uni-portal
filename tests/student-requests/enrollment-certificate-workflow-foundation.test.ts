import { describe, expect, it } from "bun:test";
import {
  ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE,
  isAdminSaveWorkflowRpcAvailable,
  type DraftWorkflowStep,
  type DraftWorkflowTransition,
} from "../../src/lib/admin-request-workflow-rpc";
import {
  getCanonicalDraftTransitionsForType,
  getCanonicalWorkflowPreview,
} from "../../src/lib/student-requests/request-workflow-preview-registry";
import { validateCanonicalPreviewRegistry } from "../../src/lib/student-requests/request-workflow-validation";
import {
  buildWorkflowSaveInputFromDraft,
  buildWorkflowSaveInputFromPreview,
  validateAllCanonicalWorkflowSaveContracts,
  validateWorkflowSaveInput,
} from "../../src/lib/student-requests/request-workflow-save-contract";
import {
  dryRunAssessStudentRequestFee,
  dryRunConfirmStudentRequestFeePayment,
} from "../../src/lib/student-requests/request-fee-workflow-contract";
import {
  decideWorkflowSaveVersionAction,
  describeActivationSideEffects,
  fingerprintsEqual,
  validateDraftRoleUnitPairs,
} from "../../src/lib/student-requests/workflow-save-versioning-policy";

const TYPE_ID = "00000000-0000-4000-8000-000000000001";
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const UNIT_A = "22222222-2222-4222-8222-222222222222";
const UNIT_B = "33333333-3333-4333-8333-333333333333";
const ROLE_A = "44444444-4444-4444-8444-444444444444";

describe("enrollment certificate workflow foundation 01A", () => {
  it("1 — ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE is false until migration applied", () => {
    expect(ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE).toBe(false);
    expect(isAdminSaveWorkflowRpcAvailable()).toBe(false);
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

  it("5 — validate enrollment_certificate save contract (save gated off)", () => {
    const built = buildWorkflowSaveInputFromPreview(TYPE_ID, "enrollment_certificate")!;
    const result = validateWorkflowSaveInput(built);
    expect(result.valid).toBe(true);
    expect(result.capability.canSave).toBe(false);
    expect(result.capability.reason).toBe("save_rpc_unavailable");
    expect(["SAVE_UNAVAILABLE", "VALID_WITH_WARNINGS"]).toContain(result.status);
    expect(result.issues.filter((i) => i.code === "assess_fee_dual_transitions")).toHaveLength(0);
  });

  it("6 — registry validation accepts enrollment_certificate 7-step path", () => {
    const report = validateCanonicalPreviewRegistry();
    const cert = report.types.find((t) => t.code === "enrollment_certificate");
    expect(cert?.stepCount).toBe(7);
    expect(cert?.valid).toBe(true);
  });

  it("7 — assess_fee amount=0 skips payment and does not notify", () => {
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

  it("8 — assess_fee amount>0 requires payment_confirmation and notifies", () => {
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

  it("13 — draft → buildWorkflowSaveInputFromDraft → validate (no undefined.stepKey)", () => {
    const draftSteps: DraftWorkflowStep[] = [
      {
        localId: "1",
        step_key: "initial_review",
        step_name_ar: "مراجعة أولية",
        step_order: 1,
        processing_unit_id: UNIT_A,
        processing_role_id: ROLE_A,
        action_type: "review",
        visible_to_student: true,
        notify_on_enter: true,
        can_return_to_student: true,
        can_reject: true,
        can_skip: false,
      },
      {
        localId: "2",
        step_key: "fee_assessment",
        step_name_ar: "تقييم الرسوم",
        step_order: 2,
        processing_unit_id: UNIT_A,
        processing_role_id: ROLE_A,
        action_type: "assess_fee",
        visible_to_student: true,
        notify_on_enter: true,
        can_return_to_student: false,
        can_reject: true,
        can_skip: false,
      },
    ];
    const draftTransitions: DraftWorkflowTransition[] = [
      {
        localId: "t1",
        from_step_key: "initial_review",
        to_step_key: "fee_assessment",
        action_result: "approve",
        is_default: true,
      },
    ];

    const built = buildWorkflowSaveInputFromDraft(
      TYPE_ID,
      "enrollment_certificate",
      draftSteps,
      draftTransitions,
    );
    expect(built.steps.every((s) => typeof s.stepKey === "string" && s.stepKey.length > 0)).toBe(
      true,
    );
    const result = validateWorkflowSaveInput(built);
    expect(result.normalized?.steps.every((s) => s.stepKey.trim().length > 0)).toBe(true);
    expect(result.issues.some((i) => i.messageAr.includes("undefined"))).toBe(false);
  });

  it("14 — role/unit mismatch detected by versioning policy helper", () => {
    const ok = validateDraftRoleUnitPairs([
      {
        step_key: "fee_assessment",
        processing_unit_id: UNIT_A,
        processing_role_id: ROLE_A,
        role_unit_id: UNIT_A,
      },
    ]);
    expect(ok.valid).toBe(true);

    const bad = validateDraftRoleUnitPairs([
      {
        step_key: "fee_assessment",
        processing_unit_id: UNIT_A,
        processing_role_id: ROLE_A,
        role_unit_id: UNIT_B,
      },
    ]);
    expect(bad.valid).toBe(false);
    expect(bad.mismatches).toContain("fee_assessment");
  });

  it("15 — non-destructive versioning: identical draft reused; diff creates new version", () => {
    const fp = {
      steps: [
        {
          step_key: "a",
          step_order: 1,
          action_type: "review",
          processing_unit_id: null,
          processing_role_id: null,
        },
      ],
      transitions: [] as [],
    };
    const reuse = decideWorkflowSaveVersionAction({
      latestDraftFingerprint: fp,
      payloadFingerprint: fp,
      activate: false,
    });
    expect(reuse.action).toBe("reuse_draft");
    expect(reuse.mutatesExistingSteps).toBe(false);

    const create = decideWorkflowSaveVersionAction({
      latestDraftFingerprint: fp,
      payloadFingerprint: {
        ...fp,
        steps: [
          {
            ...fp.steps[0],
            action_type: "assess_fee",
          },
        ],
      },
      activate: true,
    });
    expect(create.action).toBe("create_new_version");
    expect(create.willActivate).toBe(true);
    expect(create.mutatesExistingSteps).toBe(false);

    expect(fingerprintsEqual(fp, fp)).toBe(true);
    const activation = describeActivationSideEffects();
    expect(activation.retirePreviousActive).toBe(true);
    expect(activation.atMostOneActivePerRequestType).toBe(true);
  });
});
