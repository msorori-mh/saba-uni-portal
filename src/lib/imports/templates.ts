import * as XLSX from "xlsx";
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
    headers: ["academic_number","full_name_ar","full_name_en","national_id","phone","email","department_code","program_code","academic_year","semester","level","status"],
    sample: ["2025001","أحمد محمد علي","Ahmed Mohammed","12345678901","777000111","ahmed@example.com","قسم تكنولوجيا المعلومات والاتصالات","IT","2025-2026","first","1","active"],
    instructions: [
      "الحقول المطلوبة: academic_number, full_name_ar, department_code, program_code, academic_year, semester, level",
      "department_code = اسم القسم بالعربية كما هو مسجل في النظام",
      "program_code = كود البرنامج (مثل IT, CS, AI)",
      "academic_year = اسم السنة الأكاديمية (مثل 2025-2026)",
      "semester = first / second / summer أو اسم الفصل",
      "level = رقم المستوى (1-4) أو اسم المستوى",
      "status = active / suspended / graduated / withdrawn / transferred",
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
      "code و name_ar و credit_hours حقول مطلوبة",
      "credit_hours/theory_hours/practical_hours أرقام >= 0",
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
};

export function downloadTemplate(type: ImportType) {
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
    reader.onload = (e) => {
      try {
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
