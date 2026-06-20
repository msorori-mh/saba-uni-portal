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
  | "student_fees";

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
  errors: RowError[];
};

export type LookupMaps = {
  departmentsByName: Map<string, string>;
  programsByCode: Map<string, { id: string; department_id: string | null }>;
  levelsByName: Map<string, string>;
  levelsByNumber: Map<string, string>;
  coursesByCode: Map<string, { id: string; department_id: string | null }>;
  academicYearsByName: Map<string, string>;
  semestersByCode: Map<string, string>;
  semestersByName: Map<string, string>;
};
