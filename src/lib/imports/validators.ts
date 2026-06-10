import type { LookupMaps, RowError, ValidatedRow, ValidationResult } from "./types";
import { normKey } from "./lookups";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const str = (v: unknown) => (v == null ? "" : String(v).trim());
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

// =========================
// Students
// =========================
export type StudentRow = {
  academic_number: string;
  full_name_ar: string;
  full_name_en: string | null;
  national_id: string | null;
  phone: string | null;
  email: string | null;
  department_id: string;
  program_id: string;
  academic_year_id: string;
  semester_id: string;
  level_id: string;
  status: string;
};

const STUDENT_STATUSES = new Set(["active", "suspended", "graduated", "withdrawn", "transferred"]);

export async function validateStudents(
  rows: Record<string, unknown>[],
  lookups: LookupMaps,
): Promise<ValidationResult<StudentRow>> {
  // Pre-fetch existing academic numbers
  const acNumbers = rows.map((r) => str(r.academic_number)).filter(Boolean);
  const existingSet = new Set<string>();
  if (acNumbers.length) {
    // chunk
    for (let i = 0; i < acNumbers.length; i += 500) {
      const chunk = acNumbers.slice(i, i + 500);
      const { data } = await sb.from("student_profiles").select("academic_number").in("academic_number", chunk);
      (data ?? []).forEach((d: { academic_number: string }) => existingSet.add(d.academic_number));
    }
  }
  const seenInFile = new Set<string>();
  const result: ValidatedRow<StudentRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];
    const academic_number = str(raw.academic_number);
    if (!academic_number) errors.push({ row: rowNumber, column: "academic_number", message: "الرقم الأكاديمي مطلوب" });
    if (academic_number && seenInFile.has(academic_number))
      errors.push({ row: rowNumber, column: "academic_number", message: "رقم أكاديمي مكرر في الملف" });
    if (academic_number && existingSet.has(academic_number))
      errors.push({ row: rowNumber, column: "academic_number", message: "رقم أكاديمي موجود مسبقاً" });

    const full_name_ar = str(raw.full_name_ar);
    if (!full_name_ar) errors.push({ row: rowNumber, column: "full_name_ar", message: "الاسم بالعربية مطلوب" });

    const dep_id = lookups.departmentsByName.get(normKey(str(raw.department_code)));
    if (!dep_id) errors.push({ row: rowNumber, column: "department_code", message: "القسم غير موجود" });

    const prog = lookups.programsByCode.get(normKey(str(raw.program_code)));
    if (!prog) errors.push({ row: rowNumber, column: "program_code", message: "البرنامج غير موجود" });

    const ay_id = lookups.academicYearsByName.get(normKey(str(raw.academic_year)));
    if (!ay_id) errors.push({ row: rowNumber, column: "academic_year", message: "السنة الأكاديمية غير موجودة" });

    const semKey = normKey(str(raw.semester));
    const sem_id = lookups.semestersByCode.get(semKey) ?? lookups.semestersByName.get(semKey);
    if (!sem_id) errors.push({ row: rowNumber, column: "semester", message: "الفصل غير موجود" });

    const levelKey = normKey(str(raw.level));
    const level_id = lookups.levelsByNumber.get(levelKey) ?? lookups.levelsByName.get(levelKey);
    if (!level_id) errors.push({ row: rowNumber, column: "level", message: "المستوى غير موجود" });

    const status = str(raw.status) || "active";
    if (!STUDENT_STATUSES.has(status))
      errors.push({ row: rowNumber, column: "status", message: "الحالة غير صحيحة" });

    if (academic_number) seenInFile.add(academic_number);

    result.push({
      rowNumber, raw, errors,
      parsed: errors.length ? null : {
        academic_number, full_name_ar,
        full_name_en: str(raw.full_name_en) || null,
        national_id: str(raw.national_id) || null,
        phone: str(raw.phone) || null,
        email: str(raw.email) || null,
        department_id: dep_id!, program_id: prog!.id,
        academic_year_id: ay_id!, semester_id: sem_id!, level_id: level_id!,
        status,
      },
    });
  });

  return summarize(result);
}

// =========================
// Faculty
// =========================
export type FacultyRow = {
  employee_number: string;
  full_name_ar: string;
  full_name_en: string | null;
  department_id: string | null;
  program_id: string | null;
  academic_rank: string | null;
  position_title: string | null;
  status: string;
};

