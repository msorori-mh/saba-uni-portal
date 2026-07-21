import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { REPORT_BENEFICIARIES } from "../../src/lib/reports/aggregate";
import {
  REPORT_BUILDER_KEYS,
  REPORT_CATALOG,
  listCatalogGaps,
  listDeliveredForBuilder,
  listReportsForBeneficiary,
} from "../../src/lib/reports/report-catalog";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const COMPONENT_SOURCES = [
  "../../src/components/reports/AggregateReportView.tsx",
  "../../src/components/dashboards/RequestsAggregateDashboard.tsx",
  "../../src/components/dashboards/FinanceAggregateDashboard.tsx",
  "../../src/components/dashboards/StaffActivityDashboard.tsx",
] as const;

describe("report catalog", () => {
  test("every beneficiary has at least one catalog entry", () => {
    for (const beneficiary of REPORT_BENEFICIARIES) {
      expect(REPORT_CATALOG.some((entry) => entry.beneficiary === beneficiary)).toBe(true);
    }
  });

  test("delivered entries always reference a known builder", () => {
    for (const entry of REPORT_CATALOG) {
      if (entry.status === "delivered") {
        expect(entry.builderKey).toBeDefined();
        expect(REPORT_BUILDER_KEYS as readonly string[]).toContain(entry.builderKey ?? "");
      }
    }
  });

  test("every builder is wired to at least one delivered entry", () => {
    for (const builderKey of REPORT_BUILDER_KEYS) {
      expect(listDeliveredForBuilder(builderKey).length).toBeGreaterThan(0);
    }
  });

  test("gap inventory is documented: every gap entry carries notes", () => {
    const gaps = listCatalogGaps();
    expect(gaps.length).toBeGreaterThanOrEqual(5);
    for (const gap of gaps) {
      expect(gap.status).toBe("gap");
      expect(gap.notes).toBeDefined();
      expect((gap.notes ?? "").length).toBeGreaterThan(0);
    }
  });

  test("beneficiary listing is priority-ordered (critical first)", () => {
    const deanEntries = listReportsForBeneficiary("dean");
    expect(deanEntries.length).toBeGreaterThan(0);
    expect(deanEntries[0]?.priority).toBe("critical");
  });

  test("delivered finance summary serves finance and university leadership", () => {
    const beneficiaries = listDeliveredForBuilder("finance_summary").map((entry) => entry.beneficiary);
    expect(beneficiaries).toContain("finance");
    expect(beneficiaries).toContain("university_leadership");
  });
});

describe("presentational dashboards — static no-network contract", () => {
  const NETWORK_TOKENS = ["fetch(", "axios", "@supabase", "createServerFn", "XMLHttpRequest"];

  test("dashboards and the report view perform no network access", () => {
    for (const path of COMPONENT_SOURCES) {
      const source = readSource(path);
      for (const token of NETWORK_TOKENS) {
        expect(source.includes(token)).toBe(false);
      }
    }
  });

  test("components are RTL Arabic and render suppressed cells as محجوب", () => {
    for (const path of COMPONENT_SOURCES) {
      expect(readSource(path)).toContain('dir="rtl"');
    }
    expect(readSource("../../src/components/reports/AggregateReportView.tsx")).toContain("محجوب");
  });

  test("dashboards fail closed on foreign report kinds", () => {
    for (const path of COMPONENT_SOURCES.slice(1)) {
      const source = readSource(path);
      expect(source).toContain("reportId !==");
      expect(source).toContain("return null");
    }
  });
});

describe("shared library — threshold pattern contract", () => {
  test("aggregate.ts pins the GREATEST(COALESCE(min,5),3) pattern", () => {
    const source = readSource("../../src/lib/reports/aggregate.ts");
    expect(source).toContain("REPORT_DEFAULT_MINIMUM_CELL_SIZE = 5");
    expect(source).toContain("REPORT_ABSOLUTE_MINIMUM_CELL_SIZE = 3");
  });

  test("group ordering never depends on counts (no size leakage)", () => {
    const source = readSource("../../src/lib/reports/aggregate.ts");
    expect(source).toContain("localeCompare");
  });
});
