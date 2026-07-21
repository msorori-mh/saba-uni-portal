/**
 * Shared aggregate-only reporting primitives for the portal.
 *
 * Contract (mirrors the merged graduates-affairs reports contract):
 * - Reports are aggregate-only: no row-level or person-identifying output.
 * - Small-cell suppression: every metric whose underlying population is
 *   smaller than the threshold is returned as { total: null, suppressed: true }.
 * - Threshold resolution follows GREATEST(COALESCE(min, 5), 3): default 5,
 *   absolute floor 3 — callers may request a larger threshold, never smaller.
 * - Fail-closed: invalid inputs (negative/NaN counts, undersized cohorts,
 *   non-finite amounts) yield suppressed metrics instead of partial numbers.
 * - Ordering never depends on raw counts, so sort order cannot leak the
 *   relative size of suppressed cells.
 * - Ratios are published only when BOTH parties independently meet the
 *   threshold; otherwise ratio + one visible party reveals the other.
 * - Complementary suppression: a breakdown published beside a visible total
 *   never contains exactly one suppressed cell (see
 *   applyComplementarySuppression).
 */

export const REPORT_DEFAULT_MINIMUM_CELL_SIZE = 5;
export const REPORT_ABSOLUTE_MINIMUM_CELL_SIZE = 3;

/** A single privacy-safe metric: null total whenever the cell is suppressed. */
export interface AggregateMetric {
  readonly total: number | null;
  readonly suppressed: boolean;
}

/** GREATEST(COALESCE(requested, 5), 3) — the TS mirror of the SQL pattern. */
export function resolveMinimumCellSize(requested?: number | null): number {
  if (requested === undefined || requested === null || !Number.isFinite(requested)) {
    return REPORT_DEFAULT_MINIMUM_CELL_SIZE;
  }
  return Math.max(Math.floor(requested), REPORT_ABSOLUTE_MINIMUM_CELL_SIZE);
}

function suppressedMetric(): AggregateMetric {
  return { total: null, suppressed: true };
}

function visibleMetric(total: number): AggregateMetric {
  return { total, suppressed: false };
}

/** A count is visible only at or above the threshold; invalid input fails closed. */
export function privacySafeCount(
  count: number,
  minimumCellSize?: number | null,
): AggregateMetric {
  const threshold = resolveMinimumCellSize(minimumCellSize);
  if (!Number.isFinite(count)) {
    return suppressedMetric();
  }
  const normalized = Math.floor(count);
  if (normalized < 0) {
    return suppressedMetric();
  }
  return normalized >= threshold ? visibleMetric(normalized) : suppressedMetric();
}

/** Sum over a cohort, suppressed when the cohort itself is a small cell. */
export function privacySafeSum(
  values: readonly number[],
  minimumCellSize?: number | null,
): AggregateMetric {
  const threshold = resolveMinimumCellSize(minimumCellSize);
  if (values.length < threshold) {
    return suppressedMetric();
  }
  if (!values.every((value) => Number.isFinite(value))) {
    return suppressedMetric();
  }
  return visibleMetric(values.reduce((acc, value) => acc + value, 0));
}

/** Average over a cohort with the same small-cell rule. */
export function privacySafeAverage(
  values: readonly number[],
  minimumCellSize?: number | null,
): AggregateMetric {
  const threshold = resolveMinimumCellSize(minimumCellSize);
  if (values.length < threshold) {
    return suppressedMetric();
  }
  if (!values.every((value) => Number.isFinite(value))) {
    return suppressedMetric();
  }
  return visibleMetric(values.reduce((acc, value) => acc + value, 0) / values.length);
}

/**
 * Ratio (numerator / denominator) visible only when the denominator cohort is
 * not a small cell AND both parties independently meet the threshold:
 * numerator >= threshold AND (denominator − numerator) >= threshold.
 * Publishing the ratio while either party is below the threshold would let a
 * reader recover that party from the ratio and the other (visible) party —
 * so it fails closed. A zero/negative/invalid denominator also fails closed.
 */
