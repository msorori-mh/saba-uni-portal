/**
 * Organizational / data-scope contracts for beneficiary-aware reports.
 * Pure TypeScript — safe for bun test and client/server shared use.
 *
 * Task: PORTAL-REPORTS-BY-BENEFICIARY-FULL-CLOSURE-01
 */

import type { ReportBeneficiary } from "../catalog/types";

/** Closed union of organizational scope levels (narrow → wide). */
export const ORGANIZATIONAL_SCOPE_LEVELS = [
  "self",
  "assigned",
  "department",
  "college",
  "university_student_affairs",
  "university_academic",
  "university_strategic",
  "operational_unit",
] as const;

export type OrganizationalScopeLevel = (typeof ORGANIZATIONAL_SCOPE_LEVELS)[number];

/**
 * Distinguishes true zeros from missing / inaccessible metrics.
 * Never coerce missing data to 0 in report surfaces.
 */
export const METRIC_PRESENCES = [
  "value",
  "null",
  "not_configured",
  "data_incomplete",
  "no_access",
  "no_data",
] as const;

export type MetricPresence = (typeof METRIC_PRESENCES)[number];

export interface ScopedMetric<T = number> {
  readonly presence: MetricPresence;
  /** Present only when presence === "value". */
  readonly value: T | null;
  readonly label_ar?: string;
}

export function metricValue<T>(value: T, label_ar?: string): ScopedMetric<T> {
  return { presence: "value", value, label_ar };
}

export function metricNull(label_ar?: string): ScopedMetric<never> {
  return { presence: "null", value: null, label_ar };
}

export function metricNoAccess(label_ar?: string): ScopedMetric<never> {
  return { presence: "no_access", value: null, label_ar };
}

export function metricNoData(label_ar?: string): ScopedMetric<never> {
  return { presence: "no_data", value: null, label_ar };
}

export function metricIncomplete(label_ar?: string): ScopedMetric<never> {
  return { presence: "data_incomplete", value: null, label_ar };
}

export function metricNotConfigured(label_ar?: string): ScopedMetric<never> {
  return { presence: "not_configured", value: null, label_ar };
}

/** Actor-resolved report scope — enforced server-side before any query. */
export interface ReportActorScope {
  readonly userId: string;
  readonly roles: readonly string[];
  readonly beneficiaries: readonly ReportBeneficiary[];
  readonly level: OrganizationalScopeLevel;
  /** Forced department when level is department (or narrower assigned within dept). */
  readonly departmentId: string | null;
  /** Faculty profile when actor is faculty / dept head. */
  readonly facultyProfileId: string | null;
  /** Student profile when actor is student (self). */
  readonly studentProfileId: string | null;
  /** Operational processing unit code when applicable. */
  readonly operationalUnitCode: string | null;
  /** Human-readable Arabic scope label for UI. */
  readonly scopeLabelAr: string;
  /** True when scope could not be resolved safely → DENY. */
  readonly denied: boolean;
  readonly denyReasonAr: string | null;
}

/** Statuses that may appear as openable report surfaces. */
export const OPENABLE_REPORT_STATUSES = ["LIVE", "DATA_DEPENDENT"] as const;

/** Statuses shown as non-openable "قيد التجهيز" (never as available data). */
export const PREPARATION_REPORT_STATUSES = [
  "SOURCE_READY",
  "UNDER_DEVELOPMENT",
] as const;

/** Statuses hidden from the end-user catalog cards by default. */
export const HIDDEN_CATALOG_STATUSES = ["BLOCKED", "NOT_ACTIVATED"] as const;
