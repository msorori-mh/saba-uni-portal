import {
  buildEmploymentQualitySummary,
  type EmploymentReportRow,
} from "./foundation";

/**
 * Aggregate reporting for graduates affairs. Reports are cohort-level
 * (program × graduation year) and every metric passes through small-cell
 * suppression. Row-level contact or employment exports stay prohibited; the
 * report row type deliberately has no person-identifying field.
 */

export const GRADUATE_REPORT_MINIMUM_CELL_SIZE = 5;

export interface CohortEmploymentInput {
  programId: string;
  graduationYear: number;
  row: EmploymentReportRow;
}

export interface CohortEmploymentReport {
  programId: string;
  graduationYear: number;
  minimumCellSize: number;
  summary: ReturnType<typeof buildEmploymentQualitySummary>;
}

/**
 * Groups current employment report rows into cohorts and summarizes each one
 * with suppression. A cohort below the minimum cell size yields suppressed
 * metrics only (subsets can never exceed the population).
 */
export function buildCohortEmploymentReports(
  inputs: readonly CohortEmploymentInput[],
  minimumCellSize = GRADUATE_REPORT_MINIMUM_CELL_SIZE,
): CohortEmploymentReport[] {
  const cohorts = new Map<string, { programId: string; graduationYear: number; rows: EmploymentReportRow[] }>();
  for (const input of inputs) {
    if (!Number.isInteger(input.graduationYear) || input.graduationYear < 1900) {
      continue;
    }
    const key = `${input.programId}:${input.graduationYear}`;
    const cohort = cohorts.get(key) ?? {
      programId: input.programId,
      graduationYear: input.graduationYear,
      rows: [],
    };
    cohort.rows.push(input.row);
    cohorts.set(key, cohort);
  }
  return [...cohorts.values()]
    .map((cohort) => ({
      programId: cohort.programId,
      graduationYear: cohort.graduationYear,
      minimumCellSize,
      summary: buildEmploymentQualitySummary(cohort.rows, minimumCellSize),
    }))
    .toSorted((left, right) =>
      left.graduationYear !== right.graduationYear
        ? left.graduationYear - right.graduationYear
        : left.programId.localeCompare(right.programId),
    );
}

/** Keys allowed to appear in an aggregate report row (cohort dimensions only). */
const AGGREGATE_ROW_ALLOWED_KEYS: readonly string[] = [
  "programId",
  "departmentId",
  "graduationYear",
  "minimumCellSize",
  "summary",
  "population",
  "employed",
  "specializationRelated",
  "verified",
  "totalResponses",
  "questions",
  "key",
  "kind",
  "responded",
  "distribution",
  "option",
  "metric",
  "total",
  "suppressed",
];

export type AggregateSafetyCheck = { ok: true } | { ok: false; violations: string[] };

/**
 * Defense-in-depth check before a report leaves the trust boundary: walks the
 * structure and rejects any object key outside the aggregate allowlist, so a
 * future change cannot silently reintroduce person-identifying fields.
 */
export function assertAggregateReportSafe(report: unknown): AggregateSafetyCheck {
  const violations: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        if (!AGGREGATE_ROW_ALLOWED_KEYS.includes(key)) {
          violations.push(`${path}.${key}`);
        }
        walk(nested, `${path}.${key}`);
      }
    }
  };
  walk(report, "report");
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
