/**
 * College-wide «متابعة سير العملية التعليمية» broken down by department.
 *
 * Pure, client-safe aggregation over the rows public.cdp_delivery_monitoring
 * already returned for the caller's scope — it adds no data and no authority.
 * Every formula mirrors the RPC's own totals so a department's numbers add up
 * to the college totals shown above them.
 */
import type { DeliveryMonitoring, MonitoringRow } from "@/lib/lecture-execution.functions";

/** Key + label for sections whose course has no department. */
export const NO_DEPARTMENT_KEY = "__none__";
export const NO_DEPARTMENT_LABEL = "بدون قسم";

export type MonitoringTotals = DeliveryMonitoring["totals"];

export type DepartmentMonitoringSummary = {
  key: string;
  name: string;
  totals: MonitoringTotals;
  /** Sections whose plan is not published yet (excluded from execution rates). */
  awaitingPlan: number;
};

export function departmentKeyOf(row: Pick<MonitoringRow, "department_name_ar">): string {
  const name = (row.department_name_ar ?? "").trim();
  return name === "" ? NO_DEPARTMENT_KEY : name;
}

/** Same arithmetic as the `totals` object built by cdp_delivery_monitoring. */
export function totalsOfRows(rows: readonly MonitoringRow[]): MonitoringTotals {
  const sum = (pick: (r: MonitoringRow) => number) =>
    rows.reduce((acc, r) => acc + (Number(pick(r)) || 0), 0);
  const planned = sum((r) => r.planned_count);
  const executed = sum((r) => r.executed_count);
  return {
    sections: rows.length,
    planned,
    executed,
    compensated: sum((r) => r.compensated_count),
    postponed: sum((r) => r.postponed_count),
    cancelled: sum((r) => r.cancelled_count),
    hindered: sum((r) => r.hindered_count),
    not_executed: sum((r) => r.not_executed_count),
    uncompensated: sum((r) => r.uncompensated_count),
    remaining: sum((r) => r.remaining_count),
    execution_percent: planned === 0 ? null : Math.round((executed / planned) * 1000) / 10,
    behind_plan_courses: rows.filter((r) => r.behind_plan === true).length,
  };
}

/** One summary per department, Arabic-sorted, «بدون قسم» last. */
export function summarizeByDepartment(
  rows: readonly MonitoringRow[],
): DepartmentMonitoringSummary[] {
  const groups = new Map<string, MonitoringRow[]>();
  for (const row of rows) {
    const key = departmentKeyOf(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({
      key,
      name: key === NO_DEPARTMENT_KEY ? NO_DEPARTMENT_LABEL : key,
      totals: totalsOfRows(list),
      awaitingPlan: list.filter((r) => r.plan_status !== "published").length,
    }))
    .sort((a, b) => {
      if (a.key === NO_DEPARTMENT_KEY) return 1;
      if (b.key === NO_DEPARTMENT_KEY) return -1;
      return a.name.localeCompare(b.name, "ar");
    });
}

/** `null` = the whole college. An unknown key yields no rows (never all rows). */
export function rowsOfDepartment(
  rows: readonly MonitoringRow[],
  departmentKey: string | null,
): MonitoringRow[] {
  if (departmentKey === null) return [...rows];
  return rows.filter((r) => departmentKeyOf(r) === departmentKey);
}
