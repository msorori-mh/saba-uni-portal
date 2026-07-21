import { loadXLSX } from "@/lib/xlsx-loader";
import type { ImportType } from "./types";

type TemplateDef = {
  headers: string[];
  sample: (string | number)[];
  instructions: string[];
  sheetName: string;
};

export type StudentTemplateOverrides = {
  study_system?: string;
  department_code?: string;
  program_code?: string;
  academic_level?: string;
  academic_year?: string;
  semester?: string;
};

type TemplateDownloadOptions = {
  fileName?: string;
};

const TEMPLATES: Record<ImportType, TemplateDef> = {
  students: {
    sheetName: "Students",
    headers: [
      "academic_number",
      "full_name_ar",
      "full_name_en",
      "university_email",
      "department_code",
      "program_code",
      "academic_level",
      "academic_year",
      "semester",
      "study_system",
      "status",
      "phone",
      "gender",
      "national_id",
      "create_login",
      "must_change_password",
      "notes",
    ],
    sample: [
      "20251001",
      "أحمد محمد علي",
      "Ahmed Mohammed",
      "ahmed@students.usr.edu.ye",
      "قسم تكنولوجيا المعلومات والاتصالات",
      "IT",
      "1",
      "2025-2026",
      "first",
      "regular",
      "active",
      "777000111",
      "male",
      "12345678901",
      "true",
      "true",
      "ملاحظة اختيارية",
    ],
    instructions: [
      "الحقول المطلوبة: academic_number, full_name_ar, department_code, program_code, academic_level, academic_year, semester",
      "university_email = الإيميل الجامعي (مطلوب عند create_login=true) — يُستخدم لتسجيل الدخول",
      "لا تُدخل: username أو password أو user_id أو role — تُدار داخلياً عند create_login",
      "department_code = اسم القسم بالعربية كما هو مسجل في النظام",
      "program_code = كود البرنامج (مثل IT, CS, AI)",
      "academic_level = رقم المستوى (1-4) أو اسم المستوى",
      "academic_year = اسم السنة الأكاديمية (مثل 2025-2026)",
      "semester = first / second أو اسم الفصل",
      "study_system = regular / private أو عام / نفقة خاصة (اختياري؛ فارغ = غير محدد)",
      "status = active / suspended / graduated / withdrawn / transferred (افتراضي active)",
      "gender = male / female أو ذكر / أنثى (اختياري)",
      "create_login = true/false — عند true يُنشأ حساب دخول بالإيميل الجامعي (ليس بالرقم الأكاديمي)",
      "must_change_password = true/false — افتراضي true عند create_login=true لإجبار تغيير كلمة المرور عند أول دخول",
      "notes = ملاحظات حرة (لن تُخزَّن مع الملف، تُسجَّل في سجل التدقيق)",
    ],
  },
  faculty: {
    sheetName: "Faculty",
    headers: [
      "employee_number",
      "full_name_ar",
      "full_name_en",
      "department_code",
      "program_code",
      "academic_rank",
      "position_title",
      "status",
    ],
    sample: [
      "F2025001",
      "د. خالد عبدالله",
      "Dr. Khalid",
      "قسم علوم الحاسوب",
      "CS",
      "Assistant Professor",
      "عضو هيئة تدريس",
      "active",
    ],
    instructions: [
      "employee_number و full_name_ar حقول مطلوبة",
      "department_code = اسم القسم بالعربية",
      "program_code = كود البرنامج (اختياري)",
      "status = active / inactive",
    ],
  },
  staff: {
    sheetName: "Staff",
    headers: [
      "employee_number",
      "full_name_ar",
      "full_name_en",
      "university_email",
      "department_code",
      "job_title",
      "role_type",
      "status",
    ],
    sample: [
      "S2025001",
      "سامي علي",
      "Sami Ali",
      "sami@staff.usr.edu.ye",
      "قسم تكنولوجيا المعلومات والاتصالات",
      "سكرتير",
      "student_affairs_specialist",
      "active",
    ],
    instructions: [
      "employee_number و full_name_ar حقول مطلوبة",
      "university_email = الإيميل الجامعي (لتسجيل الدخول — ليس الرقم الوظيفي)",
      "role_type = المفتاح الداخلي أو التسمية العربية للدور الوظيفي المعتمد (مثل registrar_general أو مختص شؤون الطلاب)",
      "الأدوار المقبولة: مسجل الكلية، مدير/مختص شؤون الطلاب، مدير/مختص شؤون الخريجين، مسؤول الإرشيف، موظف الإيرادات والمالية، مسؤول المكتبة، مسؤول المعامل، أمين معمل",
      "لا تستخدم الأسماء القديمة (موظف القبول والتسجيل، موظف شؤون الطلاب، …)",
      "department_code = اسم القسم بالعربية (اختياري)",
      "status = active / inactive",
    ],
  },
  courses: {
    sheetName: "Courses",
    headers: [
      "code",
      "name_ar",
      "name_en",
      "credit_hours",
      "theory_hours",
      "practical_hours",
      "department_code",
      "status",
    ],
    sample: [
      "CS101",
      "مقدمة في البرمجة",
      "Intro to Programming",
      3,
      2,
      2,
      "قسم علوم الحاسوب",
      "active",
    ],
    instructions: [
      "code و name_ar حقول مطلوبة",
      "theory_hours و practical_hours أرقام >= 0",
      "⚠️ credit_hours تُحسب تلقائيًا من: نظري + ⌈عملي ÷ 2⌉ — أي قيمة مدخلة في العمود سيتم تجاهلها",
      "department_code = اسم القسم بالعربية",
    ],
  },
  study_plans: {
    sheetName: "StudyPlans",
    headers: [
      "program_code",
      "plan_name",
      "version",
      "course_code",
      "level",
      "semester",
      "required",
      "prerequisite_course_code",
      "sort_order",
    ],
    sample: ["IT", "خطة 2024", "1.0", "CS101", "1", "first", "true", "", 1],
    instructions: [
      "سياق القسم والبرنامج واسم الخطة والإصدار يحدد من شاشة الاستيراد قبل رفع الملف.",
      "program_code و plan_name و version تبقى للتوافق، ويتم تعبئتها/التحقق منها من سياق الشاشة.",
      "course_code و level حقول مطلوبة عند استيراد خطة كاملة",
      "semester مطلوب داخل الملف عند استيراد خطة كاملة، ويؤخذ من الشاشة عند استيراد فصل محدد",
      "required = true/false أو نعم/لا",
      "prerequisite_course_code اختياري — يجب أن يكون موجوداً إن تم إدخاله",
      "لا تستخدم All أو IT4XX(E) ككود مقرر؛ ضع الملاحظة خارج prerequisite_course_code.",
    ],
  },
  departments: {
    sheetName: "Departments",
    headers: [
      "department_code",
      "department_name_ar",
      "department_name_en",
      "description",
      "is_active",
    ],
    sample: [
      "IT",
      "قسم تكنولوجيا المعلومات والاتصالات",
      "Information Technology",
      "قسم تقني",
      "true",
    ],
    instructions: [
      "department_code و department_name_ar حقول مطلوبة",
      "department_code يُستخدم كمعرّف فريد للقسم (يُطابق name_ar داخل النظام)",
      "is_active = true / false (افتراضي true)",
      "عند تفعيل (تحديث القائم) يتم تحديث القسم الموجود بنفس الكود",
    ],
  },
  programs: {
    sheetName: "Programs",
    headers: [
      "program_code",
      "program_name_ar",
      "program_name_en",
      "department_code",
      "degree_type",
      "duration_years",
      "is_active",
    ],
    sample: [
      "IT",
      "تكنولوجيا المعلومات",
      "Information Technology",
      "قسم تكنولوجيا المعلومات والاتصالات",
      "bachelor",
      4,
      "true",
    ],
    instructions: [
      "program_code, program_name_ar, department_code, degree_type حقول مطلوبة",
      "department_code = اسم القسم بالعربية كما هو مسجل",
      "duration_years رقم صحيح موجب",
      "is_active = true / false",
    ],
  },
  levels: {
    sheetName: "Levels",
    headers: ["level_code", "level_name", "level_number"],
    sample: ["L1", "المستوى الأول", 1],
    instructions: [
      "level_code, level_name, level_number حقول مطلوبة",
      "level_number رقم صحيح فريد",
      "level_code يُستخدم للتمييز داخل الملف فقط",
    ],
  },
  course_sections: {
    sheetName: "CourseSections",
    headers: [
      "course_code",
      "academic_year",
      "semester",
      "program_code",
      "level",
      "section_code",
      "faculty_employee_number",
      "capacity",
      "status",
    ],
    sample: ["CS101", "2026-2027", "first", "IT", "1", "A", "F2025001", 30, "active"],
    instructions: [
      "course_code, academic_year, semester, program_code, level, section_code حقول مطلوبة",
      "section_code = رمز المجموعة (A / B / C)",
      "faculty_employee_number = الرقم الوظيفي لعضو هيئة التدريس (اختياري)",
      "capacity = السعة القصوى (اختياري)",
      "status = active / closed / cancelled / inactive (افتراضي active)",
      "إن لم يوجد إسناد مقرر مطابق يُنشأ تلقائياً",
      "فعّل (تحديث القائم) لتحديث مجموعات موجودة بنفس الرمز",
    ],
  },
  student_enrollments: {
    sheetName: "StudentEnrollments",
    headers: [
      "academic_number",
      "course_code",
      "section_code",
      "academic_year",
      "semester",
      "enrollment_status",
    ],
    sample: ["2026001", "CS101", "A", "2026-2027", "first", "enrolled"],
    instructions: [
      "academic_number, course_code, section_code, academic_year, semester حقول مطلوبة",
      "يُستنتج البرنامج والمستوى من ملف الطالب وحالته الأكاديمية للفصل",
      "enrollment_status = enrolled / dropped / completed (افتراضي enrolled)",
      "فعّل (تحديث القائم) لتحديث حالة تسجيل موجود",
    ],
  },
  student_grades: {
    sheetName: "StudentGrades",
    headers: [
      "academic_number",
      "course_code",
      "section_code",
      "academic_year",
      "semester",
      "component_name",
      "score",
      "status",
    ],
    sample: ["2026001", "CS101", "A", "2026-2027", "first", "نهائي", 45, "submitted"],
    instructions: [
      "academic_number, course_code, section_code, academic_year, semester, component_name, score حقول مطلوبة",
      "يجب أن يكون الطالب مسجلاً في المجموعة وأن يوجد مكوّن التقييم لها مسبقاً",
      "score لا يتجاوز max_score للمكوّن",
      "status = draft / submitted / approved (افتراضي submitted)",
      "فعّل (تحديث القائم) لتحديث درجة موجودة",
    ],
  },
  student_academic_status: {
    sheetName: "StudentAcademicStatus",
    headers: ["academic_number", "academic_year", "semester", "academic_level", "enrollment_status"],
    sample: ["2026001", "2026-2027", "first", "2", "enrolled"],
    instructions: [
      "يُستخدم لترحيل/تحديث الحالة الأكاديمية للطلاب لفصل دراسي (السنة + الفصل + المستوى + حالة القيد) — مطلوب قبل استيراد التسجيلات أو الدرجات للفصل الجديد.",
      "academic_number = الرقم الأكاديمي لطالب موجود مسبقاً (مطلوب)",
      "academic_year = اسم السنة الأكاديمية (مثل 2026-2027) ويجب أن تكون موجودة مسبقاً (مطلوب)",
      "semester = first / second أو اسم الفصل — يُحلّ ضمن السنة المحددة في الصف نفسه (مطلوب)",
      "academic_level = رقم المستوى أو اسمه؛ يجب ألا يتجاوز عدد سنوات برنامج الطالب (مطلوب)",
      "enrollment_status = enrolled / active / suspended / graduated / withdrawn / transferred / completed (افتراضي enrolled)",
      "لكل طالب صف واحد لكل (سنة + فصل) — التكرار داخل الملف مرفوض",
      "فعّل (تحديث القائم) لتحديث حالة موجودة لنفس الطالب والفصل",
      "التنفيذ ذرّي على مستوى الدفعة: إن فشل الإدراج لأي سبب لا يُكتب أي صف",
    ],
  },
  student_fees: {
    sheetName: "StudentFees",
    headers: [
      "academic_number",
      "fee_type_code",
      "academic_year",
      "semester",
      "amount",
      "due_date",
      "status",
    ],
    sample: ["2026001", "TUITION", "2026-2027", "first", 50000, "2026-10-15", "pending"],
    instructions: [
      "academic_number, fee_type_code, academic_year, semester, amount حقول مطلوبة",
      "fee_type_code = كود نوع الرسم النشط في النظام (مثل TUITION)",
      "amount >= 0",
      "due_date = YYYY-MM-DD (اختياري — يُخزَّن في الملاحظات)",
      "status = pending / partially_paid / paid / cancelled (افتراضي pending)",
      "فعّل (تحديث القائم) لتحديث رسم موجود لنفس الطالب والنوع والفصل",
    ],
  },
  student_discounts: {
    sheetName: "StudentDiscounts",
    headers: [
      "academic_number",
      "discount_type_code",
      "academic_year",
      "semester",
      "value",
      "reason",
      "status",
    ],
    sample: ["2026001", "SCHOLARSHIP", "2026-2027", "first", 25, "تفوق دراسي", "active"],
    instructions: [
      "academic_number, discount_type_code, academic_year, semester, value حقول مطلوبة",
      "discount_type_code = كود نوع الخصم النشط (مثل SCHOLARSHIP)",
      "value = نسبة (0-100) أو مبلغ ثابت حسب نوع الخصم",
      "reason = سبب الخصم (يُخزَّن في الملاحظات)",
      "status = active / inactive / cancelled (افتراضي active)",
      "عند active يُطبَّق الخصم تلقائياً على رسوم الطالب للفصل",
      "فعّل (تحديث القائم) لتحديث خصم موجود",
    ],
  },
  student_eligibility: {
    sheetName: "StudentEligibility",
    headers: [
      "academic_number",
      "student_study_status",
      "transferred_current_year",
      "previous_suspension_semesters_count",
      "consecutive_suspension_years_count",
      "source_reference",
      "notes",
    ],
    sample: ["2026001", "new", "false", 0, 0, "SA-2026-TERM1", ""],
    instructions: [
      "هذا القالب لتحديث بيانات أهلية الطلبات للطلاب المسجّلين مسبقاً فقط — لا يُنشئ طلاباً جدداً.",
      "academic_number (مطلوب): الرقم الأكاديمي للطالب الموجود في النظام — نص وليس UUID.",
      "student_study_status (مطلوب): new أو repeat — أو بالعربية: مستجد / باقي للإعادة / إعادة.",
      "transferred_current_year (مطلوب): true/false أو 1/0 أو yes/no أو نعم/لا — لا تترك الخانة فارغة.",
      "previous_suspension_semesters_count (مطلوب): عدد صحيح >= 0 — عدد فصول الإيقاف السابقة المعتمدة رسمياً.",
      "consecutive_suspension_years_count (مطلوب): عدد صحيح >= 0 — عدد سنوات الإيقاف المتتالية المعتمدة رسمياً.",
      "source_reference (مطلوب): مرجع المصدر الرسمي (3–250 حرفاً) — يُسجَّل في التدقيق ولا يُخزَّن في ملف الطالب.",
      "notes (اختياري): ملاحظات داخلية — لا تُخزَّن في حقول أهلية الطلب.",
      "تحذير: لا تستخدم هذا المستورد لإنشاء طلاب أو حسابات دخول أو طلبات — تحديث الحقول الأربعة فقط.",
    ],
  },
  documents: {
    sheetName: "Documents",
    headers: ["academic_number", "document_type", "issue_date", "purpose", "notes"],
    sample: ["2026001", "enrollment_letter", "2026-10-01", "لتقديمها للجهات الرسمية", ""],
    instructions: [
      "academic_number, document_type حقول مطلوبة",
      "document_type: enrollment_certificate / enrollment_letter / student_status_certificate / graduation_certificate / official_transcript / transcript / financial_receipt",
      "issue_date = YYYY-MM-DD (اختياري — افتراضي تاريخ اليوم)",
      "purpose, notes = اختياريان — يُخزَّنان في metadata",
      "كل صف يُصدر وثيقة جديدة برقم وثيقة ورمز تحقق فريدين",
    ],
  },
};

