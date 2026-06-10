// MASTER-IMPORT-TEMPLATES-01
// Official, unified registry of import templates. Generates an XLSX file
// with 3 sheets (Data / Instructions / Example) for each template.
// IMPORTANT: This module ONLY generates downloadable templates. It does
// not import or modify any data.

import { loadXLSX } from "@/lib/xlsx-loader";

export type ColumnSpec = {
  name: string;
  description: string;
  required: boolean;
  type: "text" | "number" | "integer" | "boolean" | "date" | "uuid" | "enum";
  example: string | number | boolean;
  enumValues?: string[];
};

export type MasterTemplateCategory =
  | "academic_structure"
  | "faculty"
  | "students"
  | "courses"
  | "enrollment"
  | "finance"
  | "schedule"
  | "documents";

export type MasterTemplate = {
  id: string;
  fileName: string; // template_xxx.xlsx
  title: string;
  description: string;
  category: MasterTemplateCategory;
  /** Linked existing importer key in imports page (if any) */
  importerKey?: "students" | "faculty" | "staff" | "courses" | "study_plans" | "faculty_accounts";
  /** Whether a validator already exists in src/lib/imports/validators.ts */
  hasValidator: boolean;
  /** Examples (3-5 rows) */
  examples: (string | number | boolean)[][];
  columns: ColumnSpec[];
};

const CATEGORY_LABEL: Record<MasterTemplateCategory, string> = {
  academic_structure: "الهيكل الأكاديمي",
  faculty: "أعضاء هيئة التدريس",
  students: "الطلاب",
  courses: "المقررات والخطط",
  enrollment: "التسجيل الأكاديمي",
  finance: "المالية",
  schedule: "الجداول",
  documents: "الوثائق",
};

export const CATEGORY_LABEL_MAP = CATEGORY_LABEL;

