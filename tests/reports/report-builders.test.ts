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

const V = (total: number): AggregateMetric => ({ total, suppressed: false });
const S = (): AggregateMetric => ({ total: null, suppressed: true });

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
    expect(kpiOf(report, "total")).toEqual(V(14));
    expect(kpiOf(report, "approved")).toEqual(V(7));
    expect(kpiOf(report, "rejected")).toEqual(S());
    expect(kpiOf(report, "pending")).toEqual(S());
    expect(kpiOf(report, "returned")).toEqual(S());
  });

  test("approval rate is suppressed when either published party is hidden (CRITICAL-1)", () => {
    // approved=7 visible, rejected=3 hidden ⇒ a visible 70% would recover rejected
    expect(kpiOf(report, "approval_rate")).toEqual(S());
  });

  test("approval rate is visible only when both parties meet the threshold", () => {
    const balanced = buildRequestsAggregateReport({
      beneficiary: "dean",
      rows: [
        ...[2, 3, 4, 5, 6].map((days) => ({ requestType: "أ", status: "approved", resolutionDays: days })),
        ...[7, 8, 9, 10, 11].map((days) => ({ requestType: "أ", status: "rejected", resolutionDays: days })),
      ],
    });
    expect(kpiOf(balanced, "approved")).toEqual(V(5));
    expect(kpiOf(balanced, "rejected")).toEqual(V(5));
    const rate = kpiOf(balanced, "approval_rate");
    expect(rate.suppressed).toBe(false);
    expect(rate.total).toBeCloseTo(50);
  });

  test("approval rate becomes visible at a lower threshold when both parties qualify", () => {
    const atThree = buildRequestsAggregateReport({ beneficiary: "dean", rows: requestRows, minimumCellSize: 3 });
    expect(atThree.minimumCellSize).toBe(3);
    expect(kpiOf(atThree, "rejected")).toEqual(V(3));
    const rate = kpiOf(atThree, "approval_rate");
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
    expect(kpiOf(small, "approved")).toEqual(V(5));
  });

  test("complementary suppression hides the second cell of a breakdown with exactly one small cell (HIGH-2)", () => {
    // by_type: إجازة دراسية=12 visible, وثيقة تخرج=2 suppressed ⇒ the visible
    // cell is complementary-suppressed; total stays visible (two unknowns).
    expect(rowCells(report, "by_type", "إجازة دراسية")[0]).toEqual(S());
    expect(rowCells(report, "by_type", "وثيقة تخرج")[0]).toEqual(S());
    expect(kpiOf(report, "total")).toEqual(V(14));
  });

  test("complementary suppression keeps the largest cells visible", () => {
    const mixed = buildRequestsAggregateReport({
      beneficiary: "dean",
      rows: [
        ...Array.from({ length: 6 }, () => ({ requestType: "أ", status: "approved" })),
        ...Array.from({ length: 5 }, () => ({ requestType: "ب", status: "approved" })),
        ...Array.from({ length: 2 }, () => ({ requestType: "ج", status: "approved" })),
      ],
    });
    expect(rowCells(mixed, "by_type", "أ")[0]).toEqual(V(6));
    expect(rowCells(mixed, "by_type", "ب")[0]).toEqual(S());
    expect(rowCells(mixed, "by_type", "ج")[0]).toEqual(S());
    expect(kpiOf(mixed, "total")).toEqual(V(13));
  });

  test("a single-row breakdown with a suppressed cell forces the total to be suppressed (HIGH-2)", () => {
    const single = buildRequestsAggregateReport({
      beneficiary: "dean",
      rows: [
        { requestType: "أ", status: "approved", programId: "CS" },
        { requestType: "أ", status: "approved", programId: "CS" },
        { requestType: "أ", status: "rejected", programId: "CS" },
      ],
    });
    expect(rowCells(single, "by_type", "أ")[0]).toEqual(S());
    expect(rowCells(single, "by_program", "CS")[0]).toEqual(S());
    expect(kpiOf(single, "total")).toEqual(S());
  });

  test("unknown statuses land in a visible other bucket — never dropped", () => {
    const otherRow = tableOf(report, "by_status_group").rows.find((row) => row.key === "أخرى");
    expect(otherRow).toBeDefined();
    expect(normalizeRequestStatus("archived_weird")).toBe("other");
    expect(normalizeRequestStatus(" APPROVED ")).toBe("approved");
  });

  test("program and level tables suppress small cells (two-plus suppressed cells stay differencing-safe)", () => {
    expect(rowCells(report, "by_program", "CS")[0]).toEqual(V(11));
    expect(rowCells(report, "by_program", "MATH")[0]).toEqual(S());
    expect(rowCells(report, "by_level", "ماجستير")[0]).toEqual(S());
  });

  test("pending aging table includes the unknown bucket and reconciles with the pending KPI (MEDIUM-4)", () => {
    const table = tableOf(report, "pending_age");
    expect(table.rows.map((row) => row.key)).toEqual([
      REQUEST_AGE_BUCKET_LABELS["0-7"],
      REQUEST_AGE_BUCKET_LABELS["8-14"],
      REQUEST_AGE_BUCKET_LABELS["15-30"],
      REQUEST_AGE_BUCKET_LABELS["31+"],
      "(غير محدد)",
    ]);
    for (const row of table.rows) {
      expect(row.cells[0]?.suppressed).toBe(true);
    }

    const unknownAges = buildRequestsAggregateReport({
      beneficiary: "dean",
      rows: Array.from({ length: 6 }, () => ({ requestType: "أ", status: "pending" })),
    });
    expect(kpiOf(unknownAges, "pending")).toEqual(V(6));
    expect(rowCells(unknownAges, "pending_age", "(غير محدد)")[0]).toEqual(V(6));
  });

  test("floors a custom threshold below 3", () => {
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
  ...Array.from({ length: 5 }, () => ({ actorRole: "مراقب مالية", eventType: "approved" })),
  ...Array.from({ length: 2 }, () => ({ actorRole: "موظف شؤون", eventType: "approved" })),
];

describe("buildStaffActivityReport", () => {
  const report = buildStaffActivityReport({ beneficiary: "university_leadership", rows: staffRows });

  test("has the stable report id and passes the aggregate safety walk", () => {
    expect(report.reportId).toBe(STAFF_ACTIVITY_REPORT_ID);
    expect(assertAggregateReportSafe(report)).toEqual({ ok: true });
  });

  test("KPIs aggregate by role — never by actor", () => {
    expect(kpiOf(report, "total_events")).toEqual(V(15));
    expect(kpiOf(report, "approved")).toEqual(V(12));
    expect(kpiOf(report, "rejected")).toEqual(S());
    expect(kpiOf(report, "distinct_roles")).toEqual(S());
  });

  test("by_role applies complementary suppression to the second-smallest role (HIGH-2)", () => {
    // شؤون=2 is the only suppressed cell ⇒ مالية=5 hidden as complement;
    // قبول=8 stays visible; total stays visible (two unknowns).
    expect(rowCells(report, "by_role", "موظف قبول")[0]).toEqual(V(8));
    expect(rowCells(report, "by_role", "مراقب مالية")[0]).toEqual(S());
    expect(rowCells(report, "by_role", "موظف شؤون")[0]).toEqual(S());
  });

  test("role × event matrix suppresses small and complementary cells independently", () => {
    const matrix = tableOf(report, "role_event_matrix");
    expect(matrix.columns.map((column) => column.id)).toEqual(["approved", "rejected", "returned", "created"]);

    // approved column: شؤون=2 suppressed ⇒ first-minimal visible (مالية=5) hidden as complement
    expect(rowCells(report, "role_event_matrix", "موظف قبول")[0]).toEqual(V(5));
    expect(rowCells(report, "role_event_matrix", "مراقب مالية")[0]).toEqual(S());
    expect(rowCells(report, "role_event_matrix", "موظف شؤون")[0]).toEqual(S());

    const registrar = rowCells(report, "role_event_matrix", "موظف قبول");
    expect(registrar[1]).toEqual(S());
    expect(registrar[2]).toEqual(S());
    expect(registrar[3]).toEqual(S());
  });

  test("unknown event types are counted under other and excluded from the matrix", () => {
    expect(normalizeStaffEventType("teleported")).toBe("other");
    expect(normalizeStaffEventType(" APPROVE ")).toBe("approved");
    const withUnknown = buildStaffActivityReport({
      beneficiary: "university_leadership",
      rows: [...staffRows, { actorRole: "موظف قبول", eventType: "teleported" }],
    });
    expect(kpiOf(withUnknown, "total_events")).toEqual(V(16));
    expect(rowCells(withUnknown, "by_role", "موظف قبول")[0]).toEqual(V(9));
    expect(rowCells(withUnknown, "by_role", "مراقب مالية")[0]).toEqual(S());
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
    expect(kpiOf(report, "total_entries")).toEqual(V(17));
    expect(kpiOf(report, "fees")).toEqual(V(1500));
    expect(kpiOf(report, "payments")).toEqual(V(350));
    expect(kpiOf(report, "discounts")).toEqual(V(150));
  });

  test("outstanding is fail-closed: hidden when any contributing cohort is suppressed", () => {
    expect(kpiOf(report, "outstanding")).toEqual(S());
  });

  test("outstanding becomes visible only when all cohorts meet the threshold", () => {
    const visibleReport = buildFinanceSummaryReport({
      beneficiary: "finance",
      rows: [...financeRows, ...[25, 35, 45].map((a) => ref(a))],
    });
    // fees 1500 - payments 350 - discounts 150 + refunds (5+15+25+35+45=125) = 1125
    expect(kpiOf(visibleReport, "outstanding")).toEqual(V(1125));
    expect(kpiOf(visibleReport, "total_entries")).toEqual(V(20));
  });

  test("single-period dimension with a suppressed sum forces that sum KPI to be suppressed (HIGH-2)", () => {
    const rows: readonly FinanceFactRow[] = [
      ...[100, 100, 100, 100, 100].map((a) => fee(a, "2026-02")),
      ...[40, 60].map((a) => pay(a, "2026-02")),
    ];
    const matrixReport = buildFinanceSummaryReport({ beneficiary: "finance", rows });
    const cells = rowCells(matrixReport, "period_amounts", "2026-02");
    expect(cells[0]).toEqual(V(500));
    expect(cells[1]).toEqual(S());
    // payment column is a single-cell dimension ⇒ its total is suppressed too
    expect(kpiOf(matrixReport, "payments")).toEqual(S());
    expect(kpiOf(matrixReport, "fees")).toEqual(V(500));
  });

  test("raw amounts are never silently filtered: a poisoned cohort keeps its count but loses its sum (MEDIUM-3)", () => {
    const poisoned = buildFinanceSummaryReport({
      beneficiary: "finance",
      rows: [100, 200, 300, 400, 500, Number.NaN].map((a) => fee(a)),
    });
    // count still 6 (row not dropped) while the sum fails closed
    expect(kpiOf(poisoned, "total_entries")).toEqual(V(6));
    expect(kpiOf(poisoned, "fees")).toEqual(S());
  });

  test("kind normalization maps known aliases and buckets unknowns as other", () => {
    expect(normalizeFinanceKind("tuition")).toBe("fee");
    expect(normalizeFinanceKind("scholarship")).toBe("discount");
    expect(normalizeFinanceKind("donation")).toBe("other");
    const otherRow = tableOf(report, "by_kind").rows.find((row) => row.key === "أخرى");
    expect(otherRow?.cells[0]).toEqual(S());
  });
});
