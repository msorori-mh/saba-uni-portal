import { supabase } from "@/integrations/supabase/client";
import type { ImportReport, ImportType, RowError, ValidatedRow } from "./types";
import type { CourseRow, FacultyRow, StaffRow, StudentRow, StudyPlanRow } from "./validators";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const CHUNK = 200;

async function insertBatched<T>(
  table: string,
  rows: { rowNumber: number; payload: T }[],
  report: ImportReport,
) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await sb.from(table).insert(slice.map((r) => r.payload));
    if (error) {
      // Fall back to one-by-one to identify failing rows
      for (const r of slice) {
        const { error: e2 } = await sb.from(table).insert([r.payload]);
        if (e2) {
          report.rows_failed += 1;
          report.errors.push({ row: r.rowNumber, message: e2.message });
        } else {
          report.rows_success += 1;
        }
      }
    } else {
      report.rows_success += slice.length;
    }
  }
}

export async function importStudents(rows: ValidatedRow<StudentRow>[]): Promise<ImportReport> {
  const report: ImportReport = { rows_total: rows.length, rows_success: 0, rows_failed: 0, errors: [] };
  const valid = rows.filter((r) => r.parsed) as Required<ValidatedRow<StudentRow>>[];
  // record pre-failed rows
  rows.filter((r) => !r.parsed).forEach((r) => {
    report.rows_failed += 1;
    r.errors.forEach((e) => report.errors.push(e));
  });

  // Insert student_profiles and capture ids
  const inserts = valid.map((r) => ({
    rowNumber: r.rowNumber,
    payload: {
      academic_number: r.parsed.academic_number,
      full_name_ar: r.parsed.full_name_ar,
      full_name_en: r.parsed.full_name_en,
      national_id: r.parsed.national_id,
      phone: r.parsed.phone,
      email: r.parsed.email,
      department_id: r.parsed.department_id,
      program_id: r.parsed.program_id,
      status: r.parsed.status,
    },
  }));

  // Insert profiles one chunk at a time and capture returned ids
  for (let i = 0; i < inserts.length; i += CHUNK) {
    const slice = inserts.slice(i, i + CHUNK);
    const { data, error } = await sb.from("student_profiles")
      .insert(slice.map((s) => s.payload)).select("id, academic_number");
    if (error || !data) {
      // fallback per-row
      for (const r of slice) {
        const { data: d, error: e2 } = await sb.from("student_profiles")
          .insert([r.payload]).select("id, academic_number").maybeSingle();
        if (e2 || !d) {
          report.rows_failed += 1;
          report.errors.push({ row: r.rowNumber, message: e2?.message ?? "insert failed" });
        } else {
          report.rows_success += 1;
          const orig = valid.find((v) => v.parsed.academic_number === d.academic_number);
          if (orig) {
            await sb.from("student_academic_status").insert({
              student_profile_id: d.id,
              academic_year_id: orig.parsed.academic_year_id,
              semester_id: orig.parsed.semester_id,
              level_id: orig.parsed.level_id,
              enrollment_status: orig.parsed.status === "active" ? "enrolled" : orig.parsed.status,
            });
          }
        }
      }
    } else {
      report.rows_success += data.length;
      // bulk insert statuses
      const statusRows = data.map((d: { id: string; academic_number: string }) => {
        const orig = valid.find((v) => v.parsed.academic_number === d.academic_number);
        if (!orig) return null;
        return {
          student_profile_id: d.id,
          academic_year_id: orig.parsed.academic_year_id,
          semester_id: orig.parsed.semester_id,
          level_id: orig.parsed.level_id,
          enrollment_status: orig.parsed.status === "active" ? "enrolled" : orig.parsed.status,
        };
      }).filter(Boolean);
      if (statusRows.length) await sb.from("student_academic_status").insert(statusRows);
    }
  }
  return report;
}

export async function importFaculty(rows: ValidatedRow<FacultyRow>[]): Promise<ImportReport> {
  const report: ImportReport = { rows_total: rows.length, rows_success: 0, rows_failed: 0, errors: [] };
  rows.filter((r) => !r.parsed).forEach((r) => {
    report.rows_failed += 1;
    r.errors.forEach((e) => report.errors.push(e));
  });
  const valid = rows.filter((r) => r.parsed) as Required<ValidatedRow<FacultyRow>>[];

  // faculty_profiles.faculty_id is NOT NULL → create a faculty record per profile.
  for (const r of valid) {
    const { data: fac, error: e1 } = await sb.from("faculty").insert({
      employee_id: r.parsed.employee_number,
      full_name_ar: r.parsed.full_name_ar,
      full_name_en: r.parsed.full_name_en,
      category: "faculty",
      rank: r.parsed.academic_rank,
      is_active: r.parsed.status === "active",
    }).select("id").maybeSingle();
    if (e1 || !fac) {
      report.rows_failed += 1;
      report.errors.push({ row: r.rowNumber, message: e1?.message ?? "faculty insert failed" });
      continue;
    }
    const { error: e2 } = await sb.from("faculty_profiles").insert({
      faculty_id: fac.id,
      employee_number: r.parsed.employee_number,
      full_name_ar: r.parsed.full_name_ar,
      full_name_en: r.parsed.full_name_en,
      department_id: r.parsed.department_id,
      program_id: r.parsed.program_id,
      academic_rank: r.parsed.academic_rank,
      position_title: r.parsed.position_title,
      status: r.parsed.status,
    });
    if (e2) {
      report.rows_failed += 1;
      report.errors.push({ row: r.rowNumber, message: e2.message });
    } else {
      report.rows_success += 1;
    }
  }
  return report;
}

