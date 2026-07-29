/**
 * PORTAL-B1-FIVE-SERVICES-CONFIGURED-ACTION-PANEL-ATOMIC-RPC-ROUTING-42
 *
 * Single canonical authority that decides:
 *  - whether a staff request belongs to the five B1 services (canonical mapping,
 *    legacy aliases included — never ad-hoc string comparison), and
 *  - which SINGLE executable action the B1 panel may render/send, derived
 *    literally from the active step's configured `action_type`.
 *
 * Pure module: no React, no network, no Supabase. Fail-closed by construction.
 */

import {
  B1_CANONICAL_CODES,
  type B1CanonicalCode,
} from "@/lib/student-requests/request-service-adapter";
import { normalizeStudentRequestTypeCode } from "@/lib/student-requests/request-type-registry";
import type { B1StaffAction } from "@/lib/student-requests/b1-ui/adapter.types";

const B1_CODE_SET: ReadonlySet<string> = new Set<string>(B1_CANONICAL_CODES);

/** Canonical B1 membership test (handles legacy aliases such as `absence_excuse`). */
export function isB1StaffRoutedRequestType(code: string | null | undefined): boolean {
  const normalized = normalizeStudentRequestTypeCode(code);
  return normalized !== "" && B1_CODE_SET.has(normalized);
}

/** Canonical code for a B1 request, or null when the request is not a B1 service. */
export function toB1CanonicalCode(code: string | null | undefined): B1CanonicalCode | null {
  const normalized = normalizeStudentRequestTypeCode(code);
  return B1_CODE_SET.has(normalized) ? (normalized as B1CanonicalCode) : null;
}

/** Actions the B1 employee panel is able to execute through the atomic RPC path. */
export const B1_PANEL_EXECUTABLE_ACTIONS = ["review", "approve", "return", "reject"] as const;
export type B1PanelExecutableAction = (typeof B1_PANEL_EXECUTABLE_ACTIONS)[number];

/**
 * action_result values (outcomes) — these are NEVER sent as an action payload.
 * Kept explicit so a configured value of `reviewed` fails closed instead of
 * being silently coerced to `review`.
 */
export const B1_ACTION_RESULT_VALUES = [
  "reviewed",
  "approved",
  "cleared",
  "applied",
  "archived",
  "payment_confirmed",
] as const;

/** Configured action types handled by dedicated panels, not by this one. */
export const B1_SPECIALIZED_ACTION_TYPES = [
  "confirm_payment",
  "issue_document",
  "sign",
  "archive",
  "clear",
  "apply_decision",
] as const;

export const B1_PANEL_ACTION_LABELS_AR: Readonly<Record<B1PanelExecutableAction, string>> = {
  review: "مراجعة",
  approve: "اعتماد",
  return: "إرجاع للاستكمال",
  reject: "رفض",
};

export type B1StaffActionContractFailureCode =
  | "NOT_B1_SERVICE"
  | "STEP_ID_MISSING"
  | "CONFIGURED_ACTION_MISSING"
  | "CONFIGURED_ACTION_AMBIGUOUS"
  | "CONFIGURED_ACTION_IS_RESULT"
  | "CONFIGURED_ACTION_SPECIALIZED"
  | "CONFIGURED_ACTION_UNSUPPORTED"
  | "ALLOWED_ACTION_MISMATCH"
  | "NOT_ACTIONABLE";

export type B1StaffActionContract =
  | {
      ok: true;
      canonicalCode: B1CanonicalCode;
      stepId: string;
      action: B1PanelExecutableAction;
      labelAr: string;
    }
  | { ok: false; code: B1StaffActionContractFailureCode; messageAr: string };

