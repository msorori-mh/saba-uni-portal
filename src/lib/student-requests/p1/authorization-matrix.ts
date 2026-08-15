/**
 * P1 — shared lifecycle + actor authorization contract.
 *
 * Security principle (non-negotiable):
 *   ROLE NAME ALONE NEVER GRANTS STEP EXECUTION.
 * The actor must be the legitimately assigned/current actor for that exact
 * runtime step. admin / system_admin / dean / registrar have NO global bypass.
 */

export type P1ServiceCode =
  | "october_exam_entry_form"
  | "replacement_student_card"
  | "grade_appeal"
  | "department_transfer";

export type P1StepDef = {
  key: string;
  labelAr: string;
  /** Processing unit code the direct assignment must belong to. */
  unit: string;
  /** Processing role code the direct assignment must belong to. */
  role: string;
  action: "review" | "approve" | "confirm_payment" | "issue_card" | "apply_decision" | "complete" | "archive";
  /** Step cannot execute until revenue confirmed the external payment. */
  requiresPaymentConfirmed?: boolean;
};

export const P1_WORKFLOWS: Readonly<Record<P1ServiceCode, readonly P1StepDef[]>> = {
  october_exam_entry_form: [
    { key: "student_affairs_review", labelAr: "مراجعة شؤون الطلاب", unit: "student_affairs", role: "student_affairs_specialist", action: "review" },
    { key: "payment_confirmation", labelAr: "تأكيد السداد الخارجي", unit: "finance", role: "revenue_finance_officer", action: "confirm_payment" },
    { key: "registrar_finalize", labelAr: "اعتماد مسجل الكلية", unit: "registrar", role: "registrar_general", action: "complete", requiresPaymentConfirmed: true },
    { key: "archive", labelAr: "الأرشفة", unit: "archive", role: "archive_officer", action: "archive" },
  ],
  replacement_student_card: [
    { key: "student_affairs_review", labelAr: "مراجعة شؤون الطلاب", unit: "student_affairs", role: "student_affairs_specialist", action: "review" },
    { key: "payment_confirmation", labelAr: "تأكيد السداد الخارجي", unit: "finance", role: "revenue_finance_officer", action: "confirm_payment" },
    { key: "card_issuance", labelAr: "إصدار البطاقة البديلة", unit: "student_affairs", role: "student_affairs_manager", action: "issue_card", requiresPaymentConfirmed: true },
  ],
  grade_appeal: [
    { key: "registrar_intake", labelAr: "استقبال التظلم", unit: "registrar", role: "registrar_general", action: "review" },
    { key: "department_head_review", labelAr: "المراجعة الأكاديمية لرئيس القسم", unit: "department", role: "department_head", action: "review" },
    { key: "instructor_review", labelAr: "مراجعة أستاذ المقرر", unit: "department", role: "course_instructor", action: "review" },
    { key: "academic_decision", labelAr: "القرار الأكاديمي المعتمد", unit: "department", role: "department_head", action: "approve" },
    { key: "registrar_apply_result", labelAr: "تطبيق النتيجة المعتمدة", unit: "registrar", role: "registrar_general", action: "apply_decision" },
    { key: "archive", labelAr: "الأرشفة", unit: "archive", role: "archive_officer", action: "archive" },
  ],
  department_transfer: [
    { key: "target_department_head_approval", labelAr: "اعتماد رئيس القسم المطلوب", unit: "department", role: "department_head", action: "approve" },
    { key: "dean_decision", labelAr: "قرار العميد", unit: "dean", role: "dean", action: "approve" },
    { key: "payment_confirmation", labelAr: "تأكيد السداد الخارجي", unit: "finance", role: "revenue_finance_officer", action: "confirm_payment" },
    { key: "registrar_apply", labelAr: "تطبيق قرار المسجل", unit: "registrar", role: "registrar_general", action: "apply_decision", requiresPaymentConfirmed: true },
    { key: "archive", labelAr: "الأرشفة", unit: "archive", role: "archive_officer", action: "archive" },
  ],
};

/** Roles that historically tempt global bypass — must never bypass. */
export const NO_GLOBAL_BYPASS_ROLES: readonly string[] = [
  "admin",
  "system_admin",
  "dean",
  "registrar_general",
  "student_affairs_manager",
  "revenue_finance_officer",
  "department_head",
];

