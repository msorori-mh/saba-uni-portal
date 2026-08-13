import type { LookupMaps, RowError, ValidatedRow, ValidationResult } from "./types";
import { normKey } from "./lookups";
import { normalizeStudySystemTag } from "@/lib/course-materials.shared";
import { getImportDb } from "./import-db";
import { resolveStaffRoleTypeInput } from "@/lib/staff-functional-roles";
import { ELIGIBILITY_FIELD_ERROR_AR } from "./labels";

const str = (v: unknown) => (v == null ? "" : String(v).trim());
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * G-02: resolve a semester strictly within its academic year.
 * semesters.code is UNIQUE per (academic_year_id, code) — not global — so the
 * legacy global maps collide across years. When a lookups object was built
 * without the year-scoped map (legacy/tests), fall back to the old behavior.
 */
function resolveSemesterId(
  lookups: LookupMaps,
  academicYearId: string | null | undefined,
  semKey: string,
): string | null {
  if (!semKey) return null;
  if (lookups.semestersByYearKey) {
    if (!academicYearId) return null;
    return lookups.semestersByYearKey.get(`${academicYearId}|${semKey}`) ?? null;
  }
  return lookups.semestersByCode.get(semKey) ?? lookups.semestersByName.get(semKey) ?? null;
}

const SEMESTER_YEAR_ERROR_AR = "الفصل غير موجود ضمن السنة الأكاديمية المحددة";

// =========================
// Students
// =========================
export type StudentRow = {
  academic_number: string;
  full_name_ar: string;
  full_name_en: string | null;
  national_id: string | null;
  phone: string | null;
  gender: string | null;
  university_email: string | null;
  department_id: string;
  program_id: string;
  academic_year_id: string;
  semester_id: string;
  level_id: string;
  study_system: "regular" | "private" | null;
  status: string;
  create_login: boolean;
  must_change_password: boolean;
  notes: string | null;
};

const STUDENT_STATUSES = new Set(["active", "suspended", "graduated", "withdrawn", "transferred"]);
const STUDY_SYSTEM_ALIASES = new Map<string, "regular" | "private">([
  ["regular", "regular"],
  ["عام", "regular"],
  ["نظام عام", "regular"],
  ["general", "regular"],
  ["private", "private"],
  ["نفقة خاصة", "private"],
  ["نظام نفقة خاصة", "private"],
  ["private_expense", "private"],
]);

function parseBool(v: unknown, defaultValue: boolean): { value: boolean; valid: boolean } {
  if (v === null || v === undefined || v === "") return { value: defaultValue, valid: true };
  if (typeof v === "boolean") return { value: v, valid: true };
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "yes", "y", "نعم"].includes(s)) return { value: true, valid: true };
  if (["false", "0", "no", "n", "لا"].includes(s)) return { value: false, valid: true };
  return { value: defaultValue, valid: false };
}

const GENDERS = new Set(["male", "female", "ذكر", "أنثى", "انثى"]);

