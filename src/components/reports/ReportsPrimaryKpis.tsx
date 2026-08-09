/**
 * Level 2 — المؤشرات الرئيسية
 * Compact ScopedMetric tiles (3–6 typical). Never coerce missing → 0.
 */

import { ScopedKpiGrid, type MetricTile } from "@/components/reports/ScopedKpiGrid";
import { KPI_SECTION_TITLE_AR } from "@/lib/reports/attention";

export interface ReportsPrimaryKpisProps {
  readonly tiles: readonly MetricTile[];
  readonly title?: string;
}

export function ReportsPrimaryKpis({
  tiles,
  title = KPI_SECTION_TITLE_AR,
}: ReportsPrimaryKpisProps) {
  if (tiles.length === 0) return null;

  return (
    <section
      className="space-y-3"
      aria-labelledby="reports-kpis-heading"
      data-reports-level="kpis"
    >
      <h2
        id="reports-kpis-heading"
        className="text-base font-semibold text-foreground"
      >
        {title}
      </h2>
      <ScopedKpiGrid tiles={tiles} />
    </section>
  );
}
