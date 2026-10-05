import { describe, expect, it } from "bun:test";
import { B1_SERVICE_ADAPTERS, B1_WORKFLOWS } from "../../src/lib/student-requests/request-service-adapter";
import {
  ENROLLMENT_SUSPENSION_FEE_POLICY,
  EXCUSED_ABSENCE_FEE_POLICY,
  SUSPENSION_ABSENCE_FEE_POLICY,
  canActOnSuspensionAbsenceStep,
  canCompleteSuspensionAbsence,
} from "../../src/lib/student-requests/suspension-absence-contract";

describe("suspension and excused absence source contract", () => {
  it("binds and validates the complete suspension contract", () => {
    const adapter = B1_SERVICE_ADAPTERS.enrollment_suspension;
    expect(adapter.detailBinding.fields).toEqual([
      { formField: "target_academic_year", detailField: "requested_from_academic_year_id" },
      { formField: "target_semester", detailField: "requested_from_semester_id" },
      { formField: "suspension_reason", detailField: "suspension_reason" },
      { formField: "suspension_duration_type", detailField: "suspension_duration_type" },
      { formField: "notes", detailField: "notes" },
    ]);
    const valid = { target_academic_year: "year", target_semester: "semester", suspension_reason: "reason", suspension_duration_type: "one_semester", terms_acknowledgment: true };
    expect(adapter.validate(valid)).toEqual({ valid: true, errors: {} });
    expect(adapter.validate({ ...valid, suspension_duration_type: "invented", terms_acknowledgment: false })).toMatchObject({
      valid: false, errors: { suspension_duration_type: "unknown_duration_type", terms_acknowledgment: "required_true" },
    });
  });

  it("requires a secure attachment and known reason for absence", () => {
    const adapter = B1_SERVICE_ADAPTERS.excused_absence;
    const valid = { course_section_id: "section", absence_date: "2026-07-17", reason_type: "medical", absence_reason_detail: "detail", excuse_documents: { fileName: "excuse.pdf", storagePath: "student-requests/student/request/excuse.pdf" } };
    expect(adapter.validate(valid)).toEqual({ valid: true, errors: {} });
    expect(adapter.validate({ ...valid, reason_type: "invented", excuse_documents: null })).toMatchObject({
      valid: false, errors: { reason_type: "unknown_reason_type", excuse_documents: "secure_attachment_required" },
    });
  });

  for (const service of ["enrollment_suspension", "excused_absence"] as const) {
    for (const step of B1_WORKFLOWS[service]) {
      it(`${service}/${step.key} allows only its exact direct assignee`, () => {
        const isDepartmentStep = step.role === "department_head";
        const base = {
          service, stepKey: step.key, assignedFacultyProfileId: "assigned",
          actor: { facultyProfileId: "assigned", unit: step.unit, role: step.role, departmentId: isDepartmentStep ? "student-dept" : null },
          action: step.action, predecessorComplete: true,
          studentDepartmentId: isDepartmentStep ? "student-dept" : null,
        };
        expect(canActOnSuspensionAbsenceStep(base)).toBe(true);
        expect(canActOnSuspensionAbsenceStep({ ...base, actor: { ...base.actor, facultyProfileId: "same-role-other" } })).toBe(false);
        for (const role of ["admin", "registrar_general", "dean"]) expect(canActOnSuspensionAbsenceStep({ ...base, actor: { ...base.actor, facultyProfileId: "bypass", role } })).toBe(false);
        expect(canActOnSuspensionAbsenceStep({ ...base, predecessorComplete: false })).toBe(false);
        expect(canActOnSuspensionAbsenceStep({ ...base, action: "wrong_action" })).toBe(false);
        expect(canActOnSuspensionAbsenceStep({ ...base, assignedFacultyProfileId: null })).toBe(false);
        expect(canActOnSuspensionAbsenceStep({ ...base, actor: { ...base.actor, unit: "wrong-unit" } })).toBe(false);
        // every other step's unit/role of the same cycle is denied on this step
        for (const other of B1_WORKFLOWS[service]) {
          if (other.unit === step.unit && other.role === step.role) continue;
          expect(canActOnSuspensionAbsenceStep({ ...base, actor: { ...base.actor, unit: other.unit, role: other.role } })).toBe(false);
          expect(canActOnSuspensionAbsenceStep({ ...base, actor: { ...base.actor, facultyProfileId: "other-holder", unit: other.unit, role: other.role } })).toBe(false);
        }
      });
    }
  }

  it("lets only the head of the student's own department sign the absence form", () => {
    const base = {
      service: "excused_absence" as const, stepKey: "department_head_signature", assignedFacultyProfileId: "head-cs",
      actor: { facultyProfileId: "head-cs", unit: "department", role: "department_head", departmentId: "cs" },
      action: "approve", predecessorComplete: true, studentDepartmentId: "cs",
    };
    expect(canActOnSuspensionAbsenceStep(base)).toBe(true);
    expect(canActOnSuspensionAbsenceStep({ ...base, actor: { ...base.actor, departmentId: "is" } })).toBe(false);
    expect(canActOnSuspensionAbsenceStep({ ...base, assignedFacultyProfileId: "head-is", actor: { ...base.actor, facultyProfileId: "head-is", departmentId: "is" } })).toBe(false);
    expect(canActOnSuspensionAbsenceStep({ ...base, studentDepartmentId: null })).toBe(false);
    expect(canActOnSuspensionAbsenceStep({ ...base, studentDepartmentId: undefined })).toBe(false);
    expect(canActOnSuspensionAbsenceStep({ ...base, actor: { ...base.actor, role: "dean", unit: "dean" } })).toBe(false);
    expect(canActOnSuspensionAbsenceStep({ ...base, stepKey: "manager_review" })).toBe(false);
  });

  it("fails closed on service-specific completion conditions", () => {
    const suspensionSteps = B1_WORKFLOWS.enrollment_suspension.map((step) => step.key);
    expect(canCompleteSuspensionAbsence({ service: "enrollment_suspension", completedStepKeys: suspensionSteps, academicStatusApplied: false })).toBe(false);
    expect(canCompleteSuspensionAbsence({ service: "enrollment_suspension", completedStepKeys: suspensionSteps, academicStatusApplied: true })).toBe(true);
    const absenceSteps = B1_WORKFLOWS.excused_absence.map((step) => step.key);
    const applied = [{ recordAppliedAt: "2026-07-17T00:00:00Z" }];
    expect(canCompleteSuspensionAbsence({ service: "excused_absence", completedStepKeys: absenceSteps, absenceRows: [], feeDecision: "FEE_REQUIRED" })).toBe(false);
    expect(canCompleteSuspensionAbsence({ service: "excused_absence", completedStepKeys: absenceSteps, absenceRows: [{ recordAppliedAt: null }], feeDecision: "FEE_REQUIRED" })).toBe(false);
    expect(canCompleteSuspensionAbsence({ service: "excused_absence", completedStepKeys: absenceSteps, absenceRows: applied, feeDecision: "FEE_REQUIRED" })).toBe(true);
    // no recorded fee decision → never complete, even with every step done
    expect(canCompleteSuspensionAbsence({ service: "excused_absence", completedStepKeys: absenceSteps, absenceRows: applied })).toBe(false);
    expect(canCompleteSuspensionAbsence({ service: "excused_absence", completedStepKeys: absenceSteps, absenceRows: applied, feeDecision: null })).toBe(false);
    // FEE_NOT_REQUIRED: payment confirmation is bypassed — and must NOT have happened
    const withoutPayment = absenceSteps.filter((key) => key !== "payment_confirmation");
    expect(canCompleteSuspensionAbsence({ service: "excused_absence", completedStepKeys: withoutPayment, absenceRows: applied, feeDecision: "FEE_NOT_REQUIRED" })).toBe(true);
    expect(canCompleteSuspensionAbsence({ service: "excused_absence", completedStepKeys: absenceSteps, absenceRows: applied, feeDecision: "FEE_NOT_REQUIRED" })).toBe(false);
    // FEE_REQUIRED: skipping payment confirmation is never a completed request
    expect(canCompleteSuspensionAbsence({ service: "excused_absence", completedStepKeys: withoutPayment, absenceRows: applied, feeDecision: "FEE_REQUIRED" })).toBe(false);
  });

  it("requires the excuse to be recorded AND the request archived before completion", () => {
    const allButArchive = B1_WORKFLOWS.excused_absence.map((step) => step.key).filter((key) => key !== "archive");
    for (const feeDecision of ["FEE_REQUIRED", "FEE_NOT_REQUIRED"] as const) {
      expect(canCompleteSuspensionAbsence({ service: "excused_absence", completedStepKeys: allButArchive, absenceRows: [{ recordAppliedAt: "2026-07-17T00:00:00Z" }], feeDecision })).toBe(false);
      expect(canCompleteSuspensionAbsence({ service: "excused_absence", completedStepKeys: ["student_affairs_intake", "manager_review", "record_apply"], absenceRows: [{ recordAppliedAt: "2026-07-17T00:00:00Z" }], feeDecision })).toBe(false);
    }
    const allButPayment = B1_WORKFLOWS.excused_absence.map((step) => step.key).filter((key) => key !== "payment_confirmation");
    expect(canCompleteSuspensionAbsence({ service: "excused_absence", completedStepKeys: allButPayment, absenceRows: [{ recordAppliedAt: "2026-07-17T00:00:00Z" }], feeDecision: "FEE_REQUIRED" })).toBe(false);
  });

  it("keeps suspension free: no fees, portal payment, amounts, currencies, or document issuance", () => {
    expect(ENROLLMENT_SUSPENSION_FEE_POLICY).toEqual({ feeRequired: false, portalPaymentAllowed: false, amountOrCurrencyAllowed: false, documentIssuanceAllowed: false });
    expect(SUSPENSION_ABSENCE_FEE_POLICY).toBe(ENROLLMENT_SUSPENSION_FEE_POLICY);
    expect(B1_SERVICE_ADAPTERS.enrollment_suspension.feePolicy).toBe("FREE_NO_PAYMENT");
  });

  it("charges excused absence outside the portal only: no gateway, amount, currency, or document", () => {
    expect(EXCUSED_ABSENCE_FEE_POLICY).toEqual({
      feeDecidedByRegistrarPerRequest: true,
      externalUniversityPaymentConfirmationWhenFeeRequired: true,
      portalPaymentAllowed: false,
      amountOrCurrencyAllowed: false,
      documentIssuanceAllowed: false,
    });
    expect(B1_SERVICE_ADAPTERS.excused_absence.feePolicy).toBe("REGISTRAR_FEE_DECISION_EXTERNAL_PAYMENT");
    const payment = B1_WORKFLOWS.excused_absence.filter((step) => step.action === "confirm_payment");
    expect(payment).toEqual([{ key: "payment_confirmation", unit: "finance", role: "revenue_finance_officer", action: "confirm_payment" }]);
    expect(B1_WORKFLOWS.excused_absence.some((step) => step.key === "fee_assessment" || (step.action as string) === "assess_fee")).toBe(false);
  });
});