export async function validateStudents(
  rows: Record<string, unknown>[],
  lookups: LookupMaps,
): Promise<ValidationResult<StudentRow>> {
  const acNumbers = rows.map((r) => str(r.academic_number)).filter(Boolean);
  const existingSet = new Set<string>();
  if (acNumbers.length) {
    for (let i = 0; i < acNumbers.length; i += 500) {
      const chunk = acNumbers.slice(i, i + 500);
      const { data } = await getImportDb()
        .from("student_profiles")
        .select("academic_number")
        .in("academic_number", chunk);
      (data ?? []).forEach((d: { academic_number: string }) => existingSet.add(d.academic_number));
    }
  }
  const seenInFile = new Set<string>();
  const result: ValidatedRow<StudentRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];
    const academic_number = str(raw.academic_number);
    if (!academic_number)
      errors.push({ row: rowNumber, column: "academic_number", message: "الرقم الأكاديمي مطلوب" });
    if (academic_number && !/^[A-Za-z0-9_-]+$/.test(academic_number))
      errors.push({
        row: rowNumber,
        column: "academic_number",
        message: "الرقم الأكاديمي يحتوي على أحرف غير صحيحة",
      });
    if (academic_number && seenInFile.has(academic_number))
      errors.push({
        row: rowNumber,
        column: "academic_number",
        message: "رقم أكاديمي مكرر في الملف",
      });
    if (academic_number && existingSet.has(academic_number))
      errors.push({
        row: rowNumber,
        column: "academic_number",
        message: "رقم أكاديمي موجود مسبقاً",
      });

    const full_name_ar = str(raw.full_name_ar);
    if (!full_name_ar)
      errors.push({ row: rowNumber, column: "full_name_ar", message: "الاسم بالعربية مطلوب" });

    const dep_id = lookups.departmentsByName.get(normKey(str(raw.department_code)));
    if (!dep_id)
      errors.push({ row: rowNumber, column: "department_code", message: "القسم غير موجود" });

    const prog = lookups.programsByCode.get(normKey(str(raw.program_code)));
    if (!prog)
      errors.push({ row: rowNumber, column: "program_code", message: "البرنامج غير موجود" });

    // G-06: program must belong to the resolved department.
    if (dep_id && prog?.department_id && prog.department_id !== dep_id)
      errors.push({
        row: rowNumber,
        column: "program_code",
        message: "البرنامج لا يتبع القسم المحدد",
      });

    const ay_id = lookups.academicYearsByName.get(normKey(str(raw.academic_year)));
    if (!ay_id)
      errors.push({
        row: rowNumber,
        column: "academic_year",
        message: "السنة الأكاديمية غير موجودة",
      });

    const semKey = normKey(str(raw.semester));
    const sem_id = resolveSemesterId(lookups, ay_id, semKey);
    if (ay_id && !sem_id)
      errors.push({ row: rowNumber, column: "semester", message: SEMESTER_YEAR_ERROR_AR });

    const studySystemRaw = str(raw.study_system);
    const study_system = studySystemRaw
      ? (STUDY_SYSTEM_ALIASES.get(normKey(studySystemRaw)) ?? null)
      : null;
    if (studySystemRaw && !study_system) {
      errors.push({
        row: rowNumber,
        column: "study_system",
        message: "نظام الدراسة غير صحيح (regular/private أو عام/نفقة خاصة)",
      });
    }

    // Accept `academic_level` (canonical) and `level` (legacy) as fallback
    const levelRaw = str(raw.academic_level) || str(raw.level);
    const levelKey = normKey(levelRaw);
    const level_id = lookups.levelsByNumber.get(levelKey) ?? lookups.levelsByName.get(levelKey);
    if (!level_id)
      errors.push({ row: rowNumber, column: "academic_level", message: "المستوى غير موجود" });

    // G-11: level must not exceed the program's duration in years.
    const studentLevelNumber = level_id ? lookups.levelNumberById?.get(level_id) : undefined;
    if (
      level_id &&
      prog &&
      studentLevelNumber != null &&
      prog.years != null &&
      studentLevelNumber > prog.years
    )
      errors.push({
        row: rowNumber,
        column: "academic_level",
        message: `المستوى يتجاوز عدد سنوات البرنامج (${prog.years})`,
      });

    const status = str(raw.status) || "active";
    if (!STUDENT_STATUSES.has(status))
      errors.push({ row: rowNumber, column: "status", message: "الحالة غير صحيحة" });

    const genderRaw = str(raw.gender).toLowerCase();
    let gender: string | null = null;
    if (genderRaw) {
      if (!GENDERS.has(genderRaw))
        errors.push({ row: rowNumber, column: "gender", message: "الجنس غير صحيح (male/female)" });
      else
        gender = ["ذكر"].includes(genderRaw)
          ? "male"
          : ["أنثى", "انثى"].includes(genderRaw)
            ? "female"
            : genderRaw;
    }

    const cl = parseBool(raw.create_login, false);
    if (!cl.valid)
      errors.push({
        row: rowNumber,
        column: "create_login",
        message: "create_login يجب أن يكون true/false",
      });
    const mcpDefault = cl.value; // default = create_login
    const mcp = parseBool(raw.must_change_password, mcpDefault);
    if (!mcp.valid)
      errors.push({
        row: rowNumber,
        column: "must_change_password",
        message: "must_change_password يجب أن يكون true/false",
      });

    const university_email = str(raw.university_email).toLowerCase();
    if (cl.value) {
      if (!university_email) {
        errors.push({
          row: rowNumber,
          column: "university_email",
          message: "الإيميل الجامعي مطلوب عند create_login=true",
        });
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(university_email)) {
        errors.push({
          row: rowNumber,
          column: "university_email",
          message: "صيغة الإيميل الجامعي غير صحيحة",
        });
      }
    }

    if (academic_number) seenInFile.add(academic_number);

    result.push({
      rowNumber,
      raw,
      errors,
      parsed: errors.length
        ? null
        : {
            academic_number,
            full_name_ar,
            full_name_en: str(raw.full_name_en) || null,
            national_id: str(raw.national_id) || null,
            phone: str(raw.phone) || null,
            gender,
            university_email: university_email || null,
            department_id: dep_id!,
            program_id: prog!.id,
            academic_year_id: ay_id!,
            semester_id: sem_id!,
            level_id: level_id!,
            study_system,
            status,
            create_login: cl.value,
            must_change_password: mcp.value,
            notes: str(raw.notes) || null,
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
      const { data } = await getImportDb()
        .from("faculty_profiles")
        .select("employee_number")
        .in("employee_number", chunk);
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
    if (!employee_number)
      errors.push({ row: rowNumber, column: "employee_number", message: "الرقم الوظيفي مطلوب" });
    if (employee_number && seen.has(employee_number))
      errors.push({
        row: rowNumber,
        column: "employee_number",
        message: "الرقم الوظيفي مكرر في الملف",
      });
    if (employee_number && existing.has(employee_number))
      errors.push({
        row: rowNumber,
        column: "employee_number",
        message: "الرقم الوظيفي موجود مسبقاً",
      });

    const full_name_ar = str(raw.full_name_ar);
    if (!full_name_ar)
      errors.push({ row: rowNumber, column: "full_name_ar", message: "الاسم بالعربية مطلوب" });

    const depKey = normKey(str(raw.department_code));
    const dep_id = depKey ? (lookups.departmentsByName.get(depKey) ?? null) : null;
    if (depKey && !dep_id)
      errors.push({ row: rowNumber, column: "department_code", message: "القسم غير موجود" });

    const progKey = normKey(str(raw.program_code));
    const prog = progKey ? (lookups.programsByCode.get(progKey) ?? null) : null;
    if (progKey && !prog)
      errors.push({ row: rowNumber, column: "program_code", message: "البرنامج غير موجود" });

    // G-06: when both are given, program must belong to the resolved department.
    if (dep_id && prog?.department_id && prog.department_id !== dep_id)
      errors.push({
        row: rowNumber,
        column: "program_code",
        message: "البرنامج لا يتبع القسم المحدد",
      });

    if (employee_number) seen.add(employee_number);

    out.push({
      rowNumber,
      raw,
      errors,
      parsed: errors.length
        ? null
        : {
            employee_number,
            full_name_ar,
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
      const { data } = await getImportDb()
        .from("staff_profiles")
        .select("employee_number")
        .in("employee_number", chunk);
      (data ?? []).forEach((d: { employee_number: string }) => existing.add(d.employee_number));
    }
  }
  const seen = new Set<string>();
  const out: ValidatedRow<StaffRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];
    const employee_number = str(raw.employee_number);
    if (!employee_number)
      errors.push({ row: rowNumber, column: "employee_number", message: "الرقم الوظيفي مطلوب" });
    if (employee_number && seen.has(employee_number))
      errors.push({ row: rowNumber, column: "employee_number", message: "مكرر في الملف" });
    if (employee_number && existing.has(employee_number))
      errors.push({ row: rowNumber, column: "employee_number", message: "موجود مسبقاً" });

    const full_name_ar = str(raw.full_name_ar);
    if (!full_name_ar)
      errors.push({ row: rowNumber, column: "full_name_ar", message: "الاسم مطلوب" });

    const depKey = normKey(str(raw.department_code));
    const dep_id = depKey ? (lookups.departmentsByName.get(depKey) ?? null) : null;
    if (depKey && !dep_id)
      errors.push({ row: rowNumber, column: "department_code", message: "القسم غير موجود" });

    const roleRaw = str(raw.role_type);
    let role_type: string | null = null;
    if (roleRaw) {
      const resolved = resolveStaffRoleTypeInput(roleRaw);
      if (resolved.error) {
        errors.push({ row: rowNumber, column: "role_type", message: resolved.error });
      } else if (resolved.legacy) {
        errors.push({
          row: rowNumber,
          column: "role_type",
          message:
            resolved.error ?? "دور قديم — استخدم المفاتيح أو التسميات الوظيفية المعتمدة الجديدة",
        });
      } else {
        role_type = resolved.key;
      }
    }

    if (employee_number) seen.add(employee_number);

    out.push({
      rowNumber,
      raw,
      errors,
      parsed: errors.length
        ? null
        : {
            employee_number,
            full_name_ar,
            full_name_en: str(raw.full_name_en) || null,
            department_id: dep_id,
            job_title: str(raw.job_title) || null,
            role_type,
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
      const { data } = await getImportDb().from("courses").select("code").in("code", chunk);
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
    if (code && seen.has(code))
      errors.push({ row: rowNumber, column: "code", message: "كود مكرر في الملف" });
    if (code && existing.has(code))
      errors.push({ row: rowNumber, column: "code", message: "كود موجود مسبقاً" });

    const name_ar = str(raw.name_ar);
    if (!name_ar)
      errors.push({ row: rowNumber, column: "name_ar", message: "الاسم بالعربية مطلوب" });

    const theory_hours = Number.isFinite(num(raw.theory_hours)) ? num(raw.theory_hours) : 0;
    const practical_hours = Number.isFinite(num(raw.practical_hours))
      ? num(raw.practical_hours)
      : 0;
    if (theory_hours < 0)
      errors.push({ row: rowNumber, column: "theory_hours", message: "قيمة سالبة" });
    if (practical_hours < 0)
      errors.push({ row: rowNumber, column: "practical_hours", message: "قيمة سالبة" });
    // credit_hours is ALWAYS derived: theory + ceil(practical/2). Any uploaded value is ignored.
    const credit_hours = theory_hours + Math.ceil(practical_hours / 2);

    const depKey = normKey(str(raw.department_code));
    const dep_id = depKey ? (lookups.departmentsByName.get(depKey) ?? null) : null;
    if (depKey && !dep_id)
      errors.push({ row: rowNumber, column: "department_code", message: "القسم غير موجود" });

    if (code) seen.add(code);

    out.push({
      rowNumber,
      raw,
      errors,
      parsed: errors.length
        ? null
        : {
            code,
            name_ar,
            name_en: str(raw.name_en) || null,
            credit_hours,
            theory_hours,
            practical_hours,
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
  plan_status: "draft" | "active";
  course_id: string;
  level_id: string;
  semester_code: string;
  is_required: boolean;
  prerequisite_course_id: string | null;
  sort_order: number;
};

// G-07: study_plan_courses.semester_code is stored as-is (no DB CHECK).
// Restrict to canonical codes with Arabic aliases instead of free text.
const STUDY_PLAN_SEMESTER_CODES = new Map<string, string>([
  ["first", "first"],
  ["second", "second"],
  ["summer", "summer"],
  ["الأول", "first"],
  ["الاول", "first"],
  ["فصل أول", "first"],
  ["الثاني", "second"],
  ["فصل ثاني", "second"],
  ["الصيفي", "summer"],
  ["صيفي", "summer"],
  ["1", "first"],
  ["2", "second"],
  ["3", "summer"],
]);

/** G-12: does a prerequisite path already exist from `from` to `to` in the plan graph? */
function prereqPathExists(graph: Map<string, string[]>, from: string, to: string): boolean {
  const stack = [from];
  const visited = new Set<string>();
  while (stack.length) {
    const node = stack.pop()!;
    if (node === to) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    (graph.get(node) ?? []).forEach((n) => stack.push(n));
  }
  return false;
}

export async function validateStudyPlans(
  rows: Record<string, unknown>[],
  lookups: LookupMaps,
): Promise<ValidationResult<StudyPlanRow>> {
  // G-13: one active plan per program — block activating a second version.
  const { data: activePlans } = await getImportDb()
    .from("study_plans")
    .select("program_id, version")
    .eq("is_active", true);
  const activeVersionByProgram = new Map<string, string>();
  (activePlans ?? []).forEach((p: { program_id: string; version: string }) => {
    if (!activeVersionByProgram.has(p.program_id))
      activeVersionByProgram.set(p.program_id, p.version);
  });

  const seen = new Set<string>();
  // MEDIUM-5 (review #193): also track ACTIVE versions seen inside this file —
  // the DB check above passes two different active versions of one program
  // arriving together in the same file.
  const activeVersionInFileByProgram = new Map<string, string>();
  // G-12 pass 1 collects candidate edges; pass 2 (after the loop) evaluates
  // cycles using only rows that are otherwise error-free (LOW-6), so a row
  // that fails for another reason never contributes a false cycle edge.
  const pendingPrereqEdges: Array<{
    outIndex: number;
    planKey: string;
    courseKey: string;
    prereqKey: string;
    rowNumber: number;
  }> = [];
  const out: ValidatedRow<StudyPlanRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];
    const prog = lookups.programsByCode.get(normKey(str(raw.program_code)));
    if (!prog)
      errors.push({ row: rowNumber, column: "program_code", message: "البرنامج غير موجود" });

    const courseCode = str(raw.course_code);
    if (/^IT4XX\(E\)$/i.test(courseCode)) {
      errors.push({
        row: rowNumber,
        column: "course_code",
        message:
          "IT4XX(E) يبدو مقرراً اختيارياً عاماً وليس كود مقرر فعلياً؛ يجب تحديد مقرر اختياري فعلي أو إضافته كمرجع معتمد.",
      });
    }
    const course = lookups.coursesByCode.get(normKey(courseCode));
    if (!course)
      errors.push({
        row: rowNumber,
        column: "course_code",
        message: "المقرر غير موجود في مرجع المقررات",
      });

    const levelKey = normKey(str(raw.level));
    const level_id = lookups.levelsByNumber.get(levelKey) ?? lookups.levelsByName.get(levelKey);
    if (!level_id) errors.push({ row: rowNumber, column: "level", message: "المستوى غير موجود" });

    // G-11: level must not exceed the program's duration in years.
    const planLevelNumber = level_id ? lookups.levelNumberById?.get(level_id) : undefined;
    if (
      level_id &&
      prog &&
      planLevelNumber != null &&
      prog.years != null &&
      planLevelNumber > prog.years
    )
      errors.push({
        row: rowNumber,
        column: "level",
        message: `المستوى يتجاوز عدد سنوات البرنامج (${prog.years})`,
      });

    const plan_name = str(raw.plan_name);
    if (!plan_name)
      errors.push({ row: rowNumber, column: "plan_name", message: "اسم الخطة مطلوب" });
    const version = str(raw.version) || "1.0";
    const planStatusRaw = str(raw.plan_status) || "active";
    const plan_status = planStatusRaw === "draft" ? "draft" : "active";

    // G-13: refuse activating a second plan version for the same program.
    if (prog && plan_status === "active") {
      const activeVersion = activeVersionByProgram.get(prog.id);
      if (activeVersion && normKey(activeVersion) !== normKey(version))
        errors.push({
          row: rowNumber,
          column: "plan_status",
          message: `توجد خطة نشطة أخرى لهذا البرنامج (إصدار ${activeVersion}) — عطّلها أولاً أو استورد كمسودة`,
        });
      // MEDIUM-5: same rule within the file itself.
      const fileActiveVersion = activeVersionInFileByProgram.get(prog.id);
      if (fileActiveVersion && normKey(fileActiveVersion) !== normKey(version)) {
        errors.push({
          row: rowNumber,
          column: "plan_status",
          message: `الملف يحتوي إصداراً نشطاً آخر لنفس البرنامج (${fileActiveVersion}) — إصدار نشط واحد فقط لكل برنامج`,
        });
      } else if (!fileActiveVersion) {
        activeVersionInFileByProgram.set(prog.id, version);
      }
    }

    const preReqCode = str(raw.prerequisite_course_code);
    let prereq_id: string | null = null;
    if (preReqCode) {
      let shouldLookupPrerequisite = true;
      if (normKey(preReqCode) === "all") {
        errors.push({
          row: rowNumber,
          column: "prerequisite_course_code",
          message: "القيمة All ليست كود مقرر؛ ضعها في الملاحظات.",
        });
        shouldLookupPrerequisite = false;
      } else if (/^IT4XX\(E\)$/i.test(preReqCode)) {
        errors.push({
          row: rowNumber,
          column: "prerequisite_course_code",
          message:
            "IT4XX(E) يبدو مقرراً اختيارياً عاماً وليس كود مقرر فعلياً؛ يجب تحديد مقرر اختياري فعلي أو إضافته كمرجع معتمد.",
        });
        shouldLookupPrerequisite = false;
      }
      if (shouldLookupPrerequisite) {
        const p = lookups.coursesByCode.get(normKey(preReqCode));
        if (!p)
          errors.push({
            row: rowNumber,
            column: "prerequisite_course_code",
            message: "المتطلب السابق غير موجود",
          });
        else prereq_id = p.id;
      }
    }

    // G-12: prerequisite coherence — self-reference is rejected inline;
    // cycle detection runs in pass 2 (LOW-6) over otherwise-valid rows only.
    if (course && prereq_id) {
      const courseKey = normKey(courseCode);
      const prereqKey = normKey(preReqCode);
      if (courseKey === prereqKey) {
        errors.push({
          row: rowNumber,
          column: "prerequisite_course_code",
          message: "المقرر لا يمكن أن يكون متطلباً سابقاً لنفسه",
        });
      } else {
        pendingPrereqEdges.push({
          outIndex: out.length,
          planKey: `${prog?.id}|${plan_name}|${version}`,
          courseKey,
          prereqKey,
          rowNumber,
        });
      }
    }

    const dedupKey = `${prog?.id}|${plan_name}|${version}|${course?.id}`;
    if (seen.has(dedupKey)) errors.push({ row: rowNumber, message: "مقرر مكرر داخل الخطة" });
    if (course && prog && plan_name) seen.add(dedupKey);

    const semRaw = str(raw.semester);
    const semester_code = semRaw
      ? (STUDY_PLAN_SEMESTER_CODES.get(normKey(semRaw)) ?? null)
      : "first";
    if (!semester_code)
      errors.push({
        row: rowNumber,
        column: "semester",
        message: "رمز الفصل غير صحيح (first/second/summer)",
      });
    const required = str(raw.required).toLowerCase();
    const is_required =
      required === "" ? true : ["true", "1", "yes", "نعم", "required", "إلزامي"].includes(required);
    const sort_order = Number.isFinite(num(raw.sort_order)) ? num(raw.sort_order) : 0;

    out.push({
      rowNumber,
      raw,
      errors,
      parsed: errors.length
        ? null
        : {
            program_id: prog!.id,
            plan_name,
            version,
            plan_status,
            course_id: course!.id,
            level_id: level_id!,
            semester_code: semester_code ?? "first",
            is_required,
            prerequisite_course_id: prereq_id,
            sort_order,
          },
    });
  });

  // G-12 pass 2 (LOW-6): only rows that are otherwise error-free contribute
  // edges; a cycle is reported on the row that closes it.
  const planPrereqGraphs = new Map<string, Map<string, string[]>>();
  for (const edge of pendingPrereqEdges) {
    const entry = out[edge.outIndex]!;
    if (entry.errors.length > 0) continue;
    let graph = planPrereqGraphs.get(edge.planKey);
    if (!graph) {
      graph = new Map<string, string[]>();
      planPrereqGraphs.set(edge.planKey, graph);
    }
    if (prereqPathExists(graph, edge.prereqKey, edge.courseKey)) {
      entry.errors.push({
        row: edge.rowNumber,
        column: "prerequisite_course_code",
        message: "متطلب سابق يُنشئ دورة داخل الخطة",
      });
      entry.parsed = null;
    } else {
      const list = graph.get(edge.courseKey) ?? [];
      list.push(edge.prereqKey);
      graph.set(edge.courseKey, list);
    }
  }

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
  const { data: existing } = await getImportDb().from("departments").select("id, name_ar");
  const existMap = new Map<string, string>();
  (existing ?? []).forEach((d: { id: string; name_ar: string }) =>
    existMap.set(normKey(d.name_ar), d.id),
  );

  const seen = new Set<string>();
  const out: ValidatedRow<DepartmentRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];
    const code = str(raw.department_code) || str(raw.name_ar) || str(raw.department_name_ar);
    if (!code)
      errors.push({ row: rowNumber, column: "department_code", message: "كود القسم مطلوب" });
    const name_ar = str(raw.department_name_ar) || str(raw.name_ar) || code;
    if (!name_ar)
      errors.push({
        row: rowNumber,
        column: "department_name_ar",
        message: "اسم القسم بالعربية مطلوب",
      });
    if (code && seen.has(normKey(code)))
      errors.push({ row: rowNumber, column: "department_code", message: "كود مكرر في الملف" });
    const existingId = code ? (existMap.get(normKey(code)) ?? null) : null;
    if (code && existingId && !updateExisting) {
      errors.push({
        row: rowNumber,
        column: "department_code",
        message: "القسم موجود مسبقاً (فعّل تحديث القائم)",
      });
    }
    if (code) seen.add(normKey(code));

    out.push({
      rowNumber,
      raw,
      errors,
      parsed: errors.length
        ? null
        : {
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

const VALID_DEGREES = new Set([
  "bachelor",
  "master",
  "phd",
  "diploma",
  "بكالوريوس",
  "ماجستير",
  "دكتوراه",
  "دبلوم",
]);

export async function validatePrograms(
  rows: Record<string, unknown>[],
  lookups: LookupMaps,
  updateExisting = false,
): Promise<ValidationResult<ProgramRow>> {
  const { data: existing } = await getImportDb().from("programs").select("id, code");
  const existMap = new Map<string, string>();
  (existing ?? []).forEach((p: { id: string; code: string }) =>
    existMap.set(normKey(p.code), p.id),
  );

  const seen = new Set<string>();
  const out: ValidatedRow<ProgramRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];
    const code = str(raw.program_code) || str(raw.code);
    if (!code)
      errors.push({ row: rowNumber, column: "program_code", message: "كود البرنامج مطلوب" });
    const name_ar = str(raw.program_name_ar) || str(raw.name_ar);
    if (!name_ar)
      errors.push({
        row: rowNumber,
        column: "program_name_ar",
        message: "اسم البرنامج بالعربية مطلوب",
      });
    if (code && seen.has(normKey(code)))
      errors.push({ row: rowNumber, column: "program_code", message: "كود مكرر في الملف" });

    const depKey = normKey(str(raw.department_code));
    const dep_id = depKey ? (lookups.departmentsByName.get(depKey) ?? null) : null;
    if (!dep_id)
      errors.push({ row: rowNumber, column: "department_code", message: "القسم غير موجود" });

    const degree_type = str(raw.degree_type).toLowerCase();
    if (!degree_type)
      errors.push({ row: rowNumber, column: "degree_type", message: "نوع الدرجة مطلوب" });
    else if (!VALID_DEGREES.has(degree_type))
      errors.push({ row: rowNumber, column: "degree_type", message: "نوع الدرجة غير صحيح" });

    const yearsN = num(raw.duration_years);
    if (!Number.isFinite(yearsN) || yearsN <= 0 || !Number.isInteger(yearsN))
      errors.push({
        row: rowNumber,
        column: "duration_years",
        message: "عدد السنوات يجب أن يكون رقماً صحيحاً موجباً",
      });

    const existingId = code ? (existMap.get(normKey(code)) ?? null) : null;
    if (code && existingId && !updateExisting)
      errors.push({
        row: rowNumber,
        column: "program_code",
        message: "البرنامج موجود مسبقاً (فعّل تحديث القائم)",
      });

    if (code) seen.add(normKey(code));

    out.push({
      rowNumber,
      raw,
      errors,
      parsed: errors.length
        ? null
        : {
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
  const { data: existing } = await getImportDb()
    .from("academic_levels")
    .select("id, level_number, name");
  const existByNumber = new Map<string, string>();
  (existing ?? []).forEach((l: { id: string; level_number: number }) =>
    existByNumber.set(String(l.level_number), l.id),
  );

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
      errors.push({
        row: rowNumber,
        column: "level_number",
        message: "رقم المستوى يجب أن يكون رقماً صحيحاً موجباً",
      });

    if (code && seenCode.has(normKey(code)))
      errors.push({ row: rowNumber, column: "level_code", message: "كود مكرر في الملف" });
    const numKey = String(numN);
    if (Number.isFinite(numN) && seenNum.has(numKey))
      errors.push({ row: rowNumber, column: "level_number", message: "رقم مستوى مكرر في الملف" });

    const existingId = Number.isFinite(numN) ? (existByNumber.get(numKey) ?? null) : null;
    if (existingId && !updateExisting)
      errors.push({
        row: rowNumber,
        column: "level_number",
        message: "المستوى موجود مسبقاً (فعّل تحديث القائم)",
      });

    if (code) seenCode.add(normKey(code));
    if (Number.isFinite(numN)) seenNum.add(numKey);

    out.push({
      rowNumber,
      raw,
      errors,
      parsed: errors.length
        ? null
        : {
            level_code: code,
            name,
            level_number: numN,
            _existingId: existingId,
          },
    });
  });
  return summarize(out);
}

// =========================
// Course sections (المجموعات)
// =========================
export type CourseSectionRow = {
  course_id: string;
  academic_year_id: string;
  semester_id: string;
  program_id: string;
  level_id: string;
  section_code: string;
  study_system: "general" | "private" | "both";
  faculty_profile_id: string | null;
  capacity: number | null;
  status: string;
  course_offering_id: string | null;
  _existingId: string | null;
  _needsOffering: boolean;
};

const SECTION_STATUSES = new Set(["active", "closed", "cancelled", "inactive"]);

function offeringKey(courseId: string, ayId: string, semId: string, progId: string, lvlId: string) {
  return `${courseId}|${ayId}|${semId}|${progId}|${lvlId}`;
}

export async function validateCourseSections(
  rows: Record<string, unknown>[],
  lookups: LookupMaps,
  updateExisting = false,
): Promise<ValidationResult<CourseSectionRow>> {
  // G-01: was bare `sb` (unresolved identifier → runtime ReferenceError).
  const sb = getImportDb();
  const [{ data: offerings }, { data: sections }, { data: faculty }] = await Promise.all([
    sb
      .from("course_offerings")
      .select("id, course_id, academic_year_id, semester_id, program_id, level_id"),
    sb.from("course_sections").select("id, course_offering_id, section_code"),
    sb.from("faculty_profiles").select("id, employee_number"),
  ]);

  const offeringByKey = new Map<string, string>();
  (offerings ?? []).forEach(
    (o: {
      id: string;
      course_id: string;
      academic_year_id: string;
      semester_id: string;
      program_id: string;
      level_id: string;
    }) => {
      offeringByKey.set(
        offeringKey(o.course_id, o.academic_year_id, o.semester_id, o.program_id, o.level_id),
        o.id,
      );
    },
  );

  const sectionByOfferingCode = new Map<string, { id: string }>();
  (sections ?? []).forEach(
    (s: { id: string; course_offering_id: string; section_code: string }) => {
      sectionByOfferingCode.set(`${s.course_offering_id}|${normKey(s.section_code)}`, { id: s.id });
    },
  );

  const facultyByEmp = new Map<string, string>();
  (faculty ?? []).forEach((f: { id: string; employee_number: string | null }) => {
    if (f.employee_number) facultyByEmp.set(normKey(f.employee_number), f.id);
  });

  const seenInFile = new Set<string>();
  const out: ValidatedRow<CourseSectionRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];

    const course = lookups.coursesByCode.get(normKey(str(raw.course_code)));
    if (!course)
      errors.push({ row: rowNumber, column: "course_code", message: "المقرر غير موجود" });

    const ay_id = lookups.academicYearsByName.get(normKey(str(raw.academic_year)));
    if (!ay_id)
      errors.push({
        row: rowNumber,
        column: "academic_year",
        message: "السنة الأكاديمية غير موجودة",
      });

    const semKey = normKey(str(raw.semester));
    const sem_id = resolveSemesterId(lookups, ay_id, semKey);
    if (ay_id && !sem_id)
      errors.push({ row: rowNumber, column: "semester", message: SEMESTER_YEAR_ERROR_AR });

    const prog = lookups.programsByCode.get(normKey(str(raw.program_code)));
    if (!prog)
      errors.push({ row: rowNumber, column: "program_code", message: "البرنامج غير موجود" });

    const levelKey = normKey(str(raw.level));
    const level_id = lookups.levelsByNumber.get(levelKey) ?? lookups.levelsByName.get(levelKey);
    if (!level_id) errors.push({ row: rowNumber, column: "level", message: "المستوى غير موجود" });

    // G-11: level must not exceed the program's duration in years.
    const sectionLevelNumber = level_id ? lookups.levelNumberById?.get(level_id) : undefined;
    if (
      level_id &&
      prog &&
      sectionLevelNumber != null &&
      prog.years != null &&
      sectionLevelNumber > prog.years
    )
      errors.push({
        row: rowNumber,
        column: "level",
        message: `المستوى يتجاوز عدد سنوات البرنامج (${prog.years})`,
      });

    const section_code = str(raw.section_code).toUpperCase();
    if (!section_code)
      errors.push({ row: rowNumber, column: "section_code", message: "رمز المجموعة مطلوب" });

    // نظام الدراسة للمجموعة هو مصدر الحقيقة لنظام دراسة المواد التعليمية.
    const studySystemRaw = str(raw.study_system);
    const study_system = normalizeStudySystemTag(studySystemRaw);
    if (!studySystemRaw)
      errors.push({ row: rowNumber, column: "study_system", message: "نظام الدراسة مطلوب (عام / نفقة خاصة / كلا النظامين)" });
    else if (!study_system)
      errors.push({ row: rowNumber, column: "study_system", message: "نظام الدراسة غير معروف (عام / نفقة خاصة / كلا النظامين)" });

    const status = str(raw.status) || "active";
    if (!SECTION_STATUSES.has(status))
      errors.push({
        row: rowNumber,
        column: "status",
        message: "الحالة غير صحيحة (active/closed/cancelled/inactive)",
      });

    let faculty_profile_id: string | null = null;
    const empNum = str(raw.faculty_employee_number);
    if (empNum) {
      faculty_profile_id = facultyByEmp.get(normKey(empNum)) ?? null;
      if (!faculty_profile_id)
        errors.push({
          row: rowNumber,
          column: "faculty_employee_number",
          message: "عضو هيئة التدريس غير موجود",
        });
    }

    let capacity: number | null = null;
    const capRaw = raw.capacity;
    if (capRaw !== null && capRaw !== undefined && str(capRaw) !== "") {
      const capN = num(capRaw);
      if (!Number.isFinite(capN) || capN < 0 || !Number.isInteger(capN))
        errors.push({
          row: rowNumber,
          column: "capacity",
          message: "السعة يجب أن تكون رقماً صحيحاً >= 0",
        });
      else capacity = capN;
    }

    let course_offering_id: string | null = null;
    let _needsOffering = false;
    let _existingId: string | null = null;

    if (course && ay_id && sem_id && prog && level_id && section_code) {
      const oKey = offeringKey(course.id, ay_id, sem_id, prog.id, level_id);
      course_offering_id = offeringByKey.get(oKey) ?? null;
      _needsOffering = !course_offering_id;

      const fileKey = `${oKey}|${normKey(section_code)}`;
      if (seenInFile.has(fileKey))
        errors.push({
          row: rowNumber,
          column: "section_code",
          message: "رمز مجموعة مكرر في الملف لنفس إسناد المقرر",
        });
      else seenInFile.add(fileKey);

      if (course_offering_id) {
        const existing = sectionByOfferingCode.get(
          `${course_offering_id}|${normKey(section_code)}`,
        );
        _existingId = existing?.id ?? null;
        if (_existingId && !updateExisting) {
          errors.push({
            row: rowNumber,
            column: "section_code",
            message: "المجموعة موجودة مسبقاً (فعّل تحديث القائم)",
          });
        }
      }
    }

    out.push({
      rowNumber,
      raw,
      errors,
      parsed: errors.length
        ? null
        : {
            course_id: course!.id,
            academic_year_id: ay_id!,
            semester_id: sem_id!,
            program_id: prog!.id,
            level_id: level_id!,
            section_code,
            study_system: study_system!,
            faculty_profile_id,
            capacity,
            status,
            course_offering_id,
            _existingId,
            _needsOffering,
          },
    });
  });

  return summarize(out);
}

// =========================
// Student enrollments
// =========================
export type StudentEnrollmentRow = {
  student_profile_id: string;
  course_section_id: string;
  enrollment_status: string;
  _existingId: string | null;
};

const ENROLLMENT_STATUSES = new Set(["enrolled", "dropped", "completed"]);

function enrollmentOfferingKey(
  courseId: string,
  ayId: string,
  semId: string,
  progId: string,
  lvlId: string,
) {
  return `${courseId}|${ayId}|${semId}|${progId}|${lvlId}`;
}

export async function validateStudentEnrollments(
  rows: Record<string, unknown>[],
  lookups: LookupMaps,
  updateExisting = false,
): Promise<ValidationResult<StudentEnrollmentRow>> {
  // G-01: was bare `sb` (unresolved identifier → runtime ReferenceError).
  const sb = getImportDb();
  const acNumbers = rows.map((r) => str(r.academic_number)).filter(Boolean);
  const studentByAc = new Map<string, { id: string; program_id: string | null }>();
  if (acNumbers.length) {
    for (let i = 0; i < acNumbers.length; i += 500) {
      const chunk = acNumbers.slice(i, i + 500);
      const { data } = await sb
        .from("student_profiles")
        .select("id, academic_number, program_id")
        .in("academic_number", chunk);
      (data ?? []).forEach(
        (s: { id: string; academic_number: string; program_id: string | null }) => {
          studentByAc.set(normKey(s.academic_number), { id: s.id, program_id: s.program_id });
        },
      );
    }
  }

  const [
    { data: statuses },
    { data: offerings },
    { data: sections },
    { data: existingEnrollments },
  ] = await Promise.all([
    sb
      .from("student_academic_status")
      .select("student_profile_id, academic_year_id, semester_id, level_id"),
    sb
      .from("course_offerings")
      .select("id, course_id, academic_year_id, semester_id, program_id, level_id"),
    sb.from("course_sections").select("id, course_offering_id, section_code, status"),
    sb.from("student_enrollments").select("id, student_profile_id, course_section_id"),
  ]);

  const levelByStudentTerm = new Map<string, string>();
  (statuses ?? []).forEach(
    (s: {
      student_profile_id: string;
      academic_year_id: string;
      semester_id: string;
      level_id: string;
    }) => {
      levelByStudentTerm.set(
        `${s.student_profile_id}|${s.academic_year_id}|${s.semester_id}`,
        s.level_id,
      );
    },
  );

  const offeringByKey = new Map<string, string>();
  (offerings ?? []).forEach(
    (o: {
      id: string;
      course_id: string;
      academic_year_id: string;
      semester_id: string;
      program_id: string;
      level_id: string;
    }) => {
      offeringByKey.set(
        enrollmentOfferingKey(
          o.course_id,
          o.academic_year_id,
          o.semester_id,
          o.program_id,
          o.level_id,
        ),
        o.id,
      );
    },
  );

  const sectionByOfferingCode = new Map<string, { id: string; status: string }>();
  (sections ?? []).forEach(
    (s: { id: string; course_offering_id: string; section_code: string; status: string }) => {
      sectionByOfferingCode.set(`${s.course_offering_id}|${normKey(s.section_code)}`, {
        id: s.id,
        status: s.status,
      });
    },
  );

  const enrollmentByStudentSection = new Map<string, string>();
  (existingEnrollments ?? []).forEach(
    (e: { id: string; student_profile_id: string; course_section_id: string }) => {
      enrollmentByStudentSection.set(`${e.student_profile_id}|${e.course_section_id}`, e.id);
    },
  );

  const seenInFile = new Set<string>();
  const out: ValidatedRow<StudentEnrollmentRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];

    const academic_number = str(raw.academic_number);
    if (!academic_number)
      errors.push({ row: rowNumber, column: "academic_number", message: "الرقم الأكاديمي مطلوب" });
    const student = academic_number ? (studentByAc.get(normKey(academic_number)) ?? null) : null;
    if (academic_number && !student)
      errors.push({ row: rowNumber, column: "academic_number", message: "الطالب غير موجود" });
    if (student && !student.program_id)
      errors.push({
        row: rowNumber,
        column: "academic_number",
        message: "الطالب بلا برنامج دراسي مسجل",
      });

    const course = lookups.coursesByCode.get(normKey(str(raw.course_code)));
    if (!course)
      errors.push({ row: rowNumber, column: "course_code", message: "المقرر غير موجود" });

    const ay_id = lookups.academicYearsByName.get(normKey(str(raw.academic_year)));
    if (!ay_id)
      errors.push({
        row: rowNumber,
        column: "academic_year",
        message: "السنة الأكاديمية غير موجودة",
      });

    const semKey = normKey(str(raw.semester));
    const sem_id = resolveSemesterId(lookups, ay_id, semKey);
    if (ay_id && !sem_id)
      errors.push({ row: rowNumber, column: "semester", message: SEMESTER_YEAR_ERROR_AR });

    const section_code = str(raw.section_code).toUpperCase();
    if (!section_code)
      errors.push({ row: rowNumber, column: "section_code", message: "رمز المجموعة مطلوب" });

    const enrollment_status = str(raw.enrollment_status) || "enrolled";
    if (!ENROLLMENT_STATUSES.has(enrollment_status))
      errors.push({
        row: rowNumber,
        column: "enrollment_status",
        message: "حالة التسجيل غير صحيحة (enrolled/dropped/completed)",
      });

    let course_section_id: string | null = null;
    let _existingId: string | null = null;

    if (student && course && ay_id && sem_id && section_code && student.program_id) {
      const level_id = levelByStudentTerm.get(`${student.id}|${ay_id}|${sem_id}`);
      if (!level_id) {
        errors.push({
          row: rowNumber,
          column: "academic_year",
          message: "لا توجد حالة أكاديمية للطالب في هذا الفصل",
        });
      } else {
        const oKey = enrollmentOfferingKey(course.id, ay_id, sem_id, student.program_id, level_id);
        const offeringId = offeringByKey.get(oKey);
        if (!offeringId) {
          errors.push({
            row: rowNumber,
            column: "course_code",
            message: "لا يوجد إسناد مقرر مطابق لبرنامج ومستوى الطالب",
          });
        } else {
          const sec = sectionByOfferingCode.get(`${offeringId}|${normKey(section_code)}`);
          if (!sec) {
            errors.push({
              row: rowNumber,
              column: "section_code",
              message: "المجموعة غير موجودة لهذا الإسناد",
            });
          } else if (sec.status !== "active") {
            errors.push({ row: rowNumber, column: "section_code", message: "المجموعة غير نشطة" });
          } else {
            course_section_id = sec.id;
          }
        }
      }
    }

    if (student && course_section_id) {
      const fileKey = `${student.id}|${course_section_id}`;
      if (seenInFile.has(fileKey))
        errors.push({
          row: rowNumber,
          column: "academic_number",
          message: "تسجيل مكرر في الملف لنفس الطالب والمجموعة",
        });
      else seenInFile.add(fileKey);

      _existingId = enrollmentByStudentSection.get(fileKey) ?? null;
      if (_existingId && !updateExisting) {
        errors.push({
          row: rowNumber,
          column: "academic_number",
          message: "التسجيل موجود مسبقاً (فعّل تحديث القائم)",
        });
      }
    }

    out.push({
      rowNumber,
      raw,
      errors,
      parsed: errors.length
        ? null
        : {
            student_profile_id: student!.id,
            course_section_id: course_section_id!,
            enrollment_status,
            _existingId,
          },
    });
  });

  return summarize(out);
}

// =========================
// Student grades
// =========================
export type StudentGradeRow = {
  student_enrollment_id: string;
  grade_component_id: string;
  score: number;
  status: string;
  _existingId: string | null;
};

const GRADE_STATUSES = new Set(["draft", "submitted", "approved"]);

export async function validateStudentGrades(
  rows: Record<string, unknown>[],
  lookups: LookupMaps,
  updateExisting = false,
): Promise<ValidationResult<StudentGradeRow>> {
  // G-01: was bare `sb` (unresolved identifier → runtime ReferenceError).
  const sb = getImportDb();
  const acNumbers = rows.map((r) => str(r.academic_number)).filter(Boolean);
  const studentByAc = new Map<string, { id: string; program_id: string | null }>();
  if (acNumbers.length) {
    for (let i = 0; i < acNumbers.length; i += 500) {
      const chunk = acNumbers.slice(i, i + 500);
      const { data } = await sb
        .from("student_profiles")
        .select("id, academic_number, program_id")
        .in("academic_number", chunk);
      (data ?? []).forEach(
        (s: { id: string; academic_number: string; program_id: string | null }) => {
          studentByAc.set(normKey(s.academic_number), { id: s.id, program_id: s.program_id });
        },
      );
    }
  }

  const [
    { data: statuses },
    { data: offerings },
    { data: sections },
    { data: enrollments },
    { data: components },
    { data: grades },
  ] = await Promise.all([
    sb
      .from("student_academic_status")
      .select("student_profile_id, academic_year_id, semester_id, level_id"),
    sb
      .from("course_offerings")
      .select("id, course_id, academic_year_id, semester_id, program_id, level_id"),
    sb.from("course_sections").select("id, course_offering_id, section_code"),
    sb
      .from("student_enrollments")
      .select("id, student_profile_id, course_section_id, enrollment_status"),
    sb.from("grade_components").select("id, course_section_id, name, max_score"),
    sb.from("student_grades").select("id, student_enrollment_id, grade_component_id, status"),
  ]);

  const levelByStudentTerm = new Map<string, string>();
  (statuses ?? []).forEach(
    (s: {
      student_profile_id: string;
      academic_year_id: string;
      semester_id: string;
      level_id: string;
    }) => {
      levelByStudentTerm.set(
        `${s.student_profile_id}|${s.academic_year_id}|${s.semester_id}`,
        s.level_id,
      );
    },
  );

  const offeringByKey = new Map<string, string>();
  (offerings ?? []).forEach(
    (o: {
      id: string;
      course_id: string;
      academic_year_id: string;
      semester_id: string;
      program_id: string;
      level_id: string;
    }) => {
      offeringByKey.set(
        enrollmentOfferingKey(
          o.course_id,
          o.academic_year_id,
          o.semester_id,
          o.program_id,
          o.level_id,
        ),
        o.id,
      );
    },
  );

  const sectionByOfferingCode = new Map<string, string>();
  (sections ?? []).forEach(
    (s: { id: string; course_offering_id: string; section_code: string }) => {
      sectionByOfferingCode.set(`${s.course_offering_id}|${normKey(s.section_code)}`, s.id);
    },
  );

  const enrollmentByStudentSection = new Map<string, { id: string; status: string }>();
  (enrollments ?? []).forEach(
    (e: {
      id: string;
      student_profile_id: string;
      course_section_id: string;
      enrollment_status: string;
    }) => {
      enrollmentByStudentSection.set(`${e.student_profile_id}|${e.course_section_id}`, {
        id: e.id,
        status: e.enrollment_status,
      });
    },
  );

  const componentBySectionName = new Map<string, { id: string; max_score: number }>();
  (components ?? []).forEach(
    (c: { id: string; course_section_id: string; name: string; max_score: number }) => {
      componentBySectionName.set(`${c.course_section_id}|${normKey(c.name)}`, {
        id: c.id,
        max_score: c.max_score,
      });
    },
  );

  const gradeByEnrollmentComponent = new Map<string, string>();
  (grades ?? []).forEach(
    (g: { id: string; student_enrollment_id: string; grade_component_id: string }) => {
      gradeByEnrollmentComponent.set(`${g.student_enrollment_id}|${g.grade_component_id}`, g.id);
    },
  );

  const seenInFile = new Set<string>();
  const out: ValidatedRow<StudentGradeRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];

    const academic_number = str(raw.academic_number);
    if (!academic_number)
      errors.push({ row: rowNumber, column: "academic_number", message: "الرقم الأكاديمي مطلوب" });
    const student = academic_number ? (studentByAc.get(normKey(academic_number)) ?? null) : null;
    if (academic_number && !student)
      errors.push({ row: rowNumber, column: "academic_number", message: "الطالب غير موجود" });
    if (student && !student.program_id)
      errors.push({
        row: rowNumber,
        column: "academic_number",
        message: "الطالب بلا برنامج دراسي مسجل",
      });

    const course = lookups.coursesByCode.get(normKey(str(raw.course_code)));
    if (!course)
      errors.push({ row: rowNumber, column: "course_code", message: "المقرر غير موجود" });

    const ay_id = lookups.academicYearsByName.get(normKey(str(raw.academic_year)));
    if (!ay_id)
      errors.push({
        row: rowNumber,
        column: "academic_year",
        message: "السنة الأكاديمية غير موجودة",
      });

    const semKey = normKey(str(raw.semester));
    const sem_id = resolveSemesterId(lookups, ay_id, semKey);
    if (ay_id && !sem_id)
      errors.push({ row: rowNumber, column: "semester", message: SEMESTER_YEAR_ERROR_AR });

    const section_code = str(raw.section_code).toUpperCase();
    if (!section_code)
      errors.push({ row: rowNumber, column: "section_code", message: "رمز المجموعة مطلوب" });

    const component_name = str(raw.component_name);
    if (!component_name)
      errors.push({ row: rowNumber, column: "component_name", message: "اسم مكوّن التقييم مطلوب" });

    const scoreN = num(raw.score);
    if (!Number.isFinite(scoreN) || scoreN < 0)
      errors.push({ row: rowNumber, column: "score", message: "الدرجة يجب أن تكون رقماً >= 0" });

    const status = str(raw.status) || "submitted";
    if (!GRADE_STATUSES.has(status))
      errors.push({
        row: rowNumber,
        column: "status",
        message: "الحالة غير صحيحة (draft/submitted/approved)",
      });

    let course_section_id: string | null = null;
    let student_enrollment_id: string | null = null;
    let grade_component_id: string | null = null;
    let _existingId: string | null = null;

    if (student && course && ay_id && sem_id && section_code && student.program_id) {
      const level_id = levelByStudentTerm.get(`${student.id}|${ay_id}|${sem_id}`);
      if (!level_id) {
        errors.push({
          row: rowNumber,
          column: "academic_year",
          message: "لا توجد حالة أكاديمية للطالب في هذا الفصل",
        });
      } else {
        const oKey = enrollmentOfferingKey(course.id, ay_id, sem_id, student.program_id, level_id);
        const offeringId = offeringByKey.get(oKey);
        if (!offeringId) {
          errors.push({
            row: rowNumber,
            column: "course_code",
            message: "لا يوجد إسناد مقرر مطابق لبرنامج ومستوى الطالب",
          });
        } else {
          course_section_id =
            sectionByOfferingCode.get(`${offeringId}|${normKey(section_code)}`) ?? null;
          if (!course_section_id) {
            errors.push({
              row: rowNumber,
              column: "section_code",
              message: "المجموعة غير موجودة لهذا الإسناد",
            });
          }
        }
      }
    }

    if (student && course_section_id) {
      const enr = enrollmentByStudentSection.get(`${student.id}|${course_section_id}`);
      if (!enr) {
        errors.push({
          row: rowNumber,
          column: "academic_number",
          message: "الطالب غير مسجل في هذه المجموعة",
        });
      } else if (enr.status === "dropped") {
        errors.push({
          row: rowNumber,
          column: "academic_number",
          message: "تسجيل الطالب محذوف — لا يمكن إدخال درجة",
        });
      } else {
        student_enrollment_id = enr.id;
      }
    }

    if (course_section_id && component_name) {
      const comp = componentBySectionName.get(`${course_section_id}|${normKey(component_name)}`);
      if (!comp) {
        errors.push({
          row: rowNumber,
          column: "component_name",
          message: "مكوّن التقييم غير موجود لهذه المجموعة",
        });
      } else {
        grade_component_id = comp.id;
        if (Number.isFinite(scoreN) && scoreN > comp.max_score) {
          errors.push({
            row: rowNumber,
            column: "score",
            message: `الدرجة ${scoreN} تتجاوز الحد الأقصى ${comp.max_score} لمكوّن «${component_name}»`,
          });
        }
      }
    }

    if (student_enrollment_id && grade_component_id) {
      const fileKey = `${student_enrollment_id}|${grade_component_id}`;
      if (seenInFile.has(fileKey))
        errors.push({
          row: rowNumber,
          column: "component_name",
          message: "درجة مكررة في الملف لنفس الطالب والمكوّن",
        });
      else seenInFile.add(fileKey);

      _existingId = gradeByEnrollmentComponent.get(fileKey) ?? null;
      if (_existingId && !updateExisting) {
        errors.push({
          row: rowNumber,
          column: "component_name",
          message: "الدرجة موجودة مسبقاً (فعّل تحديث القائم)",
        });
      }
    }

    out.push({
      rowNumber,
      raw,
      errors,
      parsed: errors.length
        ? null
        : {
            student_enrollment_id: student_enrollment_id!,
            grade_component_id: grade_component_id!,
            score: scoreN,
            status,
            _existingId,
          },
    });
  });

  return summarize(out);
}

