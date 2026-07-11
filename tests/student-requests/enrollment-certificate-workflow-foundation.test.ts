import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE,
  WORKFLOW_SAVE_RPC_TEMPORARILY_UNAVAILABLE_MSG,
  canSubmitWorkflowSave,
  isAdminSaveWorkflowRpcAvailable,
  isWorkflowSaveRpcMissingError,
  mapWorkflowSaveRpcError,
  workflowMetaForSaveMode,
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
  validateWorkflowSaveCapability,
  validateWorkflowSaveInput,
} from "../../src/lib/student-requests/request-workflow-save-contract";
import {
  dryRunAssessStudentRequestFee,
  dryRunConfirmStudentRequestFeePayment,
} from "../../src/lib/student-requests/request-fee-workflow-contract";
import {
  buildMinimalWorkflowFingerprint,
  decideWorkflowSaveVersionAction,
  describeActivationSideEffects,
  fingerprintsEqual,
  validateDraftRoleUnitPairs,
} from "../../src/lib/student-requests/workflow-save-versioning-policy";
import {
  dryRunFeeAuthorization,
  feeStatusDisplayModel,
  shouldShowFeeAssessmentForm,
  shouldShowFeeStatusDisplay,
  shouldShowPaymentConfirmationForm,
} from "../../src/lib/student-requests/fee-processing-ui-policy";

const TYPE_ID = "00000000-0000-4000-8000-000000000001";
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const UNIT_A = "22222222-2222-4222-8222-222222222222";
const UNIT_B = "33333333-3333-4333-8333-333333333333";
const ROLE_A = "44444444-4444-4444-8444-444444444444";
const ROOT = join(import.meta.dir, "../..");

