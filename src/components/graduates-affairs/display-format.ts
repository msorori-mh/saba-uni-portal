/**
 * Shared graduates-affairs display formatting. Presentation-only helpers;
 * every label is Arabic and machine codes never reach the screen raw.
 */

import type { GraduateConsentPurpose } from "@/lib/graduates-affairs/consents";

/** Arabic labels for the known consent-purpose vocabulary. */
export const GA_PURPOSE_LABELS: Readonly<Record<GraduateConsentPurpose, string>> = {
  career_followup: "المتابعة المهنية",
  communications: "التواصل",
  surveys: "الاستبيانات",
  events: "الفعاليات",
  employment_quality: "جودة التوظيف",
};

/** Translates a purpose code to Arabic; unknown codes degrade to a safe generic label. */
export function gaPurposeLabelAr(purposeCode: string): string {
  return GA_PURPOSE_LABELS[purposeCode as GraduateConsentPurpose] ?? "غرض غير محدد";
}

/** Arabic (Egypt) date rendering, safe against invalid input (returns the raw value). */
export function formatGaDateAr(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
}
