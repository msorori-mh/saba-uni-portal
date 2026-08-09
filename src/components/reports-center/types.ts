/**
 * Reports-center contract — presentational shell types for the canonical
 * reports catalog.
 */

import type {
  ReportBeneficiary,
  ReportEntry,
  ReportSensitivity,
  ReportStatus,
  CatalogViewerFacts,
} from "@/lib/reports/catalog";
import type { ExplicitOrgBindings } from "@/lib/reports/scope";

export interface ReportCardProps {
  readonly entry: ReportEntry;
  readonly favorite?: boolean;
  readonly onToggleFavorite?: () => void;
}

export interface ReportsCenterProps {
  /**
   * Catalog entries. When `prefiltered` is true these are already
   * server-projected via getVisibleCatalogForViewer / projectVisibleCatalogForScope.
   * Otherwise the center re-applies fail-closed visibility.
   */
  readonly entries: readonly ReportEntry[];
  /** Roles of the current viewer; empty/unknown ⇒ sees nothing (unless prefiltered). */
  readonly viewerRoles: readonly string[];
  /**
   * Full ActorScope viewer facts (preferred). When set, catalog cards respect
   * identity + org bindings — never role-only advertisement of DENY hubs.
   */
  readonly viewerScope?: CatalogViewerFacts | null;
  /** Org bindings only (legacy). Prefer viewerScope when identity facts exist. */
  readonly viewerBindings?: ExplicitOrgBindings | null;
  /**
   * When true, `entries` are already scope-filtered server-side; do not
   * re-project by role alone.
   */
  readonly prefiltered?: boolean;
  readonly title?: string;
  readonly subtitle?: string;
  /** When false, hide SOURCE_READY / UNDER_DEVELOPMENT preparation cards. */
  readonly showPreparation?: boolean;
  readonly defaultGrouping?: ReportsCenterGrouping;
}

export type ReportsCenterGrouping = "status" | "beneficiary";

/** Arabic labels for the six lifecycle statuses. */
export const STATUS_LABELS_AR: Record<ReportStatus, string> = {
  LIVE: "مفعّل",
  DATA_DEPENDENT: "موصول — ينقصه اختبار",
  SOURCE_READY: "المصدر جاهز",
  UNDER_DEVELOPMENT: "قيد التطوير",
  NOT_ACTIVATED: "غير مفعّل",
  BLOCKED: "محجوب",
};

/** Badge variants (from src/components/ui/badge.tsx) per status. */
export const STATUS_BADGE_VARIANTS: Record<
  ReportStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  LIVE: "default",
  DATA_DEPENDENT: "secondary",
  SOURCE_READY: "secondary",
  UNDER_DEVELOPMENT: "outline",
  NOT_ACTIVATED: "outline",
  BLOCKED: "destructive",
};

/** Arabic labels for sensitivity classes. */
export const SENSITIVITY_LABELS_AR: Record<ReportSensitivity, string> = {
  public: "عام",
  internal: "داخلي",
  restricted: "مقيّد",
  personal: "شخصي",
};

/** Arabic labels for the ten canonical beneficiaries. */
export const BENEFICIARY_LABELS_AR: Record<ReportBeneficiary, string> = {
  student: "طالب",
  faculty_supervisor: "عضو هيئة تدريس/مشرف",
  dept_head_coordinator: "رئيس قسم/منسق",
  operational_units_staff: "موظفو الوحدات التشغيلية",
  academic_affairs: "الشؤون الأكاديمية",
  alumni_quality: "الخريجون والجودة",
  dean: "عميد",
  vp_student_affairs: "نائب شؤون الطلاب",
  vp_academic_affairs: "نائب الشؤون الأكاديمية",
  university_presidency_council: "رئاسة الجامعة/المجلس",
};