export type P1ActorContext = {
  userId: string;
  /** Roles held globally by the actor (informational only — never sufficient). */
  roles: readonly string[];
  /** Direct request-processing assignment for THIS runtime step, if any. */
  directAssignment: { stepKey: string; unit: string; role: string; assigneeUserId: string } | null;
};

export type P1StepAuthzInput = {
  service: P1ServiceCode;
  stepKey: string;
  /** The step the runtime currently has open. */
  currentStepKey: string;
  actor: P1ActorContext;
  paymentConfirmed: boolean;
};

export const P1_AUTHZ_DENY = {
  STEP_NOT_CURRENT: "STEP_NOT_CURRENT",
  UNKNOWN_STEP: "UNKNOWN_STEP",
  NO_DIRECT_ASSIGNMENT: "DIRECT_ASSIGNMENT_REQUIRED",
  ASSIGNMENT_MISMATCH: "ASSIGNMENT_STEP_MISMATCH",
  PROCESSING_BINDING_MISMATCH: "EXACT_PROCESSING_BINDING_REQUIRED",
  PAYMENT_NOT_CONFIRMED: "PAYMENT_CONFIRMATION_REQUIRED",
} as const;

export type P1AuthzDeny = (typeof P1_AUTHZ_DENY)[keyof typeof P1_AUTHZ_DENY];

export type P1AuthzResult =
  | { allowed: true }
  | { allowed: false; deny: P1AuthzDeny };

/**
 * Single authoritative decision used by every P1 step. Role names are never
 * consulted for the allow decision — only the exact direct assignment.
 */
export function evaluateP1StepAuthorization(input: P1StepAuthzInput): P1AuthzResult {
  const steps = P1_WORKFLOWS[input.service];
  const step = steps.find((s) => s.key === input.stepKey);
  if (!step) return { allowed: false, deny: P1_AUTHZ_DENY.UNKNOWN_STEP };
  if (input.stepKey !== input.currentStepKey) {
    return { allowed: false, deny: P1_AUTHZ_DENY.STEP_NOT_CURRENT };
  }

  const assignment = input.actor.directAssignment;
  if (!assignment) return { allowed: false, deny: P1_AUTHZ_DENY.NO_DIRECT_ASSIGNMENT };
  if (assignment.assigneeUserId !== input.actor.userId) {
    return { allowed: false, deny: P1_AUTHZ_DENY.NO_DIRECT_ASSIGNMENT };
  }
  if (assignment.stepKey !== step.key) {
    return { allowed: false, deny: P1_AUTHZ_DENY.ASSIGNMENT_MISMATCH };
  }
  if (assignment.unit !== step.unit || assignment.role !== step.role) {
    return { allowed: false, deny: P1_AUTHZ_DENY.PROCESSING_BINDING_MISMATCH };
  }
  if (step.requiresPaymentConfirmed && !input.paymentConfirmed) {
    return { allowed: false, deny: P1_AUTHZ_DENY.PAYMENT_NOT_CONFIRMED };
  }
  return { allowed: true };
}

/** Lifecycle notification events (idempotent by (request_id, event_key)). */
export const P1_NOTIFICATION_EVENTS = [
  "service_submitted",
  "service_returned_for_completion",
  "service_rejected",
  "service_payment_confirmed",
  "service_completed",
] as const;

export type P1NotificationEvent = (typeof P1_NOTIFICATION_EVENTS)[number];

export function buildP1NotificationKey(requestId: string, event: P1NotificationEvent): string {
  return `${requestId}:${event}`;
}

export function deepLinkForRequest(requestId: string, surface: "web" | "mobile"): string {
  return surface === "mobile"
    ? `/mobile/student/requests/${requestId}`
    : `/student/requests/${requestId}`;
}

/** Dedupe helper — idempotent retries must not create duplicate notifications. */
export function filterNewNotifications(
  requestId: string,
  events: readonly P1NotificationEvent[],
  alreadySentKeys: readonly string[],
): P1NotificationEvent[] {
  const sent = new Set(alreadySentKeys);
  const out: P1NotificationEvent[] = [];
  for (const event of events) {
    const key = buildP1NotificationKey(requestId, event);
    if (sent.has(key)) continue;
    sent.add(key);
    out.push(event);
  }
  return out;
}
