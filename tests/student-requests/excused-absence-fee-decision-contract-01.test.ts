/**
 * EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 (iteration 2) — source contract for
 * the registrar's fee decision, the reject / return exits and the department
 * prerequisite of «غياب بعذر».
 *
 * These are TypeScript-side proofs. The database-side allow/deny matrix is the
 * direct-RPC rehearsal in scripts/excused-absence-paid-signature-01-pg17.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  B1_STEP_EXIT_REASON_MAX_LENGTH,
  EXCUSED_ABSENCE_DEPARTMENT_REQUIRED_CODE,
  EXCUSED_ABSENCE_FEE_DECISIONS,
  EXCUSED_ABSENCE_FEE_EXEMPTION_REASONS,
  EXCUSED_ABSENCE_FEE_NOT_REQUIRED_CONDITION,
  EXCUSED_ABSENCE_RESUBMIT_RESTART_STEP_KEY,
  EXCUSED_ABSENCE_STEP_EXIT_ACTIONS,
  canConfirmExcusedAbsencePayment,
  canExitExcusedAbsenceStep,
  canRecordExcusedAbsenceFeeDecision,
  canResubmitExcusedAbsenceRequest,
  evaluateExcusedAbsenceDepartmentEligibility,
  excusedAbsenceFeeDecisionStudentMessageAr,
  excusedAbsenceStepsForFeeDecision,
  getB1StepExitActions,
  isValidB1StepExitReason,
  parseExcusedAbsenceFeeDecisionRecord,
  resolveRequestStatusAfterB1StepExit,
  resolveStepAfterExcusedAbsenceFeeDecision,
  validateExcusedAbsenceFeeDecisionInput,
} from "@/lib/student-requests/excused-absence-fee-decision-contract";
import { B1_WORKFLOWS } from "@/lib/student-requests/request-service-adapter";
import {
  RECORD_EXCUSED_ABSENCE_FEE_DECISION_ARG_KEYS,
  RECORD_EXCUSED_ABSENCE_FEE_DECISION_FORBIDDEN_CLIENT_KEYS,
  buildRecordExcusedAbsenceFeeDecisionRpcArgs,
} from "@/lib/student-requests/b1-ui/b1-rpc";
import {
  b1BusinessRuleMessageAr,
  isB1BusinessRuleError,
} from "@/lib/student-requests/b1-ui/b1-business-error-mapping";
import { createMockB1UiAdapter } from "@/lib/student-requests/b1-ui/adapter.mock";
import { B1AdapterError } from "@/lib/student-requests/b1-ui/adapter.types";

const ROOT = join(import.meta.dir, "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

const STEPS = B1_WORKFLOWS.excused_absence;
const step = (key: string) => {
  const found = STEPS.find((item) => item.key === key);
  if (!found) throw new Error(`missing step ${key}`);
  return found;
};

function assigneeContext(key: string) {
  const target = step(key);
  return {
    step: target,
    authenticatedUserId: "user-assignee",
    assignedUserId: "user-assignee",
    actorUnit: target.unit,
    actorRole: target.role,
    stepStatus: "active",
    stepRequestId: "request-1",
    actionRequestId: "request-1",
    predecessorComplete: true,
    actorDepartmentId: "dept-1",
    requiredDepartmentId: "dept-1",
  };
}

describe("fee decision — input contract", () => {
  it("has exactly two engine outcomes and two reasons for the no-fee outcome", () => {
    expect([...EXCUSED_ABSENCE_FEE_DECISIONS]).toEqual(["FEE_REQUIRED", "FEE_NOT_REQUIRED"]);
    expect([...EXCUSED_ABSENCE_FEE_EXEMPTION_REASONS]).toEqual(["FREE_SERVICE", "EXEMPTION"]);
    expect(EXCUSED_ABSENCE_FEE_NOT_REQUIRED_CONDITION).toBe("EXCUSED_ABSENCE_FEE_NOT_REQUIRED");
  });

  it("accepts FEE_REQUIRED without a reason and FEE_NOT_REQUIRED only with one", () => {
    expect(validateExcusedAbsenceFeeDecisionInput({ stepId: "s", decision: "FEE_REQUIRED" })).toEqual({
      valid: true,
      normalized: { stepId: "s", decision: "FEE_REQUIRED", exemptionReason: null, note: null },
    });
    for (const reason of EXCUSED_ABSENCE_FEE_EXEMPTION_REASONS) {
      expect(
        validateExcusedAbsenceFeeDecisionInput({
          stepId: " s ",
          decision: "FEE_NOT_REQUIRED",
          exemptionReason: reason,
          note: "  ملاحظة  ",
        }),
      ).toEqual({
        valid: true,
        normalized: { stepId: "s", decision: "FEE_NOT_REQUIRED", exemptionReason: reason, note: "ملاحظة" },
      });
    }
  });

  it("fails closed on a missing or invalid decision, reason or step", () => {
    const error = (input: Parameters<typeof validateExcusedAbsenceFeeDecisionInput>[0]) => {
      const result = validateExcusedAbsenceFeeDecisionInput(input);
      return result.valid ? null : result.error;
    };
    expect(error({ stepId: "", decision: "FEE_REQUIRED" })).toBe("step_id_required");
    for (const decision of ["", "fee_required", "FREE", "SKIP", "FEE_WAIVED", "0"]) {
      expect(error({ stepId: "s", decision })).toBe("decision_invalid");
    }
    expect(error({ stepId: "s", decision: "FEE_NOT_REQUIRED" })).toBe("exemption_reason_required");
    expect(error({ stepId: "s", decision: "FEE_NOT_REQUIRED", exemptionReason: "" })).toBe(
      "exemption_reason_required",
    );
    expect(error({ stepId: "s", decision: "FEE_NOT_REQUIRED", exemptionReason: "OTHER" })).toBe(
      "exemption_reason_required",
    );
    expect(error({ stepId: "s", decision: "FEE_REQUIRED", exemptionReason: "EXEMPTION" })).toBe(
      "exemption_reason_forbidden",
    );
    expect(error({ stepId: "s", decision: "FEE_REQUIRED", note: "x".repeat(501) })).toBe("note_too_long");
  });

  it("sends the RPC a decision and a reason only — never an amount, currency or identity", () => {
    expect([...RECORD_EXCUSED_ABSENCE_FEE_DECISION_ARG_KEYS]).toEqual([
      "p_step_id",
      "p_decision",
      "p_exemption_reason",
      "p_note",
    ]);
    const args = buildRecordExcusedAbsenceFeeDecisionRpcArgs({
      stepId: "step-1",
      decision: "FEE_NOT_REQUIRED",
      exemptionReason: "EXEMPTION",
      // hostile extras must never reach the RPC payload
      ...({ amount: 5000, currency: "YER", decided_by: "someone", request_id: "other" } as object),
    });
    expect(Object.keys(args).sort()).toEqual([...RECORD_EXCUSED_ABSENCE_FEE_DECISION_ARG_KEYS].sort());
    for (const key of RECORD_EXCUSED_ABSENCE_FEE_DECISION_FORBIDDEN_CLIENT_KEYS) {
      expect(Object.keys(args)).not.toContain(key);
    }
    expect(() =>
      buildRecordExcusedAbsenceFeeDecisionRpcArgs({ stepId: "step-1", decision: "FEE_NOT_REQUIRED" }),
    ).toThrow("B1_EXCUSED_ABSENCE_FEE_DECISION_INPUT_INVALID:exemption_reason_required");
  });
});

describe("fee decision — routing and authorization", () => {
  it("routes FEE_REQUIRED to payment confirmation and FEE_NOT_REQUIRED past it", () => {
    expect(resolveStepAfterExcusedAbsenceFeeDecision("FEE_REQUIRED")).toBe("payment_confirmation");
    expect(resolveStepAfterExcusedAbsenceFeeDecision("FEE_NOT_REQUIRED")).toBe("department_head_signature");
    expect(excusedAbsenceStepsForFeeDecision("FEE_REQUIRED").map((item) => item.key)).toEqual(
      STEPS.map((item) => item.key),
    );
    expect(excusedAbsenceStepsForFeeDecision(null).map((item) => item.key)).toEqual(
      STEPS.map((item) => item.key),
    );
    expect(excusedAbsenceStepsForFeeDecision("FEE_NOT_REQUIRED").map((item) => item.key)).toEqual(
      STEPS.map((item) => item.key).filter((key) => key !== "payment_confirmation"),
    );
  });

  it("lets finance confirm only a payment the registrar actually required", () => {
    expect(canConfirmExcusedAbsencePayment("FEE_REQUIRED")).toBe(true);
    expect(canConfirmExcusedAbsencePayment("FEE_NOT_REQUIRED")).toBe(false);
    expect(canConfirmExcusedAbsencePayment(null)).toBe(false);
    expect(canConfirmExcusedAbsencePayment(undefined)).toBe(false);
  });

  it("allows only the registrar step's exact direct assignee to record the decision", () => {
    const { step: _ignored, ...base } = assigneeContext("registrar_fee_referral");
    const allow = { ...base, stepKey: "registrar_fee_referral" };
    expect(canRecordExcusedAbsenceFeeDecision(allow)).toBe(true);

    const denials: Array<[string, Partial<typeof allow>]> = [
      ["anonymous", { authenticatedUserId: null }],
      ["another user", { authenticatedUserId: "user-other" }],
      ["no assignee", { assignedUserId: null }],
      ["dean", { actorUnit: "dean", actorRole: "dean" }],
      ["finance", { actorUnit: "finance", actorRole: "revenue_finance_officer" }],
      ["student affairs manager", { actorUnit: "student_affairs", actorRole: "student_affairs_manager" }],
      ["department head", { actorUnit: "department", actorRole: "department_head" }],
      ["admin role", { actorUnit: "registrar", actorRole: "admin" }],
      ["wrong registrar role", { actorUnit: "registrar", actorRole: "registrar_clerk" }],
      ["inactive step", { stepStatus: "pending" }],
      ["completed step", { stepStatus: "completed" }],
      ["another request", { actionRequestId: "request-2" }],
      ["predecessor incomplete", { predecessorComplete: false }],
    ];
    for (const [label, patch] of denials) {
      expect(canRecordExcusedAbsenceFeeDecision({ ...allow, ...patch }), label).toBe(false);
    }
    // the decision belongs to the registrar step — no other step can carry it
    for (const other of STEPS.filter((item) => item.key !== "registrar_fee_referral")) {
      const { step: _s, ...ctx } = assigneeContext(other.key);
      expect(canRecordExcusedAbsenceFeeDecision({ ...ctx, stepKey: other.key }), other.key).toBe(false);
    }
  });

  it("parses the read payload fail-closed and words it for the student without any amount", () => {
    expect(parseExcusedAbsenceFeeDecisionRecord(null)).toBeNull();
    expect(parseExcusedAbsenceFeeDecisionRecord({ decision: "PAID" })).toBeNull();
    expect(parseExcusedAbsenceFeeDecisionRecord({ decision: "FEE_NOT_REQUIRED" })).toBeNull();
    expect(
      parseExcusedAbsenceFeeDecisionRecord({ decision: "FEE_REQUIRED", exemptionReason: "EXEMPTION" }),
    ).toBeNull();
    expect(
      parseExcusedAbsenceFeeDecisionRecord({
        requestId: "r",
        decision: "FEE_NOT_REQUIRED",
        exemptionReason: "FREE_SERVICE",
        decidedAt: "2026-10-06T00:00:00Z",
        decidedBy: "staff-uuid",
      }),
    ).toEqual({
      requestId: "r",
      decision: "FEE_NOT_REQUIRED",
      exemptionReason: "FREE_SERVICE",
      decidedAt: "2026-10-06T00:00:00Z",
    });

    const required = excusedAbsenceFeeDecisionStudentMessageAr({ decision: "FEE_REQUIRED", exemptionReason: null });
    expect(required).toContain("النظام الجامعي الرئيسي");
    expect(required).toContain("لا يتم أي سداد داخل هذه البوابة");
    const exempt = excusedAbsenceFeeDecisionStudentMessageAr({
      decision: "FEE_NOT_REQUIRED",
      exemptionReason: "EXEMPTION",
    });
    expect(exempt).toContain("لا يستلزم سداد رسوم");
    expect(exempt).toContain("إعفاء");
    for (const text of [required, exempt]) expect(text).not.toMatch(/\d|ريال|دولار|YER|USD/);
  });
});

describe("reject / return — this service only", () => {
  it("offers reject on five steps and return on the first two only", () => {
    expect(EXCUSED_ABSENCE_STEP_EXIT_ACTIONS).toEqual({
      dean_review: ["return", "reject"],
      registrar_fee_referral: ["return", "reject"],
      payment_confirmation: [],
      department_head_signature: ["reject"],
      dean_signature: ["reject"],
      student_affairs_manager_signature: ["reject"],
      record_apply: [],
      archive: [],
    });
    expect(Object.keys(EXCUSED_ABSENCE_STEP_EXIT_ACTIONS)).toEqual(STEPS.map((item) => item.key));
    expect(getB1StepExitActions("excused_absence", "dean_review")).toEqual(["return", "reject"]);
    expect(getB1StepExitActions("absence_excuse", "dean_signature")).toEqual(["reject"]);
    expect(getB1StepExitActions("excused_absence", "unknown_step")).toEqual([]);
  });

  it("offers no exit on any other B1 service (unchanged behaviour)", () => {
    for (const service of ["enrollment_suspension", "department_transfer", "final_chance", "file_withdrawal"] as const) {
      for (const other of B1_WORKFLOWS[service]) {
        expect(getB1StepExitActions(service, other.key), `${service}/${other.key}`).toEqual([]);
      }
    }
    expect(getB1StepExitActions("enrollment_certificate", "dean_review")).toEqual([]);
    expect(getB1StepExitActions(null, "dean_review")).toEqual([]);
  });

  it("requires a real reason", () => {
    for (const bad of [null, undefined, "", "    ", "abcd", "x".repeat(B1_STEP_EXIT_REASON_MAX_LENGTH + 1)]) {
      expect(isValidB1StepExitReason(bad)).toBe(false);
    }
    expect(isValidB1StepExitReason("المرفق غير واضح")).toBe(true);
  });

  it("authorizes an exit exactly like acting on the step, and denies everyone else", () => {
    const reason = "سبب واضح للطالب";
    for (const target of STEPS) {
      const base = assigneeContext(target.key);
      for (const exitAction of ["reject", "return"] as const) {
        const offered = (EXCUSED_ABSENCE_STEP_EXIT_ACTIONS[target.key] ?? []).includes(exitAction);
        expect(canExitExcusedAbsenceStep({ ...base, exitAction, reason }), `${target.key}/${exitAction}`).toBe(
          offered,
        );
        if (!offered) continue;
        const denials: Array<[string, object]> = [
          ["anonymous", { authenticatedUserId: null }],
          ["not the assignee", { authenticatedUserId: "user-other" }],
          ["wrong unit", { actorUnit: "archive", actorRole: "archive_officer" }],
          ["admin role in the right unit", { actorRole: "admin" }],
          ["inactive step", { stepStatus: "pending" }],
          ["finished step", { stepStatus: "completed" }],
          ["other request", { actionRequestId: "request-2" }],
          ["predecessor incomplete", { predecessorComplete: false }],
          ["no reason", { reason: "  " }],
          ["unknown exit", { exitAction: "cancel" }],
        ];
        for (const [label, patch] of denials) {
          expect(
            canExitExcusedAbsenceStep({ ...base, exitAction, reason, ...patch }),
            `${target.key}/${exitAction}/${label}`,
          ).toBe(false);
        }
      }
    }
    // the head of another department cannot reject at the signature step
    expect(
      canExitExcusedAbsenceStep({
        ...assigneeContext("department_head_signature"),
        actorDepartmentId: "dept-2",
        exitAction: "reject",
        reason,
      }),
    ).toBe(false);
    // a step object of another service is never accepted
    expect(
      canExitExcusedAbsenceStep({
        ...assigneeContext("dean_review"),
        step: { ...step("dean_review") },
        exitAction: "reject",
        reason,
      }),
    ).toBe(false);
  });

  it("uses the existing status vocabulary and restarts a returned request at the dean", () => {
    expect(resolveRequestStatusAfterB1StepExit("reject")).toBe("rejected");
    expect(resolveRequestStatusAfterB1StepExit("return")).toBe("returned_for_completion");
    expect(EXCUSED_ABSENCE_RESUBMIT_RESTART_STEP_KEY).toBe("dean_review");
    expect(STEPS[0]!.key).toBe(EXCUSED_ABSENCE_RESUBMIT_RESTART_STEP_KEY);
    expect(canResubmitExcusedAbsenceRequest("returned_for_completion")).toBe(true);
    for (const status of ["rejected", "completed", "in_review", "submitted", "draft"]) {
      expect(canResubmitExcusedAbsenceRequest(status), status).toBe(false);
    }
  });
});

describe("department prerequisite and error wording", () => {
  it("blocks a student without a department before submission, in student-friendly Arabic", () => {
    expect(evaluateExcusedAbsenceDepartmentEligibility({ departmentId: "d" })).toEqual({ eligible: true });
    expect(evaluateExcusedAbsenceDepartmentEligibility({ departmentLabelAr: "علوم الحاسوب" })).toEqual({
      eligible: true,
    });
    for (const input of [{}, { departmentId: null }, { departmentId: "  ", departmentLabelAr: "" }]) {
      const result = evaluateExcusedAbsenceDepartmentEligibility(input);
      expect(result.eligible).toBe(false);
      if (!result.eligible) {
        expect(result.code).toBe(EXCUSED_ABSENCE_DEPARTMENT_REQUIRED_CODE);
        expect(result.messageAr).toContain("قسمك العلمي");
        expect(result.messageAr).not.toMatch(/[A-Za-z_]{4,}/);
      }
    }
  });

  it("maps every new database code to Arabic and never leaks the raw code", () => {
    for (const code of [
      "B1_EXCUSED_ABSENCE_STUDENT_DEPARTMENT_REQUIRED",
      "B1_EXCUSED_ABSENCE_DEPARTMENT_HEAD_ASSIGNMENT_REQUIRED",
      "B1_EXCUSED_ABSENCE_FEE_DECISION_REQUIRED",
      "B1_EXCUSED_ABSENCE_DECISION_REASON_REQUIRED",
    ]) {
      expect(isB1BusinessRuleError(`${code}: تفاصيل`), code).toBe(true);
      const message = b1BusinessRuleMessageAr(code);
      expect(message, code).toMatch(/[؀-ۿ]/);
      expect(message, code).not.toContain("B1_");
    }
    // the draft raises exactly the codes the client knows
    const draft = read("docs", "migration-drafts", "EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.sql");
    const mapping = read("src", "lib", "student-requests", "b1-ui", "b1-business-error-mapping.ts");
    const raised = new Set(
      [...draft.matchAll(/RAISE EXCEPTION '(B1_EXCUSED_ABSENCE_[A-Z_]+)/g)].map((match) => match[1]!),
    );
    expect(raised.size).toBeGreaterThanOrEqual(6);
    for (const code of raised) {
      const known =
        mapping.includes(code) ||
        /B1_EXCUSED_ABSENCE_FEE_DECISION_(IS_IMMUTABLE|ROUTING_MISMATCH|INPUT_INVALID)/.test(code);
      expect(known, code).toBe(true);
    }
  });
});

describe("mock adapter — fee decision, return and reject journeys", () => {
  const FORM = {
    course_section_id: "mock-course-cs101",
    absence_date: "2026-03-01",
    reason_type: "medical",
    absence_reason_detail: "ظرف طبي (بيانات تجريبية).",
  };
  const pdf = () => new File([new Uint8Array(1024)], "mock-excuse.pdf", { type: "application/pdf" });

  async function submitted() {
    const adapter = createMockB1UiAdapter();
    const draft = await adapter.createB1RequestDraft("excused_absence");
    await adapter.saveB1RequestDraft(draft.requestId, FORM, draft.updatedAt);
    await adapter.uploadB1RequestAttachment(draft.requestId, "excuse_documents", pdf());
    const refreshed = await adapter.getB1RequestDraft(draft.requestId);
    await adapter.submitB1Request(draft.requestId, refreshed!.updatedAt);
    const active = async () => {
      const details = await adapter.getB1RequestDetails(draft.requestId);
      const item = (await adapter.getAssignedB1Requests()).find((row) => row.requestId === draft.requestId);
      return { details, item };
    };
    return { adapter, requestId: draft.requestId, active };
  }

  async function denied(promise: Promise<unknown>, code: string) {
    try {
      await promise;
    } catch (error) {
      expect(error).toBeInstanceOf(B1AdapterError);
      expect((error as B1AdapterError).code).toBe(code);
      return;
    }
    throw new Error(`expected ${code}`);
  }

  it("FEE_REQUIRED keeps the payment step; the registrar cannot finish the step without a decision", async () => {
    const { adapter, requestId, active } = await submitted();
    let { item } = await active();
    expect(item!.stepKey).toBe("dean_review");
    await adapter.actOnB1RequestStep(item!.stepId, "review");
    ({ item } = await active());
    expect(item!.stepKey).toBe("registrar_fee_referral");

    await denied(adapter.actOnB1RequestStep(item!.stepId, "review"), "BUSINESS_RULE_BLOCKED");
    await denied(adapter.actOnB1RequestStep(item!.stepId, "approve"), "BUSINESS_RULE_BLOCKED");
    await denied(
      adapter.recordB1ExcusedAbsenceFeeDecision(item!.stepId, { decision: "FEE_NOT_REQUIRED" } as never),
      "VALIDATION_ERROR",
    );
    expect(await adapter.getB1ExcusedAbsenceFeeDecision(requestId)).toBeNull();

    await adapter.recordB1ExcusedAbsenceFeeDecision(item!.stepId, { decision: "FEE_REQUIRED" });
    const registrarStepId = item!.stepId;
    ({ item } = await active());
    expect(item!.stepKey).toBe("payment_confirmation");
    expect((await adapter.getB1ExcusedAbsenceFeeDecision(requestId))!.decision).toBe("FEE_REQUIRED");
    // the decision cannot be recorded again once the step is complete
    await denied(
      adapter.recordB1ExcusedAbsenceFeeDecision(registrarStepId, {
        decision: "FEE_NOT_REQUIRED",
        exemptionReason: "EXEMPTION",
      }),
      "PERMISSION_DENIED",
    );
    expect((await adapter.getB1ExcusedAbsenceFeeDecision(requestId))!.decision).toBe("FEE_REQUIRED");
  });

  it("FEE_NOT_REQUIRED skips payment confirmation and goes to the department head", async () => {
    const { adapter, requestId, active } = await submitted();
    let { item } = await active();
    await adapter.actOnB1RequestStep(item!.stepId, "review");
    ({ item } = await active());
    await adapter.recordB1ExcusedAbsenceFeeDecision(item!.stepId, {
      decision: "FEE_NOT_REQUIRED",
      exemptionReason: "FREE_SERVICE",
    });
    const after = await active();
    expect(after.item!.stepKey).toBe("department_head_signature");
    expect(after.details.steps.map((entry) => entry.key)).not.toContain("payment_confirmation");
    expect(await adapter.getB1ExcusedAbsenceFeeDecision(requestId)).toMatchObject({
      decision: "FEE_NOT_REQUIRED",
      exemptionReason: "FREE_SERVICE",
    });
    // a signature step may reject but never return
    await denied(adapter.actOnB1RequestStep(after.item!.stepId, "return", "سبب واضح"), "PERMISSION_DENIED");
    await denied(adapter.actOnB1RequestStep(after.item!.stepId, "reject"), "VALIDATION_ERROR");
    await adapter.actOnB1RequestStep(after.item!.stepId, "reject", "العذر غير مقبول");
    const closed = await active();
    expect(closed.item).toBeUndefined();
    expect(closed.details.status).toBe("rejected");
  });

  it("the fee decision is refused on every step other than the registrar's", async () => {
    const { adapter, active } = await submitted();
    const { item } = await active();
    expect(item!.stepKey).toBe("dean_review");
    await denied(
      adapter.recordB1ExcusedAbsenceFeeDecision(item!.stepId, { decision: "FEE_REQUIRED" }),
      "PERMISSION_DENIED",
    );
    const seeded = (await adapter.getAssignedB1Requests()).find(
      (row) => row.serviceCode === "department_transfer",
    );
    await denied(
      adapter.recordB1ExcusedAbsenceFeeDecision(seeded!.stepId, { decision: "FEE_REQUIRED" }),
      "PERMISSION_DENIED",
    );
  });
});

describe("UI source — registrar fee card, exit panels, student summary", () => {
  const card = read("src", "components", "student-requests", "b1", "B1FeeDecisionCard.tsx");
  const section = read("src", "components", "student-requests", "b1", "B1StaffStepActionSection.tsx");
  const detail = read("src", "components", "student-requests", "b1", "B1StudentRequestDetail.tsx");
  const form = read("src", "components", "student-requests", "b1", "B1StudentRequestForm.tsx");

  it("the registrar card collects a decision and a reason — no amount or currency field", () => {
    expect(card).toContain('data-testid="b1-fee-decision-card"');
    expect(card).toContain('data-testid="b1-fee-decision-reason"');
    expect(card).toContain("EXCUSED_ABSENCE_FEE_DECISIONS");
    expect(card).toContain("EXCUSED_ABSENCE_FEE_EXEMPTION_REASONS");
    expect(card).not.toMatch(/type="number"|inputMode="(numeric|decimal)"|amount|currency/i);
  });

  it("routes the registrar step to the fee card and offers exits only from the contract", () => {
    expect(section).toContain("B1FeeDecisionCard");
    expect(section).toContain("EXCUSED_ABSENCE_FEE_DECISION_STEP_KEY");
    expect(section).toContain("getB1StepExitActions(");
    expect(section).toContain('data-testid="b1-staff-exit-actions"');
  });

  it("shows the student the decision and the department prerequisite", () => {
    expect(detail).toContain('data-testid="b1-fee-decision-summary"');
    expect(detail).toContain("excusedAbsenceFeeDecisionStudentMessageAr");
    expect(form).toContain('data-testid="b1-department-required-notice"');
    expect(form).toContain("evaluateExcusedAbsenceDepartmentEligibility");
  });
});
