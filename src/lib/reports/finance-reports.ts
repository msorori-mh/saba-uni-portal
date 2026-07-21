/**
 * Finance aggregate reporting (finance / university leadership) — replaces
 * the legacy unconnected getReportsFinancial with an aggregate-only contract.
 *
 * Amounts are summed per cohort and each sum is suppressed when its cohort is
 * a small cell (n < threshold), because a sum over a tiny cohort can leak an
 * individual amount. The derived "outstanding" KPI is visible only when ALL
 * contributing cohorts meet the threshold (differencing a visible sum with a
 * suppressed one would leak the suppressed value).
 *
 * Currency note: rows must be pre-normalized to a single currency by the
 * caller; mixing currencies in one cohort is a caller error (documented).
 */

import {
  type AggregateReport,
  type ReportBeneficiary,
  countByGroup,
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

function amountsOf(rows: readonly FinanceFactRow[], kind: FinanceEntryKind): number[] {
  return rows
    .filter((row) => normalizeFinanceKind(row.kind) === kind)
    .map((row) => row.amount)
    .filter((amount) => Number.isFinite(amount));
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

  // Outstanding = fees - payments - discounts + refunds. Visible only when
  // every contributing cohort meets the threshold; otherwise differencing
  // with a visible sum would leak a suppressed one (fail-closed).
  const allVisible =
    !fees.suppressed && !payments.suppressed && !discounts.suppressed && !refunds.suppressed;
  const outstanding =
    allVisible && fees.total !== null && payments.total !== null && discounts.total !== null && refunds.total !== null
      ? { total: fees.total - payments.total - discounts.total + refunds.total, suppressed: false }
      : { total: null, suppressed: true };

  const kindCounts = new Map<FinanceEntryKind, number>(
    FINANCE_ENTRY_KINDS.map((kind) => [kind, 0]),
  );
  for (const row of rows) {
    const kind = normalizeFinanceKind(row.kind);
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }

  const periods = [...new Set(rows.map((row) => (row.period ?? "").trim() || "(غير محدد)"))].toSorted(
    (a, b) => a.localeCompare(b, "ar"),
  );
  const matrixKinds: readonly FinanceEntryKind[] = ["fee", "payment", "discount", "refund"];
  const periodRows = periods.map((period) => {
    const periodRowsAll = rows.filter(
      (row) => ((row.period ?? "").trim() || "(غير محدد)") === period,
    );
    return {
      key: period,
      cells: matrixKinds.map((kind) =>
        privacySafeSum(
          periodRowsAll
            .filter((row) => normalizeFinanceKind(row.kind) === kind)
            .map((row) => row.amount)
            .filter((amount) => Number.isFinite(amount)),
          threshold,
        ),
      ),
    };
  });

  return {
    reportId: FINANCE_SUMMARY_REPORT_ID,
    title: input.title ?? "الملخص المالي المجمع",
    beneficiary: input.beneficiary,
    minimumCellSize: threshold,
    kpis: [
      { id: "total_entries", label: "إجمالي القيود", metric: privacySafeCount(rows.length, threshold) },
      { id: "fees", label: "إجمالي الرسوم", metric: fees },
      { id: "payments", label: "إجمالي المدفوعات", metric: payments },
      { id: "discounts", label: "إجمالي الخصومات", metric: discounts },
      {
        id: "outstanding",
        label: "المتبقي المستحق",
        metric: outstanding,
        hint: "الرسوم − المدفوعات − الخصومات + المستردات",
      },
    ],
    tables: [
      {
        id: "by_kind",
        title: "القيود حسب النوع",
        columns: [{ id: "count", label: "العدد" }],
        rows: FINANCE_ENTRY_KINDS.map((kind) => ({
          key: FINANCE_ENTRY_KIND_LABELS[kind],
          cells: [privacySafeCount(kindCounts.get(kind) ?? 0, threshold)],
        })),
      },
      groupRowsToCountTable(
        "by_period_count",
        "القيود حسب الفترة",
        countByGroup(rows, (row) => row.period ?? null, threshold),
      ),
      {
        id: "period_amounts",
        title: "المبالغ حسب الفترة ونوع القيد",
        columns: matrixKinds.map((kind) => ({ id: kind, label: FINANCE_ENTRY_KIND_LABELS[kind] })),
        rows: periodRows,
      },
    ],
  };
}
