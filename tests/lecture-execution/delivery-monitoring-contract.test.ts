/**
 * Lecture execution & academic monitoring — catalog + contract guard.
 *
 * Owner contract (PORTAL-LECTURE-EXECUTION-...-CLOSURE-01):
 * - the faculty member alone confirms execution (no delegate contract),
 * - planned session count is configurable (never hardcoded to 14),
 * - period monitoring exposes week / month / term-to-date.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { REPORT_CATALOG_ENTRIES } from "../../src/lib/reports/catalog/entries";
import {
  MONITORING_PERIODS,
  MONITORING_PERIOD_LABELS,
  LECTURE_EXECUTION_STATUSES,
  LECTURE_STATUS_LABELS,
  RISK_LABELS,
} from "../../src/lib/lecture-execution.functions";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (p: string) => readFileSync(root + p, "utf8");

describe("no delegate confirmation contract remains", () => {
  test("retired delegate modules are gone", () => {
    expect(existsSync(root + "src/components/lecture-execution/DelegateConfirmationCard.tsx")).toBe(
      false,
    );
    expect(existsSync(root + "src/lib/lecture-execution/domain.ts")).toBe(false);
  });

  test("no LIVE catalog entry depends on delegate confirmation", () => {
    const codes = REPORT_CATALOG_ENTRIES.map((e) => e.report_code);
    expect(codes).not.toContain("LEC-DELEGATE-CONFIRMATIONS");
    for (const entry of REPORT_CATALOG_ENTRIES) {
      expect(JSON.stringify(entry).includes("مندوب")).toBe(false);
    }
  });
});

describe("execution status contract", () => {
  test("five recordable statuses plus not_recorded, all labelled", () => {
    expect([...LECTURE_EXECUTION_STATUSES].sort()).toEqual(
      ["cancelled", "compensated", "executed", "hindered", "postponed"].sort(),
    );
    for (const s of [...LECTURE_EXECUTION_STATUSES, "not_recorded" as const]) {
      expect(LECTURE_STATUS_LABELS[s]?.length).toBeGreaterThan(0);
    }
  });
});

describe("period monitoring contract", () => {
  test("week / month / term are the supported periods and are labelled", () => {
    expect([...MONITORING_PERIODS]).toEqual(["week", "month", "term"]);
    for (const p of MONITORING_PERIODS) {
      expect(MONITORING_PERIOD_LABELS[p].length).toBeGreaterThan(0);
    }
  });

  test("risk levels used by the early-warning surface are labelled", () => {
    for (const level of ["high", "medium", "low", "no_plan"]) {
      expect(RISK_LABELS[level].length).toBeGreaterThan(0);
    }
  });
});

describe("no hardcoded semester session count", () => {
  test("the plan editor and monitoring surfaces never pin 14 sessions", () => {
    const sources = [
      "src/lib/lecture-execution.functions.ts",
      "src/components/lecture-execution/DeliveryMonitoringPanel.tsx",
      "src/components/portal/CourseDeliveryPlanGrid.tsx",
    ];
    for (const file of sources) {
      expect(/\b14\b/.test(read(file))).toBe(false);
    }
  });
});

describe("LEC catalog entries reflect the deployed runtime", () => {
  const lec = REPORT_CATALOG_ENTRIES.filter((e) => e.report_code.startsWith("LEC-"));

  test("every LIVE lecture report points at a deployed route and a cdp source", () => {
    const live = lec.filter((e) => e.status === "LIVE");
    expect(live.length).toBeGreaterThanOrEqual(6);
    for (const entry of live) {
      expect(entry.route).not.toBeNull();
      expect(entry.source).toContain("cdp_");
      expect(entry.tests.length).toBeGreaterThan(0);
      expect(entry.evidence.length).toBeGreaterThan(0);
    }
  });
});