export async function validateFaculty(
  rows: Record<string, unknown>[],
  lookups: LookupMaps,
): Promise<ValidationResult<FacultyRow>> {
  const empNums = rows.map((r) => str(r.employee_number)).filter(Boolean);
  const existing = new Set<string>();
  if (empNums.length) {
    for (let i = 0; i < empNums.length; i += 500) {
      const chunk = empNums.slice(i, i + 500);
      const { data } = await sb.from("faculty_profiles").select("employee_number").in("employee_number", chunk);
      (data ?? []).forEach((d: { employee_number: string }) => existing.add(d.employee_number));
    }
  }
  const seen = new Set<string>();
  const out: ValidatedRow<FacultyRow>[] = [];

  // faculty_profiles requires faculty_id (NOT NULL). We'll need to create or reuse a faculty row.
  // To avoid breaking existing workflows, we resolve faculty_id by matching on existing faculty.employee_id
  // Fallback: create a minimal faculty record per row (best-effort during insert phase).
  // For validation, we only check format.

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];
    const employee_number = str(raw.employee_number);
    if (!employee_number) errors.push({ row: rowNumber, column: "employee_number", message: "الرقم الوظيفي مطلوب" });
    if (employee_number && seen.has(employee_number))
      errors.push({ row: rowNumber, column: "employee_number", message: "الرقم الوظيفي مكرر في الملف" });
    if (employee_number && existing.has(employee_number))
      errors.push({ row: rowNumber, column: "employee_number", message: "الرقم الوظيفي موجود مسبقاً" });

    const full_name_ar = str(raw.full_name_ar);
    if (!full_name_ar) errors.push({ row: rowNumber, column: "full_name_ar", message: "الاسم بالعربية مطلوب" });

    const depKey = normKey(str(raw.department_code));
    const dep_id = depKey ? lookups.departmentsByName.get(depKey) ?? null : null;
    if (depKey && !dep_id) errors.push({ row: rowNumber, column: "department_code", message: "القسم غير موجود" });

    const progKey = normKey(str(raw.program_code));
    const prog = progKey ? lookups.programsByCode.get(progKey) ?? null : null;
    if (progKey && !prog) errors.push({ row: rowNumber, column: "program_code", message: "البرنامج غير موجود" });

    if (employee_number) seen.add(employee_number);

    out.push({
      rowNumber, raw, errors,
      parsed: errors.length ? null : {
        employee_number, full_name_ar,
        full_name_en: str(raw.full_name_en) || null,
        department_id: dep_id,
        program_id: prog?.id ?? null,
        academic_rank: str(raw.academic_rank) || null,
        position_title: str(raw.position_title) || null,
        status: str(raw.status) || "active",
      },
    });
  });
  return summarize(out);
}

// =========================
// Staff
// =========================
export type StaffRow = {
  employee_number: string;
  full_name_ar: string;
  full_name_en: string | null;
  department_id: string | null;
  job_title: string | null;
  role_type: string | null;
  status: string;
};

export async function validateStaff(
  rows: Record<string, unknown>[],
  lookups: LookupMaps,
): Promise<ValidationResult<StaffRow>> {
  const empNums = rows.map((r) => str(r.employee_number)).filter(Boolean);
  const existing = new Set<string>();
  if (empNums.length) {
    for (let i = 0; i < empNums.length; i += 500) {
      const chunk = empNums.slice(i, i + 500);
      const { data } = await sb.from("staff_profiles").select("employee_number").in("employee_number", chunk);
      (data ?? []).forEach((d: { employee_number: string }) => existing.add(d.employee_number));
    }
  }
  const seen = new Set<string>();
  const out: ValidatedRow<StaffRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];
    const employee_number = str(raw.employee_number);
    if (!employee_number) errors.push({ row: rowNumber, column: "employee_number", message: "الرقم الوظيفي مطلوب" });
    if (employee_number && seen.has(employee_number))
      errors.push({ row: rowNumber, column: "employee_number", message: "مكرر في الملف" });
    if (employee_number && existing.has(employee_number))
      errors.push({ row: rowNumber, column: "employee_number", message: "موجود مسبقاً" });

    const full_name_ar = str(raw.full_name_ar);
    if (!full_name_ar) errors.push({ row: rowNumber, column: "full_name_ar", message: "الاسم مطلوب" });

    const depKey = normKey(str(raw.department_code));
    const dep_id = depKey ? lookups.departmentsByName.get(depKey) ?? null : null;
    if (depKey && !dep_id) errors.push({ row: rowNumber, column: "department_code", message: "القسم غير موجود" });

    if (employee_number) seen.add(employee_number);

    out.push({
      rowNumber, raw, errors,
      parsed: errors.length ? null : {
        employee_number, full_name_ar,
        full_name_en: str(raw.full_name_en) || null,
        department_id: dep_id,
        job_title: str(raw.job_title) || null,
        role_type: str(raw.role_type) || null,
        status: str(raw.status) || "active",
      },
    });
  });
  return summarize(out);
}

