/**
 * Shared presentational KPI strip for beneficiary report hubs.
 * Distinguishes value / null / incomplete / no_access / no_data.
 */

import type { ScopedMetric } from "@/lib/reports/scope";

function formatMetric(m: ScopedMetric<number> | null | undefined): string {
  if (!m) return "—";
  switch (m.presence) {
    case "value":
      return m.value === null ? "—" : String(m.value);
    case "null":
      return "غير متوفر";
    case "not_configured":
      return "غير مُعدّ";
    case "data_incomplete":
      return "بيانات ناقصة";
    case "no_access":
      return "لا صلاحية";
    case "no_data":
      return "لا بيانات";
    default:
      return "—";
  }
}

export interface MetricTile {
  readonly label: string;
  readonly metric: ScopedMetric<number>;
}

export function ScopedKpiGrid({ tiles }: { tiles: readonly MetricTile[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" dir="rtl">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-lg border border-border bg-card p-4"
          data-presence={tile.metric.presence}
        >
          <div className="text-xs text-muted-foreground">{tile.label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {formatMetric(tile.metric)}
          </div>
          {tile.metric.label_ar ? (
            <div className="mt-1 text-xs text-muted-foreground">{tile.metric.label_ar}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
