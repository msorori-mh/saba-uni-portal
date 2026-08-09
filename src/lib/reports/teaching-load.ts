/**
 * Shared teaching-load KPI builder — one source, multiple scoped adapters.
 * Pure: callers pass already-scoped rows (server enforces scope).
 */

import {
  metricNoData,
  metricValue,
  type ScopedMetric,
} from "./scope/types";

export interface TeachingAssignmentRow {
  readonly facultyProfileId: string | null;
  readonly facultyNameAr: string | null;
  readonly departmentId: string | null;
  readonly courseCode: string | null;
  readonly sectionCode: string | null;
  readonly creditHours: number | null;
  readonly assigned: boolean;
}

export interface TeachingLoadKpis {
  readonly assignedSections: ScopedMetric<number>;
  readonly unassignedSections: ScopedMetric<number>;
  readonly facultyWithLoad: ScopedMetric<number>;
  readonly facultyWithoutLoad: ScopedMetric<number>;
  readonly totalCreditHours: ScopedMetric<number>;
  readonly byFaculty: ReadonlyArray<{
    readonly facultyProfileId: string;
    readonly facultyNameAr: string;
    readonly sections: number;
    readonly creditHours: number;
  }>;
}

/**
 * Build teaching-load KPIs from scoped assignment rows.
 * Empty input ⇒ no_data (not zero), unless `treatEmptyAsZero` for true empty sets
 * after a successful scoped query that returned zero rows intentionally.
 */
export function buildTeachingLoadKpis(
  rows: readonly TeachingAssignmentRow[],
  options: { readonly treatEmptyAsZero?: boolean } = {},
): TeachingLoadKpis {
  if (rows.length === 0 && !options.treatEmptyAsZero) {
    return {
      assignedSections: metricNoData("لا بيانات إسناد في النطاق"),
      unassignedSections: metricNoData(),
      facultyWithLoad: metricNoData(),
      facultyWithoutLoad: metricNoData(),
      totalCreditHours: metricNoData(),
      byFaculty: [],
    };
  }

  let assigned = 0;
  let unassigned = 0;
  let credits = 0;
  const byFaculty = new Map<
    string,
    { facultyNameAr: string; sections: number; creditHours: number }
  >();

  for (const row of rows) {
    if (row.assigned) {
      assigned += 1;
      credits += Number(row.creditHours ?? 0);
      if (row.facultyProfileId) {
        const prev = byFaculty.get(row.facultyProfileId) ?? {
          facultyNameAr: row.facultyNameAr ?? "—",
          sections: 0,
          creditHours: 0,
        };
        prev.sections += 1;
        prev.creditHours += Number(row.creditHours ?? 0);
        byFaculty.set(row.facultyProfileId, prev);
      }
    } else {
      unassigned += 1;
    }
  }

  return {
    assignedSections: metricValue(assigned),
    unassignedSections: metricValue(unassigned),
    facultyWithLoad: metricValue(byFaculty.size),
    facultyWithoutLoad: metricValue(0, "يُحسب مقابل قائمة أعضاء النطاق عند التوفر"),
    totalCreditHours: metricValue(credits),
    byFaculty: [...byFaculty.entries()].map(([facultyProfileId, v]) => ({
      facultyProfileId,
      facultyNameAr: v.facultyNameAr,
      sections: v.sections,
      creditHours: v.creditHours,
    })),
  };
}
