import { describe, expect, test } from "bun:test";
import {
  AGGREGATE_UNKNOWN_GROUP_KEY,
  REPORT_ABSOLUTE_MINIMUM_CELL_SIZE,
  REPORT_BENEFICIARIES,
  REPORT_BENEFICIARY_LABELS,
  REPORT_DEFAULT_MINIMUM_CELL_SIZE,
  type AggregateReport,
  assertAggregateReportSafe,
  countByGroup,
  groupRowsToCountTable,
  privacySafeAverage,
  privacySafeCount,
  privacySafeRatio,
  privacySafeSum,
  resolveMinimumCellSize,
} from "../../src/lib/reports/aggregate";

describe("resolveMinimumCellSize — GREATEST(COALESCE(min,5),3)", () => {
  test("defaults to 5 when omitted, null, or non-finite", () => {
    expect(REPORT_DEFAULT_MINIMUM_CELL_SIZE).toBe(5);
    expect(REPORT_ABSOLUTE_MINIMUM_CELL_SIZE).toBe(3);
    expect(resolveMinimumCellSize()).toBe(5);
    expect(resolveMinimumCellSize(null)).toBe(5);
    expect(resolveMinimumCellSize(Number.NaN)).toBe(5);
  });

  test("never goes below the absolute floor of 3", () => {
    expect(resolveMinimumCellSize(0)).toBe(3);
    expect(resolveMinimumCellSize(1)).toBe(3);
    expect(resolveMinimumCellSize(-7)).toBe(3);
    expect(resolveMinimumCellSize(3)).toBe(3);
  });

  test("honors larger thresholds and floors fractions", () => {
    expect(resolveMinimumCellSize(10)).toBe(10);
    expect(resolveMinimumCellSize(4.9)).toBe(4);
  });
});

describe("privacySafeCount", () => {
  test("suppresses counts below the threshold and shows counts at/above it", () => {
    expect(privacySafeCount(4)).toEqual({ total: null, suppressed: true });
    expect(privacySafeCount(5)).toEqual({ total: 5, suppressed: false });
    expect(privacySafeCount(2, 3)).toEqual({ total: null, suppressed: true });
    expect(privacySafeCount(3, 3)).toEqual({ total: 3, suppressed: false });
  });

  test("fails closed on invalid input", () => {
    expect(privacySafeCount(-1)).toEqual({ total: null, suppressed: true });
    expect(privacySafeCount(Number.NaN)).toEqual({ total: null, suppressed: true });
    expect(privacySafeCount(Number.POSITIVE_INFINITY)).toEqual({ total: null, suppressed: true });
  });

  test("normalizes fractional counts by flooring", () => {
    expect(privacySafeCount(5.9)).toEqual({ total: 5, suppressed: false });
    expect(privacySafeCount(4.9)).toEqual({ total: null, suppressed: true });
  });
});

describe("privacySafeSum / privacySafeAverage", () => {
  test("suppress when the cohort is a small cell", () => {
    expect(privacySafeSum([1, 2], 3).suppressed).toBe(true);
    expect(privacySafeSum([], 3).suppressed).toBe(true);
    expect(privacySafeAverage([2, 4], 3).suppressed).toBe(true);
  });

  test("compute over visible cohorts", () => {
    expect(privacySafeSum([1, 2, 3], 3)).toEqual({ total: 6, suppressed: false });
    expect(privacySafeAverage([2, 4, 6], 3)).toEqual({ total: 4, suppressed: false });
  });

  test("fail closed when any value is non-finite", () => {
    expect(privacySafeSum([1, 2, Number.NaN], 3).suppressed).toBe(true);
    expect(privacySafeAverage([1, 1, Number.POSITIVE_INFINITY], 3).suppressed).toBe(true);
  });
});