// =====================================================================
// 16 official templates
// =====================================================================
export const MASTER_TEMPLATES: MasterTemplate[] = [
  // ===== الهيكل الأكاديمي =====
  {
    id: "departments",
    fileName: "template_departments.xlsx",
    title: "الأقسام",
    description: "قائمة الأقسام الأكاديمية بالجامعة.",
    category: "academic_structure",
    hasValidator: false,
    columns: [
      { name: "name_ar", description: "اسم القسم بالعربية", required: true, type: "text", example: "قسم علوم الحاسوب" },
      { name: "name_en", description: "اسم القسم بالإنجليزية", required: false, type: "text", example: "Computer Science" },
      { name: "description_ar", description: "وصف القسم بالعربية", required: false, type: "text", example: "قسم متخصص في علوم الحاسوب" },
      { name: "description_en", description: "وصف القسم بالإنجليزية", required: false, type: "text", example: "Department of CS" },
      { name: "sort_order", description: "ترتيب العرض", required: false, type: "integer", example: 1 },
      { name: "is_active", description: "نشط (true/false)", required: false, type: "boolean", example: true },
    ],
    examples: [
      ["قسم علوم الحاسوب", "Computer Science", "قسم متخصص في علوم الحاسوب", "Department of CS", 1, true],
      ["قسم تكنولوجيا المعلومات والاتصالات", "ICT", "قسم تقنية المعلومات", "ICT Department", 2, true],
      ["قسم نظم المعلومات", "Information Systems", "قسم نظم المعلومات الإدارية", "IS Department", 3, true],
    ],
  },
  {
    id: "programs",
    fileName: "template_programs.xlsx",
    title: "البرامج",
    description: "البرامج الأكاديمية المرتبطة بالأقسام.",
    category: "academic_structure",
    hasValidator: false,
    columns: [
      { name: "code", description: "كود البرنامج (مختصر)", required: true, type: "text", example: "CS" },
      { name: "name_ar", description: "اسم البرنامج بالعربية", required: true, type: "text", example: "بكالوريوس علوم الحاسوب" },
      { name: "name_en", description: "اسم البرنامج بالإنجليزية", required: false, type: "text", example: "BSc Computer Science" },
      { name: "department_name", description: "اسم القسم بالعربية (يجب أن يكون موجوداً)", required: true, type: "text", example: "قسم علوم الحاسوب" },
      { name: "duration_years", description: "مدة البرنامج بالسنوات", required: false, type: "integer", example: 4 },
      { name: "total_credit_hours", description: "إجمالي الساعات المعتمدة", required: false, type: "integer", example: 138 },
      { name: "degree_type", description: "نوع الدرجة (bachelor/master/diploma)", required: false, type: "enum", example: "bachelor", enumValues: ["bachelor", "master", "diploma"] },
      { name: "is_active", description: "نشط (true/false)", required: false, type: "boolean", example: true },
    ],
    examples: [
      ["CS", "بكالوريوس علوم الحاسوب", "BSc Computer Science", "قسم علوم الحاسوب", 4, 138, "bachelor", true],
      ["IT", "بكالوريوس تكنولوجيا المعلومات", "BSc Information Technology", "قسم تكنولوجيا المعلومات والاتصالات", 4, 138, "bachelor", true],
      ["IS", "بكالوريوس نظم المعلومات", "BSc Information Systems", "قسم نظم المعلومات", 4, 138, "bachelor", true],
    ],
  },
  {
    id: "levels",
    fileName: "template_levels.xlsx",
    title: "المستويات الدراسية",
    description: "المستويات الدراسية المعتمدة في النظام.",
    category: "academic_structure",
    hasValidator: false,
    columns: [
      { name: "level_number", description: "رقم المستوى (1-8)", required: true, type: "integer", example: 1 },
      { name: "name", description: "اسم المستوى", required: true, type: "text", example: "المستوى الأول" },
      { name: "status", description: "الحالة (active/inactive)", required: false, type: "enum", example: "active", enumValues: ["active", "inactive"] },
    ],
    examples: [
      [1, "المستوى الأول", "active"],
      [2, "المستوى الثاني", "active"],
      [3, "المستوى الثالث", "active"],
      [4, "المستوى الرابع", "active"],
    ],
  },

  // ===== أعضاء هيئة التدريس =====
  {
    id: "faculty",
    fileName: "template_faculty.xlsx",
    title: "أعضاء هيئة التدريس",
    description: "بيانات أعضاء هيئة التدريس الأساسية (دون حسابات الدخول).",
    category: "faculty",
    importerKey: "faculty",
    hasValidator: true,
    columns: [
      { name: "employee_number", description: "الرقم الوظيفي (فريد)", required: true, type: "text", example: "F2025001" },
      { name: "full_name_ar", description: "الاسم بالعربية", required: true, type: "text", example: "د. خالد عبدالله" },
      { name: "full_name_en", description: "الاسم بالإنجليزية", required: false, type: "text", example: "Dr. Khalid" },
      { name: "department_code", description: "اسم القسم بالعربية كما هو مسجل", required: true, type: "text", example: "قسم علوم الحاسوب" },
      { name: "program_code", description: "كود البرنامج (اختياري)", required: false, type: "text", example: "CS" },
      { name: "academic_rank", description: "الرتبة الأكاديمية", required: false, type: "text", example: "Assistant Professor" },
      { name: "position_title", description: "المسمى الوظيفي", required: false, type: "text", example: "عضو هيئة تدريس" },
      { name: "status", description: "active / inactive", required: false, type: "enum", example: "active", enumValues: ["active", "inactive"] },
    ],
    examples: [
      ["F2025001", "د. خالد عبدالله", "Dr. Khalid Abdullah", "قسم علوم الحاسوب", "CS", "Assistant Professor", "عضو هيئة تدريس", "active"],
      ["F2025002", "د. أحمد سعيد", "Dr. Ahmed Saeed", "قسم تكنولوجيا المعلومات والاتصالات", "IT", "Associate Professor", "عضو هيئة تدريس", "active"],
      ["F2025003", "د. منى الحسن", "Dr. Mona Al-Hassan", "قسم نظم المعلومات", "IS", "Lecturer", "عضو هيئة تدريس", "active"],
    ],
  },
  {
    id: "faculty_accounts",
    fileName: "template_faculty_accounts.xlsx",
    title: "حسابات أعضاء هيئة التدريس",
    description: "إنشاء/ربط حسابات الدخول لأعضاء هيئة التدريس عبر الرقم الوظيفي.",
    category: "faculty",
    importerKey: "faculty_accounts",
    hasValidator: true,
    columns: [
      { name: "employee_number", description: "الرقم الوظيفي (فريد، يجب وجوده مسبقاً)", required: true, type: "text", example: "F2025001" },
      { name: "email", description: "البريد الرسمي للحساب", required: true, type: "text", example: "faculty@example.com" },
      { name: "initial_password", description: "كلمة المرور المبدئية", required: true, type: "text", example: "TempPass!23" },
      { name: "full_name_ar", description: "الاسم بالعربية", required: false, type: "text", example: "د. أحمد" },
      { name: "department_name", description: "اسم القسم", required: false, type: "text", example: "قسم علوم الحاسوب" },
      { name: "academic_rank", description: "الرتبة الأكاديمية", required: false, type: "text", example: "Assistant Professor" },
      { name: "role", description: "الدور (افتراضي: faculty_member)", required: false, type: "enum", example: "faculty_member", enumValues: ["faculty_member", "department_head"] },
      { name: "force_password_change", description: "إجبار تغيير كلمة المرور (افتراضي: true)", required: false, type: "boolean", example: true },
    ],
    examples: [
      ["F2025001", "khalid@usr.edu.ye", "TempPass!23", "د. خالد عبدالله", "قسم علوم الحاسوب", "Assistant Professor", "faculty_member", true],
      ["F2025002", "ahmed@usr.edu.ye", "TempPass!23", "د. أحمد سعيد", "قسم تكنولوجيا المعلومات والاتصالات", "Associate Professor", "faculty_member", true],
    ],
  },

  // ===== الطلاب =====
  {
    id: "students",
    fileName: "template_students.xlsx",
    title: "الطلاب",
    description: "بيانات الطلاب الأساسية وحالتهم الأكاديمية.",
    category: "students",
    importerKey: "students",
    hasValidator: true,
    columns: [
      { name: "academic_number", description: "الرقم الأكاديمي (فريد)", required: true, type: "text", example: "2025001" },
      { name: "full_name_ar", description: "الاسم بالعربية", required: true, type: "text", example: "أحمد محمد علي" },
      { name: "full_name_en", description: "الاسم بالإنجليزية", required: false, type: "text", example: "Ahmed Mohammed" },
      { name: "national_id", description: "رقم الهوية الوطنية", required: false, type: "text", example: "12345678901" },
      { name: "phone", description: "رقم الهاتف", required: false, type: "text", example: "777000111" },
      { name: "email", description: "البريد الإلكتروني", required: false, type: "text", example: "ahmed@example.com" },
      { name: "department_code", description: "اسم القسم بالعربية", required: true, type: "text", example: "قسم تكنولوجيا المعلومات والاتصالات" },
      { name: "program_code", description: "كود البرنامج", required: true, type: "text", example: "IT" },
      { name: "academic_year", description: "اسم السنة الأكاديمية", required: true, type: "text", example: "2026-2027" },
      { name: "semester", description: "first / second / summer أو اسم الفصل", required: true, type: "text", example: "first" },
      { name: "level", description: "رقم المستوى (1-4) أو اسمه", required: true, type: "text", example: "1" },
      { name: "status", description: "حالة الطالب", required: false, type: "enum", example: "active", enumValues: ["active", "suspended", "graduated", "withdrawn", "transferred"] },
    ],
    examples: [
      ["2026001", "أحمد محمد علي", "Ahmed Mohammed", "12345678901", "777000111", "ahmed@example.com", "قسم تكنولوجيا المعلومات والاتصالات", "IT", "2026-2027", "first", "1", "active"],
      ["2026002", "فاطمة الزهراء", "Fatima Alzahra", "12345678902", "777000112", "fatima@example.com", "قسم علوم الحاسوب", "CS", "2026-2027", "first", "1", "active"],
      ["2026003", "يوسف الحسن", "Yousef Alhassan", "12345678903", "777000113", "yousef@example.com", "قسم نظم المعلومات", "IS", "2026-2027", "first", "1", "active"],
    ],
  },
  {
    id: "student_accounts",
    fileName: "template_student_accounts.xlsx",
    title: "حسابات الطلاب",
    description: "إنشاء/ربط حسابات الدخول للطلاب عبر الرقم الأكاديمي (يتطلب تطوير مستورد).",
    category: "students",
    hasValidator: false,
    columns: [
      { name: "academic_number", description: "الرقم الأكاديمي (يجب وجوده مسبقاً)", required: true, type: "text", example: "2026001" },
      { name: "email", description: "البريد الرسمي للحساب", required: true, type: "text", example: "2026001@student.usr.edu.ye" },
      { name: "initial_password", description: "كلمة المرور المبدئية", required: true, type: "text", example: "TempPass!23" },
      { name: "phone", description: "رقم الهاتف", required: false, type: "text", example: "777000111" },
      { name: "force_password_change", description: "إجبار تغيير كلمة المرور (افتراضي: true)", required: false, type: "boolean", example: true },
    ],
    examples: [
      ["2026001", "2026001@student.usr.edu.ye", "TempPass!23", "777000111", true],
      ["2026002", "2026002@student.usr.edu.ye", "TempPass!23", "777000112", true],
    ],
  },

  // ===== المقررات والخطط =====
  {
    id: "courses",
    fileName: "template_courses.xlsx",
    title: "المقررات",
    description: "المقررات الدراسية. ملاحظة: الساعات المعتمدة تُحسب تلقائياً من النظري + سقف(العملي/2).",
    category: "courses",
    importerKey: "courses",
    hasValidator: true,
    columns: [
      { name: "code", description: "كود المقرر (فريد)", required: true, type: "text", example: "CS101" },
      { name: "name_ar", description: "اسم المقرر بالعربية", required: true, type: "text", example: "مقدمة في البرمجة" },
      { name: "name_en", description: "اسم المقرر بالإنجليزية", required: false, type: "text", example: "Intro to Programming" },
      { name: "credit_hours", description: "تُحسب تلقائياً، يتم تجاهل المُدخل", required: false, type: "integer", example: 3 },
      { name: "theory_hours", description: "ساعات نظري (>= 0)", required: true, type: "integer", example: 2 },
      { name: "practical_hours", description: "ساعات عملي (>= 0)", required: true, type: "integer", example: 2 },
      { name: "department_code", description: "اسم القسم بالعربية", required: true, type: "text", example: "قسم علوم الحاسوب" },
      { name: "status", description: "active / inactive", required: false, type: "enum", example: "active", enumValues: ["active", "inactive"] },
    ],
    examples: [
      ["CS101", "مقدمة في البرمجة", "Intro to Programming", 3, 2, 2, "قسم علوم الحاسوب", "active"],
      ["CS102", "هياكل البيانات", "Data Structures", 3, 2, 2, "قسم علوم الحاسوب", "active"],
      ["IT101", "مبادئ تقنية المعلومات", "IT Fundamentals", 3, 3, 0, "قسم تكنولوجيا المعلومات والاتصالات", "active"],
    ],
  },
  {
    id: "study_plans",
    fileName: "template_study_plans.xlsx",
    title: "الخطط الدراسية",
    description: "مقررات الخطة الدراسية مرتبة حسب المستوى والفصل.",
    category: "courses",
    importerKey: "study_plans",
    hasValidator: true,
    columns: [
      { name: "program_code", description: "كود البرنامج", required: true, type: "text", example: "IT" },
      { name: "plan_name", description: "اسم الخطة", required: true, type: "text", example: "خطة 2024" },
      { name: "version", description: "إصدار الخطة (افتراضي 1.0)", required: false, type: "text", example: "1.0" },
      { name: "course_code", description: "كود المقرر (موجود في جدول المقررات)", required: true, type: "text", example: "CS101" },
      { name: "level", description: "المستوى الدراسي", required: true, type: "text", example: "1" },
      { name: "semester", description: "first / second / summer", required: false, type: "text", example: "first" },
      { name: "required", description: "مقرر إجباري (true/false)", required: false, type: "boolean", example: true },
      { name: "prerequisite_course_code", description: "كود المتطلب السابق (اختياري)", required: false, type: "text", example: "" },
      { name: "sort_order", description: "الترتيب", required: false, type: "integer", example: 1 },
    ],
    examples: [
      ["IT", "خطة 2024", "1.0", "CS101", "1", "first", true, "", 1],
      ["IT", "خطة 2024", "1.0", "IT101", "1", "first", true, "", 2],
      ["IT", "خطة 2024", "1.0", "CS102", "1", "second", true, "CS101", 3],
    ],
  },
  {
    id: "course_sections",
    fileName: "template_course_sections.xlsx",
    title: "مجموعات المقررات الدراسية",
    description: "المجموعات (Sections) المفتوحة للمقررات في الفصل الحالي (يتطلب تطوير مستورد).",
    category: "courses",
    hasValidator: false,
    columns: [
      { name: "course_code", description: "كود المقرر", required: true, type: "text", example: "CS101" },
      { name: "academic_year", description: "اسم السنة الأكاديمية", required: true, type: "text", example: "2026-2027" },
      { name: "semester", description: "first / second / summer", required: true, type: "text", example: "first" },
      { name: "program_code", description: "كود البرنامج", required: true, type: "text", example: "IT" },
      { name: "level", description: "المستوى الدراسي", required: true, type: "text", example: "1" },
      { name: "section_code", description: "رمز المجموعة الدراسية", required: true, type: "text", example: "A" },
      { name: "faculty_employee_number", description: "الرقم الوظيفي لعضو هيئة التدريس", required: false, type: "text", example: "F2025001" },
      { name: "capacity", description: "السعة القصوى", required: false, type: "integer", example: 30 },
      { name: "status", description: "active / closed", required: false, type: "enum", example: "active", enumValues: ["active", "closed", "cancelled"] },
    ],
    examples: [
      ["CS101", "2026-2027", "first", "IT", "1", "A", "F2025001", 30, "active"],
      ["CS101", "2026-2027", "first", "IT", "1", "B", "F2025002", 30, "active"],
      ["IT101", "2026-2027", "first", "IT", "1", "A", "F2025002", 30, "active"],
    ],
  },

  // ===== التسجيل الأكاديمي =====
  {
    id: "student_enrollments",
    fileName: "template_student_enrollments.xlsx",
    title: "تسجيلات الطلاب",
    description: "تسجيل الطلاب في مجموعات المقررات (يتطلب تطوير مستورد).",
    category: "enrollment",
    hasValidator: false,
    columns: [
      { name: "academic_number", description: "الرقم الأكاديمي للطالب", required: true, type: "text", example: "2026001" },
      { name: "course_code", description: "كود المقرر", required: true, type: "text", example: "CS101" },
      { name: "section_code", description: "رمز المجموعة الدراسية", required: true, type: "text", example: "A" },
      { name: "academic_year", description: "اسم السنة الأكاديمية", required: true, type: "text", example: "2026-2027" },
      { name: "semester", description: "first / second / summer", required: true, type: "text", example: "first" },
      { name: "enrollment_status", description: "enrolled / dropped / completed", required: false, type: "enum", example: "enrolled", enumValues: ["enrolled", "dropped", "completed"] },
    ],
    examples: [
      ["2026001", "CS101", "A", "2026-2027", "first", "enrolled"],
      ["2026001", "IT101", "A", "2026-2027", "first", "enrolled"],
      ["2026002", "CS101", "A", "2026-2027", "first", "enrolled"],
    ],
  },
  {
    id: "student_grades",
    fileName: "template_student_grades.xlsx",
    title: "درجات الطلاب",
    description: "درجات الطلاب لكل مكوّن تقييم (يتطلب تطوير مستورد).",
    category: "enrollment",
    hasValidator: false,
    columns: [
      { name: "academic_number", description: "الرقم الأكاديمي للطالب", required: true, type: "text", example: "2026001" },
      { name: "course_code", description: "كود المقرر", required: true, type: "text", example: "CS101" },
      { name: "section_code", description: "رمز المجموعة الدراسية", required: true, type: "text", example: "A" },
      { name: "academic_year", description: "اسم السنة الأكاديمية", required: true, type: "text", example: "2026-2027" },
      { name: "semester", description: "first / second / summer", required: true, type: "text", example: "first" },
      { name: "component_name", description: "اسم مكوّن التقييم (مثل: نصفي، نهائي، أعمال فصل)", required: true, type: "text", example: "نهائي" },
      { name: "score", description: "الدرجة (لا تتجاوز الحد الأقصى للمكوّن)", required: true, type: "number", example: 85 },
      { name: "status", description: "draft / submitted / approved", required: false, type: "enum", example: "submitted", enumValues: ["draft", "submitted", "approved"] },
    ],
    examples: [
      ["2026001", "CS101", "A", "2026-2027", "first", "أعمال فصل", 28, "submitted"],
      ["2026001", "CS101", "A", "2026-2027", "first", "نصفي", 18, "submitted"],
      ["2026001", "CS101", "A", "2026-2027", "first", "نهائي", 45, "submitted"],
    ],
  },

  // ===== المالية =====
  {
    id: "student_fees",
    fileName: "template_student_fees.xlsx",
    title: "رسوم الطلاب",
    description: "إصدار رسوم على الطلاب لفصل معيّن (يتطلب تطوير مستورد).",
    category: "finance",
    hasValidator: false,
    columns: [
      { name: "academic_number", description: "الرقم الأكاديمي للطالب", required: true, type: "text", example: "2026001" },
      { name: "fee_type_code", description: "كود نوع الرسم", required: true, type: "text", example: "TUITION" },
      { name: "academic_year", description: "اسم السنة الأكاديمية", required: true, type: "text", example: "2026-2027" },
      { name: "semester", description: "first / second / summer", required: true, type: "text", example: "first" },
      { name: "amount", description: "المبلغ (>= 0)", required: true, type: "number", example: 50000 },
      { name: "due_date", description: "تاريخ الاستحقاق (YYYY-MM-DD)", required: false, type: "date", example: "2026-10-15" },
      { name: "status", description: "pending / partially_paid / paid / cancelled", required: false, type: "enum", example: "pending", enumValues: ["pending", "partially_paid", "paid", "cancelled"] },
    ],
    examples: [
      ["2026001", "TUITION", "2026-2027", "first", 50000, "2026-10-15", "pending"],
      ["2026002", "TUITION", "2026-2027", "first", 50000, "2026-10-15", "pending"],
      ["2026003", "TUITION", "2026-2027", "first", 50000, "2026-10-15", "pending"],
    ],
  },
  {
    id: "student_discounts",
    fileName: "template_student_discounts.xlsx",
    title: "خصومات الطلاب",
    description: "تطبيق خصومات (نسبة أو مبلغ) على رسوم الطلاب (يتطلب تطوير مستورد).",
    category: "finance",
    hasValidator: false,
    columns: [
      { name: "academic_number", description: "الرقم الأكاديمي للطالب", required: true, type: "text", example: "2026001" },
      { name: "discount_type_code", description: "كود نوع الخصم", required: true, type: "text", example: "SCHOLARSHIP" },
      { name: "academic_year", description: "اسم السنة الأكاديمية", required: true, type: "text", example: "2026-2027" },
      { name: "semester", description: "first / second / summer", required: true, type: "text", example: "first" },
      { name: "value", description: "قيمة الخصم (نسبة 0-100 أو مبلغ حسب نوع الخصم)", required: true, type: "number", example: 25 },
      { name: "reason", description: "سبب الخصم", required: false, type: "text", example: "تفوق دراسي" },
      { name: "status", description: "active / cancelled", required: false, type: "enum", example: "active", enumValues: ["active", "cancelled"] },
    ],
    examples: [
      ["2026001", "SCHOLARSHIP", "2026-2027", "first", 25, "تفوق دراسي", "active"],
      ["2026002", "SIBLING", "2026-2027", "first", 10, "خصم إخوة", "active"],
    ],
  },

  // ===== الجداول =====
  {
    id: "class_schedule",
    fileName: "template_class_schedule.xlsx",
    title: "الجداول الدراسية",
    description: "جداول المحاضرات (قاعة + فترة زمنية + مدرّس) للمجموعات الدراسية (يتطلب تطوير مستورد).",
    category: "schedule",
    hasValidator: false,
    columns: [
      { name: "course_code", description: "كود المقرر", required: true, type: "text", example: "CS101" },
      { name: "section_code", description: "رمز المجموعة الدراسية", required: true, type: "text", example: "A" },
      { name: "academic_year", description: "اسم السنة الأكاديمية", required: true, type: "text", example: "2026-2027" },
      { name: "semester", description: "first / second / summer", required: true, type: "text", example: "first" },
      { name: "day_of_week", description: "اليوم (sunday..saturday)", required: true, type: "enum", example: "sunday", enumValues: ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] },
      { name: "start_time", description: "وقت البدء (HH:MM)", required: true, type: "text", example: "08:00" },
      { name: "end_time", description: "وقت الانتهاء (HH:MM)", required: true, type: "text", example: "09:30" },
      { name: "room_code", description: "كود/رقم القاعة", required: true, type: "text", example: "A101" },
      { name: "faculty_employee_number", description: "الرقم الوظيفي لعضو هيئة التدريس", required: false, type: "text", example: "F2025001" },
      { name: "schedule_type", description: "lecture / lab / tutorial", required: false, type: "enum", example: "lecture", enumValues: ["lecture", "lab", "tutorial"] },
      { name: "status", description: "draft / published", required: false, type: "enum", example: "published", enumValues: ["draft", "published", "cancelled"] },
    ],
    examples: [
      ["CS101", "A", "2026-2027", "first", "sunday", "08:00", "09:30", "A101", "F2025001", "lecture", "published"],
      ["CS101", "A", "2026-2027", "first", "tuesday", "08:00", "09:30", "A101", "F2025001", "lecture", "published"],
      ["IT101", "A", "2026-2027", "first", "monday", "10:00", "11:30", "A102", "F2025002", "lecture", "published"],
    ],
  },

  // ===== الوثائق =====
  {
    id: "documents",
    fileName: "template_documents.xlsx",
    title: "الوثائق الرسمية",
    description: "إصدار وثائق رسمية للطلاب (شهادات، إفادات...) (يتطلب تطوير مستورد).",
    category: "documents",
    hasValidator: false,
    columns: [
      { name: "academic_number", description: "الرقم الأكاديمي للطالب", required: true, type: "text", example: "2026001" },
      { name: "document_type", description: "نوع الوثيقة (enrollment_letter, transcript, graduation_certificate ...)", required: true, type: "text", example: "enrollment_letter" },
      { name: "issue_date", description: "تاريخ الإصدار (YYYY-MM-DD)", required: false, type: "date", example: "2026-10-01" },
      { name: "purpose", description: "الغرض من الوثيقة", required: false, type: "text", example: "لتقديمها للجهات الرسمية" },
      { name: "notes", description: "ملاحظات إضافية", required: false, type: "text", example: "" },
    ],
    examples: [
      ["2026001", "enrollment_letter", "2026-10-01", "لتقديمها للجهات الرسمية", ""],
      ["2026002", "transcript", "2026-10-01", "لطلب القبول", ""],
      ["2026003", "enrollment_letter", "2026-10-01", "بنك", ""],
    ],
  },
];

