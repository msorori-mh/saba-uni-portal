import {
  ENROLLMENT_CERTIFICATE_PROTECTED_ROLE_CODES,
  PROCESSING_ROLE_CODE_RE,
  evaluateProcessingRoleMutationSafety,
  type ProcessingRoleUsageCounts,
} from "@/lib/admin-staff-deletion.core";

export {
  ENROLLMENT_CERTIFICATE_PROTECTED_ROLE_CODES,
  PROCESSING_ROLE_CODE_RE,
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
