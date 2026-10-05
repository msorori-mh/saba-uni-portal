import {
  B1_STUDENT_DEPARTMENT_SCOPED_STEPS,
  B1_WORKFLOWS,
  canActOnB1Step,
  canActOnDepartmentHeadStep,
  type StepActor,
} from "./request-service-adapter";

export const SUSPENSION_DURATION_TYPES = ["one_semester", "full_year"] as const;
export const ABSENCE_REASON_TYPES = ["medical", "family_emergency", "official", "other"] as const;

export type SuspensionAbsenceService = "enrollment_suspension" | "excused_absence";

export function canActOnSuspensionAbsenceStep(input: {
  service: SuspensionAbsenceService;
  stepKey: string;
  assignedFacultyProfileId: string | null;
  actor: StepActor;
  action: string;
  predecessorComplete: boolean;
  /** Required for steps scoped to the requesting student's own department. */
  studentDepartmentId?: string | null;
}): boolean {
  const step = B1_WORKFLOWS[input.service].find((candidate) => candidate.key === input.stepKey);
  if (!step) return false;
  const context = {
    step,
    assignedFacultyProfileId: input.assignedFacultyProfileId,
    actor: input.actor,
    action: input.action,
    predecessorComplete: input.predecessorComplete,
  };
  const scopedSteps = B1_STUDENT_DEPARTMENT_SCOPED_STEPS[input.service] ?? [];
  if (step.role === "department_head" || scopedSteps.includes(step.key)) {
    // Fail closed: a department-head step without the student's department,
    // or acted on by the head of any other department, is always denied.
    return canActOnDepartmentHeadStep({ ...context, requiredDepartmentId: input.studentDepartmentId });
  }
  return canActOnB1Step(context);
}

export function canCompleteSuspensionAbsence(input: {
  service: SuspensionAbsenceService;
  completedStepKeys: readonly string[];
  academicStatusApplied?: boolean;
  absenceRows?: readonly { recordAppliedAt: string | null }[];
}): boolean {
  const stepsComplete = B1_WORKFLOWS[input.service].every((step) => input.completedStepKeys.includes(step.key));
  if (!stepsComplete) return false;
  if (input.service === "enrollment_suspension") return input.academicStatusApplied === true;
  return Boolean(input.absenceRows?.length) && input.absenceRows!.every((row) => Boolean(row.recordAppliedAt));
}

/** وقف القيد: خدمة مجانية بلا رسوم. */
export const ENROLLMENT_SUSPENSION_FEE_POLICY = {
  feeRequired: false,
  portalPaymentAllowed: false,
  amountOrCurrencyAllowed: false,
  documentIssuanceAllowed: false,
} as const;

/**
 * غياب بعذر: رسوم تُسدَّد في النظام الجامعي الرئيسي وتُؤكَّد يدوياً في خطوة
 * payment_confirmation. لا بوابة دفع ولا مبلغ ولا عملة ولا وثيقة داخل البوابة.
 */
export const EXCUSED_ABSENCE_FEE_POLICY = {
  feeRequired: true,
  externalUniversityPaymentConfirmationRequired: true,
  portalPaymentAllowed: false,
  amountOrCurrencyAllowed: false,
  documentIssuanceAllowed: false,
} as const;

/** @deprecated Suspension-only alias kept for existing imports; absence is no longer free. */
export const SUSPENSION_ABSENCE_FEE_POLICY = ENROLLMENT_SUSPENSION_FEE_POLICY;
