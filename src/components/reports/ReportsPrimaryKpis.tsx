/**
 * Level 2 — المؤشرات الرئيسية
 * Compact ScopedMetric tiles (3–6 typical). Never coerce missing → 0.
 * Empty tile lists keep the level heading (honest empty) so the
 * Attention → KPIs → Catalog hierarchy never collapses.
 */

import { ScopedKpiGrid, type MetricTile } from "@/components/reports/ScopedKpiGrid";
import { KPI_SECTION_TITLE_AR } from "@/lib/reports/attention";

export const KPI_EMPTY_MESSAGE_AR = "لا مؤشرات رئيسية متاحة في هذا النطاق حالياً.";

export interface ReportsPrimaryKpisProps {
  readonly tiles: readonly MetricTile[];
  readonly title?: string;
}

export function ReportsPrimaryKpis({
  tiles,
  title = KPI_SECTION_TITLE_AR,
}: ReportsPrimaryKpisProps) {
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
      {tiles.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          {KPI_EMPTY_MESSAGE_AR}
        </p>
      ) : (
        <ScopedKpiGrid tiles={tiles} />
      )}
    </section>
  );
}
