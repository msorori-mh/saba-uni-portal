/**
 * B1 details preflight (pure module).
 *
 * Before any forward staff action on a B1 request (STEP4 and every other
 * decision step), the service-specific `*_details` row MUST exist. Without it
 * the atomic RPC fails deep inside with an opaque code such as
 * `B1_SUSPENSION_DETAILS_REQUIRED`. This contract lets the caller fail closed
 * early with an explicit Arabic explanation.
 *
 * No React, no Supabase, no network here.
 */

import type { B1CanonicalCode } from "@/lib/student-requests/request-service-adapter";

/** Actions that move the request forward and therefore require details rows. */
export const B1_DETAILS_REQUIRED_ACTIONS = [
  "review",
  "approve",
  "clear",
  "apply_decision",
  "archive",
] as const;
export type B1DetailsRequiredAction = (typeof B1_DETAILS_REQUIRED_ACTIONS)[number];

/** Actions that never need details (they send the request back / close it). */
export const B1_DETAILS_EXEMPT_ACTIONS = ["return", "reject"] as const;

export function b1ActionRequiresDetails(action: string): boolean {
  return (B1_DETAILS_REQUIRED_ACTIONS as readonly string[]).includes(action);
}

export type B1DetailsTableSpec = {
  /** Detail table name in the public schema. */
  table: string;
  /** FK column pointing at student_requests.id. */
  requestColumn: "request_id";
  /** Arabic service label used in the blocking message. */
  serviceLabelAr: string;
};

export const B1_DETAILS_TABLES: Readonly<Record<B1CanonicalCode, B1DetailsTableSpec>> = {
  enrollment_suspension: {
    table: "enrollment_suspension_details",
    requestColumn: "request_id",
    serviceLabelAr: "إيقاف القيد",
  },
  excused_absence: {
    table: "absence_excuse_details",
    requestColumn: "request_id",
    serviceLabelAr: "غياب بعذر",
  },
  department_transfer: {
    table: "transfer_request_details",
    requestColumn: "request_id",
    serviceLabelAr: "التحويل بين الأقسام",
  },
  final_chance: {
    table: "extra_chance_details",
    requestColumn: "request_id",
    serviceLabelAr: "الفرصة الأخيرة",
  },
  file_withdrawal: {
    table: "file_withdrawal_details",
    requestColumn: "request_id",
    serviceLabelAr: "سحب الملف",
  },
} as const;

export function getB1DetailsTableSpec(
  canonicalCode: string | null | undefined,
): B1DetailsTableSpec | null {
  if (!canonicalCode) return null;
  return (
    (B1_DETAILS_TABLES as Record<string, B1DetailsTableSpec | undefined>)[canonicalCode] ?? null
  );
}

export const B1_DETAILS_PREFLIGHT_ERROR_CODE = "B1_DETAILS_ROW_MISSING";

/**
 * Explicit, user-readable blocking message. Includes the exact technical
 * reason (missing detail row + table) and the remediation path.
 */
export function buildB1DetailsPreflightMessage(params: {
  spec: B1DetailsTableSpec;
  requestNumber?: string | null;
  actionLabelAr?: string | null;
}): string {
  const requestPart = params.requestNumber ? ` للطلب ${params.requestNumber}` : "";
  const actionPart = params.actionLabelAr ? ` «${params.actionLabelAr}»` : "";
  return [
    `${B1_DETAILS_PREFLIGHT_ERROR_CODE}: تم إيقاف تنفيذ الإجراء${actionPart}${requestPart} قبل إرساله للنظام.`,
    `السبب: لا توجد بيانات تفصيلية مسجّلة لخدمة «${params.spec.serviceLabelAr}» (سجل ${params.spec.table} غير موجود لهذا الطلب).`,
    "هذه البيانات تُنشأ عند إرسال الطلب من الطالب، ووجودها شرط لتطبيق القرار.",
    "الإجراء المقترح: أعد الطلب للطالب لاستكمال بيانات الخدمة، أو تواصل مع الدعم الفني لمراجعة الطلب — لا تُكرر المحاولة لأن التنفيذ سيفشل مجددًا.",
  ].join(" ");
}
