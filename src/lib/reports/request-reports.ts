/**
 * Student-requests aggregate reporting (dean / student affairs / university
 * leadership) — the Critical gap from PORTAL-REPORTING-COVERAGE-AUDIT-01.
 *
 * Input rows are anonymized request facts: no request id, no student id, no
 * names. Every KPI and table cell passes small-cell suppression; every
 * total↔breakdown relation passes complementary suppression (a breakdown
 * never shows exactly one suppressed cell beside a visible total); the
 * approval rate is published only when both published parties are visible
 * and independently meet the threshold. Unknown raw statuses fall into a
 * visible "other" bucket so no request is silently dropped, and the exact
 * production status keys can be mapped at adoption time via
 * REQUEST_STATUS_GROUP_MAP.
 */

import {
  AGGREGATE_UNKNOWN_GROUP_KEY,
  type AggregateMetric,
  type AggregateReport,
  type ReportBeneficiary,
  applyComplementarySuppressionToTable,
  countByGroup,
  forceSuppressed,
  groupRowsToCountTable,
  privacySafeAverage,
  privacySafeCount,
  privacySafeRatio,
  resolveMinimumCellSize,
} from "./aggregate";

export const REQUESTS_OVERVIEW_REPORT_ID = "student_requests_overview";

/** Anonymized request fact; personally identifying fields are excluded by type. */
export interface RequestFactRow {
  readonly requestType: string;
  readonly status: string;
  readonly programId?: string | null;
  readonly level?: string | null;
  /** Days the request took to reach a final decision (approved/rejected). */
  readonly resolutionDays?: number | null;
  /** Current age in days (used for the pending aging table). */
  readonly ageDays?: number | null;
}

export const REQUEST_STATUS_GROUPS = [
  "approved",
  "rejected",
  "pending",
  "returned",
  "other",
] as const;
export type RequestStatusGroup = (typeof REQUEST_STATUS_GROUPS)[number];

export const REQUEST_STATUS_GROUP_LABELS: Record<RequestStatusGroup, string> = {
  approved: "معتمد",
  rejected: "مرفوض",
  pending: "قيد المعالجة",
  returned: "معاد للاستكمال",
  other: "أخرى",
};

/**
 * Raw status → group mapping (lowercased keys). Extend at adoption time with
 * the exact production status keys; anything unmapped lands in "other".
 */
export const REQUEST_STATUS_GROUP_MAP: Readonly<Record<string, RequestStatusGroup>> = {
  approved: "approved",
  accepted: "approved",
  completed: "approved",
  rejected: "rejected",
  declined: "rejected",
  pending: "pending",
  submitted: "pending",
  in_progress: "pending",
  under_review: "pending",
  under_processing: "pending",
  returned: "returned",
  returned_for_completion: "returned",
  needs_correction: "returned",
  resubmission_required: "returned",
};

/** Fail-safe normalization: unknown statuses are counted under "other". */
export function normalizeRequestStatus(status: string): RequestStatusGroup {
  const key = status.trim().toLowerCase();
  return REQUEST_STATUS_GROUP_MAP[key] ?? "other";
}

export type RequestAgeBucket = "0-7" | "8-14" | "15-30" | "31+";

export const REQUEST_AGE_BUCKET_LABELS: Record<RequestAgeBucket, string> = {
  "0-7": "0–7 أيام",
  "8-14": "8–14 يوماً",
  "15-30": "15–30 يوماً",
  "31+": "أكثر من 30 يوماً",
};

const AGE_BUCKET_ORDER: readonly RequestAgeBucket[] = ["0-7", "8-14", "15-30", "31+"];

/** Buckets the age of a still-pending request; unknown ages share the bucket. */
export function bucketRequestAge(ageDays: number | null | undefined): string {
  if (ageDays === null || ageDays === undefined || !Number.isFinite(ageDays) || ageDays < 0) {
    return AGGREGATE_UNKNOWN_GROUP_KEY;
  }
  const bucket: RequestAgeBucket =
    ageDays <= 7 ? "0-7" : ageDays <= 14 ? "8-14" : ageDays <= 30 ? "15-30" : "31+";
  return REQUEST_AGE_BUCKET_LABELS[bucket];
}

export interface RequestsAggregateReportInput {
  readonly beneficiary: ReportBeneficiary;
  readonly rows: readonly RequestFactRow[];
  readonly minimumCellSize?: number | null;
  readonly title?: string;
}

function isVisible(metric: AggregateMetric): boolean {
  return !metric.suppressed && metric.total !== null;
}