describe("privacySafeRatio", () => {
  test("suppresses when the denominator cohort is a small cell or invalid", () => {
    expect(privacySafeRatio(2, 2, 3).suppressed).toBe(true);
    expect(privacySafeRatio(1, 0, 3).suppressed).toBe(true);
    expect(privacySafeRatio(-1, 5, 3).suppressed).toBe(true);
    expect(privacySafeRatio(Number.NaN, 5, 3).suppressed).toBe(true);
  });

  test("computes the ratio for visible denominators", () => {
    const ratio = privacySafeRatio(2, 4, 3);
    expect(ratio.suppressed).toBe(false);
    expect(ratio.total).toBeCloseTo(0.5);
  });
});

describe("countByGroup", () => {
  test("groups, suppresses small cells, and never drops missing keys", () => {
    const rows = [
      { program: "CS" },
      { program: "CS" },
      { program: "CS" },
      { program: "MATH" },
      { program: " " },
      { program: null },
    ];
    const groups = countByGroup(rows, (row) => row.program, 3);
    const byKey = new Map(groups.map((group) => [group.key, group.metric]));
    expect(byKey.get("CS")).toEqual({ total: 3, suppressed: false });
    expect(byKey.get("MATH")).toEqual({ total: null, suppressed: true });
    expect(byKey.get(AGGREGATE_UNKNOWN_GROUP_KEY)).toEqual({ total: null, suppressed: true });
  });

  test("orders by key only — never by count (no size leakage for suppressed cells)", () => {
    const rows = [
      { key: "ب" },
      { key: "أ" },
      { key: "أ" },
      { key: "أ" },
      { key: "ت" },
      { key: "ت" },
    ];
    const groups = countByGroup(rows, (row) => row.key, 3);
    // ب (عددها 1) تسبق ت (عددها 2) أبجدياً — الترتيب لا يتبع العدد إطلاقاً.
    expect(groups.map((group) => group.key)).toEqual(["أ", "ب", "ت"]);
  });
});

describe("groupRowsToCountTable", () => {
  test("maps grouped rows into a single-count-column table", () => {
    const table = groupRowsToCountTable("by_x", "حسب X", countByGroup([{ k: "أ" }], (row) => row.k, 3));
    expect(table.columns).toEqual([{ id: "count", label: "العدد" }]);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]?.key).toBe("أ");
    expect(table.rows[0]?.cells).toHaveLength(1);
  });
});

describe("assertAggregateReportSafe", () => {
  const safeReport: AggregateReport = {
    reportId: "demo",
    title: "تقرير تجريبي",
    beneficiary: "dean",
    minimumCellSize: 5,
    kpis: [{ id: "total", label: "الإجمالي", metric: { total: 9, suppressed: false } }],
    tables: [
      {
        id: "by_x",
        title: "حسب X",
        columns: [{ id: "count", label: "العدد" }],
        rows: [{ key: "أ", cells: [{ total: null, suppressed: true }] }],
      },
    ],
  };

  test("accepts a well-formed aggregate report", () => {
    expect(assertAggregateReportSafe(safeReport)).toEqual({ ok: true });
  });

  test("rejects person-identifying keys at any depth", () => {
    const unsafeTop = { ...safeReport, studentId: "s-1" };
    const topCheck = assertAggregateReportSafe(unsafeTop);
    expect(topCheck.ok).toBe(false);
    if (!topCheck.ok) {
      expect(topCheck.violations).toContain("report.studentId");
    }

    const unsafeNested = {
      ...safeReport,
      tables: [
        {
          id: "by_x",
          title: "حسب X",
          columns: [],
          rows: [{ key: "أ", cells: [], studentName: "اختبار" }],
        },
      ],
    };
    const nestedCheck = assertAggregateReportSafe(unsafeNested);
    expect(nestedCheck.ok).toBe(false);
    if (!nestedCheck.ok) {
      expect(nestedCheck.violations.some((v) => v.endsWith("studentName"))).toBe(true);
    }
  });
});

describe("beneficiary registry", () => {
  test("covers exactly the seven audit beneficiaries, each with an Arabic label", () => {
    expect(REPORT_BENEFICIARIES).toHaveLength(7);
    for (const beneficiary of REPORT_BENEFICIARIES) {
      expect(REPORT_BENEFICIARY_LABELS[beneficiary].length).toBeGreaterThan(0);
    }
  });
});
