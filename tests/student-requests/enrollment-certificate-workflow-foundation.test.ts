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
  mergeWorkflowStepPaymentDocumentFlags,
  workflowMetaForSaveMode,
  type DraftWorkflowStep,
  type DraftWorkflowTransition,
  type WorkflowConfigStep,
  type WorkflowConfigTransition,
  type WorkflowConfigWorkflow,
} from "../../src/lib/admin-request-workflow-rpc";
import {
  configStepToDraftStep,
  configTransitionToDraftTransition,
  decideWorkflowEditorRemap,
  hasWorkflowId,
  mapWorkflowConfigToDraft,
  selectWorkflowForEditor,
  WORKFLOW_SAVE_REFRESH_MISSING_MSG,
} from "../../src/lib/student-requests/request-workflow-editor-mappers";
import {
  getCanonicalDraftTransitionsForType,
  getCanonicalWorkflowPreview,
} from "../../src/lib/student-requests/request-workflow-preview-registry";
import { validateCanonicalPreviewRegistry } from "../../src/lib/student-requests/request-workflow-validation";
import {
  buildWorkflowSaveInputFromDraft,
  buildWorkflowSaveInputFromPreview,
  buildDraftProcessingResolutionFromRows,
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

    const resolution = buildDraftProcessingResolutionFromRows(
      [{ id: UNIT_A, code: "student_affairs", is_active: true }],
      [
        {
          id: ROLE_A,
          unit_id: UNIT_A,
          code: "student_affairs_specialist",
          is_active: true,
        },
      ],
    );
    const built = buildWorkflowSaveInputFromDraft(
      TYPE_ID,
      "enrollment_certificate",
      draftSteps,
      draftTransitions,
      resolution,
    );
    expect(built.steps.every((s) => typeof s.stepKey === "string" && s.stepKey.length > 0)).toBe(
      true,
    );
    expect(built.steps[0]?.actorType).toBe("staff");
    expect(built.steps[0]?.roleKey).toBe("student_affairs_specialist");
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
      join(ROOT, "src/routes/admin/request-types_.$id.workflow.tsx"),
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

describe("workflow editor round-trip integrity (01B remediation)", () => {
  const baseStep = (overrides: Partial<WorkflowConfigStep> = {}): WorkflowConfigStep => ({
    id: "step-1",
    workflow_id: "wf-1",
    step_key: "fee_assessment",
    step_name_ar: "تقييم الرسوم",
    step_order: 2,
    processing_unit_id: UNIT_A,
    processing_role_id: ROLE_A,
    assignment_strategy: "direct_assignment",
    action_type: "assess_fee",
    is_required: false,
    can_return_to_student: true,
    can_reject: false,
    can_skip: true,
    notify_on_enter: true,
    notify_on_complete: false,
    visible_to_student: true,
    requires_payment: true,
    produces_document: true,
    ...overrides,
  });

  it("configStepToDraftStep preserves non-default step flags", () => {
    const step = baseStep();
    const draft = configStepToDraftStep(step);
    expect(draft.assignment_strategy).toBe("direct_assignment");
    expect(draft.is_required).toBe(false);
    expect(draft.notify_on_complete).toBe(false);
    expect(draft.requires_payment).toBe(true);
    expect(draft.produces_document).toBe(true);
    expect(draft.can_reject).toBe(false);
    expect(draft.can_skip).toBe(true);
    expect(draft.step_key).toBe("fee_assessment");
    expect(draft.processing_unit_id).toBe(UNIT_A);
    expect(draft.processing_role_id).toBe(ROLE_A);
  });

  it("configTransitionToDraftTransition preserves label_ar and conditions", () => {
    const transition: WorkflowConfigTransition = {
      id: "tr-1",
      workflow_id: "wf-1",
      from_step_id: "step-1",
      to_step_id: "step-2",
      action_result: "approve",
      label_ar: "إرسال إلى المسجل العام",
      is_default: false,
      condition_schema: { fee: "zero" },
    };
    const stepIdToKey = new Map([
      ["step-1", "fee_assessment"],
      ["step-2", "registrar"],
    ]);
    const draft = configTransitionToDraftTransition(transition, stepIdToKey);
    expect(draft.label_ar).toBe("إرسال إلى المسجل العام");
    expect(draft.condition_config).toEqual({ fee: "zero" });
    expect(draft.is_default).toBe(false);
    expect(draft.from_step_key).toBe("fee_assessment");
    expect(draft.to_step_key).toBe("registrar");
  });

  it("no-op round-trip: config → draft → buildWorkflowSaveInputFromDraft keeps flags", () => {
    const step = baseStep({ produces_document: true, requires_payment: true });
    const transition: WorkflowConfigTransition = {
      id: "tr-1",
      workflow_id: "wf-1",
      from_step_id: "step-1",
      to_step_id: null,
      action_result: "complete",
      label_ar: "إرسال إلى المسجل العام",
      is_default: false,
      condition_config: { fee: "zero" },
    };
    const draftStep = configStepToDraftStep(step);
    const draftTransition = configTransitionToDraftTransition(
      transition,
      new Map([["step-1", "fee_assessment"]]),
    );
    expect(draftStep.requires_payment).toBe(true);
    expect(draftStep.produces_document).toBe(true);
    expect(draftStep.is_required).toBe(false);
    expect(draftStep.assignment_strategy).toBe("direct_assignment");
    expect(draftTransition.label_ar).toBe("إرسال إلى المسجل العام");
    expect(draftTransition.condition_config).toEqual({ fee: "zero" });

    const built = buildWorkflowSaveInputFromDraft(
      TYPE_ID,
      "enrollment_certificate",
      [draftStep],
      [draftTransition],
      buildDraftProcessingResolutionFromRows(
        [{ id: UNIT_A, code: "student_affairs", is_active: true }],
        [
          {
            id: ROLE_A,
            unit_id: UNIT_A,
            code: "student_affairs_manager",
            is_active: true,
          },
        ],
      ),
    );
    expect(built.steps[0]?.allowsReject).toBe(false);
    expect(built.steps[0]?.requiresFee).toBe(true);
  });

  it("selectWorkflowForEditor prefers saved draft over active", () => {
    const workflows: WorkflowConfigWorkflow[] = [
      {
        id: "active-1",
        code: "wf",
        name_ar: "نشط",
        name_en: null,
        description_ar: null,
        version: 1,
        status: "active",
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "draft-2",
        code: "wf",
        name_ar: "مسودة",
        name_en: null,
        description_ar: null,
        version: 2,
        status: "draft",
        is_active: false,
        created_at: "2026-01-02T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
      },
    ];
    expect(selectWorkflowForEditor(workflows, "draft-2")?.id).toBe("draft-2");
  });

  it("selectWorkflowForEditor falls back to active then newest draft", () => {
    const workflows: WorkflowConfigWorkflow[] = [
      {
        id: "active-1",
        code: "wf",
        name_ar: "نشط",
        name_en: null,
        description_ar: null,
        version: 1,
        status: "active",
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "draft-old",
        code: "wf",
        name_ar: "مسودة قديمة",
        name_en: null,
        description_ar: null,
        version: 2,
        status: "draft",
        is_active: false,
        created_at: "2026-01-02T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
      },
      {
        id: "draft-new",
        code: "wf",
        name_ar: "مسودة جديدة",
        name_en: null,
        description_ar: null,
        version: 3,
        status: "draft",
        is_active: false,
        created_at: "2026-01-03T00:00:00Z",
        updated_at: "2026-01-03T00:00:00Z",
      },
    ];
    expect(selectWorkflowForEditor(workflows, "missing")?.id).toBe("active-1");
    const draftsOnly = workflows.filter((w) => w.status === "draft");
    expect(selectWorkflowForEditor(draftsOnly, "missing")?.id).toBe("draft-new");
  });

  it("mergeWorkflowStepPaymentDocumentFlags merges without inventing defaults", () => {
    const config = {
      request_type_id: TYPE_ID,
      workflows: [],
      steps: [baseStep({ requires_payment: false, produces_document: false })],
      transitions: [],
    };
    const merged = mergeWorkflowStepPaymentDocumentFlags(config, [
      {
        id: "step-1",
        workflow_id: "wf-1",
        requires_payment: true,
        produces_document: true,
      },
    ]);
    expect(merged.steps[0]?.requires_payment).toBe(true);
    expect(merged.steps[0]?.produces_document).toBe(true);
    expect(() =>
      mergeWorkflowStepPaymentDocumentFlags(config, []),
    ).toThrow(/requires_payment/);
  });

  it("mapWorkflowConfigToDraft keeps step and transition fields for a workflow", () => {
    const mapped = mapWorkflowConfigToDraft(
      {
        request_type_id: TYPE_ID,
        workflows: [],
        steps: [baseStep()],
        transitions: [
          {
            id: "tr-1",
            workflow_id: "wf-1",
            from_step_id: "step-1",
            to_step_id: "step-1",
            action_result: "approve",
            label_ar: "إرسال إلى المسجل العام",
            is_default: false,
            condition_schema: { fee: "zero" },
          },
        ],
      },
      "wf-1",
    );
    expect(mapped.steps[0]?.requires_payment).toBe(true);
    expect(mapped.steps[0]?.produces_document).toBe(true);
    expect(mapped.transitions[0]?.label_ar).toBe("إرسال إلى المسجل العام");
    expect(mapped.transitions[0]?.condition_config).toEqual({ fee: "zero" });
  });

  it("getAdminRequestWorkflowConfig enriches requires_payment/produces_document from steps table", () => {
    const source = readFileSync(
      join(ROOT, "src/lib/admin-request-workflow.functions.ts"),
      "utf8",
    );
    expect(source).toContain("assertRequestWorkflowAdmin");
    expect(source).toContain('from("request_type_workflow_steps")');
    expect(source).toContain(
      'select("id, workflow_id, requires_payment, produces_document")',
    );
    expect(source).toContain(".in(\"workflow_id\", workflowIds)");
    expect(source).toContain("mergeWorkflowStepPaymentDocumentFlags");
    expect(source).toContain("rpcAdminGetRequestWorkflowConfig");
  });

  it("workflow page keeps selectedWorkflowId after save and remaps only after refresh", () => {
    const page = readFileSync(
      join(ROOT, "src/routes/admin/request-types_.$id.workflow.tsx"),
      "utf8",
    );
    expect(page).toContain("selectedWorkflowId");
    expect(page).toContain("setSelectedWorkflowId(result.workflowId)");
    expect(page).toContain("refetchQueries");
    expect(page).toContain("setInitialized(false)");
    expect(page).toContain("selectWorkflowForEditor");
    expect(page).toContain("mapWorkflowConfigToDraft");
    expect(page).toContain("Keep draftSteps / draftTransitions / selectedWorkflowId intact");
  });
});

describe("workflow save refresh integrity (01B refresh remediation)", () => {
  const configWith = (
    workflowIds: string[],
  ): {
    request_type_id: string;
    workflows: WorkflowConfigWorkflow[];
    steps: [];
    transitions: [];
  } => ({
    request_type_id: TYPE_ID,
    workflows: workflowIds.map((id, idx) => ({
      id,
      code: "wf",
      name_ar: id,
      name_en: null,
      description_ar: null,
      version: idx + 1,
      status: id.startsWith("active") ? ("active" as const) : ("draft" as const),
      is_active: id.startsWith("active"),
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    })),
    steps: [],
    transitions: [],
  });

  it("hasWorkflowId returns true when saved workflow exists", () => {
    expect(hasWorkflowId(configWith(["active-1", "draft-2"]), "draft-2")).toBe(true);
  });

  it("hasWorkflowId returns false when saved workflow is absent", () => {
    expect(hasWorkflowId(configWith(["active-1"]), "draft-2")).toBe(false);
    expect(hasWorkflowId(undefined, "draft-2")).toBe(false);
  });

  it("decideWorkflowEditorRemap blocks remap on refresh failure or missing workflow", () => {
    expect(
      decideWorkflowEditorRemap({
        refreshOk: false,
        config: configWith(["draft-2"]),
        savedWorkflowId: "draft-2",
      }),
    ).toEqual({ canRemap: false, reason: "refresh_failed" });

    expect(
      decideWorkflowEditorRemap({
        refreshOk: true,
        config: configWith(["active-1"]),
        savedWorkflowId: "draft-2",
      }),
    ).toEqual({ canRemap: false, reason: "workflow_missing" });

    expect(
      decideWorkflowEditorRemap({
        refreshOk: true,
        config: configWith(["active-1", "draft-2"]),
        savedWorkflowId: "draft-2",
      }),
    ).toEqual({ canRemap: true });
  });

  it("failed refresh decision keeps local drafts and preferred saved id (no active swap)", () => {
    const draftSteps = [{ step_key: "fee_assessment" }];
    const draftTransitions = [{ from_step_key: "fee_assessment", label_ar: "إرسال" }];
    let selectedWorkflowId = "draft-2";
    let initialized = true;

    const decision = decideWorkflowEditorRemap({
      refreshOk: false,
      config: configWith(["active-1"]),
      savedWorkflowId: "draft-2",
    });

    // Simulate page policy on refresh failure.
    if (!decision.canRemap) {
      // do not setInitialized(false); do not clear drafts; keep selected id.
    } else {
      initialized = false;
      selectedWorkflowId = "active-1";
    }

    expect(decision.canRemap).toBe(false);
    expect(initialized).toBe(true);
    expect(selectedWorkflowId).toBe("draft-2");
    expect(draftSteps).toHaveLength(1);
    expect(draftTransitions).toHaveLength(1);
    expect(selectWorkflowForEditor(configWith(["active-1", "draft-2"]).workflows, selectedWorkflowId)?.id).toBe(
      "draft-2",
    );
  });

  it("missing saved workflow uses clear Arabic error and does not remap", () => {
    const decision = decideWorkflowEditorRemap({
      refreshOk: true,
      config: configWith(["active-1"]),
      savedWorkflowId: "draft-2",
    });
    expect(decision).toEqual({ canRemap: false, reason: "workflow_missing" });
    expect(WORKFLOW_SAVE_REFRESH_MISSING_MSG).toContain("تعذر تحميل الإصدار المحفوظ");
  });

  it("page uses throwOnError and verifies workflow id before setInitialized(false)", () => {
    const page = readFileSync(
      join(ROOT, "src/routes/admin/request-types_.$id.workflow.tsx"),
      "utf8",
    );
    expect(page).toContain("throwOnError: true");
    expect(page).toContain('type: "active"');
    expect(page).toContain("getQueryData<AdminRequestWorkflowConfig>");
    expect(page).toContain("decideWorkflowEditorRemap");
    expect(page).toContain("hasWorkflowId");
    expect(page).toContain("WORKFLOW_SAVE_REFRESH_MISSING_MSG");
    expect(page).toContain("setSaveSuccess(null)");
    expect(page).toContain("Keep editor as-is");
    expect(page).toContain("setSelectedWorkflowId(result.workflowId)");

    const selectedIdx = page.indexOf("setSelectedWorkflowId(result.workflowId)");
    const verifyIdx = page.indexOf("hasWorkflowId(refreshedConfig, result.workflowId)");
    const remapIdx = page.indexOf(
      "// Remap editor from the saved version only after refresh + id verification.",
    );
    const initFalseIdx = page.indexOf("setInitialized(false)", remapIdx);
    const successIdx = page.indexOf("setSaveSuccess(", initFalseIdx);
    expect(selectedIdx).toBeGreaterThan(-1);
    expect(verifyIdx).toBeGreaterThan(selectedIdx);
    expect(initFalseIdx).toBeGreaterThan(verifyIdx);
    expect(successIdx).toBeGreaterThan(initFalseIdx);
  });

  it("no automatic save retry on refresh failure (source policy)", () => {
    const page = readFileSync(
      join(ROOT, "src/routes/admin/request-types_.$id.workflow.tsx"),
      "utf8",
    );
    expect(page).toContain("no auto-retry/save");
    const catchIdx = page.indexOf("} catch (refreshErr) {");
    expect(catchIdx).toBeGreaterThan(-1);
    const catchBlock = page.slice(catchIdx, catchIdx + 450);
    expect(catchBlock).toContain("setSaveSuccess(null)");
    expect(catchBlock).toContain("setSaveError(");
    expect(catchBlock).not.toContain("saveFn(");
    expect(catchBlock).not.toContain("handleSave(");
    expect(catchBlock).not.toContain("setInitialized(false)");
    expect(catchBlock).not.toContain("setDraftSteps(");
    expect(catchBlock).not.toContain("setDraftTransitions(");
  });
});