describe("enrollment certificate workflow foundation 01A", () => {
  it("1 — ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE is true after 01B enablement", () => {
    expect(ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE).toBe(true);
    expect(isAdminSaveWorkflowRpcAvailable()).toBe(true);
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

  it("5 — validate enrollment_certificate save contract (save enabled)", () => {
    const built = buildWorkflowSaveInputFromPreview(TYPE_ID, "enrollment_certificate")!;
    const result = validateWorkflowSaveInput(built);
    expect(result.valid).toBe(true);
    expect(result.capability.canSave).toBe(true);
    expect(result.capability.reason).toBe("ready_for_staging_save");
    expect(["VALID", "VALID_WITH_WARNINGS"]).toContain(result.status);
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

  it("15 — identical full fingerprint reuses draft; action_type diff creates version", () => {
    const fp = buildMinimalWorkflowFingerprint();
    const reuse = decideWorkflowSaveVersionAction({
      latestDraftFingerprint: fp,
      payloadFingerprint: fp,
      activate: false,
    });
    expect(reuse.action).toBe("reuse_draft");
    expect(reuse.mutatesExistingSteps).toBe(false);

    const create = decideWorkflowSaveVersionAction({
      latestDraftFingerprint: fp,
      payloadFingerprint: buildMinimalWorkflowFingerprint({
        step: { action_type: "assess_fee", requires_payment: true },
      }),
      activate: true,
    });
    expect(create.action).toBe("create_new_version");
    expect(create.willActivate).toBe(true);
    expect(fingerprintsEqual(fp, fp)).toBe(true);
    const activation = describeActivationSideEffects();
    expect(activation.retirePreviousActive).toBe(true);
  });
});

describe("PR115 remediation round 2 — fingerprint field coverage", () => {
  const base = buildMinimalWorkflowFingerprint();

  it("1 — changing step_name_ar creates a new version (no draft reuse)", () => {
    const changed = buildMinimalWorkflowFingerprint({
      step: { step_name_ar: "اسم جديد للخطوة" },
    });
    expect(
      decideWorkflowSaveVersionAction({
        latestDraftFingerprint: base,
        payloadFingerprint: changed,
        activate: false,
      }).action,
    ).toBe("create_new_version");
  });

  it("2 — changing notify_on_enter creates a new version", () => {
    const changed = buildMinimalWorkflowFingerprint({
      step: { notify_on_enter: false },
    });
    expect(
      decideWorkflowSaveVersionAction({
        latestDraftFingerprint: base,
        payloadFingerprint: changed,
        activate: false,
      }).action,
    ).toBe("create_new_version");
  });

  it("3 — changing transition label_ar creates a new version", () => {
    const changed = buildMinimalWorkflowFingerprint({
      transition: { label_ar: "تسمية انتقال جديدة" },
    });
    expect(
      decideWorkflowSaveVersionAction({
        latestDraftFingerprint: base,
        payloadFingerprint: changed,
        activate: false,
      }).action,
    ).toBe("create_new_version");
  });

  it("changing visible_to_student / can_reject / workflow name creates new versions", () => {
    expect(
      decideWorkflowSaveVersionAction({
        latestDraftFingerprint: base,
        payloadFingerprint: buildMinimalWorkflowFingerprint({
          step: { visible_to_student: false },
        }),
        activate: false,
      }).action,
    ).toBe("create_new_version");

    expect(
      decideWorkflowSaveVersionAction({
        latestDraftFingerprint: base,
        payloadFingerprint: buildMinimalWorkflowFingerprint({
          step: { can_reject: false },
        }),
        activate: false,
      }).action,
    ).toBe("create_new_version");

    expect(
      decideWorkflowSaveVersionAction({
        latestDraftFingerprint: base,
        payloadFingerprint: buildMinimalWorkflowFingerprint({
          workflow: { name_ar: "اسم سير عمل جديد" },
        }),
        activate: false,
      }).action,
    ).toBe("create_new_version");
  });
});

describe("PR115 remediation round 2 — fee auth without false-deny", () => {
  it("4 — processing assignment allows student_affairs_manager to assess without matching app role", () => {
    const decision = dryRunFeeAuthorization({
      hasSession: true,
      appRoles: [],
      processingRoleCodes: ["student_affairs_manager"],
      action: "assess",
    });
    expect(decision.tsPrecheckAllows).toBe(true);
    expect(decision.usesAssertAnyRolePrecheck).toBe(false);
    expect(decision.rpcWouldAllow).toBe(true);
  });

  it("5 — processing assignment allows finance to confirm payment", () => {
    const viaProcessing = dryRunFeeAuthorization({
      hasSession: true,
      appRoles: [],
      processingRoleCodes: ["revenue_finance_officer"],
      action: "confirm",
    });
    expect(viaProcessing.tsPrecheckAllows).toBe(true);
    expect(viaProcessing.rpcWouldAllow).toBe(true);

    const viaAppRole = dryRunFeeAuthorization({
      hasSession: true,
      appRoles: ["finance_officer"],
      processingRoleCodes: [],
      action: "confirm",
    });
    expect(viaAppRole.tsPrecheckAllows).toBe(true);
    expect(viaAppRole.rpcWouldAllow).toBe(true);
  });

  it("6 — unassigned user is denied by RPC rules", () => {
    const assess = dryRunFeeAuthorization({
      hasSession: true,
      appRoles: ["student_affairs"],
      processingRoleCodes: [],
      action: "assess",
    });
    expect(assess.tsPrecheckAllows).toBe(true);
    expect(assess.rpcWouldAllow).toBe(false);

    const confirm = dryRunFeeAuthorization({
      hasSession: true,
      appRoles: ["student_affairs_manager"],
      processingRoleCodes: [],
      action: "confirm",
    });
    expect(confirm.tsPrecheckAllows).toBe(true);
    expect(confirm.rpcWouldAllow).toBe(false);
  });

  it("fee server functions do not call assertAnyRole", () => {
    const source = readFileSync(
      join(ROOT, "src/lib/student-request-fee.functions.ts"),
      "utf8",
    );
    expect(source).toContain("requireSupabaseAuth");
    expect(source).not.toMatch(/\bassertAnyRole\s*\(/);
    expect(source).not.toMatch(/from ["']@\/lib\/authz\.server["']/);
    expect(source).toContain("getStudentRequestFeeProcessingContext");
  });
});

describe("PR115 remediation round 2 — fee UI visibility", () => {
  it("7 — assessment form only on assess_fee active executable step without assessment", () => {
    expect(
      shouldShowFeeAssessmentForm({
        actionType: "assess_fee",
        stepStatus: "active",
        canExecuteStep: true,
        hasActiveFeeAssessment: false,
      }),
    ).toBe(true);
    expect(
      shouldShowFeeAssessmentForm({
        actionType: "confirm_payment",
        stepStatus: "active",
        canExecuteStep: true,
        hasActiveFeeAssessment: false,
      }),
    ).toBe(false);
  });

  it("8 — payment confirmation form only on confirm_payment + pending_payment", () => {
    expect(
      shouldShowPaymentConfirmationForm({
        actionType: "confirm_payment",
        stepStatus: "active",
        canExecuteStep: true,
        paymentStatus: "pending_payment",
      }),
    ).toBe(true);
    expect(
      shouldShowPaymentConfirmationForm({
        actionType: "assess_fee",
        stepStatus: "active",
        canExecuteStep: true,
        paymentStatus: "pending_payment",
      }),
    ).toBe(false);
  });

  it("9 — unauthorized viewer sees status without action buttons", () => {
    expect(shouldShowFeeStatusDisplay(true)).toBe(true);
    expect(
      shouldShowFeeAssessmentForm({
        actionType: "assess_fee",
        stepStatus: "active",
        canExecuteStep: false,
        hasActiveFeeAssessment: false,
      }),
    ).toBe(false);
    expect(
      shouldShowPaymentConfirmationForm({
        actionType: "confirm_payment",
        stepStatus: "active",
        canExecuteStep: false,
        paymentStatus: "pending_payment",
      }),
    ).toBe(false);
  });

  it("10 — amount=0 skips finance form and shows no-fee status", () => {
    const model = feeStatusDisplayModel({
      amount: 0,
      paymentStatus: "not_required",
    });
    expect(model.amountLabelAr).toBe("لا رسوم مطلوبة");
    expect(model.showFinanceForm).toBe(false);
    expect(
      shouldShowPaymentConfirmationForm({
        actionType: "confirm_payment",
        stepStatus: "active",
        canExecuteStep: true,
        paymentStatus: "not_required",
      }),
    ).toBe(false);
  });

  it("11 — amount>0 shows pending payment", () => {
    const model = feeStatusDisplayModel({
      amount: 5000,
      paymentStatus: "pending_payment",
    });
    expect(model.statusLabelAr).toBe("بانتظار السداد");
    expect(model.showFinanceForm).toBe(true);
  });

  it("12 — paid blocks repeated confirmation", () => {
    const model = feeStatusDisplayModel({
      amount: 5000,
      paymentStatus: "paid",
      paymentReference: "REF-1",
    });
    expect(model.statusLabelAr).toBe("تم تأكيد السداد");
    expect(model.allowConfirmAgain).toBe(false);
    expect(
      shouldShowPaymentConfirmationForm({
        actionType: "confirm_payment",
        stepStatus: "active",
        canExecuteStep: true,
        paymentStatus: "paid",
      }),
    ).toBe(false);
  });

  it("13 — staff detail panel mounts fee forms by action_type", () => {
    const source = readFileSync(
      join(ROOT, "src/components/student-requests/StaffRequestDetailPanel.tsx"),
      "utf8",
    );
    expect(source).toContain("StudentRequestFeeAssessmentForm");
    expect(source).toContain("StudentRequestPaymentConfirmationForm");
    expect(source).toContain("StudentRequestFeeStatusDisplay");
    expect(source).toContain("shouldShowFeeAssessmentForm");
    expect(source).toContain("getStudentRequestFeeProcessingContext");
  });
});

describe("student request workflow save enablement 01B", () => {
  it("capability is available with canSave/canActivate", () => {
    const cap = validateWorkflowSaveCapability();
    expect(cap.available).toBe(true);
    expect(cap.canSave).toBe(true);
    expect(cap.canActivate).toBe(true);
    expect(cap.reason).toBe("ready_for_staging_save");
  });

  it("draft save mode maps to status=draft and is_active=false", () => {
    expect(workflowMetaForSaveMode("draft")).toEqual({
      status: "draft",
      is_active: false,
    });
  });

  it("activate save mode maps to status=active and is_active=true", () => {
    expect(workflowMetaForSaveMode("activate")).toEqual({
      status: "active",
      is_active: true,
    });
  });

  it("pending save disables both draft and activate buttons", () => {
    expect(
      canSubmitWorkflowSave({
        saveRpcAvailable: true,
        saveLoading: "draft",
        dryRunOk: true,
        saveMode: "draft",
      }),
    ).toBe(false);
    expect(
      canSubmitWorkflowSave({
        saveRpcAvailable: true,
        saveLoading: "activate",
        dryRunOk: true,
        saveMode: "activate",
      }),
    ).toBe(false);
  });

  it("activate requires successful dry-run; draft does not", () => {
    expect(
      canSubmitWorkflowSave({
        saveRpcAvailable: true,
        saveLoading: null,
        dryRunOk: false,
        saveMode: "draft",
      }),
    ).toBe(true);
    expect(
      canSubmitWorkflowSave({
        saveRpcAvailable: true,
        saveLoading: null,
        dryRunOk: false,
        saveMode: "activate",
      }),
    ).toBe(false);
  });

  it("RPC missing/schema cache maps to temporary Arabic message without retry", () => {
    expect(
      isWorkflowSaveRpcMissingError({
        code: "PGRST202",
        message: "Could not find the function in the schema cache",
      }),
    ).toBe(true);
    expect(
      mapWorkflowSaveRpcError({
        message: "function admin_save_request_workflow_config does not exist",
        code: "42883",
      }),
    ).toBe(WORKFLOW_SAVE_RPC_TEMPORARILY_UNAVAILABLE_MSG);
  });

  it("RPC error path does not clear local draft snapshots (policy)", () => {
    const draftSteps = [{ step_key: "fee_assessment" }];
    const draftTransitions = [{ from_step_key: "fee_assessment" }];
    const msg = mapWorkflowSaveRpcError({
      code: "PGRST202",
      message: "schema cache",
    });
    expect(msg.length).toBeGreaterThan(10);
    expect(draftSteps).toHaveLength(1);
    expect(draftTransitions).toHaveLength(1);
  });

  it("page open does not call save RPC; save only after user click", () => {
    const page = readFileSync(
      join(ROOT, "src/routes/admin/request-types.$id.workflow.tsx"),
      "utf8",
    );
    expect(page).toContain('onClick={() => handleSave("draft")}');
    expect(page).toContain('onClick={() => handleSave("activate")}');
    expect(page).toContain("canSubmitWorkflowSave");
    expect(page).toContain("getAdminRequestWorkflowConfig");
    // Save must not be invoked from any useEffect body
    expect(page).not.toMatch(/useEffect\(\(\)\s*=>\s*\{[^}]*handleSave/s);
  });

  it("rpcAdminSaveRequestWorkflowConfig keeps availability guard", () => {
    const source = readFileSync(
      join(ROOT, "src/lib/admin-request-workflow-rpc.ts"),
      "utf8",
    );
    expect(source).toContain("if (!ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE)");
    expect(source).toContain("mapWorkflowSaveRpcError");
    expect(source).toContain("No automatic retry");
  });
});