// =========================
// Student academic status (G-05 — term progression)
// =========================
export type StudentAcademicStatusRow = {
  student_profile_id: string;
  academic_year_id: string;
  semester_id: string;
  level_id: string;
  enrollment_status: string;
  _existingId: string | null;
};

const ACADEMIC_ENROLLMENT_STATUSES = new Set([
  "enrolled",
  "active",
  "suspended",
  "graduated",
  "withdrawn",
  "transferred",
  "completed",
]);

export async function validateStudentAcademicStatus(
  rows: Record<string, unknown>[],
  lookups: LookupMaps,
  updateExisting = false,
): Promise<ValidationResult<StudentAcademicStatusRow>> {
  const sb = getImportDb();
  const acNumbers = rows.map((r) => str(r.academic_number)).filter(Boolean);
  const studentByAc = new Map<string, { id: string; program_id: string | null }>();
  if (acNumbers.length) {
    for (let i = 0; i < acNumbers.length; i += 500) {
      const chunk = acNumbers.slice(i, i + 500);
      const { data } = await sb
        .from("student_profiles")
        .select("id, academic_number, program_id")
        .in("academic_number", chunk);
      (data ?? []).forEach(
        (s: { id: string; academic_number: string; program_id: string | null }) => {
          studentByAc.set(normKey(s.academic_number), { id: s.id, program_id: s.program_id });
        },
      );
    }
  }

  const { data: existingStatuses } = await sb
    .from("student_academic_status")
    .select("id, student_profile_id, academic_year_id, semester_id");
  const statusIdByKey = new Map<string, string>();
  (existingStatuses ?? []).forEach(
    (s: {
      id: string;
      student_profile_id: string;
      academic_year_id: string;
      semester_id: string;
    }) => {
      statusIdByKey.set(`${s.student_profile_id}|${s.academic_year_id}|${s.semester_id}`, s.id);
    },
  );

  const seenInFile = new Set<string>();
  const out: ValidatedRow<StudentAcademicStatusRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];

    const academic_number = str(raw.academic_number);
    if (!academic_number)
      errors.push({ row: rowNumber, column: "academic_number", message: "الرقم الأكاديمي مطلوب" });
    const student = academic_number ? (studentByAc.get(normKey(academic_number)) ?? null) : null;
    if (academic_number && !student)
      errors.push({ row: rowNumber, column: "academic_number", message: "الطالب غير موجود" });

    const ay_id = lookups.academicYearsByName.get(normKey(str(raw.academic_year)));
    if (!ay_id)
      errors.push({
        row: rowNumber,
        column: "academic_year",
        message: "السنة الأكاديمية غير موجودة",
      });

    // G-02: semester resolved strictly within the row's academic year.
    const semKey = normKey(str(raw.semester));
    const sem_id = resolveSemesterId(lookups, ay_id, semKey);
    if (ay_id && !sem_id)
      errors.push({ row: rowNumber, column: "semester", message: SEMESTER_YEAR_ERROR_AR });

    // Accept `academic_level` (canonical) and `level` (legacy) as fallback
    const levelRaw = str(raw.academic_level) || str(raw.level);
    const levelKey = normKey(levelRaw);
    const level_id = lookups.levelsByNumber.get(levelKey) ?? lookups.levelsByName.get(levelKey);
    if (!level_id)
      errors.push({ row: rowNumber, column: "academic_level", message: "المستوى غير موجود" });

    // G-11: level must not exceed the student's program duration in years.
    const statusLevelNumber = level_id ? lookups.levelNumberById?.get(level_id) : undefined;
    const progYears = student?.program_id
      ? lookups.programYearsById?.get(student.program_id)
      : undefined;
    if (level_id && statusLevelNumber != null && progYears != null && statusLevelNumber > progYears)
      errors.push({
        row: rowNumber,
        column: "academic_level",
        message: `المستوى يتجاوز عدد سنوات البرنامج (${progYears})`,
      });

    const enrollment_status = str(raw.enrollment_status) || "enrolled";
    if (!ACADEMIC_ENROLLMENT_STATUSES.has(enrollment_status))
      errors.push({
        row: rowNumber,
        column: "enrollment_status",
        message:
          "حالة القيد غير صحيحة (enrolled/active/suspended/graduated/withdrawn/transferred/completed)",
      });

    let _existingId: string | null = null;
    if (student && ay_id && sem_id) {
      const key = `${student.id}|${ay_id}|${sem_id}`;
      if (seenInFile.has(key))
        errors.push({
          row: rowNumber,
          column: "academic_number",
          message: "حالة أكاديمية مكررة في الملف لنفس الطالب والفصل",
        });
      else seenInFile.add(key);

      _existingId = statusIdByKey.get(key) ?? null;
      if (_existingId && !updateExisting) {
        errors.push({
          row: rowNumber,
          column: "academic_number",
          message: "الحالة الأكاديمية موجودة مسبقاً لهذا الفصل (فعّل تحديث القائم)",
        });
      }
    }

    out.push({
      rowNumber,
      raw,
      errors,
      parsed: errors.length
        ? null
        : {
            student_profile_id: student!.id,
            academic_year_id: ay_id!,
            semester_id: sem_id!,
            level_id: level_id!,
            enrollment_status,
            _existingId,
          },
    });
  });

  return summarize(out);
}