export function privacySafeRatio(
  numerator: number,
  denominator: number,
  minimumCellSize?: number | null,
): AggregateMetric {
  const threshold = resolveMinimumCellSize(minimumCellSize);
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    numerator < 0 ||
    denominator < threshold
  ) {
    return suppressedMetric();
  }
  if (numerator < threshold || denominator - numerator < threshold) {
    return suppressedMetric();
  }
  return visibleMetric(numerator / denominator);
}

/** Shared bucket key for rows missing a grouping dimension. */
export const AGGREGATE_UNKNOWN_GROUP_KEY = "(غير محدد)";

export interface AggregateGroupRow {
  readonly key: string;
  readonly metric: AggregateMetric;
}

/**
 * Groups rows by a string key and counts each group with suppression.
 * Null/empty keys fall into a single shared bucket so no row is dropped.
 * Output is ordered by key only (Arabic locale) — never by count — so the
 * ordering itself cannot leak the size of suppressed cells.
 */
export function countByGroup<T>(
  rows: readonly T[],
  keyOf: (row: T) => string | null | undefined,
  minimumCellSize?: number | null,
): AggregateGroupRow[] {
  const threshold = resolveMinimumCellSize(minimumCellSize);
  const groups = new Map<string, number>();
  for (const row of rows) {
    const raw = keyOf(row);
    const key = raw && raw.trim().length > 0 ? raw.trim() : AGGREGATE_UNKNOWN_GROUP_KEY;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return [...groups.entries()]
    .toSorted((a, b) => a[0].localeCompare(b[0], "ar"))
    .map(([key, count]) => ({ key, metric: privacySafeCount(count, threshold) }));
}

/** The seven report beneficiaries covered by the coverage audit. */
export const REPORT_BENEFICIARIES = [
  "student",
  "faculty_member",
  "department_head",
  "dean",
  "student_affairs",
  "finance",
  "university_leadership",
] as const;
export type ReportBeneficiary = (typeof REPORT_BENEFICIARIES)[number];

/** Arabic display labels for each beneficiary (RTL dashboards). */
export const REPORT_BENEFICIARY_LABELS: Record<ReportBeneficiary, string> = {
  student: "طالب",
  faculty_member: "عضو هيئة تدريس",
  department_head: "رئيس قسم",
  dean: "عميد",
  student_affairs: "شؤون الطلاب",
  finance: "المالية",
  university_leadership: "قيادة الجامعة",
};

export interface ReportKpi {
  readonly id: string;
  readonly label: string;
  readonly metric: AggregateMetric;
  readonly hint?: string;
}

export interface ReportTableColumn {
  readonly id: string;
  readonly label: string;
}

export interface ReportTableRow {
  readonly key: string;
  readonly cells: readonly AggregateMetric[];
}

export interface ReportTable {
  readonly id: string;
  readonly title: string;
  readonly columns: readonly ReportTableColumn[];
  readonly rows: readonly ReportTableRow[];
}

/**
 * The complete aggregate report payload rendered by dashboards. The shape is
 * deliberately closed: every key is allowlisted so a future change cannot
 * silently attach person-identifying fields (see assertAggregateReportSafe).
 */
export interface AggregateReport {
  readonly reportId: string;
  readonly title: string;
  readonly beneficiary: ReportBeneficiary;
  readonly minimumCellSize: number;
  readonly kpis: readonly ReportKpi[];
  readonly tables: readonly ReportTable[];
}

/** Builds a single-count-column table from grouped rows. */
export function groupRowsToCountTable(
  id: string,
  title: string,
  groups: readonly AggregateGroupRow[],
  countLabel = "العدد",
): ReportTable {
  return {
    id,
    title,
    columns: [{ id: "count", label: countLabel }],
    rows: groups.map((group) => ({ key: group.key, cells: [group.metric] })),
  };
}

export interface ComplementarySuppressionResult {
  readonly cells: AggregateMetric[];
  /**
   * True when the dimension has exactly one suppressed cell that is also its
   * ONLY cell — no second cell can be hidden, so the caller must suppress
   * the corresponding published total instead.
   */
  readonly requiresTotalSuppression: boolean;
}

/**
 * Complementary suppression (differencing protection). A breakdown published
 * alongside a visible total must never contain exactly one suppressed cell:
 * total − Σ(visible cells) would recover it exactly. When exactly one cell
 * is suppressed, the smallest visible cell is suppressed as well
 * (deterministic: first minimal in row order), leaving at least two unknowns
 * for any single-equation recovery attempt. Dimensions with zero or two-plus
 * suppressed cells are returned unchanged; a single-row dimension sets
 * requiresTotalSuppression.
 */
export function applyComplementarySuppression(
  cells: readonly AggregateMetric[],
): ComplementarySuppressionResult {
  const suppressedCount = cells.filter((cell) => cell.suppressed || cell.total === null).length;
  if (suppressedCount !== 1) {
    return { cells: [...cells], requiresTotalSuppression: false };
  }
  if (cells.length === 1) {
    return { cells: [...cells], requiresTotalSuppression: true };
  }
  let targetIndex = -1;
  let smallest = Number.POSITIVE_INFINITY;
  cells.forEach((cell, index) => {
    if (!cell.suppressed && cell.total !== null && cell.total < smallest) {
      smallest = cell.total;
      targetIndex = index;
    }
  });
  if (targetIndex === -1) {
    return { cells: [...cells], requiresTotalSuppression: true };
  }
  const next = [...cells];
  next[targetIndex] = { total: null, suppressed: true };
  return { cells: next, requiresTotalSuppression: false };
}

export interface TableComplementarySuppressionResult {
  readonly table: ReportTable;
  /** Per column: the caller must suppress the total related to that column. */
  readonly requiresTotalSuppression: readonly boolean[];
}

/**
 * Applies complementary suppression to every column of a table. Each column
 * is treated as one dimension related to its own published total (KPI).
 */
export function applyComplementarySuppressionToTable(
  table: ReportTable,
): TableComplementarySuppressionResult {
  const flags: boolean[] = [];
  const adjustedColumns: AggregateMetric[][] = [];
  for (let columnIndex = 0; columnIndex < table.columns.length; columnIndex += 1) {
    const columnCells = table.rows.map(
      (row) => row.cells[columnIndex] ?? { total: null, suppressed: true },
    );
    const result = applyComplementarySuppression(columnCells);
    flags.push(result.requiresTotalSuppression);
    adjustedColumns.push(result.cells);
  }
  const rows = table.rows.map((row, rowIndex) => ({
    key: row.key,
    cells: row.cells.map(
      (_cell, columnIndex) =>
        adjustedColumns[columnIndex]?.[rowIndex] ?? { total: null, suppressed: true },
    ),
  }));
  return { table: { ...table, rows }, requiresTotalSuppression: flags };
}

/** Returns a suppressed metric regardless of input (forced suppression). */
export function forceSuppressed(): AggregateMetric {
  return { total: null, suppressed: true };
}

/** Keys allowed anywhere inside an aggregate report payload. */
const AGGREGATE_REPORT_ALLOWED_KEYS: readonly string[] = [
  "reportId",
  "title",
  "beneficiary",
  "minimumCellSize",
  "kpis",
  "tables",
  "id",
  "label",
  "metric",
  "hint",
  "columns",
  "rows",
  "cells",
  "key",
  "total",
  "suppressed",
];

export type AggregateSafetyCheck = { ok: true } | { ok: false; violations: string[] };

/**
 * Defense-in-depth check before a report leaves the trust boundary: walks the
 * structure and rejects any object key outside the aggregate allowlist, so a
 * future change cannot silently reintroduce person-identifying fields.
 *
 * NOTE: currently exercised by the test suite; it will be wired into the
 * emission path when server functions adopt these builders (documented
 * follow-up).
 */
export function assertAggregateReportSafe(report: unknown): AggregateSafetyCheck {
  const violations: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        if (!AGGREGATE_REPORT_ALLOWED_KEYS.includes(key)) {
          violations.push(`${path}.${key}`);
        }
        walk(nested, `${path}.${key}`);
      }
    }
  };
  walk(report, "report");
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
