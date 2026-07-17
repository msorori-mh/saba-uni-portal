export const FILE_WITHDRAWAL_STEPS = [
  { key: "student_affairs_intake", unit: "student_affairs", role: "student_affairs_specialist", action: "review" },
  { key: "library_clearance", unit: "library", role: "library_officer", action: "clear" },
  { key: "labs_clearance", unit: "labs", role: "labs_manager", action: "clear" },
  { key: "activities_clearance", unit: "student_affairs", role: "student_affairs_manager", action: "clear" },
  { key: "finance_clearance", unit: "finance", role: "revenue_finance_officer", action: "clear" },
  { key: "registrar_apply", unit: "registrar", role: "registrar_general", action: "apply_decision" },
  { key: "archive", unit: "archive", role: "archive_officer", action: "archive" },
] as const;

export type FileWithdrawalStepKey = (typeof FILE_WITHDRAWAL_STEPS)[number]["key"];

export type FileWithdrawalFormData = {
  withdrawal_reason?: unknown;
  impact_acknowledgment?: unknown;
};

export function validateFileWithdrawalForm(data: FileWithdrawalFormData) {
  const errors: Record<string, string> = {};
  if (typeof data.withdrawal_reason !== "string" || data.withdrawal_reason.trim().length < 10) {
    errors.withdrawal_reason = "يجب كتابة سبب واضح لسحب الملف (10 أحرف على الأقل).";
  }
  if (data.impact_acknowledgment !== true) {
    errors.impact_acknowledgment = "يجب الإقرار بالأثر الأكاديمي والإداري لسحب الملف.";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export type FileWithdrawalActor = {
  userId: string;
  unit: string;
  role: string;
  directlyAssignedUserId: string | null;
};

export function canActOnFileWithdrawalStep(stepKey: FileWithdrawalStepKey, actor: FileWithdrawalActor) {
  const step = FILE_WITHDRAWAL_STEPS.find((candidate) => candidate.key === stepKey);
  return Boolean(
    step &&
      actor.directlyAssignedUserId === actor.userId &&
      actor.unit === step.unit &&
      actor.role === step.role,
  );
}

export type FileWithdrawalProgress = Partial<Record<FileWithdrawalStepKey, boolean>>;

export function canCompleteFileWithdrawalStep(stepKey: FileWithdrawalStepKey, progress: FileWithdrawalProgress) {
  const index = FILE_WITHDRAWAL_STEPS.findIndex((step) => step.key === stepKey);
  if (index < 0) return false;
  return FILE_WITHDRAWAL_STEPS.slice(0, index).every((step) => progress[step.key] === true);
}

export const FILE_WITHDRAWAL_FEE_POLICY = {
  feeRequired: false,
  portalPaymentAllowed: false,
  amountOrCurrencyAllowed: false,
} as const;