// =========================
// Student fees
// =========================
export type StudentFeeRow = {
  student_profile_id: string;
  fee_type_id: string;
  academic_year_id: string;
  semester_id: string;
  amount: number;
  status: string;
  notes: string | null;
  _existingId: string | null;
};

const FEE_STATUSES = new Set(["pending", "partially_paid", "paid", "cancelled"]);

function parseDueDateNote(dueRaw: unknown): { valid: boolean; note: string | null } {
  const s = str(dueRaw);
  if (!s) return { valid: true, note: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { valid: false, note: null };
  return { valid: true, note: `تاريخ الاستحقاق: ${s}` };
}

export async function validateStudentFees(
  rows: Record<string, unknown>[],
  lookups: LookupMaps,
  updateExisting = false,
): Promise<ValidationResult<StudentFeeRow>> {
  // G-01: was bare `sb` (unresolved identifier → runtime ReferenceError).
  const sb = getImportDb();
  const acNumbers = rows.map((r) => str(r.academic_number)).filter(Boolean);
  const studentByAc = new Map<string, string>();
  if (acNumbers.length) {
    for (let i = 0; i < acNumbers.length; i += 500) {
      const chunk = acNumbers.slice(i, i + 500);
      const { data } = await sb
        .from("student_profiles")
        .select("id, academic_number")
        .in("academic_number", chunk);
      (data ?? []).forEach((s: { id: string; academic_number: string }) => {
        studentByAc.set(normKey(s.academic_number), s.id);
      });
    }
  }

  const [{ data: feeTypes }, { data: existingFees }] = await Promise.all([
    sb.from("fee_types").select("id, code, is_active"),
    sb
      .from("student_fees")
      .select("id, student_profile_id, fee_type_id, academic_year_id, semester_id"),
  ]);

  const feeTypeByCode = new Map<string, string>();
  (feeTypes ?? []).forEach((f: { id: string; code: string; is_active: boolean }) => {
    if (f.code && f.is_active) feeTypeByCode.set(normKey(f.code), f.id);
  });

  const feeByKey = new Map<string, string>();
  (existingFees ?? []).forEach(
    (f: {
      id: string;
      student_profile_id: string;
      fee_type_id: string;
      academic_year_id: string;
      semester_id: string;
    }) => {
      feeByKey.set(
        `${f.student_profile_id}|${f.fee_type_id}|${f.academic_year_id}|${f.semester_id}`,
        f.id,
      );
    },
  );

  const seenInFile = new Set<string>();
  const out: ValidatedRow<StudentFeeRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];

    const academic_number = str(raw.academic_number);
    if (!academic_number)
      errors.push({ row: rowNumber, column: "academic_number", message: "الرقم الأكاديمي مطلوب" });
    const student_id = academic_number ? (studentByAc.get(normKey(academic_number)) ?? null) : null;
    if (academic_number && !student_id)
      errors.push({ row: rowNumber, column: "academic_number", message: "الطالب غير موجود" });

    const fee_type_code = str(raw.fee_type_code);
    if (!fee_type_code)
      errors.push({ row: rowNumber, column: "fee_type_code", message: "كود نوع الرسم مطلوب" });
    const fee_type_id = fee_type_code ? (feeTypeByCode.get(normKey(fee_type_code)) ?? null) : null;
    if (fee_type_code && !fee_type_id)
      errors.push({
        row: rowNumber,
        column: "fee_type_code",
        message: "نوع الرسم غير موجود أو غير نشط",
      });

    const ay_id = lookups.academicYearsByName.get(normKey(str(raw.academic_year)));
    if (!ay_id)
      errors.push({
        row: rowNumber,
        column: "academic_year",
        message: "السنة الأكاديمية غير موجودة",
      });

    const semKey = normKey(str(raw.semester));
    const sem_id = resolveSemesterId(lookups, ay_id, semKey);
    if (ay_id && !sem_id)
      errors.push({ row: rowNumber, column: "semester", message: SEMESTER_YEAR_ERROR_AR });

    const amountN = num(raw.amount);
    if (!Number.isFinite(amountN) || amountN < 0)
      errors.push({ row: rowNumber, column: "amount", message: "المبلغ يجب أن يكون رقماً >= 0" });

    const status = str(raw.status) || "pending";
    if (!FEE_STATUSES.has(status))
      errors.push({
        row: rowNumber,
        column: "status",
        message: "الحالة غير صحيحة (pending/partially_paid/paid/cancelled)",
      });

    const due = parseDueDateNote(raw.due_date);
    if (!due.valid)
      errors.push({
        row: rowNumber,
        column: "due_date",
        message: "تاريخ الاستحقاق بصيغة YYYY-MM-DD",
      });

    let _existingId: string | null = null;
    if (student_id && fee_type_id && ay_id && sem_id) {
      const fileKey = `${student_id}|${fee_type_id}|${ay_id}|${sem_id}`;
      if (seenInFile.has(fileKey))
        errors.push({
          row: rowNumber,
          column: "academic_number",
          message: "رسم مكرر في الملف لنفس الطالب والنوع والفصل",
        });
      else seenInFile.add(fileKey);

      _existingId = feeByKey.get(fileKey) ?? null;
      if (_existingId && !updateExisting) {
        errors.push({
          row: rowNumber,
          column: "academic_number",
          message: "الرسم موجود مسبقاً (فعّل تحديث القائم)",
        });
      }
    }

    out.push({
      rowNumber,
      raw,
      errors,
      parsed: errors.length
        ? null
        : {
            student_profile_id: student_id!,
            fee_type_id: fee_type_id!,
            academic_year_id: ay_id!,
            semester_id: sem_id!,
            amount: amountN,
            status,
            notes: due.note,
            _existingId,
          },
    });
  });

  return summarize(out);
}

