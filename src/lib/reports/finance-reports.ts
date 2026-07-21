/**
 * Finance aggregate reporting (finance / university leadership) — replaces
 * the legacy unconnected getReportsFinancial with an aggregate-only contract.
 *
 * Amounts are summed per cohort and each sum is suppressed when its cohort is
 * a small cell (n < threshold), because a sum over a tiny cohort can leak an
 * individual amount. Raw amounts — including non-finite ones — are passed to
 * privacySafeSum unfiltered, so a poisoned row fails the whole cohort closed
 * instead of being silently dropped (which would corrupt the count↔sum
 * relation and open a differencing channel). The derived "outstanding" KPI
 * is visible only when ALL contributing sums are visible AND no contributing
 * period dimension forced a total suppression (differencing a visible sum
 * with a suppressed one would leak the suppressed value).
 *
 * Every total↔breakdown relation (total_entries ↔ by_kind / by_period_count;
 * each amount KPI ↔ its period_amounts column) passes complementary
 * suppression.
 *
 * Currency note: rows must be pre-normalized to a single currency by the
 * caller; mixing currencies in one cohort is a caller error (documented).
 */

import {
  type AggregateMetric,
  type AggregateReport,
  type ReportBeneficiary,
  applyComplementarySuppressionToTable,
  countByGroup,
  forceSuppressed,
  groupRowsToCountTable,
  privacySafeCount,
  privacySafeSum,
  resolveMinimumCellSize,
} from "./aggregate";

export const FINANCE_SUMMARY_REPORT_ID = "finance_summary";

/** Anonymized finance ledger fact; student/receipt ids are excluded by type. */
export interface FinanceFactRow {
  readonly kind: string;
  readonly amount: number;
  /** Free-form period key (e.g. "2026-01" or "2025-Fall"); sorted as text. */
  readonly period?: string | null;
}

export const FINANCE_ENTRY_KINDS = ["fee", "payment", "discount", "refund", "other"] as const;
export type FinanceEntryKind = (typeof FINANCE_ENTRY_KINDS)[number];

export const FINANCE_ENTRY_KIND_LABELS: Record<FinanceEntryKind, string> = {
  fee: "رسوم",
  payment: "مدفوعات",
  discount: "خصومات",
  refund: "مستردات",
  other: "أخرى",
};

/** Raw kind → canonical kind mapping (lowercased keys); unknowns land in "other". */
export const FINANCE_KIND_MAP: Readonly<Record<string, FinanceEntryKind>> = {
  fee: "fee",
  tuition: "fee",
  charge: "fee",
  payment: "payment",
  installment: "payment",
  discount: "discount",
  scholarship: "discount",
  waiver: "discount",
  refund: "refund",
};

/** Fail-safe normalization: unknown kinds are counted under "other". */
export function normalizeFinanceKind(kind: string): FinanceEntryKind {
  const key = kind.trim().toLowerCase();
  return FINANCE_KIND_MAP[key] ?? "other";
}

export interface FinanceSummaryReportInput {
  readonly beneficiary: ReportBeneficiary;
  readonly rows: readonly FinanceFactRow[];
  readonly minimumCellSize?: number | null;
  readonly title?: string;
}

/**
 * Raw amounts of one kind — unfiltered on purpose: privacySafeSum fails the
 * whole cohort closed on non-finite values, keeping count↔sum consistent.
 */
function amountsOf(rows: readonly FinanceFactRow[], kind: FinanceEntryKind): number[] {
  return rows.filter((row) => normalizeFinanceKind(row.kind) === kind).map((row) => row.amount);
}

function periodOf(row: FinanceFactRow): string {
  return (row.period ?? "").trim() || "(غير محدد)";
}

