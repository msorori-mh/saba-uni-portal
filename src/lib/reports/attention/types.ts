/**
 * Attention-item contract for the three-level operational reports UX.
 * Items must come from proven state/metrics — never fabricated fillers.
 *
 * Task: PORTAL-REPORTS-THREE-LEVEL-OPERATIONAL-UX-CLOSURE-01
 */

export const REPORT_ATTENTION_SEVERITIES = [
  "critical",
  "warning",
  "info",
] as const;

export type ReportAttentionSeverity =
  (typeof REPORT_ATTENTION_SEVERITIES)[number];

/**
 * Proven operational attention item.
 * `sourceCode` is mandatory provenance (metric / issue / workflow code).
 */
export type ReportAttentionItem = {
  readonly id: string;
  readonly severity: ReportAttentionSeverity;
  readonly titleAr: string;
  readonly descriptionAr?: string;
  readonly count?: number;
  readonly actionLabelAr?: string;
  readonly actionTo?: string;
  /** Provenance: weeklyIssues.code, metric key, workflow status, etc. */
  readonly sourceCode: string;
};

/** Canonical empty-state copy — neutral, not a fabricated success badge. */
export const ATTENTION_EMPTY_MESSAGE_AR =
  "لا توجد عناصر تحتاج تدخلك الآن";

export const ATTENTION_SECTION_TITLE_AR = "يحتاج انتباهك الآن";
export const KPI_SECTION_TITLE_AR = "المؤشرات الرئيسية";
export const CATALOG_SECTION_TITLE_AR = "جميع التقارير";

/** Official Arabic terminology for course_sections in user-facing copy. */
export const STUDY_GROUP_TERM_AR = "المجموعة الدراسية";
export const STUDY_GROUPS_TERM_AR = "المجموعات الدراسية";