// =========================
// Student discounts
// =========================
export type StudentDiscountRow = {
  student_profile_id: string;
  discount_type_id: string;
  academic_year_id: string;
  semester_id: string;
  value: number;
  status: string;
  notes: string | null;
  _existingId: string | null;
};

const DISCOUNT_STATUSES = new Set(["active", "inactive", "cancelled"]);

export async function validateStudentDiscounts(
  rows: Record<string, unknown>[],
  lookups: LookupMaps,
  updateExisting = false,
): Promise<ValidationResult<StudentDiscountRow>> {
  // G-01: was bare `sb` (unresolved identifier → runtime ReferenceError).
  const sb = getImportDb();
  const acNumbers = rows.map((r) => str(r.academic_number)).filter(Boolean);
  const studentByAc = new Map<string, string>();
  if (acNumbers.length) {
    for (let i = 0; i < acNumbers.length; i += 500) {
      const chunk = acNumbers.slice(i, i + 500);
      const { data } = await sb
        .from("student_profiles")
        .select("id, academic_number")
        .in("academic_number", chunk);
      (data ?? []).forEach((s: { id: string; academic_number: string }) => {
        studentByAc.set(normKey(s.academic_number), s.id);
      });
    }
  }

  const [{ data: discountTypes }, { data: existing }] = await Promise.all([
    sb.from("discount_types").select("id, code, discount_type, is_active"),
    sb
      .from("student_discounts")
      .select("id, student_profile_id, discount_type_id, academic_year_id, semester_id"),
  ]);

  const typeByCode = new Map<string, { id: string; discount_type: string }>();
  (discountTypes ?? []).forEach(
    (d: { id: string; code: string; discount_type: string; is_active: boolean }) => {
      if (d.code && d.is_active)
        typeByCode.set(normKey(d.code), { id: d.id, discount_type: d.discount_type });
    },
  );

  const discountByKey = new Map<string, string>();
  (existing ?? []).forEach(
    (d: {
      id: string;
      student_profile_id: string;
      discount_type_id: string;
      academic_year_id: string;
      semester_id: string;
    }) => {
      discountByKey.set(
        `${d.student_profile_id}|${d.discount_type_id}|${d.academic_year_id}|${d.semester_id}`,
        d.id,
      );
    },
  );

  const seenInFile = new Set<string>();
  const out: ValidatedRow<StudentDiscountRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];

    const academic_number = str(raw.academic_number);
    if (!academic_number)
      errors.push({ row: rowNumber, column: "academic_number", message: "الرقم الأكاديمي مطلوب" });
    const student_id = academic_number ? (studentByAc.get(normKey(academic_number)) ?? null) : null;
    if (academic_number && !student_id)
      errors.push({ row: rowNumber, column: "academic_number", message: "الطالب غير موجود" });

    const discount_type_code = str(raw.discount_type_code);
    if (!discount_type_code)
      errors.push({ row: rowNumber, column: "discount_type_code", message: "كود نوع الخصم مطلوب" });
    const dtype = discount_type_code ? (typeByCode.get(normKey(discount_type_code)) ?? null) : null;
    if (discount_type_code && !dtype)
      errors.push({
        row: rowNumber,
        column: "discount_type_code",
        message: "نوع الخصم غير موجود أو غير نشط",
      });

    const ay_id = lookups.academicYearsByName.get(normKey(str(raw.academic_year)));
    if (!ay_id)
      errors.push({
        row: rowNumber,
        column: "academic_year",
        message: "السنة الأكاديمية غير موجودة",
      });

    const semKey = normKey(str(raw.semester));
    const sem_id = resolveSemesterId(lookups, ay_id, semKey);
    if (ay_id && !sem_id)
      errors.push({ row: rowNumber, column: "semester", message: SEMESTER_YEAR_ERROR_AR });

    const valueN = num(raw.value);
    if (!Number.isFinite(valueN) || valueN < 0)
      errors.push({
        row: rowNumber,
        column: "value",
        message: "قيمة الخصم يجب أن تكون رقماً >= 0",
      });
    else if (dtype?.discount_type === "percentage" && valueN > 100)
      errors.push({
        row: rowNumber,
        column: "value",
        message: "نسبة الخصم يجب أن تكون بين 0 و 100",
      });

    const status = str(raw.status) || "active";
    if (!DISCOUNT_STATUSES.has(status))
      errors.push({
        row: rowNumber,
        column: "status",
        message: "الحالة غير صحيحة (active/inactive/cancelled)",
      });

    const reason = str(raw.reason);
    const notes = reason || null;

    let _existingId: string | null = null;
    if (student_id && dtype && ay_id && sem_id) {
      const fileKey = `${student_id}|${dtype.id}|${ay_id}|${sem_id}`;
      if (seenInFile.has(fileKey))
        errors.push({
          row: rowNumber,
          column: "academic_number",
          message: "خصم مكرر في الملف لنفس الطالب والنوع والفصل",
        });
      else seenInFile.add(fileKey);

      _existingId = discountByKey.get(fileKey) ?? null;
      if (_existingId && !updateExisting) {
        errors.push({
          row: rowNumber,
          column: "academic_number",
          message: "الخصم موجود مسبقاً (فعّل تحديث القائم)",
        });
      }
    }

    out.push({
      rowNumber,
      raw,
      errors,
      parsed: errors.length
        ? null
        : {
            student_profile_id: student_id!,
            discount_type_id: dtype!.id,
            academic_year_id: ay_id!,
            semester_id: sem_id!,
            value: valueN,
            status,
            notes,
            _existingId,
          },
    });
  });

  return summarize(out);
}