function applyStudentTemplateOverrides(
  def: TemplateDef,
  overrides?: StudentTemplateOverrides,
): TemplateDef {
  if (!overrides) return def;

  const lockedColumns: Array<[keyof StudentTemplateOverrides, string]> = [
    ["study_system", "study_system"],
    ["department_code", "department_code"],
    ["program_code", "program_code"],
    ["academic_level", "academic_level"],
    ["academic_year", "academic_year"],
    ["semester", "semester"],
  ];

  const headers = def.headers.filter((h) => {
    const lock = lockedColumns.find(([, col]) => col === h);
    if (!lock) return true;
    const [key] = lock;
    const value = overrides[key]?.trim();
    return !value;
  });

  const sample = headers.map((h) => {
    const idx = def.headers.indexOf(h);
    return def.sample[idx] ?? "";
  });

  const notes = lockedColumns.flatMap(([key, col]) => {
    const value = overrides[key]?.trim();
    return value ? [`${col} مثبت من اختيارك في الشاشة: ${value}`] : [];
  });

  return {
    ...def,
    headers,
    sample,
    instructions: [...notes, ...def.instructions],
  };
}

async function buildTemplateWorkbook(def: TemplateDef) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  const rows = [def.headers, def.sample, ...def.instructions.map((line) => [line])];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = def.headers.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, def.sheetName);
  return wb;
}

function writeWorkbook(wb: unknown, fileName: string) {
  return import("@/lib/xlsx-loader").then(({ loadXLSX }) =>
    loadXLSX().then((XLSX) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      XLSX.writeFile(wb as any, fileName);
    }),
  );
}

export async function downloadTemplate(
  type: ImportType,
  options: TemplateDownloadOptions = {},
): Promise<void> {
  const def = TEMPLATES[type];
  const wb = await buildTemplateWorkbook(def);
  await writeWorkbook(wb, options.fileName ?? `template_${type}.xlsx`);
}

export async function downloadStudentsTemplate(
  overrides?: StudentTemplateOverrides,
  options: TemplateDownloadOptions = {},
): Promise<void> {
  const def = applyStudentTemplateOverrides(TEMPLATES.students, overrides);
  const wb = await buildTemplateWorkbook(def);
  await writeWorkbook(wb, options.fileName ?? "template_students.xlsx");
}
