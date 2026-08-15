/**
 * P1 — canonical user-facing terminology for the student-services domain.
 *
 * Product rule: the user-facing domain name is «الخدمات الطلابية».
 * Internal identifiers (student_requests, request_types, RPC names, TS types)
 * are deliberately NOT renamed — only presentation strings.
 */

export const STUDENT_SERVICES_TERMS = {
  domain: "الخدمات الطلابية",
  domainShort: "الخدمات",
  submit: "تقديم خدمة",
  track: "متابعة الخدمات",
  submitted: "الخدمات المقدمة",
  availableServices: "الخدمات المتاحة",
  newService: "خدمة جديدة",
  serviceDetail: "تفاصيل الخدمة",
  emptyState: "لا توجد خدمات مقدمة حتى الآن.",
  loadError: "تعذر تحميل الخدمات.",
  adminTypes: "أنواع الخدمات الطلابية",
} as const;

/** Phrases retired from user-facing surfaces in P1. */
export const RETIRED_STUDENT_SERVICE_PHRASES: readonly string[] = [
  "الطلبات الطلابية",
  "طلبات شؤون الطلاب",
  "تقديم طلب شؤون طلاب",
] as const;

/** Approved Arabic label for registrar_general (never «المسجل العام»). */
export const COLLEGE_REGISTRAR_LABEL_AR = "مسجل الكلية";
export const RETIRED_REGISTRAR_LABEL_AR = "المسجل العام";

/** Audit helper used by tests: returns retired phrases found in a source text. */
export function findRetiredStudentServicePhrases(text: string): string[] {
  return RETIRED_STUDENT_SERVICE_PHRASES.filter((phrase) => text.includes(phrase));
}
