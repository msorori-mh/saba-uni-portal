/**
 * Central portal feature switches — reversible without deleting routes/services/data.
 * Flip a flag to restore UI; backend RPCs/tables stay untouched.
 */
export const portalFeatures = {
  studentRegisteredCourses: false,
  studentUnofficialTranscript: false,
  studentFinance: false,
  adminFinance: false,
  facultyCourseMaterials: false,
  studentCourseMaterials: false,
  /** Graduate self-service portal — OFF until promotion + continuity policy. */
  studentGraduatesAffairs: false,
  /** Graduates-affairs staff surfaces — OFF until promotion + assignment seed. */
  staffGraduatesAffairs: false,
} as const;

export type PortalFeatureKey = keyof typeof portalFeatures;

export function isPortalFeatureEnabled(key: PortalFeatureKey): boolean {
  return portalFeatures[key];
}

export const STUDENT_FINANCE_FROZEN_MSG =
  "الخدمات المالية مجمدة مؤقتًا وغير متاحة حالياً.";

export const ADMIN_FINANCE_FROZEN_MSG = "الميزة مجمدة مؤقتًا";

export const STUDENT_GRADUATES_AFFAIRS_FROZEN_MSG =
  "بوابة شؤون الخريجين مجمدة مؤقتًا وغير متاحة حالياً.";

export const STAFF_GRADUATES_AFFAIRS_FROZEN_MSG =
  "واجهة شؤون الخريجين للموظفين مجمدة مؤقتًا وغير متاحة حالياً.";
