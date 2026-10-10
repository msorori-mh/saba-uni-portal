/**
 * قرار الرسوم لكل طلب لدى مسجل الكلية — الخدمات الثلاث:
 * غياب بعذر، التحويل بين الأقسام، الفرصة الأخيرة.
 *
 * One contract for the three services that carry a registrar fee decision.
 * The decision rules (two outcomes, mandatory reason, display-only value due)
 * are the ones in excused-absence-fee-decision-contract.ts; this module only
 * says WHERE the decision lives per service and WHICH database objects serve it:
 *
 *   excused_absence      step registrar_fee_referral  -> record_excused_absence_fee_decision
 *                        (EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01, applied)
 *   department_transfer  step registrar_fee_decision  -> record_b1_fee_decision
 *   final_chance         step registrar_fee_decision  -> record_b1_fee_decision
 *                        (B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01)
 *
 * The portal processes NO payment: no gateway, balance, receipt or arithmetic.
 */
import {
  B1_WORKFLOWS,
  canActOnB1RuntimeStep,
  type B1CanonicalCode,
  type B1RuntimeAuthorizationContext,
  type B1WorkflowStep,
} from "./request-service-adapter";
import { normalizeStudentRequestTypeCode } from "./request-type-registry";
import type { ExcusedAbsenceFeeDecision } from "./excused-absence-fee-decision-contract";

export const B1_FEE_DECISION_SERVICES = ["excused_absence", "department_transfer", "final_chance"] as const;
export type B1FeeDecisionService = (typeof B1_FEE_DECISION_SERVICES)[number];

export const B1_FEE_DECISION_PAYMENT_STEP_KEY = "payment_confirmation" as const;

type FeeDecisionBinding = {
  /** Registrar step that carries the decision. */
  stepKey: string;
  /** Step that becomes active when no fee is due (payment is skipped). */
  stepWhenNotRequired: string;
  recordRpc: string;
  readRpc: string;
  /** Transition-condition catalog code of the no-fee branch. */
  notRequiredCondition: string;
};

export const B1_FEE_DECISION_BINDINGS: Readonly<Record<B1FeeDecisionService, FeeDecisionBinding>> = {
  excused_absence: {
    stepKey: "registrar_fee_referral",
    stepWhenNotRequired: "department_head_signature",
    recordRpc: "record_excused_absence_fee_decision",
    readRpc: "get_excused_absence_fee_decision",
    notRequiredCondition: "EXCUSED_ABSENCE_FEE_NOT_REQUIRED",
  },
  department_transfer: {
    stepKey: "registrar_fee_decision",
    stepWhenNotRequired: "registrar_apply",
    recordRpc: "record_b1_fee_decision",
    readRpc: "get_b1_fee_decision",
    notRequiredCondition: "B1_FEE_NOT_REQUIRED",
  },
  final_chance: {
    stepKey: "registrar_fee_decision",
    stepWhenNotRequired: "registrar_apply",
    recordRpc: "record_b1_fee_decision",
    readRpc: "get_b1_fee_decision",
    notRequiredCondition: "B1_FEE_NOT_REQUIRED",
  },
};

/** The fee-decision service for a (possibly legacy) request type code, or null. */
export function getB1FeeDecisionService(requestTypeCode: string | null | undefined): B1FeeDecisionService | null {
  const canonical = normalizeStudentRequestTypeCode(requestTypeCode);
  return (B1_FEE_DECISION_SERVICES as readonly string[]).includes(canonical ?? "")
    ? (canonical as B1FeeDecisionService)
    : null;
}

/** True only for the registrar fee-decision step of one of the three services. */
export function isB1FeeDecisionStep(
  requestTypeCode: string | null | undefined,
  stepKey: string | null | undefined,
): boolean {
  const service = getB1FeeDecisionService(requestTypeCode);
  return service !== null && B1_FEE_DECISION_BINDINGS[service].stepKey === (stepKey ?? "").trim();
}

/** RPC names for a service. Fail closed: an unknown service has no RPC. */
export function getB1FeeDecisionRpcs(
  requestTypeCode: string | null | undefined,
): { recordRpc: string; readRpc: string } | null {
  const service = getB1FeeDecisionService(requestTypeCode);
  if (!service) return null;
  const { recordRpc, readRpc } = B1_FEE_DECISION_BINDINGS[service];
  return { recordRpc, readRpc };
}

/** The step that becomes active once the registrar's decision is recorded. */
export function resolveStepAfterB1FeeDecision(
  service: B1FeeDecisionService,
  decision: ExcusedAbsenceFeeDecision,
): string {
  return decision === "FEE_NOT_REQUIRED"
    ? B1_FEE_DECISION_BINDINGS[service].stepWhenNotRequired
    : B1_FEE_DECISION_PAYMENT_STEP_KEY;
}

/** Steps a request actually goes through; without a decision the full cycle applies. */
export function b1StepsForFeeDecision(
  service: B1FeeDecisionService,
  decision: ExcusedAbsenceFeeDecision | null | undefined,
): readonly B1WorkflowStep[] {
  const steps = B1_WORKFLOWS[service as B1CanonicalCode];
  return decision === "FEE_NOT_REQUIRED"
    ? steps.filter((step) => step.key !== B1_FEE_DECISION_PAYMENT_STEP_KEY)
    : steps;
}

/** Finance may confirm only a payment the registrar actually required. */
export function canConfirmB1PaymentAfterFeeDecision(
  decision: ExcusedAbsenceFeeDecision | null | undefined,
): boolean {
  return decision === "FEE_REQUIRED";
}

/**
 * Who may record the decision: exactly the direct assignee of the active
 * registrar fee-decision step, with the step's own unit and role — identical
 * to acting on the step. No admin / registrar / dean bypass.
 */
export function canRecordB1FeeDecision(
  context: Omit<B1RuntimeAuthorizationContext, "step" | "attemptedAction"> & {
    service: string;
    stepKey: string;
  },
): boolean {
  if (!isB1FeeDecisionStep(context.service, context.stepKey)) return false;
  const service = getB1FeeDecisionService(context.service)!;
  const step = B1_WORKFLOWS[service as B1CanonicalCode].find((candidate) => candidate.key === context.stepKey);
  if (!step) return false;
  return canActOnB1RuntimeStep({ ...context, step, attemptedAction: step.action });
}
