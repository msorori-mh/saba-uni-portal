import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  DraftWorkflowStep,
  DraftWorkflowTransition,
} from "../../src/lib/admin-request-workflow-rpc";
import { getCanonicalDraftTransitionsForType } from "../../src/lib/student-requests/request-workflow-preview-registry";
import {
  assertDraftProcessingResolution,
  buildDraftProcessingResolutionFromRows,
  buildWorkflowSaveInputFromDraft,
  draftTransitionsForSaveRpc,
  isExplicitStudentDraftStep,
  normalizeDraftWorkflowStepFlags,
  validateDraftProcessingReferences,
  validateWorkflowSaveInput,
} from "../../src/lib/student-requests/request-workflow-save-contract";

const TYPE_ID = "da670e75-2ce3-4a60-a41e-7eb89fa9dfdc";
const ROOT = join(import.meta.dir, "../..");

const UNIT = {
  student_affairs: "11111111-1111-4111-8111-111111111101",
  finance: "11111111-1111-4111-8111-111111111102",
  registrar: "11111111-1111-4111-8111-111111111103",
  dean: "11111111-1111-4111-8111-111111111104",
  archive: "11111111-1111-4111-8111-111111111105",
} as const;

const ROLE = {
  student_affairs_specialist: "22222222-2222-4222-8222-222222222201",
  student_affairs_manager: "22222222-2222-4222-8222-222222222202",
  revenue_finance_officer: "22222222-2222-4222-8222-222222222203",
  registrar_general: "22222222-2222-4222-8222-222222222204",
  dean: "22222222-2222-4222-8222-222222222205",
  archive_officer: "22222222-2222-4222-8222-222222222206",
} as const;

function enrollmentResolution() {
  return buildDraftProcessingResolutionFromRows(
    [
      { id: UNIT.student_affairs, code: "student_affairs", is_active: true },
      { id: UNIT.finance, code: "finance", is_active: true },
      { id: UNIT.registrar, code: "registrar", is_active: true },
      { id: UNIT.dean, code: "dean", is_active: true },
      { id: UNIT.archive, code: "archive", is_active: true },
    ],
    [
      {
        id: ROLE.student_affairs_specialist,
        unit_id: UNIT.student_affairs,
        code: "student_affairs_specialist",
        is_active: true,
      },
      {
        id: ROLE.student_affairs_manager,
        unit_id: UNIT.student_affairs,
        code: "student_affairs_manager",
        is_active: true,
      },
      {
        id: ROLE.revenue_finance_officer,
        unit_id: UNIT.finance,
        code: "revenue_finance_officer",
        is_active: true,
      },
      {
        id: ROLE.registrar_general,
        unit_id: UNIT.registrar,
        code: "registrar_general",
        is_active: true,
      },
      { id: ROLE.dean, unit_id: UNIT.dean, code: "dean", is_active: true },
      {
        id: ROLE.archive_officer,
        unit_id: UNIT.archive,
        code: "archive_officer",
        is_active: true,
      },
    ],
  );
}

function step(partial: Partial<DraftWorkflowStep> & Pick<
  DraftWorkflowStep,
  "step_key" | "step_name_ar" | "step_order" | "action_type" | "processing_unit_id" | "processing_role_id"
>): DraftWorkflowStep {
  return normalizeDraftWorkflowStepFlags({
    localId: partial.localId ?? crypto.randomUUID(),
    visible_to_student: true,
    notify_on_enter: true,
    can_return_to_student: false,
    can_reject: true,
    can_skip: false,
    ...partial,
  });
}