/** Builds the aggregate-only student requests overview report. */
export function buildRequestsAggregateReport(
  input: RequestsAggregateReportInput,
): AggregateReport {
  const threshold = resolveMinimumCellSize(input.minimumCellSize);
  const rows = input.rows;

  const groupCounts = new Map<RequestStatusGroup, number>(
    REQUEST_STATUS_GROUPS.map((group) => [group, 0]),
  );
  for (const row of rows) {
    const group = normalizeRequestStatus(row.status);
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
  }
  const countOf = (group: RequestStatusGroup): number => groupCounts.get(group) ?? 0;

  const decided = countOf("approved") + countOf("rejected");
  const resolutionDays = rows
    .map((row) => row.resolutionDays)
    .filter(
      (days): days is number =>
        typeof days === "number" && Number.isFinite(days) && days >= 0,
    );
  const pendingRows = rows.filter(
    (row) => normalizeRequestStatus(row.status) === "pending",
  );

  // ── Tables first: complementary suppression decides what may be published,
  //    and the KPIs are then derived from the adjusted cells so a hidden cell
  //    can never reappear as a visible KPI (consistency by construction). ──
  const statusAdjusted = applyComplementarySuppressionToTable({
    id: "by_status_group",
    title: "الطلبات حسب الحالة",
    columns: [{ id: "count", label: "العدد" }],
    rows: REQUEST_STATUS_GROUPS.map((group) => ({
      key: REQUEST_STATUS_GROUP_LABELS[group],
      cells: [privacySafeCount(countOf(group), threshold)],
    })),
  });
  const groupMetric = new Map<RequestStatusGroup, AggregateMetric>(
    REQUEST_STATUS_GROUPS.map((group, index) => [
      group,
      statusAdjusted.table.rows[index]?.cells[0] ?? forceSuppressed(),
    ]),
  );

  const typeAdjusted = applyComplementarySuppressionToTable(
    groupRowsToCountTable(
      "by_type",
      "الطلبات حسب النوع",
      countByGroup(rows, (row) => row.requestType, threshold),
    ),
  );
  const programAdjusted = applyComplementarySuppressionToTable(
    groupRowsToCountTable(
      "by_program",
      "الطلبات حسب البرنامج",
      countByGroup(rows, (row) => row.programId ?? null, threshold),
    ),
  );
  const levelAdjusted = applyComplementarySuppressionToTable(
    groupRowsToCountTable(
      "by_level",
      "الطلبات حسب المستوى",
      countByGroup(rows, (row) => row.level ?? null, threshold),
    ),
  );

  // Pending aging: the "(غير محدد)" bucket is a first-class row so the bucket
  // counts always reconcile with the pending KPI (no silent drop).
  const ageAdjusted = applyComplementarySuppressionToTable({
    id: "pending_age",
    title: "أعمار الطلبات قيد المعالجة",
    columns: [{ id: "count", label: "العدد" }],
    rows: [
      ...AGE_BUCKET_ORDER.map((bucket) => ({
        key: REQUEST_AGE_BUCKET_LABELS[bucket],
        cells: [
          privacySafeCount(
            pendingRows.filter(
              (row) => bucketRequestAge(row.ageDays ?? null) === REQUEST_AGE_BUCKET_LABELS[bucket],
            ).length,
            threshold,
          ),
        ],
      })),
      {
        key: AGGREGATE_UNKNOWN_GROUP_KEY,
        cells: [
          privacySafeCount(
            pendingRows.filter(
              (row) => bucketRequestAge(row.ageDays ?? null) === AGGREGATE_UNKNOWN_GROUP_KEY,
            ).length,
            threshold,
          ),
        ],
      },
    ],
  });

  const totalSuppressed =
    (statusAdjusted.requiresTotalSuppression[0] ?? false) ||
    (typeAdjusted.requiresTotalSuppression[0] ?? false) ||
    (programAdjusted.requiresTotalSuppression[0] ?? false) ||
    (levelAdjusted.requiresTotalSuppression[0] ?? false);
  const totalKpi = totalSuppressed ? forceSuppressed() : privacySafeCount(rows.length, threshold);

  const pendingKpi = (ageAdjusted.requiresTotalSuppression[0] ?? false)
    ? forceSuppressed()
    : (groupMetric.get("pending") ?? forceSuppressed());

  const approvedKpi = groupMetric.get("approved") ?? forceSuppressed();
  const rejectedKpi = groupMetric.get("rejected") ?? forceSuppressed();

  // Approval rate: published only when BOTH published parties are visible —
  // a visible ratio plus one visible party would reveal a hidden one — and
  // privacySafeRatio additionally requires each party to meet the threshold.
  const approvalRate: AggregateMetric =
    isVisible(approvedKpi) && isVisible(rejectedKpi)
      ? ((): AggregateMetric => {
          const ratio = privacySafeRatio(countOf("approved"), decided, threshold);
          return ratio.total === null ? ratio : { total: ratio.total * 100, suppressed: false };
        })()
      : forceSuppressed();

  return {
    reportId: REQUESTS_OVERVIEW_REPORT_ID,
    title: input.title ?? "نظرة مجمعة على طلبات الطلاب",
    beneficiary: input.beneficiary,
    minimumCellSize: threshold,
    kpis: [
      { id: "total", label: "إجمالي الطلبات", metric: totalKpi },
      { id: "approved", label: "المعتمدة", metric: approvedKpi },
      { id: "rejected", label: "المرفوضة", metric: rejectedKpi },
      { id: "pending", label: "قيد المعالجة", metric: pendingKpi },
      {
        id: "returned",
        label: "المعادة للاستكمال",
        metric: groupMetric.get("returned") ?? forceSuppressed(),
      },
      {
        id: "approval_rate",
        label: "نسبة الاعتماد %",
        metric: approvalRate,
        hint: "من الطلبات المحسومة (معتمد أو مرفوض)",
      },
      {
        id: "avg_resolution_days",
        label: "متوسط أيام المعالجة",
        metric: privacySafeAverage(resolutionDays, threshold),
        hint: "للطلبات المحسومة فقط",
      },
    ],
    tables: [
      typeAdjusted.table,
      statusAdjusted.table,
      programAdjusted.table,
      levelAdjusted.table,
      ageAdjusted.table,
    ],
  };
}