// =========================
// Courses
// =========================
export type CourseRow = {
  code: string;
  name_ar: string;
  name_en: string | null;
  credit_hours: number;
  theory_hours: number;
  practical_hours: number;
  department_id: string | null;
  status: string;
};

export async function validateCourses(
  rows: Record<string, unknown>[],
  lookups: LookupMaps,
): Promise<ValidationResult<CourseRow>> {
  const codes = rows.map((r) => str(r.code)).filter(Boolean);
  const existing = new Set<string>();
  if (codes.length) {
    for (let i = 0; i < codes.length; i += 500) {
      const chunk = codes.slice(i, i + 500);
      const { data } = await sb.from("courses").select("code").in("code", chunk);
      (data ?? []).forEach((d: { code: string }) => existing.add(d.code));
    }
  }
  const seen = new Set<string>();
  const out: ValidatedRow<CourseRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];
    const code = str(raw.code);
    if (!code) errors.push({ row: rowNumber, column: "code", message: "كود المقرر مطلوب" });
    if (code && seen.has(code)) errors.push({ row: rowNumber, column: "code", message: "كود مكرر في الملف" });
    if (code && existing.has(code)) errors.push({ row: rowNumber, column: "code", message: "كود موجود مسبقاً" });

    const name_ar = str(raw.name_ar);
    if (!name_ar) errors.push({ row: rowNumber, column: "name_ar", message: "الاسم بالعربية مطلوب" });

    const theory_hours = Number.isFinite(num(raw.theory_hours)) ? num(raw.theory_hours) : 0;
    const practical_hours = Number.isFinite(num(raw.practical_hours)) ? num(raw.practical_hours) : 0;
    if (theory_hours < 0) errors.push({ row: rowNumber, column: "theory_hours", message: "قيمة سالبة" });
    if (practical_hours < 0) errors.push({ row: rowNumber, column: "practical_hours", message: "قيمة سالبة" });
    // credit_hours is ALWAYS derived: theory + ceil(practical/2). Any uploaded value is ignored.
    const credit_hours = theory_hours + Math.ceil(practical_hours / 2);

    const depKey = normKey(str(raw.department_code));
    const dep_id = depKey ? lookups.departmentsByName.get(depKey) ?? null : null;
    if (depKey && !dep_id) errors.push({ row: rowNumber, column: "department_code", message: "القسم غير موجود" });

    if (code) seen.add(code);

    out.push({
      rowNumber, raw, errors,
      parsed: errors.length ? null : {
        code, name_ar,
        name_en: str(raw.name_en) || null,
        credit_hours, theory_hours, practical_hours,
        department_id: dep_id,
        status: str(raw.status) || "active",
      },
    });
  });
  return summarize(out);
}

// =========================
// Study plans
// =========================
export type StudyPlanRow = {
  program_id: string;
  plan_name: string;
  version: string;
  course_id: string;
  level_id: string;
  semester_code: string;
  is_required: boolean;
  prerequisite_course_id: string | null;
  sort_order: number;
};

