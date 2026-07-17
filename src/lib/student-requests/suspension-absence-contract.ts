import { B1_WORKFLOWS, canActOnB1Step, type StepActor } from "./request-service-adapter";

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
}): boolean {
  const step = B1_WORKFLOWS[input.service].find((candidate) => candidate.key === input.stepKey);
  if (!step) return false;
  return canActOnB1Step({
    step,
    assignedFacultyProfileId: input.assignedFacultyProfileId,
    actor: input.actor,
    action: input.action,
    predecessorComplete: input.predecessorComplete,
  });
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

export const SUSPENSION_ABSENCE_FEE_POLICY = {
  feeRequired: false,
  portalPaymentAllowed: false,
  amountOrCurrencyAllowed: false,
  documentIssuanceAllowed: false,
} as const;
