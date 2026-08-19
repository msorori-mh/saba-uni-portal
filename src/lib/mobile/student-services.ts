/**
 * Canonical catalog of the additional (non bottom-nav) student services offered
 * inside the Android/mobile shell.
 *
 * Single source of truth for both the home dashboard and the «المزيد» hub so
 * the two surfaces can never drift. Bottom-nav destinations (الرئيسية/الجدول/
 * الطلبات/الوثائق) are deliberately NOT part of this catalog — «المزيد» must
 * never be a duplicate of the bottom bar.
 *
 * Pure TypeScript: no React, no I/O.
 */

import { portalFeatures } from "@/lib/portal-features";

export type MobileServiceGroup =
  | "core"
  | "academic"
  | "communication"
  | "account"
  | "conditional";

export type MobileServiceKey =
  | "grades"
  | "materials"
  | "study-plan"
  | "reports"
  | "notifications"
  | "profile"
  | "settings"
  | "graduation-projects"
  | "graduates-affairs"
  | "academic-record";

export type MobileServiceItem = {
  readonly key: MobileServiceKey;
  readonly label: string;
  readonly to: string;
  readonly group: MobileServiceGroup;
};

/** Bottom-nav destinations — never repeated inside the «المزيد» hub. */
export const MOBILE_BOTTOM_NAV_TARGETS = [
  "/mobile/student",
  "/mobile/student/schedule",
  "/mobile/student/requests",
  "/mobile/student/documents",
  "/mobile/student/more",
] as const;

export type MobileServicesInput = {
  /** Canonical current fourth-level eligibility (backend predicate mirrors this). */
  readonly gpEligible: boolean;
  /** Official graduate — graduates-affairs surface only. */
  readonly isGraduate: boolean;
};

/**
 * Builds the eligible additional-services list.
 * Frozen features (finance, unofficial transcript) stay out while their flags
 * are false — no placeholder, no «قريباً».
 */
export function buildMobileStudentServices(
  input: MobileServicesInput,
): MobileServiceItem[] {
  const items: MobileServiceItem[] = [
    { key: "grades", label: "الدرجات", to: "/mobile/student/grades", group: "core" },
  ];

  if (portalFeatures.studentCourseMaterials) {
    items.push({
      key: "materials",
      label: "المواد التعليمية",
      to: "/mobile/student/materials",
      group: "academic",
    });
  }

  items.push(
    { key: "study-plan", label: "الخطة الدراسية", to: "/mobile/student/study-plan", group: "academic" },
    { key: "reports", label: "تقاريري", to: "/mobile/student/reports", group: "academic" },
  );

  if (portalFeatures.studentUnofficialTranscript) {
    items.push({
      key: "academic-record",
      label: "السجل الأكاديمي",
      to: "/mobile/student/academic-record",
      group: "academic",
    });
  }

  items.push(
    {
      key: "notifications",
      label: "الإشعارات",
      to: "/mobile/student/notifications",
      group: "communication",
    },
    { key: "profile", label: "بياناتي", to: "/mobile/student/profile", group: "account" },
    { key: "settings", label: "الإعدادات", to: "/mobile/student/settings", group: "account" },
  );

  if (input.gpEligible) {
    items.push({
      key: "graduation-projects",
      label: "مشروع التخرج",
      to: "/mobile/student/graduation-projects",
      group: "conditional",
    });
  }

  if (input.isGraduate && portalFeatures.studentGraduatesAffairs) {
    items.push({
      key: "graduates-affairs",
      label: "شؤون الخريجين",
      to: "/mobile/student/graduates-affairs",
      group: "conditional",
    });
  }

  return items;
}

/** Keys promoted to the home dashboard grid (max 8 cards incl. bottom-nav shortcuts). */
export const MOBILE_HOME_SERVICE_KEYS: readonly MobileServiceKey[] = [
  "grades",
  "study-plan",
  "materials",
  "reports",
] as const;

/** Header destinations are available through global shell actions, not cards. */
export const MOBILE_HEADER_SERVICE_KEYS: readonly MobileServiceKey[] = [
  "notifications",
] as const;

/**
 * Home dashboard services — primary academic surfaces only.
 * Account-level items (بياناتي / الإعدادات) live in «المزيد», never on home.
 */
export function buildMobileHomeServices(input: MobileServicesInput): MobileServiceItem[] {
  const order = new Map(MOBILE_HOME_SERVICE_KEYS.map((k, i) => [k, i] as const));
  return buildMobileStudentServices(input)
    .filter((item) => order.has(item.key))
    .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
}

/**
 * «المزيد» hub content — secondary items only.
 * Excludes the bottom navigation and anything already promoted to the home grid,
 * so the two surfaces never duplicate each other.
 */
export function buildMobileMoreHub(input: MobileServicesInput): MobileServiceItem[] {
  const bottom = new Set<string>(MOBILE_BOTTOM_NAV_TARGETS);
  const promoted = new Set<MobileServiceKey>(MOBILE_HOME_SERVICE_KEYS);
  const header = new Set<MobileServiceKey>(MOBILE_HEADER_SERVICE_KEYS);
  return buildMobileStudentServices(input).filter(
    (item) =>
      !bottom.has(item.to) &&
      !promoted.has(item.key) &&
      !header.has(item.key) &&
      item.group !== "core",
  );
}