// =========================
// Student eligibility (G9 — update existing students only)
// =========================
export type StudentEligibilityRow = {
  student_profile_id: string;
  academic_number: string;
  student_study_status: "new" | "repeat";
  transferred_current_year: boolean;
  previous_suspension_semesters_count: number;
  consecutive_suspension_years_count: number;
  source_reference: string;
  notes: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STUDY_STATUS_ALIASES = new Map<string, "new" | "repeat">([
  ["new", "new"],
  ["repeat", "repeat"],
  ["مستجد", "new"],
  ["باقي للإعادة", "repeat"],
  ["باق", "repeat"],
  ["إعادة", "repeat"],
  ["اعادة", "repeat"],
]);

export function normalizeStudentStudyStatus(raw: unknown): "new" | "repeat" | null {
  const s = str(raw);
  if (!s) return null;
  return STUDY_STATUS_ALIASES.get(normKey(s)) ?? STUDY_STATUS_ALIASES.get(s.toLowerCase()) ?? null;
}

function parseRequiredBool(v: unknown): { value: boolean | null; valid: boolean; empty: boolean } {
  if (v === null || v === undefined || v === "") return { value: null, valid: false, empty: true };
  if (typeof v === "boolean") return { value: v, valid: true, empty: false };
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "yes", "y", "نعم"].includes(s))
    return { value: true, valid: true, empty: false };
  if (["false", "0", "no", "n", "لا"].includes(s))
    return { value: false, valid: true, empty: false };
  return { value: null, valid: false, empty: false };
}

