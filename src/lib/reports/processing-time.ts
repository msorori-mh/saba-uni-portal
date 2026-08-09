/**
 * Request processing-time / SLA-oriented builders from anonymized facts.
 * Complements request-reports.ts aggregates.
 */

import {
  metricIncomplete,
  metricNoData,
  metricValue,
  type ScopedMetric,
} from "./scope/types";

export interface ProcessingTimeFact {
  readonly requestType: string;
  readonly status: string;
  readonly ageDays: number | null;
  readonly resolutionDays: number | null;
  readonly unitCode?: string | null;
}

export interface ProcessingTimeKpis {
  readonly total: ScopedMetric<number>;
  readonly pending: ScopedMetric<number>;
  readonly overdue: ScopedMetric<number>;
  readonly avgResolutionDays: ScopedMetric<number>;
  readonly avgPendingAgeDays: ScopedMetric<number>;
  readonly byStatus: ReadonlyArray<{ status: string; count: number }>;
  readonly byType: ReadonlyArray<{ requestType: string; count: number }>;
}

const DEFAULT_SLA_DAYS = 14;

export function buildProcessingTimeKpis(
  rows: readonly ProcessingTimeFact[],
  options: { readonly slaDays?: number; readonly treatEmptyAsZero?: boolean } = {},
): ProcessingTimeKpis {
  const sla = options.slaDays ?? DEFAULT_SLA_DAYS;
  if (rows.length === 0 && !options.treatEmptyAsZero) {
    return {
      total: metricNoData(),
      pending: metricNoData(),
      overdue: metricNoData(),
      avgResolutionDays: metricNoData(),
      avgPendingAgeDays: metricNoData(),
      byStatus: [],
      byType: [],
    };
  }

  const pendingStatuses = new Set([
    "pending",
    "submitted",
    "in_progress",
    "under_review",
    "under_processing",
  ]);

  let pending = 0;
  let overdue = 0;
  const resolution: number[] = [];
  const pendingAges: number[] = [];
  const byStatus = new Map<string, number>();
  const byType = new Map<string, number>();

  for (const row of rows) {
    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
    byType.set(row.requestType, (byType.get(row.requestType) ?? 0) + 1);
    if (pendingStatuses.has(row.status.toLowerCase())) {
      pending += 1;
      if (typeof row.ageDays === "number") {
        pendingAges.push(row.ageDays);
        if (row.ageDays > sla) overdue += 1;
      }
    }
    if (typeof row.resolutionDays === "number") {
      resolution.push(row.resolutionDays);
    }
  }

  const avg = (xs: number[]): ScopedMetric<number> => {
    if (xs.length === 0) return metricIncomplete("لا قيم زمنية كافية");
    const sum = xs.reduce((a, b) => a + b, 0);
    return metricValue(Math.round((sum / xs.length) * 10) / 10);
  };

  return {
    total: metricValue(rows.length),
    pending: metricValue(pending),
    overdue: metricValue(overdue),
    avgResolutionDays: avg(resolution),
    avgPendingAgeDays: avg(pendingAges),
    byStatus: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
    byType: [...byType.entries()].map(([requestType, count]) => ({
      requestType,
      count,
    })),
  };
}
