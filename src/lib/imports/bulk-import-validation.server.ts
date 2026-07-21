import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runWithImportDb } from "@/lib/imports/import-db";
import { loadLookups } from "@/lib/imports/lookups";
import type { ImportType, ValidatedRow, ValidationResult } from "@/lib/imports/types";
import {
  validateStudents,
  validateFaculty,
  validateStaff,
  validateCourses,
  validateStudyPlans,
  validateDepartments,
  validatePrograms,
  validateLevels,
  validateCourseSections,
  validateStudentEnrollments,
  validateStudentGrades,
  validateStudentAcademicStatus,
  validateStudentFees,
  validateStudentDiscounts,
  validateStudentEligibility,
  validateDocuments,
} from "@/lib/imports/validators";

/** Server-side bulk import preview — uses supabaseAdmin via runWithImportDb (no writes). */
export async function previewBulkImportValidation(
  type: ImportType,
  rawRows: Record<string, unknown>[],
  updateExisting = false,
): Promise<ValidationResult<unknown>> {
  return runWithImportDb(supabaseAdmin, async () => {
    const lookups = await loadLookups();
    switch (type) {
      case "students":
        return validateStudents(rawRows, lookups);
      case "faculty":
        return validateFaculty(rawRows, lookups);
      case "staff":
        return validateStaff(rawRows, lookups);
      case "courses":
        return validateCourses(rawRows, lookups);
      case "study_plans":
        return validateStudyPlans(rawRows, lookups);
      case "departments":
        return validateDepartments(rawRows, lookups, updateExisting);
      case "programs":
        return validatePrograms(rawRows, lookups, updateExisting);
      case "levels":
        return validateLevels(rawRows, lookups, updateExisting);
      case "course_sections":
        return validateCourseSections(rawRows, lookups, updateExisting);
      case "student_enrollments":
        return validateStudentEnrollments(rawRows, lookups, updateExisting);
      case "student_grades":
        return validateStudentGrades(rawRows, lookups, updateExisting);
      case "student_academic_status":
        return validateStudentAcademicStatus(rawRows, lookups, updateExisting);
      case "student_fees":
        return validateStudentFees(rawRows, lookups, updateExisting);
      case "student_discounts":
        return validateStudentDiscounts(rawRows, lookups, updateExisting);
      case "student_eligibility":
        return validateStudentEligibility(rawRows, lookups);
      case "documents":
        return validateDocuments(rawRows, lookups);
      default:
        throw new Error("نوع استيراد غير مدعوم");
    }
  });
}

export async function revalidateBulkImportRows(
  type: ImportType,
  rows: ValidatedRow[],
): Promise<ValidatedRow[]> {
  const result = await previewBulkImportValidation(
    type,
    rows.map((r) => r.raw),
    false,
  );
  return result.rows;
}

export function assertServerValidationPassed(rows: ValidatedRow[]): void {
  const invalid = rows.filter((r) => r.parsed === null || r.errors.length > 0);
  if (invalid.length > 0) {
    const sample = invalid[0]?.errors[0]?.message ?? "صف غير صالح";
    throw new Error(
      `فشل التحقق على الخادم: ${invalid.length.toLocaleString("ar-EG")} صف غير صالح. ${sample}`,
    );
  }
}