function parseRequiredNonNegInt(v: unknown): {
  value: number | null;
  valid: boolean;
  empty: boolean;
} {
  if (v === null || v === undefined || v === "") return { value: null, valid: false, empty: true };
  const raw = String(v).trim();
  if (!raw) return { value: null, valid: false, empty: true };
  if (/[.,]/.test(raw)) return { value: null, valid: false, empty: false };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return { value: null, valid: false, empty: false };
  return { value: n, valid: true, empty: false };
}

export async function validateStudentEligibility(
  rows: Record<string, unknown>[],
  _lookups: LookupMaps,
): Promise<ValidationResult<StudentEligibilityRow>> {
  const acNumbers = rows.map((r) => str(r.academic_number)).filter(Boolean);
  const studentByAc = new Map<string, { id: string; academic_number: string }>();
  if (acNumbers.length) {
    for (let i = 0; i < acNumbers.length; i += 500) {
      const chunk = acNumbers.slice(i, i + 500);
      const { data } = await getImportDb()
        .from("student_profiles")
        .select("id, academic_number")
        .in("academic_number", chunk);
      (data ?? []).forEach((s: { id: string; academic_number: string }) => {
        studentByAc.set(normKey(s.academic_number), s);
      });
    }
  }

  const seenInFile = new Set<string>();
  const out: ValidatedRow<StudentEligibilityRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];

    const academic_number = str(raw.academic_number);
    if (!academic_number) {
      errors.push({
        row: rowNumber,
        column: "academic_number",
        message: ELIGIBILITY_FIELD_ERROR_AR.academic_number_required,
      });
    } else if (UUID_RE.test(academic_number)) {
      errors.push({
        row: rowNumber,
        column: "academic_number",
        message: ELIGIBILITY_FIELD_ERROR_AR.academic_number_uuid,
      });
    } else {
      const fileKey = normKey(academic_number);
      if (seenInFile.has(fileKey)) {
        errors.push({
          row: rowNumber,
          column: "academic_number",
          message: ELIGIBILITY_FIELD_ERROR_AR.academic_number_duplicate,
        });
      } else {
        seenInFile.add(fileKey);
      }
    }

    const student = academic_number ? (studentByAc.get(normKey(academic_number)) ?? null) : null;
    if (academic_number && !UUID_RE.test(academic_number) && !student) {
      errors.push({
        row: rowNumber,
        column: "academic_number",
        message: ELIGIBILITY_FIELD_ERROR_AR.academic_number_not_found,
      });
    }

    const studyStatusRaw = str(raw.student_study_status);
    if (!studyStatusRaw) {
      errors.push({
        row: rowNumber,
        column: "student_study_status",
        message: ELIGIBILITY_FIELD_ERROR_AR.student_study_status_required,
      });
    }
    const student_study_status = normalizeStudentStudyStatus(raw.student_study_status);
    if (studyStatusRaw && !student_study_status) {
      errors.push({
        row: rowNumber,
        column: "student_study_status",
        message: ELIGIBILITY_FIELD_ERROR_AR.student_study_status_invalid,
      });
    }

    const transferred = parseRequiredBool(raw.transferred_current_year);
    if (transferred.empty) {
      errors.push({
        row: rowNumber,
        column: "transferred_current_year",
        message: ELIGIBILITY_FIELD_ERROR_AR.transferred_current_year_required,
      });
    } else if (!transferred.valid) {
      errors.push({
        row: rowNumber,
        column: "transferred_current_year",
        message: ELIGIBILITY_FIELD_ERROR_AR.transferred_current_year_invalid,
      });
    }

    const prevSem = parseRequiredNonNegInt(raw.previous_suspension_semesters_count);
    if (prevSem.empty) {
      errors.push({
        row: rowNumber,
        column: "previous_suspension_semesters_count",
        message: ELIGIBILITY_FIELD_ERROR_AR.previous_suspension_semesters_required,
      });
    } else if (!prevSem.valid) {
      errors.push({
        row: rowNumber,
        column: "previous_suspension_semesters_count",
        message: ELIGIBILITY_FIELD_ERROR_AR.previous_suspension_semesters_invalid,
      });
    }

    const consecYears = parseRequiredNonNegInt(raw.consecutive_suspension_years_count);
    if (consecYears.empty) {
      errors.push({
        row: rowNumber,
        column: "consecutive_suspension_years_count",
        message: ELIGIBILITY_FIELD_ERROR_AR.consecutive_suspension_years_required,
      });
    } else if (!consecYears.valid) {
      errors.push({
        row: rowNumber,
        column: "consecutive_suspension_years_count",
        message: ELIGIBILITY_FIELD_ERROR_AR.consecutive_suspension_years_invalid,
      });
    }

    const source_reference = str(raw.source_reference);
    if (!source_reference) {
      errors.push({
        row: rowNumber,
        column: "source_reference",
        message: ELIGIBILITY_FIELD_ERROR_AR.source_reference_required,
      });
    } else if (source_reference.length < 3) {
      errors.push({
        row: rowNumber,
        column: "source_reference",
        message: ELIGIBILITY_FIELD_ERROR_AR.source_reference_required,
      });
    } else if (source_reference.length > 250) {
      errors.push({
        row: rowNumber,
        column: "source_reference",
        message: ELIGIBILITY_FIELD_ERROR_AR.source_reference_too_long,
      });
    }

    const notesRaw = raw.notes;
    const notes = notesRaw == null || str(notesRaw) === "" ? null : str(notesRaw);

    out.push({
      rowNumber,
      raw,
      errors,
      parsed: errors.length
        ? null
        : {
            student_profile_id: student!.id,
            academic_number: student!.academic_number,
            student_study_status: student_study_status!,
            transferred_current_year: transferred.value!,
            previous_suspension_semesters_count: prevSem.value!,
            consecutive_suspension_years_count: consecYears.value!,
            source_reference,
            notes,
          },
    });
  });

  return summarize(out);
}

