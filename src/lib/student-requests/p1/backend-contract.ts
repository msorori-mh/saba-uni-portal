/**
 * P1 — authoritative backend contract.
 *
 * Every rule the student sees in the UI is RE-COMPUTED on the server by the
 * SECURITY DEFINER functions shipped in the P1 migration drafts
 * (docs/migration-drafts/p1). This module is the single translation layer
 * between the SQL error codes those functions raise and the Arabic messages the
 * portal shows. The UI never decides eligibility on its own.
 */

export const P1_RPC = {
  octoberRemaining: "p1_october_remaining_requirements",
  assertOctober: "p1_assert_october_eligibility",
  assertReplacementCard: "p1_assert_replacement_card_eligibility",
  assertFinalResultAppeal: "p1_assert_final_result_appeal_eligibility",
  assertTransferLevel: "p1_assert_department_transfer_level",
  assertStepActor: "p1_assert_step_actor",
  assertPaymentConfirmed: "p1_assert_payment_confirmed",
  applyFinalResult: "p1_apply_final_result_decision",
} as const;

export type P1RpcName = (typeof P1_RPC)[keyof typeof P1_RPC];

/** Exact server error codes raised by the P1 SQL layer. */
export const P1_SERVER_ERROR_CODES = [
  "OCTOBER_NOT_LEVEL_4",
  "OCTOBER_NO_REMAINING_REQUIRED_COURSES",
  "OCTOBER_REMAINING_COURSES_EXCEEDS_LIMIT",
  "OCTOBER_SELECTION_NOT_AUTHORITATIVE",
  "REPLACEMENT_CARD_STUDENT_NOT_ACTIVE",
  "REPLACEMENT_CARD_DUPLICATE_OPEN_REQUEST",
  "FINAL_RESULT_APPEAL_NO_ENROLLMENT",
  "FINAL_RESULT_APPEAL_RESULT_NOT_PUBLISHED",
  "FINAL_RESULT_APPEAL_WINDOW_EXPIRED",
  "FINAL_RESULT_APPEAL_DUPLICATE_OPEN",
  "FINAL_RESULT_APPEAL_DETAILS_MISSING",
  "FINAL_RESULT_APPEAL_NO_PUBLISHED_RESULT",
  "FINAL_RESULT_OUT_OF_RANGE",
  "DEPARTMENT_TRANSFER_LEVEL_1_NOT_ELIGIBLE",
  "UNKNOWN_STEP",
  "STEP_NOT_CURRENT",
  "DIRECT_ASSIGNMENT_REQUIRED",
  "EXACT_PROCESSING_BINDING_REQUIRED",
  "PAYMENT_CONFIRMATION_REQUIRED",
] as const;

export type P1ServerErrorCode = (typeof P1_SERVER_ERROR_CODES)[number];