const FAILURE_MESSAGES_AR: Readonly<Record<B1StaffActionContractFailureCode, string>> = {
  NOT_B1_SERVICE: "نوع الطلب غير محسوم ضمن خدمات B1 — تعذر تحديد لوحة الإجراء.",
  STEP_ID_MISSING: "معرّف الخطوة النشطة غير متوفر — لا يمكن تنفيذ أي إجراء.",
  CONFIGURED_ACTION_MISSING: "لا يوجد إجراء مُهيّأ للخطوة النشطة — تم إيقاف التنفيذ.",
  CONFIGURED_ACTION_AMBIGUOUS:
    "الخطوة النشطة تحتوي أكثر من إجراء مُهيّأ — تم إيقاف التنفيذ لعدم الوضوح.",
  CONFIGURED_ACTION_IS_RESULT:
    "القيمة المُهيّأة تمثل نتيجة إجراء وليست إجراءً — تم إيقاف التنفيذ.",
  CONFIGURED_ACTION_SPECIALIZED:
    "إجراء هذه الخطوة يُنفَّذ من لوحته المخصصة، وليس من لوحة إجراءات B1.",
  CONFIGURED_ACTION_UNSUPPORTED: "الإجراء المُهيّأ لهذه الخطوة غير مدعوم في لوحة B1.",
  ALLOWED_ACTION_MISMATCH:
    "الإجراء المسموح لا يطابق الإجراء المُهيّأ للخطوة — تم إيقاف التنفيذ.",
  NOT_ACTIONABLE: "لست الفاعل المُسنَد للخطوة النشطة — لا يمكن تنفيذ الإجراء.",
};

export type B1StaffActionContractInput = {
  requestTypeCode: string | null | undefined;
  stepId: string | null | undefined;
  /** Literal `request_type_workflow_steps.action_type` of the ACTIVE step. */
  configuredActionType: string | null | undefined;
  /** Optional backend-provided allowed action; must equal the configured action. */
  allowedAction?: string | null;
  isActionable: boolean;
};

function fail(code: B1StaffActionContractFailureCode): B1StaffActionContract {
  return { ok: false, code, messageAr: FAILURE_MESSAGES_AR[code] };
}

/**
 * Resolves the single legal B1 action for an active step. Every ambiguous,
 * missing, mismatched or unsupported input fails closed BEFORE any RPC.
 */
export function resolveB1StaffActionContract(
  input: B1StaffActionContractInput,
): B1StaffActionContract {
  const canonicalCode = toB1CanonicalCode(input.requestTypeCode);
  if (!canonicalCode) return fail("NOT_B1_SERVICE");

  const stepId = (input.stepId ?? "").trim();
  if (!stepId) return fail("STEP_ID_MISSING");

  const raw = (input.configuredActionType ?? "").trim();
  if (!raw) return fail("CONFIGURED_ACTION_MISSING");
  if (/[,|/\s]/.test(raw)) return fail("CONFIGURED_ACTION_AMBIGUOUS");
  if ((B1_ACTION_RESULT_VALUES as readonly string[]).includes(raw)) {
    return fail("CONFIGURED_ACTION_IS_RESULT");
  }
  if (!(B1_PANEL_EXECUTABLE_ACTIONS as readonly string[]).includes(raw)) {
    return (B1_SPECIALIZED_ACTION_TYPES as readonly string[]).includes(raw)
      ? fail("CONFIGURED_ACTION_SPECIALIZED")
      : fail("CONFIGURED_ACTION_UNSUPPORTED");
  }

  const action = raw as B1PanelExecutableAction;

  const allowed = (input.allowedAction ?? "").trim();
  if (allowed && allowed !== action) return fail("ALLOWED_ACTION_MISMATCH");

  if (!input.isActionable) return fail("NOT_ACTIONABLE");

  return {
    ok: true,
    canonicalCode,
    stepId,
    action,
    labelAr: B1_PANEL_ACTION_LABELS_AR[action],
  };
}

/** Adapter-level action type (B1StaffAction) narrowing without widening the union. */
export function asB1StaffAction(action: B1PanelExecutableAction): B1StaffAction {
  return action;
}

export const GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR =
  "B1_SERVICE_REQUIRES_ATOMIC_RPC_PATH: منفذ الإجراءات العام غير مسموح لخدمات B1 الخمس.";

/**
 * Hard guard: throws BEFORE any DB call when a B1 service is routed through the
 * generic staff executor (`act_on_student_request_step`).
 */
export function assertGenericStaffExecutorAllowed(code: string | null | undefined): void {
  if (isB1StaffRoutedRequestType(code)) {
    throw new Error(GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR);
  }
}
