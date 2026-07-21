export type ImportType =
  | "students"
  | "faculty"
  | "staff"
  | "courses"
  | "study_plans"
  | "departments"
  | "programs"
  | "levels"
  | "course_sections"
  | "student_enrollments"
  | "student_grades"
  | "student_academic_status"
  | "student_fees"
  | "student_discounts"
  | "student_eligibility"
  | "documents";

/** Aggregate stats for student_eligibility dry-run / import reports (no PII). */
export type EligibilityImportSummary = {
  new_count: number;
  repeat_count: number;
  transferred_count: number;
  prior_suspension_count: number;
  distinct_source_references: number;
};

export type RowError = { row: number; column?: string; message: string };

export type ValidatedRow<T> = {
  rowNumber: number; // 1-based in source file (excluding header)
  raw: Record<string, unknown>;
  parsed: T | null;
  errors: RowError[];
};

export type ValidationResult<T> = {
  rows: ValidatedRow<T>[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
};

export type ImportReport = {
  rows_total: number;
  rows_success: number;
  rows_failed: number;
  rows_created?: number;
  rows_updated?: number;
  eligibility_summary?: EligibilityImportSummary;
  errors: RowError[];
};

export type LookupMaps = {
  departmentsByName: Map<string, string>;
  programsByCode: Map<string, { id: string; department_id: string | null; years: number | null }>;
  levelsByName: Map<string, string>;
  levelsByNumber: Map<string, string>;
  coursesByCode: Map<string, { id: string; department_id: string | null }>;
  academicYearsByName: Map<string, string>;
  semestersByCode: Map<string, string>;
  semestersByName: Map<string, string>;
  /**
   * Year-scoped semester resolution (ACADEMIC-DATA-QUALITY-01 / G-02).
   * Key = `${academic_year_id}|${normKey(code | name)}`.
   * Built by loadLookups(). Optional: legacy hand-built lookups without this
   * map fall back to the old global (non year-scoped) resolution.
   */
  semestersByYearKey?: Map<string, string>;
  /**
   * level id -> level_number (G-11). Used to bound levels by program years.
   * Optional so legacy hand-built lookups keep working (check is skipped
   * when the map is absent).
   */
  levelNumberById?: Map<string, number>;
  /** program id -> duration years (G-11) for validators that only know the program id. */
  programYearsById?: Map<string, number | null>;
};
