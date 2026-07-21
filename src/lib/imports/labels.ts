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
  student_academic_status: "الحالة الأكاديمية للطلاب",
  student_fees: "رسوم الطلاب",
  student_discounts: "خصومات الطلاب",
  student_eligibility: "بيانات أهلية الطلبات",
  documents: "الوثائق الرسمية",
};

/** Field-level validation error labels for student_eligibility imports. */
export const ELIGIBILITY_FIELD_ERROR_AR = {
  academic_number_required: "الرقم الأكاديمي مطلوب",
  academic_number_duplicate: "الرقم الأكاديمي مكرر في الملف",
  academic_number_not_found: "الطالب غير موجود — هذا المستورد يحدّث الطلاب الحاليين فقط",
  academic_number_uuid: "الرقم الأكاديمي لا يجب أن يكون UUID — استخدم الرقم الأكاديمي الفعلي",
  student_study_status_required: "حالة الدراسة مطلوبة (new/repeat أو مستجد/باقي للإعادة)",
  student_study_status_invalid:
    "حالة الدراسة غير صحيحة — القيم المسموحة: new, repeat, مستجد, باقي للإعادة, إعادة",
  transferred_current_year_required: "حقل «محوّل للعام الحالي» مطلوب — أدخل true/false أو نعم/لا",
  transferred_current_year_invalid:
    "قيمة «محوّل للعام الحالي» غير صحيحة — استخدم true/false أو 1/0 أو نعم/لا",
  previous_suspension_semesters_required: "عدد فصول الإيقاف السابقة مطلوب (عدد صحيح >= 0)",
  previous_suspension_semesters_invalid: "عدد فصول الإيقاف السابقة يجب أن يكون عدداً صحيحاً >= 0",
  consecutive_suspension_years_required: "عدد سنوات الإيقاف المتتالية مطلوب (عدد صحيح >= 0)",
  consecutive_suspension_years_invalid: "عدد سنوات الإيقاف المتتالية يجب أن يكون عدداً صحيحاً >= 0",
  source_reference_required: "مرجع المصدر مطلوب (3 أحرف على الأقل)",
  source_reference_too_long: "مرجع المصدر طويل جداً (الحد الأقصى ~250 حرفاً)",
} as const;

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
  "departments",
  "programs",
  "levels",
  "course_sections",
  "student_enrollments",
  "student_grades",
  "student_academic_status",
  "student_fees",
  "student_discounts",
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
  if (type === "student_eligibility") {
    return {
      created: dryRun ? "طلاب جدد (يجب 0)" : "طلاب جدد (يجب 0)",
      updated: dryRun ? "طلاب سيُحدَّثون" : "طلاب محدّثون",
      showUpdated: true,
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
