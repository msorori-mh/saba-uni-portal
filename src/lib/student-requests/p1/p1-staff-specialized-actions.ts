/**
 * P1 staff-side specialized actions (architecture-aligned).
 *
 * P1 REUSES the existing student-request workflow engine:
 *  - ordinary steps (review / approve / archive) execute through the SAME
 *    atomic step RPC used by the five B1 services,
 *  - external university payment executes through the EXISTING
 *    `record_external_university_payment_confirmation` RPC,
 *  - only two steps carry a P1-specific effect and therefore get a thin
 *    specialized RPC of their own.
 *
 * Pure module: routing decisions only, plus thin typed RPC wrappers.
 * No new workflow engine, no parallel lifecycle model.
 */

import { isP1AtomicSubmitService } from "@/lib/student-request-rpc";

/** Steps whose effect requires a dedicated thin RPC instead of the atomic action. */
export const P1_SPECIALIZED_STEP_KEYS = {
  paymentConfirmation: "payment_confirmation",
  cardIssuance: "card_issuance",
  appealApplyResult: "registrar_apply_result",
} as const;

export type P1SpecializedRoute =
  | { kind: "atomic_action" }
  | { kind: "external_payment_confirmation" }
  | { kind: "replacement_card_issuance" }
  | { kind: "final_result_appeal_apply" }
  | { kind: "not_p1" };

/**
 * Decides which execution surface a P1 runtime step belongs to.
 * Fail-closed: unknown P1 combinations stay on the atomic action path, where
 * the backend rejects them explicitly.
 */
export function routeP1StaffStep(input: {
  requestTypeCode: string | null | undefined;
  stepKey: string | null | undefined;
}): P1SpecializedRoute {
  const code = (input.requestTypeCode ?? "").trim();
  if (!code || !isP1AtomicSubmitService(code)) return { kind: "not_p1" };

  const stepKey = (input.stepKey ?? "").trim();
  if (stepKey === P1_SPECIALIZED_STEP_KEYS.paymentConfirmation) {
    return { kind: "external_payment_confirmation" };
  }
  if (code === "replacement_student_card" && stepKey === P1_SPECIALIZED_STEP_KEYS.cardIssuance) {
    return { kind: "replacement_card_issuance" };
  }
  if (code === "grade_appeal" && stepKey === P1_SPECIALIZED_STEP_KEYS.appealApplyResult) {
    return { kind: "final_result_appeal_apply" };
  }
  return { kind: "atomic_action" };
}

/** ARCHIVE for P1 means completion only — never document issuance. */
export function p1ArchiveIssuesDocument(): false {
  return false;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type RpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }> };

export type P1SpecializedActionResult = {
  success: boolean;
  status: string;
  request_id: string;
  step_id: string;
  next_step_id: string | null;
};

export async function rpcIssueReplacementCardStep(
  client: RpcClient,
  input: { stepId: string; cardSerial: string; note?: string | null },
): Promise<P1SpecializedActionResult> {
  const serial = input.cardSerial.trim();
  if (!serial) throw new Error("الرقم التسلسلي للبطاقة مطلوب");
  const { data, error } = await client.rpc("p1_issue_replacement_card_step", {
    p_step_id: input.stepId,
    p_card_serial: serial,
    p_note: input.note?.trim() || null,
  });
  if (error) throw new Error(error.message ?? "تعذر تنفيذ إصدار البطاقة");
  return data as P1SpecializedActionResult;
}

export async function rpcApplyFinalResultAppealStep(
  client: RpcClient,
  input: { stepId: string; finalResult: number; note?: string | null },
): Promise<P1SpecializedActionResult> {
  if (!Number.isFinite(input.finalResult) || input.finalResult < 0) {
    throw new Error("النتيجة النهائية المعتمدة غير صالحة");
  }
  const { data, error } = await client.rpc("p1_apply_final_result_appeal_step", {
    p_step_id: input.stepId,
    p_final_result: input.finalResult,
    p_note: input.note?.trim() || null,
  });
  if (error) throw new Error(error.message ?? "تعذر تطبيق النتيجة المعتمدة");
  return data as P1SpecializedActionResult;
}
