import {
  B1_SERVICE_ADAPTERS,
  B1_WORKFLOWS,
  canActOnB1Step,
  canActOnDepartmentHeadStep,
  resolveDirectDepartmentHead,
  type DepartmentHeadCandidate,
  type StepActor,
} from "./request-service-adapter";

/**
 * B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01: the college registrar decides the
 * fee per request; when a fee is due the student pays in the university's main
 * system and the revenue officer confirms it (payment_confirmation).
 */
export const B1_02_POLICY = "REGISTRAR_FEE_DECISION_EXTERNAL_PAYMENT" as const;

export type TransferDepartmentAssignments = {
  sourceDepartmentId: string | null;
  targetDepartmentId: string | null;
  sourceHeadFacultyProfileId: string;
  targetHeadFacultyProfileId: string;
};

export function resolveTransferDepartmentAssignments(input: {
  sourceDepartmentId: string | null;
  targetDepartmentId: string | null;
  candidates: readonly DepartmentHeadCandidate[];
}): { ok: true; assignments: TransferDepartmentAssignments } | { ok: false; reason: string } {
  if (!input.sourceDepartmentId || !input.targetDepartmentId) return { ok: false, reason: "missing_transfer_department" };
  if (input.sourceDepartmentId === input.targetDepartmentId) return { ok: false, reason: "same_department_transfer" };
  const source = resolveDirectDepartmentHead(input.sourceDepartmentId, input.candidates);
  if (!source.ok) return { ok: false, reason: `source_${source.reason}` };
  const target = resolveDirectDepartmentHead(input.targetDepartmentId, input.candidates);
  if (!target.ok) return { ok: false, reason: `target_${target.reason}` };
  return {
    ok: true,
    assignments: {
      sourceDepartmentId: input.sourceDepartmentId,
      targetDepartmentId: input.targetDepartmentId,
      sourceHeadFacultyProfileId: source.facultyProfileId,
      targetHeadFacultyProfileId: target.facultyProfileId,
    },
  };
}

export function canActOnTransferOrFinalChanceStep(input: {
  service: "department_transfer" | "final_chance";
  stepKey: string;
  assignedFacultyProfileId: string | null;
  actor: StepActor;
  action: string;
  predecessorComplete: boolean;
  sourceDepartmentId?: string | null;
  targetDepartmentId?: string | null;
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
  if (input.service !== "department_transfer" || step.role !== "department_head") {
    return canActOnB1Step(context);
  }
  const requiredDepartmentId = step.key === "source_department_head_approval"
    ? input.sourceDepartmentId
    : step.key === "target_department_head_approval"
      ? input.targetDepartmentId
      : null;
  return canActOnDepartmentHeadStep({ ...context, requiredDepartmentId });
}

export function getB102ActivationDecision(service: "department_transfer" | "final_chance") {
  const adapter = B1_SERVICE_ADAPTERS[service];
  return {
    status: "SOURCE_POLICY_APPROVED" as const,
    policy: B1_02_POLICY,
    activationBlockedReason: adapter.activationBlockedReason,
    runtimeAvailable: !adapter.activationBlockedReason,
  };
}