// =====================================================================
// XLSX generation
// =====================================================================
export async function downloadMasterTemplate(id: string) {
  const tpl = MASTER_TEMPLATES.find((t) => t.id === id);
  if (!tpl) throw new Error(`Template not found: ${id}`);

  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();

  // Sheet 1: Data (headers only + one example row to show shape)
  const headers = tpl.columns.map((c) => c.name);
  const wsData = XLSX.utils.aoa_to_sheet([
    headers,
    tpl.columns.map((c) => c.example as string | number | boolean),
  ]);
  wsData["!cols"] = headers.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, wsData, "Data");

  // Sheet 2: Instructions
  const instRows: (string | number | boolean)[][] = [
    ["العمود", "الوصف", "مطلوب", "نوع البيانات", "مثال صحيح", "قيم مسموحة"],
    ...tpl.columns.map((c) => [
      c.name,
      c.description,
      c.required ? "نعم" : "لا",
      c.type,
      String(c.example),
      c.enumValues?.join(" | ") ?? "",
    ]),
    [],
    ["ملاحظات عامة:"],
    ["- لا تغيّر أسماء الأعمدة في صف العناوين."],
    ["- التحقق النهائي يتم من خلال صفحة الاستيراد (المراجع، التكرار، التواريخ، الأنواع)."],
    [`- اسم القالب: ${tpl.fileName}`],
    [`- الفئة: ${CATEGORY_LABEL[tpl.category]}`],
    [`- يوجد مستورد فعلي؟ ${tpl.importerKey ? "نعم" : "لا (يتطلب تطوير مستقبلاً)"}`],
  ];
  const wsInst = XLSX.utils.aoa_to_sheet(instRows);
  wsInst["!cols"] = [{ wch: 28 }, { wch: 50 }, { wch: 10 }, { wch: 14 }, { wch: 30 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsInst, "Instructions");

  // Sheet 3: Example (3-5 sample rows)
  const wsEx = XLSX.utils.aoa_to_sheet([headers, ...tpl.examples]);
  wsEx["!cols"] = headers.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, wsEx, "Example");

  XLSX.writeFile(wb, tpl.fileName);
}

export function getTemplatesByCategory(): { category: MasterTemplateCategory; label: string; templates: MasterTemplate[] }[] {
  const cats = Object.keys(CATEGORY_LABEL) as MasterTemplateCategory[];
  return cats
    .map((c) => ({
      category: c,
      label: CATEGORY_LABEL[c],
      templates: MASTER_TEMPLATES.filter((t) => t.category === c),
    }))
    .filter((g) => g.templates.length > 0);
}