/** Builds the aggregate-only finance summary report. */
export function buildFinanceSummaryReport(input: FinanceSummaryReportInput): AggregateReport {
  const threshold = resolveMinimumCellSize(input.minimumCellSize);
  const rows = input.rows;

  const feeAmounts = amountsOf(rows, "fee");
  const paymentAmounts = amountsOf(rows, "payment");
  const discountAmounts = amountsOf(rows, "discount");
  const refundAmounts = amountsOf(rows, "refund");

  const fees = privacySafeSum(feeAmounts, threshold);
  const payments = privacySafeSum(paymentAmounts, threshold);
  const discounts = privacySafeSum(discountAmounts, threshold);
  const refunds = privacySafeSum(refundAmounts, threshold);

  const kindCounts = new Map<FinanceEntryKind, number>(
    FINANCE_ENTRY_KINDS.map((kind) => [kind, 0]),
  );
  for (const row of rows) {
    const kind = normalizeFinanceKind(row.kind);
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }

  const matrixKinds: readonly FinanceEntryKind[] = ["fee", "payment", "discount", "refund"];
  const periods = [...new Set(rows.map(periodOf))].toSorted((a, b) => a.localeCompare(b, "ar"));

  // ── Tables first: complementary suppression per dimension/column; KPIs are
  //    then gated on the per-column flags. ──
  const kindAdjusted = applyComplementarySuppressionToTable({
    id: "by_kind",
    title: "القيود حسب النوع",
    columns: [{ id: "count", label: "العدد" }],
    rows: FINANCE_ENTRY_KINDS.map((kind) => ({
      key: FINANCE_ENTRY_KIND_LABELS[kind],
      cells: [privacySafeCount(kindCounts.get(kind) ?? 0, threshold)],
    })),
  });

  const periodCountAdjusted = applyComplementarySuppressionToTable(
    groupRowsToCountTable(
      "by_period_count",
      "القيود حسب الفترة",
      countByGroup(rows, (row) => row.period ?? null, threshold),
    ),
  );

  const periodAmountsAdjusted = applyComplementarySuppressionToTable({
    id: "period_amounts",
    title: "المبالغ حسب الفترة ونوع القيد",
    columns: matrixKinds.map((kind) => ({ id: kind, label: FINANCE_ENTRY_KIND_LABELS[kind] })),
    rows: periods.map((period) => ({
      key: period,
      cells: matrixKinds.map((kind) =>
        privacySafeSum(
          rows
            .filter((row) => periodOf(row) === period && normalizeFinanceKind(row.kind) === kind)
            .map((row) => row.amount),
          threshold,
        ),
      ),
    })),
  });

  const totalEntriesSuppressed =
    (kindAdjusted.requiresTotalSuppression[0] ?? false) ||
    (periodCountAdjusted.requiresTotalSuppression[0] ?? false);
  const totalEntriesKpi = totalEntriesSuppressed
    ? forceSuppressed()
    : privacySafeCount(rows.length, threshold);

  const flagFor = (kind: FinanceEntryKind): boolean => {
    const index = matrixKinds.indexOf(kind);
    return index >= 0 ? (periodAmountsAdjusted.requiresTotalSuppression[index] ?? false) : false;
  };
  const sumKpiFor = (kind: FinanceEntryKind, metric: AggregateMetric): AggregateMetric =>
    flagFor(kind) ? forceSuppressed() : metric;

  // Outstanding = fees - payments - discounts + refunds. Visible only when
  // every contributing sum is visible AND no period dimension forced the
  // suppression of a contributing total (fail-closed on differencing).
  const sumsVisible = [fees, payments, discounts, refunds].every(
    (metric) => !metric.suppressed && metric.total !== null,
  );
  const anySumForced = matrixKinds.some(flagFor);
  const outstanding: AggregateMetric =
    sumsVisible && !anySumForced
      ? {
          total: (fees.total ?? 0) - (payments.total ?? 0) - (discounts.total ?? 0) + (refunds.total ?? 0),
          suppressed: false,
        }
      : forceSuppressed();

  return {
    reportId: FINANCE_SUMMARY_REPORT_ID,
    title: input.title ?? "الملخص المالي المجمع",
    beneficiary: input.beneficiary,
    minimumCellSize: threshold,
    kpis: [
      { id: "total_entries", label: "إجمالي القيود", metric: totalEntriesKpi },
      { id: "fees", label: "إجمالي الرسوم", metric: sumKpiFor("fee", fees) },
      { id: "payments", label: "إجمالي المدفوعات", metric: sumKpiFor("payment", payments) },
      { id: "discounts", label: "إجمالي الخصومات", metric: sumKpiFor("discount", discounts) },
      {
        id: "outstanding",
        label: "المتبقي المستحق",
        metric: outstanding,
        hint: "الرسوم − المدفوعات − الخصومات + المستردات",
      },
    ],
    tables: [kindAdjusted.table, periodCountAdjusted.table, periodAmountsAdjusted.table],
  };
}
