/**
 * Educational materials coverage KPIs from live material/section rows.
 * Pure builder — server supplies already-scoped rows.
 */

import {
  metricNoData,
  metricValue,
  type ScopedMetric,
} from "./scope/types";

export interface MaterialFactRow {
  readonly materialId: string;
  readonly sectionId: string;
  readonly courseCode: string | null;
  readonly published: boolean;
  readonly updatedAt: string | null;
  readonly facultyProfileId: string | null;
}

export interface MaterialsCoverageKpis {
  readonly totalMaterials: ScopedMetric<number>;
  readonly published: ScopedMetric<number>;
  readonly draft: ScopedMetric<number>;
  readonly sectionsWithMaterials: ScopedMetric<number>;
  readonly staleMaterials: ScopedMetric<number>;
}

const STALE_DAYS = 180;

export function buildMaterialsCoverageKpis(
  rows: readonly MaterialFactRow[],
  options: { readonly treatEmptyAsZero?: boolean; readonly now?: Date } = {},
): MaterialsCoverageKpis {
  if (rows.length === 0 && !options.treatEmptyAsZero) {
    return {
      totalMaterials: metricNoData(),
      published: metricNoData(),
      draft: metricNoData(),
      sectionsWithMaterials: metricNoData(),
      staleMaterials: metricNoData(),
    };
  }

  const now = options.now ?? new Date();
  const staleMs = STALE_DAYS * 24 * 60 * 60 * 1000;
  let published = 0;
  let draft = 0;
  let stale = 0;
  const sections = new Set<string>();

  for (const row of rows) {
    sections.add(row.sectionId);
    if (row.published) published += 1;
    else draft += 1;
    if (row.updatedAt) {
      const ts = Date.parse(row.updatedAt);
      if (!Number.isNaN(ts) && now.getTime() - ts > staleMs) stale += 1;
    }
  }

  return {
    totalMaterials: metricValue(rows.length),
    published: metricValue(published),
    draft: metricValue(draft),
    sectionsWithMaterials: metricValue(sections.size),
    staleMaterials: metricValue(stale),
  };
}