export async function validateStudyPlans(
  rows: Record<string, unknown>[],
  lookups: LookupMaps,
): Promise<ValidationResult<StudyPlanRow>> {
  const seen = new Set<string>();
  const out: ValidatedRow<StudyPlanRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];
    const prog = lookups.programsByCode.get(normKey(str(raw.program_code)));
    if (!prog) errors.push({ row: rowNumber, column: "program_code", message: "البرنامج غير موجود" });

    const course = lookups.coursesByCode.get(normKey(str(raw.course_code)));
    if (!course) errors.push({ row: rowNumber, column: "course_code", message: "المقرر غير موجود" });

    const levelKey = normKey(str(raw.level));
    const level_id = lookups.levelsByNumber.get(levelKey) ?? lookups.levelsByName.get(levelKey);
    if (!level_id) errors.push({ row: rowNumber, column: "level", message: "المستوى غير موجود" });

    const plan_name = str(raw.plan_name);
    if (!plan_name) errors.push({ row: rowNumber, column: "plan_name", message: "اسم الخطة مطلوب" });
    const version = str(raw.version) || "1.0";

    const preReqCode = str(raw.prerequisite_course_code);
    let prereq_id: string | null = null;
    if (preReqCode) {
      const p = lookups.coursesByCode.get(normKey(preReqCode));
      if (!p) errors.push({ row: rowNumber, column: "prerequisite_course_code", message: "المتطلب السابق غير موجود" });
      else prereq_id = p.id;
    }

    const dedupKey = `${prog?.id}|${plan_name}|${version}|${course?.id}`;
    if (seen.has(dedupKey)) errors.push({ row: rowNumber, message: "مقرر مكرر داخل الخطة" });
    if (course && prog && plan_name) seen.add(dedupKey);

    const semester_code = str(raw.semester) || "first";
    const required = str(raw.required).toLowerCase();
    const is_required = required === "" ? true : ["true", "1", "yes", "نعم", "required", "إلزامي"].includes(required);
    const sort_order = Number.isFinite(num(raw.sort_order)) ? num(raw.sort_order) : 0;

    out.push({
      rowNumber, raw, errors,
      parsed: errors.length ? null : {
        program_id: prog!.id, plan_name, version,
        course_id: course!.id, level_id: level_id!,
        semester_code, is_required, prerequisite_course_id: prereq_id, sort_order,
      },
    });
  });

  return summarize(out);
}

// =========================
// Departments
// =========================
export type DepartmentRow = {
  department_code: string; // matched to name_ar
  name_ar: string;
  name_en: string | null;
  description_ar: string | null;
  is_active: boolean;
  _existingId: string | null;
};

const truthy = (v: unknown) => {
  const s = str(v).toLowerCase();
  if (!s) return true;
  return ["true", "1", "yes", "نعم", "active", "مفعل"].includes(s);
};

export async function validateDepartments(
  rows: Record<string, unknown>[],
  _lookups: LookupMaps,
  updateExisting = false,
): Promise<ValidationResult<DepartmentRow>> {
  // Fetch existing departments by name_ar (treated as the "code")
  const { data: existing } = await sb.from("departments").select("id, name_ar");
  const existMap = new Map<string, string>();
  (existing ?? []).forEach((d: { id: string; name_ar: string }) => existMap.set(normKey(d.name_ar), d.id));

  const seen = new Set<string>();
  const out: ValidatedRow<DepartmentRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];
    const code = str(raw.department_code) || str(raw.name_ar) || str(raw.department_name_ar);
    if (!code) errors.push({ row: rowNumber, column: "department_code", message: "كود القسم مطلوب" });
    const name_ar = str(raw.department_name_ar) || str(raw.name_ar) || code;
    if (!name_ar) errors.push({ row: rowNumber, column: "department_name_ar", message: "اسم القسم بالعربية مطلوب" });
    if (code && seen.has(normKey(code))) errors.push({ row: rowNumber, column: "department_code", message: "كود مكرر في الملف" });
    const existingId = code ? existMap.get(normKey(code)) ?? null : null;
    if (code && existingId && !updateExisting) {
      errors.push({ row: rowNumber, column: "department_code", message: "القسم موجود مسبقاً (فعّل تحديث القائم)" });
    }
    if (code) seen.add(normKey(code));

    out.push({
      rowNumber, raw, errors,
      parsed: errors.length ? null : {
        department_code: code,
        name_ar,
        name_en: str(raw.department_name_en) || str(raw.name_en) || null,
        description_ar: str(raw.description) || str(raw.description_ar) || null,
        is_active: truthy(raw.is_active),
        _existingId: existingId,
      },
    });
  });
  return summarize(out);
}

// =========================
// Programs
// =========================
export type ProgramRow = {
  code: string;
  name_ar: string;
  name_en: string | null;
  department_id: string;
  degree_type: string;
  years: number;
  is_active: boolean;
  _existingId: string | null;
};

const VALID_DEGREES = new Set(["bachelor", "master", "phd", "diploma", "بكالوريوس", "ماجستير", "دكتوراه", "دبلوم"]);

