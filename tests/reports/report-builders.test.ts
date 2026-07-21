import { describe, expect, test } from "bun:test";
import type { AggregateMetric, AggregateReport } from "../../src/lib/reports/aggregate";
import { assertAggregateReportSafe } from "../../src/lib/reports/aggregate";
import {
  REQUESTS_OVERVIEW_REPORT_ID,
  REQUEST_AGE_BUCKET_LABELS,
  type RequestFactRow,
  bucketRequestAge,
  buildRequestsAggregateReport,
  normalizeRequestStatus,
} from "../../src/lib/reports/request-reports";
import {
  FINANCE_SUMMARY_REPORT_ID,
  type FinanceFactRow,
  buildFinanceSummaryReport,
  normalizeFinanceKind,
} from "../../src/lib/reports/finance-reports";
import {
  STAFF_ACTIVITY_REPORT_ID,
  type StaffActivityFactRow,
  buildStaffActivityReport,
  normalizeStaffEventType,
} from "../../src/lib/reports/staff-activity-reports";

function kpiOf(report: AggregateReport, id: string): AggregateMetric {
  const kpi = report.kpis.find((entry) => entry.id === id);
  if (!kpi) throw new Error(`missing kpi: ${id}`);
  return kpi.metric;
}

function tableOf(report: AggregateReport, id: string) {
  const table = report.tables.find((entry) => entry.id === id);
  if (!table) throw new Error(`missing table: ${id}`);
  return table;
}

function rowCells(report: AggregateReport, tableId: string, key: string): readonly AggregateMetric[] {
  const row = tableOf(report, tableId).rows.find((entry) => entry.key === key);
  if (!row) throw new Error(`missing row ${key} in ${tableId}`);
  return row.cells;
}

// ─── Requests overview ───────────────────────────────────────────────────────

const requestRows: readonly RequestFactRow[] = [
  ...[3, 4, 5, 6, 7, 8].map((days) => ({
    requestType: "إجازة دراسية",
    status: "approved",
    resolutionDays: days,
    programId: "CS",
    level: "بكالوريوس",
  })),
  ...[10, 11, 12].map((days) => ({
    requestType: "إجازة دراسية",
    status: "rejected",
    resolutionDays: days,
    programId: "CS",
    level: "بكالوريوس",
  })),
  { requestType: "إجازة دراسية", status: "in_progress", ageDays: 3, programId: "CS", level: "بكالوريوس" },
  { requestType: "إجازة دراسية", status: "pending", ageDays: 40, programId: "MATH", level: "بكالوريوس" },
  { requestType: "إجازة دراسية", status: "returned_for_completion", programId: "CS", level: "ماجستير" },
  { requestType: "وثيقة تخرج", status: "approved", resolutionDays: 2 },
  { requestType: "وثيقة تخرج", status: "archived_weird" },
];

