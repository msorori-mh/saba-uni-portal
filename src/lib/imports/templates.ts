import { loadXLSX } from "@/lib/xlsx-loader";
import type { ImportType } from "./types";

type TemplateDef = {
  headers: string[];
  sample: (string | number)[];
  instructions: string[];
  sheetName: string;
};

const TEMPLATES: Record<ImportType, TemplateDef> = {
  students: {
    sheetName: "Students",
    headers: [
      "academic_number","full_name_ar","full_name_en",
      "department_code","program_code","academic_level","academic_year","semester",
      "status","phone","gender","national_id",
      "create_login","must_change_password","notes",
    ],
    sample: [
      "20251001","أحمد محمد علي","Ahmed Mohammed",
      "قسم تكنولوجيا المعلومات والاتصالات","IT","1","2025-2026","first",
      "active","777000111","male","12345678901",
      "true","true","ملاحظة اختيارية",
    ],
    instructions: [
      "الحقول المطلوبة: academic_number, full_name_ar, department_code, program_code, academic_level, academic_year, semester",
      "لا تُدخل: email أو username أو password أو user_id أو role — يتم إنشاؤها داخلياً.",
      "department_code = اسم القسم بالعربية كما هو مسجل في النظام",
      "program_code = كود البرنامج (مثل IT, CS, AI)",
      "academic_level = رقم المستوى (1-4) أو اسم المستوى",
      "academic_year = اسم السنة الأكاديمية (مثل 2025-2026)",
      "semester = first / second أو اسم الفصل",
      "status = active / suspended / graduated / withdrawn / transferred (افتراضي active)",
      "gender = male / female أو ذكر / أنثى (اختياري)",
      "create_login = true/false — عند true يُنشأ حساب دخول داخلي تلقائياً باسم المستخدم = academic_number وكلمة المرور الأولية = academic_number",
      "must_change_password = true/false — افتراضي true عند create_login=true لإجبار تغيير كلمة المرور عند أول دخول",
      "notes = ملاحظات حرة (لن تُخزَّن مع الملف، تُسجَّل في سجل التدقيق)",
    ],
  },
  faculty: {
    sheetName: "Faculty",
    headers: ["employee_number","full_name_ar","full_name_en","department_code","program_code","academic_rank","position_title","status"],
    sample: ["F2025001","د. خالد عبدالله","Dr. Khalid","قسم علوم الحاسوب","CS","Assistant Professor","عضو هيئة تدريس","active"],
    instructions: [
      "employee_number و full_name_ar حقول مطلوبة",
      "department_code = اسم القسم بالعربية",
      "program_code = كود البرنامج (اختياري)",
      "status = active / inactive",
    ],
  },
  staff: {
    sheetName: "Staff",
    headers: ["employee_number","full_name_ar","full_name_en","department_code","job_title","role_type","status"],
    sample: ["S2025001","سامي علي","Sami Ali","قسم تكنولوجيا المعلومات والاتصالات","سكرتير","staff","active"],
    instructions: [
      "employee_number و full_name_ar حقول مطلوبة",
      "department_code = اسم القسم بالعربية (اختياري)",
      "status = active / inactive",
    ],
  },
  courses: {
    sheetName: "Courses",
    headers: ["code","name_ar","name_en","credit_hours","theory_hours","practical_hours","department_code","status"],
    sample: ["CS101","مقدمة في البرمجة","Intro to Programming",3,2,2,"قسم علوم الحاسوب","active"],
    instructions: [
      "code و name_ar حقول مطلوبة",
      "theory_hours و practical_hours أرقام >= 0",
      "⚠️ credit_hours تُحسب تلقائيًا من: نظري + ⌈عملي ÷ 2⌉ — أي قيمة مدخلة في العمود سيتم تجاهلها",
      "department_code = اسم القسم بالعربية",
    ],
  },
  study_plans: {
    sheetName: "StudyPlans",
    headers: ["program_code","plan_name","version","course_code","level","semester","required","prerequisite_course_code","sort_order"],
    sample: ["IT","خطة 2024","1.0","CS101","1","first","true","",1],
    instructions: [
      "program_code, plan_name, course_code, level حقول مطلوبة",
      "version افتراضي 1.0 إن لم يُدخل",
      "required = true/false أو نعم/لا",
      "prerequisite_course_code اختياري — يجب أن يكون موجوداً إن تم إدخاله",
    ],
  },
  departments: {
    sheetName: "Departments",
    headers: ["department_code","department_name_ar","department_name_en","description","is_active"],
    sample: ["IT","قسم تكنولوجيا المعلومات والاتصالات","Information Technology","قسم تقني","true"],
    instructions: [
      "department_code و department_name_ar حقول مطلوبة",
      "department_code يُستخدم كمعرّف فريد للقسم (يُطابق name_ar داخل النظام)",
      "is_active = true / false (افتراضي true)",
      "عند تفعيل (تحديث القائم) يتم تحديث القسم الموجود بنفس الكود",
    ],
  },
  programs: {
    sheetName: "Programs",
    headers: ["program_code","program_name_ar","program_name_en","department_code","degree_type","duration_years","is_active"],
    sample: ["IT","تكنولوجيا المعلومات","Information Technology","قسم تكنولوجيا المعلومات والاتصالات","bachelor",4,"true"],
    instructions: [
      "program_code, program_name_ar, department_code, degree_type حقول مطلوبة",
      "department_code = اسم القسم بالعربية كما هو مسجل",
      "duration_years رقم صحيح موجب",
      "is_active = true / false",
    ],
  },
  levels: {
    sheetName: "Levels",
    headers: ["level_code","level_name","level_number"],
    sample: ["L1","المستوى الأول",1],
    instructions: [
      "level_code, level_name, level_number حقول مطلوبة",
      "level_number رقم صحيح فريد",
      "level_code يُستخدم للتمييز داخل الملف فقط",
    ],
  },
  course_sections: {
    sheetName: "CourseSections",
    headers: [
      "course_code","academic_year","semester","program_code","level",
      "section_code","faculty_employee_number","capacity","status",
    ],
    sample: ["CS101","2026-2027","first","IT","1","A","F2025001",30,"active"],
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
};

export async function downloadTemplate(type: ImportType) {
  const XLSX = await loadXLSX();
  const def = TEMPLATES[type];
  const wb = XLSX.utils.book_new();
  const wsData = [def.headers, def.sample];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = def.headers.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, def.sheetName);

  const instructions = [["التعليمات"], ...def.instructions.map((i) => [i])];
  const wsi = XLSX.utils.aoa_to_sheet(instructions);
  wsi["!cols"] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsi, "Instructions");

  XLSX.writeFile(wb, `template_${type}.xlsx`);
}

export function parseExcel(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await loadXLSX();
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
