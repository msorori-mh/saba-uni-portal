import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runWithImportDb } from "@/lib/imports/import-db";
import { loadLookups } from "@/lib/imports/lookups";
import type { ImportType, ValidatedRow } from "@/lib/imports/types";
import {
  validateStudents, validateFaculty, validateStaff, validateCourses, validateStudyPlans,
  validateDepartments, validatePrograms, validateLevels, validateCourseSections,
  validateStudentEnrollments, validateStudentGrades, validateStudentFees,
  validateStudentDiscounts, validateDocuments,
} from "@/lib/imports/validators";

export async function revalidateBulkImportRows(
  type: ImportType,
  rows: ValidatedRow[],
): Promise<ValidatedRow[]> {
  const rawRows = rows.map((r) => r.raw);
  return runWithImportDb(supabaseAdmin, async () => {
    const lookups = await loadLookups();
    switch (type) {
      case "students":
        return (await validateStudents(rawRows, lookups)).rows;
      case "faculty":
        return (await validateFaculty(rawRows, lookups)).rows;
      case "staff":
        return (await validateStaff(rawRows, lookups)).rows;
      case "courses":
        return (await validateCourses(rawRows, lookups)).rows;
      case "study_plans":
        return (await validateStudyPlans(rawRows, lookups)).rows;
      case "departments":
        return (await validateDepartments(rawRows, lookups)).rows;
      case "programs":
        return (await validatePrograms(rawRows, lookups)).rows;
      case "levels":
        return (await validateLevels(rawRows, lookups)).rows;
      case "course_sections":
        return (await validateCourseSections(rawRows, lookups)).rows;
      case "student_enrollments":
        return (await validateStudentEnrollments(rawRows, lookups)).rows;
      case "student_grades":
        return (await validateStudentGrades(rawRows, lookups)).rows;
      case "student_fees":
        return (await validateStudentFees(rawRows, lookups)).rows;
      case "student_discounts":
        return (await validateStudentDiscounts(rawRows, lookups)).rows;
      case "documents":
        return (await validateDocuments(rawRows, lookups)).rows;
      default:
        throw new Error("نوع استيراد غير مدعوم");
    }
  });
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