describe("buildRequestsAggregateReport", () => {
  const report = buildRequestsAggregateReport({ beneficiary: "dean", rows: requestRows });

  test("has the stable report id and default threshold", () => {
    expect(report.reportId).toBe(REQUESTS_OVERVIEW_REPORT_ID);
    expect(report.minimumCellSize).toBe(5);
    expect(assertAggregateReportSafe(report)).toEqual({ ok: true });
  });

  test("KPIs: visible totals, per-KPI suppression for small cells", () => {
    expect(kpiOf(report, "total")).toEqual({ total: 14, suppressed: false });
    expect(kpiOf(report, "approved")).toEqual({ total: 7, suppressed: false });
    expect(kpiOf(report, "rejected")).toEqual({ total: null, suppressed: true });
    expect(kpiOf(report, "pending")).toEqual({ total: null, suppressed: true });
    expect(kpiOf(report, "returned")).toEqual({ total: null, suppressed: true });
  });

  test("approval rate is a percentage of decided requests", () => {
    const rate = kpiOf(report, "approval_rate");
    expect(rate.suppressed).toBe(false);
    expect(rate.total).toBeCloseTo(70);
  });

  test("average resolution days computed only over rows with valid durations", () => {
    const avg = kpiOf(report, "avg_resolution_days");
    expect(avg.suppressed).toBe(false);
    expect(avg.total).toBeCloseTo(6.8);
  });

  test("average resolution days suppressed when the measured cohort is a small cell", () => {
    const small = buildRequestsAggregateReport({
      beneficiary: "dean",
      rows: [
        { requestType: "أ", status: "approved", resolutionDays: 3 },
        { requestType: "أ", status: "approved", resolutionDays: 5 },
        { requestType: "أ", status: "approved" },
        { requestType: "أ", status: "approved" },
        { requestType: "أ", status: "approved" },
      ],
    });
    expect(kpiOf(small, "avg_resolution_days").suppressed).toBe(true);
    expect(kpiOf(small, "approved")).toEqual({ total: 5, suppressed: false });
  });

  test("per-cell suppression inside a non-suppressed table (small request type)", () => {
    expect(rowCells(report, "by_type", "إجازة دراسية")[0]).toEqual({ total: 12, suppressed: false });
    expect(rowCells(report, "by_type", "وثيقة تخرج")[0]).toEqual({ total: null, suppressed: true });
  });

  test("unknown statuses land in a visible other bucket — never dropped", () => {
    const otherRow = tableOf(report, "by_status_group").rows.find((row) => row.key === "أخرى");
    expect(otherRow).toBeDefined();
    expect(normalizeRequestStatus("archived_weird")).toBe("other");
    expect(normalizeRequestStatus(" APPROVED ")).toBe("approved");
  });

  test("program and level tables suppress small cells", () => {
    expect(rowCells(report, "by_program", "CS")[0]).toEqual({ total: 11, suppressed: false });
    expect(rowCells(report, "by_program", "MATH")[0]).toEqual({ total: null, suppressed: true });
    expect(rowCells(report, "by_level", "ماجستير")[0]).toEqual({ total: null, suppressed: true });
  });

  test("pending aging table keeps bucket order and suppresses tiny buckets", () => {
    const table = tableOf(report, "pending_age");
    expect(table.rows.map((row) => row.key)).toEqual([
      REQUEST_AGE_BUCKET_LABELS["0-7"],
      REQUEST_AGE_BUCKET_LABELS["8-14"],
      REQUEST_AGE_BUCKET_LABELS["15-30"],
      REQUEST_AGE_BUCKET_LABELS["31+"],
    ]);
    for (const row of table.rows) {
      expect(row.cells[0]?.suppressed).toBe(true);
    }
  });

  test("honors a custom threshold of 3 and floors anything smaller", () => {
    const atThree = buildRequestsAggregateReport({ beneficiary: "dean", rows: requestRows, minimumCellSize: 3 });
    expect(atThree.minimumCellSize).toBe(3);
    expect(kpiOf(atThree, "rejected")).toEqual({ total: 3, suppressed: false });
    const floored = buildRequestsAggregateReport({ beneficiary: "dean", rows: requestRows, minimumCellSize: 1 });
    expect(floored.minimumCellSize).toBe(3);
  });
});

describe("bucketRequestAge", () => {
  test("maps ages to buckets and fails closed on invalid ages", () => {
    expect(bucketRequestAge(3)).toBe(REQUEST_AGE_BUCKET_LABELS["0-7"]);
    expect(bucketRequestAge(8)).toBe(REQUEST_AGE_BUCKET_LABELS["8-14"]);
    expect(bucketRequestAge(30)).toBe(REQUEST_AGE_BUCKET_LABELS["15-30"]);
    expect(bucketRequestAge(31)).toBe(REQUEST_AGE_BUCKET_LABELS["31+"]);
    expect(bucketRequestAge(null)).toBe("(غير محدد)");
    expect(bucketRequestAge(-2)).toBe("(غير محدد)");
    expect(bucketRequestAge(Number.NaN)).toBe("(غير محدد)");
  });
});

// ─── Staff activity ──────────────────────────────────────────────────────────

const staffRows: readonly StaffActivityFactRow[] = [
  ...Array.from({ length: 5 }, () => ({ actorRole: "موظف قبول", eventType: "approved" })),
  ...Array.from({ length: 2 }, () => ({ actorRole: "موظف قبول", eventType: "rejected" })),
  { actorRole: "موظف قبول", eventType: "created" },
  ...Array.from({ length: 2 }, () => ({ actorRole: "مراقب مالية", eventType: "approved" })),
];

describe("buildStaffActivityReport", () => {
  const report = buildStaffActivityReport({ beneficiary: "university_leadership", rows: staffRows });

  test("has the stable report id and passes the aggregate safety walk", () => {
    expect(report.reportId).toBe(STAFF_ACTIVITY_REPORT_ID);
    expect(assertAggregateReportSafe(report)).toEqual({ ok: true });
  });

  test("KPIs aggregate by role — never by actor", () => {
    expect(kpiOf(report, "total_events")).toEqual({ total: 10, suppressed: false });
    expect(kpiOf(report, "approved")).toEqual({ total: 7, suppressed: false });
    expect(kpiOf(report, "rejected")).toEqual({ total: null, suppressed: true });
    expect(kpiOf(report, "distinct_roles")).toEqual({ total: null, suppressed: true });
  });

  test("role × event matrix suppresses each small cell independently", () => {
    const matrix = tableOf(report, "role_event_matrix");
    expect(matrix.columns.map((column) => column.id)).toEqual(["approved", "rejected", "returned", "created"]);

    const registrar = rowCells(report, "role_event_matrix", "موظف قبول");
    expect(registrar[0]).toEqual({ total: 5, suppressed: false });
    expect(registrar[1]).toEqual({ total: null, suppressed: true });
    expect(registrar[2]).toEqual({ total: null, suppressed: true });
    expect(registrar[3]).toEqual({ total: null, suppressed: true });

    const controller = rowCells(report, "role_event_matrix", "مراقب مالية");
    expect(controller[0]).toEqual({ total: null, suppressed: true });
  });

  test("unknown event types are counted under other and excluded from the matrix", () => {
    expect(normalizeStaffEventType("teleported")).toBe("other");
    expect(normalizeStaffEventType(" APPROVE ")).toBe("approved");
    const withUnknown = buildStaffActivityReport({
      beneficiary: "university_leadership",
      rows: [...staffRows, { actorRole: "موظف قبول", eventType: "teleported" }],
    });
    expect(kpiOf(withUnknown, "total_events")).toEqual({ total: 11, suppressed: false });
    expect(rowCells(withUnknown, "by_role", "موظف قبول")[0]).toEqual({ total: 9, suppressed: false });
  });
});

