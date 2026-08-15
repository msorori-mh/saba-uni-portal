/**
 * P1 — SERVICE 4 rule: department_transfer level guard.
 *
 * LEVEL 1  → NOT ELIGIBLE (backend-enforced, UI-hidden)
 * LEVEL >= 2 → continue evaluating the existing transfer rules.
 *
 * The level is read from the canonical academic-level order, never from
 * Arabic display text.
 */

export const DEPARTMENT_TRANSFER_CODE = "department_transfer" as const;
export const DEPARTMENT_TRANSFER_MIN_LEVEL = 2 as const;

export const DEPARTMENT_TRANSFER_LEVEL1_DENY_CODE = "TRANSFER_LEVEL_1_NOT_ELIGIBLE" as const;
export const DEPARTMENT_TRANSFER_LEVEL1_MESSAGE_AR =
  "التحويل بين الأقسام غير متاح لطلاب المستوى الأول.";

export type TransferLevelGuardResult =
  | { ok: true; continueToRemainingRules: true }
  | { ok: false; denyCode: typeof DEPARTMENT_TRANSFER_LEVEL1_DENY_CODE; messageAr: string; continueToRemainingRules: false }
  | { ok: false; denyCode: "TRANSFER_LEVEL_UNKNOWN"; messageAr: string; continueToRemainingRules: false };

export function evaluateDepartmentTransferLevelGuard(
  academicLevelOrder: number | null | undefined,
): TransferLevelGuardResult {
  if (academicLevelOrder == null || !Number.isFinite(academicLevelOrder)) {
    return {
      ok: false,
      denyCode: "TRANSFER_LEVEL_UNKNOWN",
      messageAr: "تعذر تحديد المستوى الدراسي المعتمد، لا يمكن تقييم أهلية التحويل.",
      continueToRemainingRules: false,
    };
  }
  if (academicLevelOrder < DEPARTMENT_TRANSFER_MIN_LEVEL) {
    return {
      ok: false,
      denyCode: DEPARTMENT_TRANSFER_LEVEL1_DENY_CODE,
      messageAr: DEPARTMENT_TRANSFER_LEVEL1_MESSAGE_AR,
      continueToRemainingRules: false,
    };
  }
  return { ok: true, continueToRemainingRules: true };
}