// =========================
// Official documents
// =========================
export type DocumentRow = {
  student_profile_id: string;
  document_type: string;
  metadata: Record<string, unknown>;
  issued_at: string | null;
};

const DOCUMENT_TYPES = new Set([
  "enrollment_certificate",
  "student_status_certificate",
  "official_transcript",
  "financial_receipt",
]);

const DOCUMENT_TYPE_ALIASES: Record<string, string> = {
  enrollment_certificate: "enrollment_certificate",
  enrollment_letter: "enrollment_certificate",
  student_status_certificate: "student_status_certificate",
  graduation_certificate: "student_status_certificate",
  official_transcript: "official_transcript",
  transcript: "official_transcript",
  financial_receipt: "financial_receipt",
};

function normalizeDocumentType(raw: string): string | null {
  const key = normKey(raw);
  return DOCUMENT_TYPE_ALIASES[key] ?? (DOCUMENT_TYPES.has(key) ? key : null);
}

function parseIssueDate(raw: unknown): { valid: boolean; iso: string | null } {
  const s = str(raw);
  if (!s) return { valid: true, iso: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { valid: false, iso: null };
  const d = new Date(`${s}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return { valid: false, iso: null };
  return { valid: true, iso: d.toISOString() };
}

export async function validateDocuments(
  rows: Record<string, unknown>[],
  _lookups: LookupMaps,
): Promise<ValidationResult<DocumentRow>> {
  const acNumbers = rows.map((r) => str(r.academic_number)).filter(Boolean);
  const studentByAc = new Map<string, string>();
  if (acNumbers.length) {
    for (let i = 0; i < acNumbers.length; i += 500) {
      const chunk = acNumbers.slice(i, i + 500);
      const { data } = await getImportDb()
        .from("student_profiles")
        .select("id, academic_number")
        .in("academic_number", chunk);
      (data ?? []).forEach((s: { id: string; academic_number: string }) => {
        studentByAc.set(normKey(s.academic_number), s.id);
      });
    }
  }

  const out: ValidatedRow<DocumentRow>[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];

    const academic_number = str(raw.academic_number);
    if (!academic_number)
      errors.push({ row: rowNumber, column: "academic_number", message: "الرقم الأكاديمي مطلوب" });
    const student_id = academic_number ? (studentByAc.get(normKey(academic_number)) ?? null) : null;
    if (academic_number && !student_id)
      errors.push({ row: rowNumber, column: "academic_number", message: "الطالب غير موجود" });

    const docTypeRaw = str(raw.document_type);
    if (!docTypeRaw)
      errors.push({ row: rowNumber, column: "document_type", message: "نوع الوثيقة مطلوب" });
    const document_type = docTypeRaw ? normalizeDocumentType(docTypeRaw) : null;
    if (docTypeRaw && !document_type) {
      errors.push({
        row: rowNumber,
        column: "document_type",
        message:
          "نوع الوثيقة غير صحيح (enrollment_certificate, student_status_certificate, official_transcript, financial_receipt)",
      });
    }

    const issueDate = parseIssueDate(raw.issue_date);
    if (!issueDate.valid)
      errors.push({
        row: rowNumber,
        column: "issue_date",
        message: "تاريخ الإصدار بصيغة YYYY-MM-DD",
      });

    const purpose = str(raw.purpose);
    const notes = str(raw.notes);
    const metadata: Record<string, unknown> = {};
    if (purpose) metadata.purpose = purpose;
    if (notes) metadata.notes = notes;
    if (issueDate.iso) metadata.issue_date = raw.issue_date;

    out.push({
      rowNumber,
      raw,
      errors,
      parsed: errors.length
        ? null
        : {
            student_profile_id: student_id!,
            document_type: document_type!,
            metadata,
            issued_at: issueDate.iso,
          },
    });
  });

  return summarize(out);
}

function summarize<T>(rows: ValidatedRow<T>[]): ValidationResult<T> {
  const validRows = rows.filter((r) => r.parsed !== null).length;
  return {
    rows,
    totalRows: rows.length,
    validRows,
    invalidRows: rows.length - validRows,
  };
}