export const P1_SERVER_ERROR_MESSAGES_AR: Readonly<Record<P1ServerErrorCode, string>> = {
  OCTOBER_NOT_LEVEL_4: "خدمة دور أكتوبر متاحة لطلاب المستوى الرابع فقط.",
  OCTOBER_NO_REMAINING_REQUIRED_COURSES:
    "لا توجد لديك مقررات متبقية مطلوبة لاستكمال الخطة الدراسية.",
  OCTOBER_REMAINING_COURSES_EXCEEDS_LIMIT:
    "لا يمكنك التقديم لدور أكتوبر لأن عدد المقررات المتبقية لديك يتجاوز الحد المسموح وهو 4 مقررات.",
  OCTOBER_SELECTION_NOT_AUTHORITATIVE:
    "المقررات المختارة لا تطابق المقررات المتبقية المعتمدة في سجلك الأكاديمي.",
  REPLACEMENT_CARD_STUDENT_NOT_ACTIVE: "هذه الخدمة متاحة للطلاب النشطين فقط.",
  REPLACEMENT_CARD_DUPLICATE_OPEN_REQUEST:
    "لديك طلب بطاقة بدل فاقد قيد المعالجة، لا يمكن تقديم طلب جديد قبل اكتماله.",
  FINAL_RESULT_APPEAL_NO_ENROLLMENT: "لا يوجد تسجيل معتمد لك في هذا المقرر.",
  FINAL_RESULT_APPEAL_RESULT_NOT_PUBLISHED:
    "لا يمكن التظلم قبل إعلان النتيجة النهائية رسمياً.",
  FINAL_RESULT_APPEAL_WINDOW_EXPIRED:
    "انتهت مهلة التظلم وهي 7 أيام من تاريخ إعلان النتيجة النهائية.",
  FINAL_RESULT_APPEAL_DUPLICATE_OPEN: "لديك تظلم قائم على نفس النتيجة قيد المعالجة.",
  FINAL_RESULT_APPEAL_DETAILS_MISSING: "بيانات التظلم غير مكتملة، تعذر تطبيق القرار.",
  FINAL_RESULT_APPEAL_NO_PUBLISHED_RESULT:
    "لا توجد نتيجة نهائية معتمدة لتطبيق القرار عليها.",
  FINAL_RESULT_OUT_OF_RANGE: "النتيجة المعتمدة خارج الحد المسموح للمقرر.",
  DEPARTMENT_TRANSFER_LEVEL_1_NOT_ELIGIBLE:
    "التحويل بين الأقسام غير متاح لطلاب المستوى الأول.",
  UNKNOWN_STEP: "خطوة غير معروفة في مسار الطلب.",
  STEP_NOT_CURRENT: "هذه الخطوة ليست الخطوة الحالية للطلب.",
  DIRECT_ASSIGNMENT_REQUIRED: "لا يمكن تنفيذ هذه الخطوة إلا من الشخص المكلف بها مباشرة.",
  EXACT_PROCESSING_BINDING_REQUIRED:
    "لا تملك التكليف المطلوب (الوحدة والدور) لتنفيذ هذه الخطوة.",
  PAYMENT_CONFIRMATION_REQUIRED:
    "لا يمكن متابعة الطلب قبل تأكيد السداد من قسم الإيرادات.",
};

const CODE_SET = new Set<string>(P1_SERVER_ERROR_CODES);

/** Extracts the canonical P1 code from a raw server error message. */
export function parseP1ServerError(raw: unknown): P1ServerErrorCode | null {
  const text =
    typeof raw === "string"
      ? raw
      : typeof (raw as { message?: unknown })?.message === "string"
        ? ((raw as { message: string }).message)
        : "";
  for (const code of P1_SERVER_ERROR_CODES) {
    if (text.includes(code)) return code;
  }
  return CODE_SET.has(text.trim()) ? (text.trim() as P1ServerErrorCode) : null;
}

export function p1ServerErrorMessageAr(raw: unknown): string {
  const code = parseP1ServerError(raw);
  return code
    ? P1_SERVER_ERROR_MESSAGES_AR[code]
    : "تعذر إتمام العملية، يرجى المحاولة لاحقاً.";
}

/**
 * Revenue gate: the portal has NO payment gateway, amounts or currency.
 * A paid service only waits for the manual external confirmation recorded by
 * the revenue officer; a free service simply has no payment step and no
 * financial row is ever fabricated.
 */
export const P1_REVENUE_GATE = {
  paymentStepKey: "payment_confirmation",
  confirmDecisions: ["confirmed", "approved", "payment_confirmed"] as const,
  portalCollectsMoney: false,
  freeServiceSkipsGate: true,
} as const;

export function isRevenueGateOpen(input: {
  hasPaymentStep: boolean;
  paymentStepStatus: string | null;
  paymentStepDecision: string | null;
}): boolean {
  if (!input.hasPaymentStep) return true;
  return (
    input.paymentStepStatus === "completed"
    && P1_REVENUE_GATE.confirmDecisions.includes(
      (input.paymentStepDecision ?? "") as (typeof P1_REVENUE_GATE.confirmDecisions)[number],
    )
  );
}

/** Migration drafts that must be applied before P1 activation. */
export const P1_MIGRATION_PACKAGE = [
  "docs/migration-drafts/p1/P1-01-DETAIL-MODELS.sql",
  "docs/migration-drafts/p1/P1-02-BACKEND-VALIDATION.sql",
  "docs/migration-drafts/p1/P1-03-WORKFLOW-SEEDS.sql",
  "docs/migration-drafts/p1/P1-04-GRADE-APPEAL-TRIGGER-REPLACE.sql",
] as const;
