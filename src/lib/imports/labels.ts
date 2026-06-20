import type { ImportType } from "./types";

/** Arabic display names for import types (UI + Excel reports). */
export const IMPORT_TYPE_LABEL_AR: Record<ImportType, string> = {
  students: "الطلاب",
  faculty: "أعضاء هيئة التدريس",
  staff: "الموظفون",
  courses: "المقررات",
  study_plans: "الخطط الدراسية",
  departments: "الأقسام",
  programs: "البرامج",
  levels: "المستويات الدراسية",
  course_sections: "مجموعات المقررات",
  student_enrollments: "تسجيلات الطلاب",
  student_grades: "درجات الطلاب",
  student_fees: "رسوم الطلاب",
  student_discounts: "خصومات الطلاب",
  documents: "الوثائق الرسمية",
};

export const REPORT_STATUS_AR = {
  valid: "صالح",
  invalid: "غير صالح",
  failed: "فشل",
  none: "—",
} as const;

export const VALIDATION_REPORT_HEADERS = {
  row_number: "رقم الصف",
  status: "الحالة",
  column: "العمود",
  error_message: "رسالة الخطأ",
} as const;

export const IMPORT_LOG_STATUS_AR: Record<string, string> = {
  completed: "مكتمل",
  partial: "جزئي",
  failed: "فشل",
  dry_run: "تجريبي",
};

const STRUCTURE_TYPES = new Set<ImportType>([
  "departments", "programs", "levels", "course_sections",
  "student_enrollments", "student_grades", "student_fees", "student_discounts",
]);

export type ReportStatLabels = {
  created: string;
  updated: string;
  showUpdated: boolean;
};

/** Context-aware stat card labels for import/dry-run result blocks. */
export function getReportStatLabels(type: ImportType, dryRun: boolean): ReportStatLabels {
  if (type === "students") {
    return {
      created: dryRun ? "حسابات ستُنشأ" : "حسابات مُنشأة",
      updated: dryRun ? "طلاب بدون حساب" : "طلاب بدون حساب",
      showUpdated: true,
    };
  }
  if (type === "documents") {
    return {
      created: dryRun ? "وثائق ستُصدر" : "وثائق مُصدرة",
      updated: "",
      showUpdated: false,
    };
  }
  if (STRUCTURE_TYPES.has(type)) {
    return {
      created: dryRun ? "ستُضاف" : "مضافة",
      updated: dryRun ? "ستُحدَّث" : "محدثة",
      showUpdated: true,
    };
  }
  return {
    created: dryRun ? "ستُضاف" : "مضافة",
    updated: dryRun ? "ستُحدَّث" : "محدثة",
    showUpdated: false,
  };
}
