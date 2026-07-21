/**
 * Canonical portal reports catalog — shared types.
 *
 * Pure TypeScript: no server imports, no React, no I/O. Safe to consume from
 * server functions, routes, components, and isolated `bun test` runs.
 *
 * Task: PORTAL-REPORTS-CANONICAL-CATALOG-AND-TRACEABILITY-01
 */

/** Allowed lifecycle statuses for a catalog entry (closed union). */
export const REPORT_STATUSES = [
  "LIVE",
  "DATA_DEPENDENT",
  "SOURCE_READY",
  "UNDER_DEVELOPMENT",
  "NOT_ACTIVATED",
  "BLOCKED",
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * The ten canonical report beneficiaries (audience facets) used for indexing
 * and visibility grouping in the reports center.
 */
export const REPORT_BENEFICIARIES = [
  "student",
  "faculty_supervisor",
  "dept_head_coordinator",
  "operational_units_staff",
  "academic_affairs",
  "alumni_quality",
  "dean",
  "vp_student_affairs",
  "vp_academic_affairs",
  "university_presidency_council",
] as const;

export type ReportBeneficiary = (typeof REPORT_BENEFICIARIES)[number];

/** Data sensitivity classification (closed union, enforced by invariants). */
export const REPORT_SENSITIVITIES = [
  "public",
  "internal",
  "restricted",
  "personal",
] as const;

export type ReportSensitivity = (typeof REPORT_SENSITIVITIES)[number];

/** Supported output channels. */
export const REPORT_OUTPUT_TYPES = ["screen", "excel", "pdf"] as const;

export type ReportOutputType = (typeof REPORT_OUTPUT_TYPES)[number];

/**
 * One canonical catalog entry.
 *
 * Status semantics (enforced by `invariants.ts`):
 * - `LIVE` — real data source + permission guard + route + automated test +
 *   actual UI wiring, all evidenced by file paths.
 * - `DATA_DEPENDENT` — wired and serving real data in the UI, but missing at
 *   least one LIVE pillar (typically an automated test).
 * - `SOURCE_READY` — the underlying data source is live on main, but no report
 *   surface exists yet; `route` must be `null` (no UI claim).
 * - `UNDER_DEVELOPMENT` — builder/component (+ tests) exist but no server
 *   function and no route; wiring is a documented follow-up.
 * - `NOT_ACTIVATED` — documented gap; no report source exists on main.
 * - `BLOCKED` — source/client/tests exist but a hard external precondition
 *   (unapplied SQL draft, missing authorization package, governance decision)
 *   prevents activation; `blocker` must be a non-empty string.
 */
export interface ReportEntry {
  /** Unique stable code, e.g. `ADM-STUDENTS-DIRECTORY`. */
  readonly report_code: string;
  /** Official Arabic report name. */
  readonly name_ar: string;
  /** What the report contains; merged official sub-items are named here. */
  readonly description: string;
  /** Canonical beneficiaries (non-empty). */
  readonly beneficiaries: readonly ReportBeneficiary[];
  /**
   * Role tokens that may see the report. `canSeeReport` is fail-closed:
   * tokens are matched exactly against viewer roles, so pending/undecided
   * authorization tokens (e.g. `pending:*`) match nobody.
   */
  readonly required_role: readonly string[];
  /** Data scope descriptor (university / college / department / self / ...). */
  readonly data_scope: string;
  /** Evidence-anchored source description (table/RPC/builder + file path). */
  readonly source: string;
  /** Supported filter dimensions. */
  readonly filters: readonly string[];
  readonly sensitivity: ReportSensitivity;
  readonly output_types: readonly ReportOutputType[];
  /** Serving route, or `null` when no UI route exists. */
  readonly route: string | null;
  /** Automated test files covering this report. */
  readonly tests: readonly string[];
  /** File/contract dependencies (paths, RPC names, related components). */
  readonly dependencies: readonly string[];
  readonly status: ReportStatus;
  /** Why the report is not LIVE; mandatory for `BLOCKED`. */
  readonly blocker: string | null;
  /** File-path / document evidence supporting the status decision. */
  readonly evidence: readonly string[];
}
