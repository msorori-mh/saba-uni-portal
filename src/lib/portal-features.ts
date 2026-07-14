/**
 * Central portal feature switches — reversible without deleting routes/services/data.
 * Flip a flag to restore UI; backend RPCs/tables stay untouched.
 */
export const portalFeatures = {
  studentRegisteredCourses: false,
  studentUnofficialTranscript: false,
  studentFinance: false,
  adminFinance: false,
} as const;

export type PortalFeatureKey = keyof typeof portalFeatures;

export function isPortalFeatureEnabled(key: PortalFeatureKey): boolean {
  return portalFeatures[key];
}

export const STUDENT_FINANCE_FROZEN_MSG =
  "الخدمات المالية مجمدة مؤقتًا وغير متاحة حالياً.";

export const ADMIN_FINANCE_FROZEN_MSG = "الميزة مجمدة مؤقتًا";