// ─── Finance summary ─────────────────────────────────────────────────────────

const fee = (amount: number, period = "2026-01"): FinanceFactRow => ({ kind: "tuition", amount, period });
const pay = (amount: number, period = "2026-01"): FinanceFactRow => ({ kind: "payment", amount, period });
const dis = (amount: number, period = "2026-01"): FinanceFactRow => ({ kind: "scholarship", amount, period });
const ref = (amount: number, period = "2026-01"): FinanceFactRow => ({ kind: "refund", amount, period });

const financeRows: readonly FinanceFactRow[] = [
  ...[100, 200, 300, 400, 500].map((a) => fee(a)),
  ...[50, 60, 70, 80, 90].map((a) => pay(a)),
  ...[10, 20, 30, 40, 50].map((a) => dis(a)),
  ...[5, 15].map((a) => ref(a)),
];

describe("buildFinanceSummaryReport", () => {
  const report = buildFinanceSummaryReport({ beneficiary: "finance", rows: financeRows });

  test("has the stable report id and passes the aggregate safety walk", () => {
    expect(report.reportId).toBe(FINANCE_SUMMARY_REPORT_ID);
    expect(assertAggregateReportSafe(report)).toEqual({ ok: true });
  });

  test("sums visible cohorts and suppresses the small refunds cohort", () => {
    expect(kpiOf(report, "total_entries")).toEqual({ total: 17, suppressed: false });
    expect(kpiOf(report, "fees")).toEqual({ total: 1500, suppressed: false });
    expect(kpiOf(report, "payments")).toEqual({ total: 350, suppressed: false });
    expect(kpiOf(report, "discounts")).toEqual({ total: 150, suppressed: false });
  });

  test("outstanding is fail-closed: hidden when any contributing cohort is suppressed", () => {
    expect(kpiOf(report, "outstanding")).toEqual({ total: null, suppressed: true });
  });

  test("outstanding becomes visible only when all cohorts meet the threshold", () => {
    const visible = buildFinanceSummaryReport({
      beneficiary: "finance",
      rows: [...financeRows, ...[25, 35, 45].map((a) => ref(a))],
    });
    // fees 1500 - payments 350 - discounts 150 + refunds (5+15+25+35+45=125) = 1125
    expect(kpiOf(visible, "outstanding")).toEqual({ total: 1125, suppressed: false });
  });

  test("period × kind matrix suppresses each small cell independently", () => {
    const rows: readonly FinanceFactRow[] = [
      ...[100, 100, 100, 100, 100].map((a) => fee(a, "2026-02")),
      ...[40, 60].map((a) => pay(a, "2026-02")),
    ];
    const matrixReport = buildFinanceSummaryReport({ beneficiary: "finance", rows });
    const cells = rowCells(matrixReport, "period_amounts", "2026-02");
    expect(cells[0]).toEqual({ total: 500, suppressed: false });
    expect(cells[1]).toEqual({ total: null, suppressed: true });
  });

  test("a non-finite amount fails the whole cohort closed", () => {
    const poisoned = buildFinanceSummaryReport({
      beneficiary: "finance",
      rows: [100, 200, 300, 400, Number.NaN].map((a) => fee(a)),
    });
    expect(kpiOf(poisoned, "fees")).toEqual({ total: null, suppressed: true });
  });

  test("kind normalization maps known aliases and buckets unknowns as other", () => {
    expect(normalizeFinanceKind("tuition")).toBe("fee");
    expect(normalizeFinanceKind("scholarship")).toBe("discount");
    expect(normalizeFinanceKind("donation")).toBe("other");
    const otherRow = tableOf(report, "by_kind").rows.find((row) => row.key === "أخرى");
    expect(otherRow?.cells[0]).toEqual({ total: null, suppressed: true });
  });
});