export async function importStaff(rows: ValidatedRow<StaffRow>[]): Promise<ImportReport> {
  const report: ImportReport = { rows_total: rows.length, rows_success: 0, rows_failed: 0, errors: [] };
  rows.filter((r) => !r.parsed).forEach((r) => {
    report.rows_failed += 1;
    r.errors.forEach((e) => report.errors.push(e));
  });
  const valid = rows.filter((r) => r.parsed) as Required<ValidatedRow<StaffRow>>[];
  await insertBatched("staff_profiles", valid.map((r) => ({
    rowNumber: r.rowNumber,
    payload: { ...r.parsed },
  })), report);
  return report;
}

export async function importCourses(rows: ValidatedRow<CourseRow>[]): Promise<ImportReport> {
  const report: ImportReport = { rows_total: rows.length, rows_success: 0, rows_failed: 0, errors: [] };
  rows.filter((r) => !r.parsed).forEach((r) => {
    report.rows_failed += 1;
    r.errors.forEach((e) => report.errors.push(e));
  });
  const valid = rows.filter((r) => r.parsed) as Required<ValidatedRow<CourseRow>>[];
  await insertBatched("courses", valid.map((r) => ({
    rowNumber: r.rowNumber,
    payload: { ...r.parsed },
  })), report);
  return report;
}

export async function importStudyPlans(rows: ValidatedRow<StudyPlanRow>[]): Promise<ImportReport> {
  const report: ImportReport = { rows_total: rows.length, rows_success: 0, rows_failed: 0, errors: [] };
  rows.filter((r) => !r.parsed).forEach((r) => {
    report.rows_failed += 1;
    r.errors.forEach((e) => report.errors.push(e));
  });
  const valid = rows.filter((r) => r.parsed) as Required<ValidatedRow<StudyPlanRow>>[];

  // Group by (program_id, plan_name, version) and resolve/create study_plans rows.
  const planCache = new Map<string, string>();
  async function getOrCreatePlan(program_id: string, name: string, version: string): Promise<string | null> {
    const key = `${program_id}|${name}|${version}`;
    if (planCache.has(key)) return planCache.get(key)!;
    const { data: existing } = await sb.from("study_plans")
      .select("id").eq("program_id", program_id).eq("name", name).eq("version", version).maybeSingle();
    if (existing) { planCache.set(key, existing.id); return existing.id; }
    const { data: created, error } = await sb.from("study_plans")
      .insert({ program_id, name, version, status: "active", is_active: true })
      .select("id").maybeSingle();
    if (error || !created) return null;
    planCache.set(key, created.id);
    return created.id;
  }

  for (const r of valid) {
    const planId = await getOrCreatePlan(r.parsed.program_id, r.parsed.plan_name, r.parsed.version);
    if (!planId) {
      report.rows_failed += 1;
      report.errors.push({ row: r.rowNumber, message: "تعذر إنشاء أو إيجاد الخطة" });
      continue;
    }
    const { error } = await sb.from("study_plan_courses").insert({
      study_plan_id: planId,
      course_id: r.parsed.course_id,
      level_id: r.parsed.level_id,
      semester_code: r.parsed.semester_code,
      is_required: r.parsed.is_required,
      prerequisite_course_id: r.parsed.prerequisite_course_id,
      sort_order: r.parsed.sort_order,
    });
    if (error) {
      report.rows_failed += 1;
      report.errors.push({ row: r.rowNumber, message: error.message });
    } else {
      report.rows_success += 1;
    }
  }
  return report;
}

export async function finalizeImport(opts: {
  type: ImportType;
  fileName: string;
  report: ImportReport;
}) {
  const auth = await supabase.auth.getUser();
  const userId = auth.data.user?.id ?? null;
  const status = opts.report.rows_failed === 0 ? "completed" : opts.report.rows_success === 0 ? "failed" : "partial";
  const { data: logRow } = await sb.from("import_logs").insert({
    created_by: userId,
    import_type: opts.type,
    file_name: opts.fileName,
    rows_total: opts.report.rows_total,
    rows_success: opts.report.rows_success,
    rows_failed: opts.report.rows_failed,
    status,
    notes: opts.report.errors.slice(0, 50).map((e) => `R${e.row}${e.column ? ` [${e.column}]` : ""}: ${e.message}`).join(" | ") || null,
  }).select("id").maybeSingle();

  const actionMap: Record<ImportType, string> = {
    students: "students_imported",
    faculty: "faculty_imported",
    staff: "staff_imported",
    courses: "courses_imported",
    study_plans: "study_plans_imported",
  };

  try {
    await sb.rpc("log_audit", {
      _entity_type: "import",
      _entity_id: logRow?.id ?? null,
      _action_type: actionMap[opts.type],
      _old: null,
      _new: {
        rows_total: opts.report.rows_total,
        rows_success: opts.report.rows_success,
        rows_failed: opts.report.rows_failed,
        file_name: opts.fileName,
      },
      _notes: null,
    });
  } catch {
    // best-effort
  }
}

export function emptyReport(): ImportReport {
  return { rows_total: 0, rows_success: 0, rows_failed: 0, errors: [] };
}

// re-export for convenience
export type { RowError };
