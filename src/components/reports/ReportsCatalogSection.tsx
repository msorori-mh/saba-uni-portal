/**
 * Level 3 — جميع التقارير
 * Wraps ReportsCenter (internal name preserved) with catalog section semantics.
 */

import { ReportsCenter } from "@/components/reports-center/ReportsCenter";
import type { ReportsCenterProps } from "@/components/reports-center/types";
import { CATALOG_SECTION_TITLE_AR } from "@/lib/reports/attention";

export type ReportsCatalogSectionProps = ReportsCenterProps & {
  /** Override UI title; defaults to «جميع التقارير». */
  readonly catalogTitle?: string;
};

export function ReportsCatalogSection({
  catalogTitle = CATALOG_SECTION_TITLE_AR,
  title,
  ...rest
}: ReportsCatalogSectionProps) {
  return (
    <section
      className="space-y-2"
      aria-labelledby="reports-catalog-heading"
      data-reports-level="catalog"
    >
      <h2 id="reports-catalog-heading" className="sr-only">
        {catalogTitle}
      </h2>
      <ReportsCenter title={title ?? catalogTitle} {...rest} />
    </section>
  );
}