function enrollmentDraftSteps(): DraftWorkflowStep[] {
  return [
    step({
      step_key: "initial_review",
      step_name_ar: "المراجعة الأولية",
      step_order: 1,
      action_type: "review",
      processing_unit_id: UNIT.student_affairs,
      processing_role_id: ROLE.student_affairs_specialist,
    }),
    step({
      step_key: "fee_assessment",
      step_name_ar: "تقييم الرسوم",
      step_order: 2,
      action_type: "assess_fee",
      processing_unit_id: UNIT.student_affairs,
      processing_role_id: ROLE.student_affairs_manager,
    }),
    step({
      step_key: "payment_confirmation",
      step_name_ar: "تأكيد الدفع",
      step_order: 3,
      action_type: "confirm_payment",
      processing_unit_id: UNIT.finance,
      processing_role_id: ROLE.revenue_finance_officer,
    }),
    step({
      step_key: "registrar_signature",
      step_name_ar: "توقيع مسجل الكلية",
      step_order: 4,
      action_type: "sign",
      processing_unit_id: UNIT.registrar,
      processing_role_id: ROLE.registrar_general,
    }),
    step({
      step_key: "dean_signature",
      step_name_ar: "توقيع العميد",
      step_order: 5,
      action_type: "sign",
      processing_unit_id: UNIT.dean,
      processing_role_id: ROLE.dean,
    }),
    step({
      step_key: "document_issuance",
      step_name_ar: "إصدار الوثيقة",
      step_order: 6,
      action_type: "issue_document",
      processing_unit_id: UNIT.student_affairs,
      processing_role_id: ROLE.student_affairs_specialist,
    }),
    step({
      step_key: "archive",
      step_name_ar: "الأرشيف",
      step_order: 7,
      action_type: "archive",
      processing_unit_id: UNIT.archive,
      processing_role_id: ROLE.archive_officer,
    }),
  ];
}

function enrollmentDraftTransitions(): DraftWorkflowTransition[] {
  return getCanonicalDraftTransitionsForType("enrollment_certificate").map((t, i) => ({
    localId: `t-${i}`,
    from_step_key: t.from_step_key,
    to_step_key: t.to_step_key,
    action_result: t.action_result,
    is_default: t.is_default,
  }));
}

