import { describe, expect, it } from "bun:test";
import { B1_SERVICE_ADAPTERS, B1_WORKFLOWS } from "../../src/lib/student-requests/request-service-adapter";
import {
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
        const base = { service, stepKey: step.key, assignedFacultyProfileId: "assigned", actor: { facultyProfileId: "assigned", unit: step.unit, role: step.role }, action: step.action, predecessorComplete: true };
        expect(canActOnSuspensionAbsenceStep(base)).toBe(true);
        expect(canActOnSuspensionAbsenceStep({ ...base, actor: { ...base.actor, facultyProfileId: "same-role-other" } })).toBe(false);
        for (const role of ["admin", "registrar_general", "dean"]) expect(canActOnSuspensionAbsenceStep({ ...base, actor: { ...base.actor, facultyProfileId: "bypass", role } })).toBe(false);
        expect(canActOnSuspensionAbsenceStep({ ...base, predecessorComplete: false })).toBe(false);
      });
    }
  }

  it("fails closed on service-specific completion conditions", () => {
    const suspensionSteps = B1_WORKFLOWS.enrollment_suspension.map((step) => step.key);
    expect(canCompleteSuspensionAbsence({ service: "enrollment_suspension", completedStepKeys: suspensionSteps, academicStatusApplied: false })).toBe(false);
    expect(canCompleteSuspensionAbsence({ service: "enrollment_suspension", completedStepKeys: suspensionSteps, academicStatusApplied: true })).toBe(true);
    const absenceSteps = B1_WORKFLOWS.excused_absence.map((step) => step.key);
    expect(canCompleteSuspensionAbsence({ service: "excused_absence", completedStepKeys: absenceSteps, absenceRows: [] })).toBe(false);
    expect(canCompleteSuspensionAbsence({ service: "excused_absence", completedStepKeys: absenceSteps, absenceRows: [{ recordAppliedAt: null }] })).toBe(false);
    expect(canCompleteSuspensionAbsence({ service: "excused_absence", completedStepKeys: absenceSteps, absenceRows: [{ recordAppliedAt: "2026-07-17T00:00:00Z" }] })).toBe(true);
  });

  it("forbids fees, portal payment, amounts, currencies, and document issuance", () => {
    expect(SUSPENSION_ABSENCE_FEE_POLICY).toEqual({ feeRequired: false, portalPaymentAllowed: false, amountOrCurrencyAllowed: false, documentIssuanceAllowed: false });
  });
});
