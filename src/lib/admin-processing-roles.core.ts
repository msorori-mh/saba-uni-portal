import {
  ENROLLMENT_CERTIFICATE_PROTECTED_ROLE_CODES,
  PROCESSING_ROLE_CODE_RE,
  attachAuditWarning,
  evaluateProcessingRoleMutationSafety,
  type ProcessingRoleUsageCounts,
} from "@/lib/admin-staff-deletion.core";

export {
  ENROLLMENT_CERTIFICATE_PROTECTED_ROLE_CODES,
  PROCESSING_ROLE_CODE_RE,
  attachAuditWarning,
};

export type ProcessingRoleUsageSafetyInput = ProcessingRoleUsageCounts;
export type ProcessingRoleMutationAction = "delete" | "deactivate" | "change_unit";

export function normalizeProcessingRoleCode(code: string): string {
  return code.trim().toLowerCase();
}

export function validateProcessingRoleCode(
  code: string,
): { ok: true } | { ok: false; messageAr: string } {
  const normalized = normalizeProcessingRoleCode(code);
  if (!normalized) {
    return { ok: false, messageAr: "رمز مسمى المعالجة مطلوب." };
  }
  if (!PROCESSING_ROLE_CODE_RE.test(normalized)) {
    return {
      ok: false,
      messageAr:
        "رمز مسمى المعالجة يجب أن يبدأ بحرف لاتيني صغير ويحتوي على أحرف صغيرة أو أرقام أو شرطة سفلية فقط.",
    };
  }
  return { ok: true };
}

export function evaluateProcessingRoleUsageSafety(
  usage: ProcessingRoleUsageSafetyInput,
  action: ProcessingRoleMutationAction,
  code = "processing_role",
): { allowed: boolean; reasons: string[] } {
  return evaluateProcessingRoleMutationSafety({
    code,
    usage,
    action,
  });
}

export function interpretRoleDeleteResult(input: {
  deletedCount: number;
  roleId: string;
  alreadyMissing: boolean;
}):
  | { ok: true; deleted_id: string; idempotent: false }
  | { ok: true; deleted_id: string; idempotent: true; messageAr: string }
  | { ok: false; messageAr: string } {
  if (input.deletedCount === 1) {
    return { ok: true, deleted_id: input.roleId, idempotent: false };
  }
  if (input.deletedCount === 0 && input.alreadyMissing) {
    return {
      ok: true,
      deleted_id: input.roleId,
      idempotent: true,
      messageAr: "مسمى المعالجة محذوف مسبقاً.",
    };
  }
  if (input.deletedCount === 0) {
    return {
      ok: false,
      messageAr: "تعذر حذف مسمى المعالجة بسبب تعارض الحالة أو تغيير الرمز.",
    };
  }
  return {
    ok: false,
    messageAr: "نتيجة حذف غير متوقعة؛ لم يُسجّل حذف جديد.",
  };
}