describe("workflow draft processing resolution 01J", () => {
  it("1 — initial_review at order 1 with specialist is staff, not student", () => {
    const draft = enrollmentDraftSteps();
    const built = buildWorkflowSaveInputFromDraft(
      TYPE_ID,
      "enrollment_certificate",
      draft,
      enrollmentDraftTransitions(),
      enrollmentResolution(),
    );
    const initial = built.steps.find((s) => s.stepKey === "initial_review")!;
    expect(initial.actorType).toBe("staff");
    expect(initial.roleKey).toBe("student_affairs_specialist");
    expect(initial.actorType).not.toBe("student");
  });

  it("2 — all seven enrollment steps resolve to expected roleKey", () => {
    const built = buildWorkflowSaveInputFromDraft(
      TYPE_ID,
      "enrollment_certificate",
      enrollmentDraftSteps(),
      enrollmentDraftTransitions(),
      enrollmentResolution(),
    );
    const byKey = Object.fromEntries(built.steps.map((s) => [s.stepKey, s.roleKey]));
    expect(byKey).toEqual({
      initial_review: "student_affairs_specialist",
      fee_assessment: "student_affairs_manager",
      payment_confirmation: "revenue_finance_officer",
      registrar_signature: "registrar_general",
      dean_signature: "dean",
      document_issuance: "student_affairs_specialist",
      archive: "archive_officer",
    });
  });

  it("3 — dean_signature alone isFinalApproval", () => {
    const built = buildWorkflowSaveInputFromDraft(
      TYPE_ID,
      "enrollment_certificate",
      enrollmentDraftSteps(),
      enrollmentDraftTransitions(),
      enrollmentResolution(),
    );
    const finals = built.steps.filter((s) => s.isFinalApproval);
    expect(finals.map((s) => s.stepKey)).toEqual(["dean_signature"]);
  });

  it("4 — fee_assessment requiresFee true", () => {
    const built = buildWorkflowSaveInputFromDraft(
      TYPE_ID,
      "enrollment_certificate",
      enrollmentDraftSteps(),
      enrollmentDraftTransitions(),
      enrollmentResolution(),
    );
    expect(built.steps.find((s) => s.stepKey === "fee_assessment")?.requiresFee).toBe(true);
    expect(built.steps.find((s) => s.stepKey === "payment_confirmation")?.requiresFee).toBe(false);
  });

  it("5 — document_issuance producesDocument true", () => {
    const built = buildWorkflowSaveInputFromDraft(
      TYPE_ID,
      "enrollment_certificate",
      enrollmentDraftSteps(),
      enrollmentDraftTransitions(),
      enrollmentResolution(),
    );
    expect(built.steps.find((s) => s.stepKey === "document_issuance")?.producesDocument).toBe(true);
  });

  it("6 — full draft validates VALID with fee branches and no issues", () => {
    const steps = enrollmentDraftSteps();
    const transitions = enrollmentDraftTransitions();
    expect(steps).toHaveLength(7);
    expect(transitions).toHaveLength(9);
    expect(transitions.some((t) => t.action_result === "payment_required")).toBe(true);
    expect(transitions.some((t) => t.action_result === "fee_not_required")).toBe(true);
    expect(transitions.some((t) => t.action_result === "payment_confirmed")).toBe(true);

    const resolution = enrollmentResolution();
    expect(validateDraftProcessingReferences(steps, resolution)).toEqual([]);

    const built = buildWorkflowSaveInputFromDraft(
      TYPE_ID,
      "enrollment_certificate",
      steps,
      transitions,
      resolution,
    );
    const result = validateWorkflowSaveInput(built);
    expect(result.valid).toBe(true);
    expect(result.status).toBe("VALID");
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(result.issues.filter((i) => i.severity === "warning")).toHaveLength(0);
  });

  it("7 — missing role id blocks validation", () => {
    const resolution = enrollmentResolution();
    const issues = validateDraftProcessingReferences(
      [
        step({
          step_key: "initial_review",
          step_name_ar: "المراجعة الأولية",
          step_order: 1,
          action_type: "review",
          processing_unit_id: UNIT.student_affairs,
          processing_role_id: "99999999-9999-4999-8999-999999999999",
        }),
      ],
      resolution,
    );
    expect(issues.some((i) => i.code === "role_not_found")).toBe(true);
    expect(() =>
      assertDraftProcessingResolution(
        [
          step({
            step_key: "initial_review",
            step_name_ar: "المراجعة الأولية",
            step_order: 1,
            action_type: "review",
            processing_unit_id: UNIT.student_affairs,
            processing_role_id: "99999999-9999-4999-8999-999999999999",
          }),
        ],
        resolution,
      ),
    ).toThrow(/غير نشط أو غير موجود/);
  });

  it("8 — inactive role blocks save", () => {
    const resolution = buildDraftProcessingResolutionFromRows(
      [{ id: UNIT.student_affairs, code: "student_affairs", is_active: true }],
      [
        {
          id: ROLE.student_affairs_specialist,
          unit_id: UNIT.student_affairs,
          code: "student_affairs_specialist",
          is_active: false,
        },
      ],
    );
    const issues = validateDraftProcessingReferences(
      [
        step({
          step_key: "initial_review",
          step_name_ar: "المراجعة الأولية",
          step_order: 1,
          action_type: "review",
          processing_unit_id: UNIT.student_affairs,
          processing_role_id: ROLE.student_affairs_specialist,
        }),
      ],
      resolution,
    );
    expect(issues.some((i) => i.code === "role_inactive")).toBe(true);
  });

  it("9 — role bound to different unit blocks save", () => {
    const resolution = enrollmentResolution();
    const issues = validateDraftProcessingReferences(
      [
        step({
          step_key: "fee_assessment",
          step_name_ar: "تقييم الرسوم",
          step_order: 2,
          action_type: "assess_fee",
          processing_unit_id: UNIT.finance,
          processing_role_id: ROLE.student_affairs_manager,
        }),
      ],
      resolution,
    );
    expect(issues.some((i) => i.code === "role_unit_mismatch")).toBe(true);
    expect(issues[0]?.messageAr).toContain("لا ينتمي إلى الجهة المختارة");
  });

  it("10 — staff step without processing_unit_id is rejected", () => {
    const issues = validateDraftProcessingReferences(
      [
        step({
          step_key: "initial_review",
          step_name_ar: "المراجعة الأولية",
          step_order: 1,
          action_type: "review",
          processing_unit_id: null,
          processing_role_id: ROLE.student_affairs_specialist,
        }),
      ],
      enrollmentResolution(),
    );
    expect(issues.some((i) => i.code === "missing_processing_unit")).toBe(true);
  });

  it("11 — staff step without processing_role_id is rejected", () => {
    const issues = validateDraftProcessingReferences(
      [
        step({
          step_key: "fee_assessment",
          step_name_ar: "تقييم الرسوم",
          step_order: 2,
          action_type: "assess_fee",
          processing_unit_id: UNIT.student_affairs,
          processing_role_id: null,
        }),
      ],
      enrollmentResolution(),
    );
    expect(issues.some((i) => i.code === "missing_processing_role")).toBe(true);
  });

  it("12 — explicit student step without unit/role stays student", () => {
    const studentStep = step({
      step_key: "student",
      step_name_ar: "الطالب",
      step_order: 1,
      action_type: "review",
      processing_unit_id: null,
      processing_role_id: null,
      can_return_to_student: true,
      can_reject: false,
    });
    expect(isExplicitStudentDraftStep(studentStep)).toBe(true);
    const built = buildWorkflowSaveInputFromDraft(
      TYPE_ID,
      "file_withdrawal",
      [studentStep],
      [],
      enrollmentResolution(),
    );
    expect(built.steps[0]?.actorType).toBe("student");
    expect(built.steps[0]?.roleKey).toBeNull();
  });

  it("13 — RPC payload keeps 9 transitions and payment/document flags + IDs", () => {
    const steps = enrollmentDraftSteps();
    const transitions = draftTransitionsForSaveRpc(enrollmentDraftTransitions());
    expect(transitions).toHaveLength(9);
    expect(transitions.some((t) => t.from_step_key === null)).toBe(true);
    expect(transitions.some((t) => t.to_step_key === null)).toBe(true);

    const fee = steps.find((s) => s.step_key === "fee_assessment")!;
    const doc = steps.find((s) => s.step_key === "document_issuance")!;
    expect(fee.requires_payment).toBe(true);
    expect(doc.produces_document).toBe(true);
    expect(fee.processing_unit_id).toBe(UNIT.student_affairs);
    expect(fee.processing_role_id).toBe(ROLE.student_affairs_manager);

    const rpcSteps = steps.map((s) => ({
      step_key: s.step_key,
      processing_unit_id: s.processing_unit_id,
      processing_role_id: s.processing_role_id,
      requires_payment: s.requires_payment,
      produces_document: s.produces_document,
    }));
    expect(rpcSteps.find((s) => s.step_key === "fee_assessment")).toMatchObject({
      requires_payment: true,
      processing_role_id: ROLE.student_affairs_manager,
    });
    expect(rpcSteps.find((s) => s.step_key === "document_issuance")).toMatchObject({
      produces_document: true,
    });
  });

  it("14 — dry-run path never calls save RPC / has no DB writes in prepare handler source", () => {
    const source = readFileSync(
      join(ROOT, "src/lib/admin-request-workflow.functions.ts"),
      "utf8",
    );
    const prepareStart = source.indexOf("export const prepareStudentRequestWorkflowSave");
    const saveStart = source.indexOf("export const saveAdminRequestWorkflowConfig");
    expect(prepareStart).toBeGreaterThan(-1);
    expect(saveStart).toBeGreaterThan(prepareStart);
    const prepareBlock = source.slice(prepareStart, saveStart);
    expect(prepareBlock).toContain("resolveDraftWorkflowProcessingReferences");
    expect(prepareBlock).toContain("validateWorkflowSaveInput");
    expect(prepareBlock).not.toContain("rpcAdminSaveRequestWorkflowConfig");
    expect(prepareBlock).not.toMatch(/\.insert\(/);
    expect(prepareBlock).not.toMatch(/\.update\(/);

    // JSDoc immediately above prepare must document dry-run-only semantics.
    const jsdoc = source.slice(Math.max(0, prepareStart - 200), prepareStart);
    expect(jsdoc.toLowerCase()).toContain("dry-run");
    expect(jsdoc).toMatch(/never writes|لا.*حفظ|no DB|calls save RPC/i);
  });
});
