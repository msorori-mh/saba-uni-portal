/**
 * Canonical three-level operational reports workspace.
 * Order is mandatory: Attention → Primary KPIs → All Reports.
 */

import type { ReactNode } from "react";
import {
  ReportsAttentionSection,
} from "@/components/reports/ReportsAttentionSection";
import {
  ReportsPrimaryKpis,
} from "@/components/reports/ReportsPrimaryKpis";
import {
  ReportsCatalogSection,
  type ReportsCatalogSectionProps,
} from "@/components/reports/ReportsCatalogSection";
import type { MetricTile } from "@/components/reports/ScopedKpiGrid";
import type { ReportAttentionItem } from "@/lib/reports/attention";

export interface ReportsOperationalWorkspaceProps {
  readonly attentionItems: readonly ReportAttentionItem[];
  readonly kpiTiles: readonly MetricTile[];
  /** Omit for surfaces (e.g. student) that render their own safe projection. */
  readonly catalog?: ReportsCatalogSectionProps;
  /** Rendered in place of / after the generic catalog section. */
  readonly afterCatalog?: ReactNode;
  /** Optional header (page title / scope label) rendered above level 1. */
  readonly header?: ReactNode;
  /** Optional content between KPIs and catalog (legacy quick links, etc.). */
  readonly betweenKpisAndCatalog?: ReactNode;
  readonly className?: string;
}

export function ReportsOperationalWorkspace({
  attentionItems,
  kpiTiles,
  catalog,
  afterCatalog,
  header,
  betweenKpisAndCatalog,
  className,
}: ReportsOperationalWorkspaceProps) {
  return (
    <div
      className={className ?? "space-y-6"}
      dir="rtl"
      data-reports-workspace="three-level"
    >
      {header}
      <ReportsAttentionSection items={attentionItems} />
      <ReportsPrimaryKpis tiles={kpiTiles} />
      {betweenKpisAndCatalog}
      {catalog ? <ReportsCatalogSection {...catalog} /> : null}
      {afterCatalog}
    </div>
  );
}
