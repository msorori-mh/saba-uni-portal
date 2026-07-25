/**
 * Client-side validation for the five B1 services.
 *
 * Wraps the backend-contract validators (`B1_SERVICE_ADAPTERS[code].validate`)
 * and adds UI-only rules (absence date order, same-department guard). The
 * server remains the trusted boundary; these checks only shape the UX.
 */

import {
  B1_SERVICE_ADAPTERS,
  type B1CanonicalCode,
} from "@/lib/student-requests/request-service-adapter";
import { isB1ServiceCode } from "./service-config";
import { normalizeStudentRequestTypeCode } from "@/lib/student-requests/request-type-registry";

/** Allowed vocabulary for excused-absence reason types (mirrors backend validator). */
export const B1_EXCUSE_REASON_TYPES = ["medical", "family_emergency", "official", "other"] as const;
export type B1ExcuseReasonType = (typeof B1_EXCUSE_REASON_TYPES)[number];

export type B1ValidationResult = { valid: boolean; errors: Record<string, string> };

/** Arabic messages for every error key emitted by B1 validators. */
export const B1_VALIDATION_MESSAGES_AR: Readonly<Record<string, string>> = {
  required: "هذا الحقل مطلوب.",
  required_true: "يجب تأكيد الإقرار للمتابعة.",
  minimum_10: "يجب ألا يقل النص عن 10 أحرف.",
  date_order: "تاريخ نهاية الغياب يجب أن يكون مساويًا لتاريخ البداية أو بعده.",
  same_department: "لا يمكن اختيار القسم الحالي كقسم مطلوب للتحويل.",
  unknown_reason_type: "نوع العذر غير معروف. اختر نوعًا من القائمة.",
  unknown_duration_type: "مدة وقف القيد غير معروفة.",
  unknown_chance_type: "نوع الفرصة غير معروف.",
  unknown_service: "نوع الخدمة غير معروف.",
  secure_attachment_required: "يجب إرفاق وثيقة داعمة صالحة.",
  attachment_too_large: "حجم المرفق يتجاوز الحد الأقصى المسموح (10 ميجابايت).",
  unsupported_attachment_type: "نوع الملف غير مدعوم. المسموح: PDF أو PNG أو JPEG فقط.",
  attachment_not_found: "المرفق المطلوب غير موجود.",
  not_draft: "لا يمكن تنفيذ هذا الإجراء بعد إرسال الطلب.",
  comment_required: "التعليق إلزامي عند الإرجاع أو الرفض.",
};

export function b1ValidationMessageAr(errorKey: string): string {
  return B1_VALIDATION_MESSAGES_AR[errorKey] ?? "قيمة غير صحيحة. راجع الحقل المحدد.";
}

// ---------------------------------------------------------------------------
// Focused UI rules
// ---------------------------------------------------------------------------

/**
 * Absence end date must be >= start date. The end date is optional in the
 * form; an empty end (or empty start) is always accepted here — required-field
 * checks live in the backend-contract validator.
 * Expects ISO date strings (YYYY-MM-DD), where lexicographic compare is safe.
 */
export function validateAbsenceDateOrder(
  start: unknown,
  end: unknown,
): { valid: true } | { valid: false; error: "date_order" } {
  if (typeof start !== "string" || typeof end !== "string" || !start.trim() || !end.trim()) {
    return { valid: true };
  }
  return end >= start ? { valid: true } : { valid: false, error: "date_order" };
}

/** Blocks selecting the student's current department as the transfer target. */
export function validateDepartmentTransferTarget(
  currentDepartmentId: unknown,
  targetDepartmentId: unknown,
): { valid: true } | { valid: false; error: "same_department" } {
  if (
    typeof currentDepartmentId === "string" &&
    currentDepartmentId.trim() !== "" &&
    typeof targetDepartmentId === "string" &&
    targetDepartmentId.trim() !== "" &&
    currentDepartmentId === targetDepartmentId
  ) {
    return { valid: false, error: "same_department" };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Per-service validation
// ---------------------------------------------------------------------------

/**
 * Runs the backend-contract validator for the service, then layers UI rules.
 * Error values are keys (required, date_order, same_department, ...) resolved
 * to Arabic via `B1_VALIDATION_MESSAGES_AR`.
 * Throws for unknown service codes (fail closed).
 */
export function validateB1FormValues(
  serviceCode: string,
  values: Record<string, unknown>,
): B1ValidationResult {
  const normalized = normalizeStudentRequestTypeCode(serviceCode);
  if (!isB1ServiceCode(normalized)) {
    throw new Error("UNKNOWN_B1_SERVICE_CODE");
  }
  const code = normalized as B1CanonicalCode;
  const base = B1_SERVICE_ADAPTERS[code].validate(values);
  const errors: Record<string, string> = { ...base.errors };

  if (code === "excused_absence") {
    const order = validateAbsenceDateOrder(values.absence_date, values.absence_end_date);
    if (!order.valid) errors.absence_end_date = order.error;
    // Explicit vocabulary guard for reason_type (backend validator also covers it).
    const reasonType = values.reason_type;
    if (
      typeof reasonType === "string" &&
      reasonType.trim() !== "" &&
      !(B1_EXCUSE_REASON_TYPES as readonly string[]).includes(reasonType)
    ) {
      errors.reason_type = "unknown_reason_type";
    }
  }

  if (code === "department_transfer") {
    const target = validateDepartmentTransferTarget(
      values.current_department_id,
      values.target_department_id,
    );
    if (!target.valid) errors.target_department_id = target.error;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