export async function validatePrograms(
  rows: Record<string, unknown>[],
  lookups: LookupMaps,
  updateExisting = false,
): Promise<ValidationResult<ProgramRow>> {
  const { data: existing } = await sb.from("programs").select("id, code");
  const existMap = new Map<string, string>();
  (existing ?? []).forEach((p: { id: string; code: string }) => existMap.set(normKey(p.code), p.id));

  const seen = new Set<string>();
  const out: ValidatedRow<ProgramRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];
    const code = str(raw.program_code) || str(raw.code);
    if (!code) errors.push({ row: rowNumber, column: "program_code", message: "كود البرنامج مطلوب" });
    const name_ar = str(raw.program_name_ar) || str(raw.name_ar);
    if (!name_ar) errors.push({ row: rowNumber, column: "program_name_ar", message: "اسم البرنامج بالعربية مطلوب" });
    if (code && seen.has(normKey(code))) errors.push({ row: rowNumber, column: "program_code", message: "كود مكرر في الملف" });

    const depKey = normKey(str(raw.department_code));
    const dep_id = depKey ? lookups.departmentsByName.get(depKey) ?? null : null;
    if (!dep_id) errors.push({ row: rowNumber, column: "department_code", message: "القسم غير موجود" });

    const degree_type = str(raw.degree_type).toLowerCase();
    if (!degree_type) errors.push({ row: rowNumber, column: "degree_type", message: "نوع الدرجة مطلوب" });
    else if (!VALID_DEGREES.has(degree_type)) errors.push({ row: rowNumber, column: "degree_type", message: "نوع الدرجة غير صحيح" });

    const yearsN = num(raw.duration_years);
    if (!Number.isFinite(yearsN) || yearsN <= 0 || !Number.isInteger(yearsN))
      errors.push({ row: rowNumber, column: "duration_years", message: "عدد السنوات يجب أن يكون رقماً صحيحاً موجباً" });

    const existingId = code ? existMap.get(normKey(code)) ?? null : null;
    if (code && existingId && !updateExisting)
      errors.push({ row: rowNumber, column: "program_code", message: "البرنامج موجود مسبقاً (فعّل تحديث القائم)" });

    if (code) seen.add(normKey(code));

    out.push({
      rowNumber, raw, errors,
      parsed: errors.length ? null : {
        code,
        name_ar,
        name_en: str(raw.program_name_en) || str(raw.name_en) || null,
        department_id: dep_id!,
        degree_type,
        years: yearsN,
        is_active: truthy(raw.is_active),
        _existingId: existingId,
      },
    });
  });
  return summarize(out);
}

// =========================
// Academic Levels
// =========================
export type LevelRow = {
  level_code: string;
  name: string;
  level_number: number;
  _existingId: string | null;
};

export async function validateLevels(
  rows: Record<string, unknown>[],
  _lookups: LookupMaps,
  updateExisting = false,
): Promise<ValidationResult<LevelRow>> {
  const { data: existing } = await sb.from("academic_levels").select("id, level_number, name");
  const existByNumber = new Map<string, string>();
  (existing ?? []).forEach((l: { id: string; level_number: number }) =>
    existByNumber.set(String(l.level_number), l.id));

  const seenCode = new Set<string>();
  const seenNum = new Set<string>();
  const out: ValidatedRow<LevelRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];
    const code = str(raw.level_code);
    if (!code) errors.push({ row: rowNumber, column: "level_code", message: "كود المستوى مطلوب" });
    const name = str(raw.level_name);
    if (!name) errors.push({ row: rowNumber, column: "level_name", message: "اسم المستوى مطلوب" });
    const numN = num(raw.level_number);
    if (!Number.isFinite(numN) || !Number.isInteger(numN) || numN <= 0)
      errors.push({ row: rowNumber, column: "level_number", message: "رقم المستوى يجب أن يكون رقماً صحيحاً موجباً" });

    if (code && seenCode.has(normKey(code))) errors.push({ row: rowNumber, column: "level_code", message: "كود مكرر في الملف" });
    const numKey = String(numN);
    if (Number.isFinite(numN) && seenNum.has(numKey)) errors.push({ row: rowNumber, column: "level_number", message: "رقم مستوى مكرر في الملف" });

    const existingId = Number.isFinite(numN) ? existByNumber.get(numKey) ?? null : null;
    if (existingId && !updateExisting)
      errors.push({ row: rowNumber, column: "level_number", message: "المستوى موجود مسبقاً (فعّل تحديث القائم)" });

    if (code) seenCode.add(normKey(code));
    if (Number.isFinite(numN)) seenNum.add(numKey);

    out.push({
      rowNumber, raw, errors,
      parsed: errors.length ? null : {
        level_code: code,
        name,
        level_number: numN,
        _existingId: existingId,
      },
    });
  });
  return summarize(out);
}


  const validRows = rows.filter((r) => r.parsed !== null).length;
  return {
    rows,
    totalRows: rows.length,
    validRows,
    invalidRows: rows.length - validRows,
  };
}
