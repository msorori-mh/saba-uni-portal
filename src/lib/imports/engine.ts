import { supabase } from "@/integrations/supabase/client";
import type { ImportReport, ImportType, ValidatedRow } from "./types";
import type {
  CourseRow, FacultyRow, StaffRow, StudentRow, StudyPlanRow,
  DepartmentRow, ProgramRow, LevelRow,
} from "./validators";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const CHUNK = 200;

type ParsedRow<T> = { rowNumber: number; parsed: T };

function splitRows<T>(rows: ValidatedRow<T>[], report: ImportReport): ParsedRow<T>[] {
  const valid: ParsedRow<T>[] = [];
  for (const r of rows) {
    if (r.parsed === null) {
      report.rows_failed += 1;
      r.errors.forEach((e) => report.errors.push(e));
    } else {
      valid.push({ rowNumber: r.rowNumber, parsed: r.parsed });
    }
  }
  return valid;
}

async function safeAudit(action: string, entityId: string | null, payload: Record<string, unknown>) {
  try {
    await sb.rpc("log_audit", {
      _entity_type: "import",
      _entity_id: entityId,
      _action_type: action,
      _old: null,
      _new: payload,
      _notes: null,
    });
  } catch {
    // best-effort
  }
}

async function insertBatched<T>(
  table: string,
  rows: { rowNumber: number; payload: T }[],
  report: ImportReport,
) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await sb.from(table).insert(slice.map((r) => r.payload));
    if (error) {
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

// ============================================================
// Dry-run helper — counts valid rows as success, no DB writes.
// ============================================================
function dryRunReport<T>(rows: ValidatedRow<T>[]): ImportReport {
  const report: ImportReport = { rows_total: rows.length, rows_success: 0, rows_failed: 0, errors: [] };
  for (const r of rows) {
    if (r.parsed === null) {
      report.rows_failed += 1;
      r.errors.forEach((e) => report.errors.push(e));
    } else {
      report.rows_success += 1;
    }
  }
  return report;
}

export async function importStudents(rows: ValidatedRow<StudentRow>[], dryRun = false): Promise<ImportReport> {
  if (dryRun) return dryRunReport(rows);
  const report: ImportReport = { rows_total: rows.length, rows_success: 0, rows_failed: 0, errors: [] };
  const valid = splitRows(rows, report);

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

  const byAcademic = new Map(valid.map((v) => [v.parsed.academic_number, v.parsed]));

  for (let i = 0; i < inserts.length; i += CHUNK) {
    const slice = inserts.slice(i, i + CHUNK);
    const { data, error } = await sb.from("student_profiles")
      .insert(slice.map((s) => s.payload)).select("id, academic_number");
    if (error || !data) {
      for (const r of slice) {
        const { data: d, error: e2 } = await sb.from("student_profiles")
          .insert([r.payload]).select("id, academic_number").maybeSingle();
        if (e2 || !d) {
          report.rows_failed += 1;
          report.errors.push({ row: r.rowNumber, message: e2?.message ?? "insert failed" });
        } else {
          report.rows_success += 1;
          const orig = byAcademic.get(d.academic_number);
          if (orig) {
            await sb.from("student_academic_status").insert({
              student_profile_id: d.id,
              academic_year_id: orig.academic_year_id,
              semester_id: orig.semester_id,
              level_id: orig.level_id,
              enrollment_status: orig.status === "active" ? "enrolled" : orig.status,
            });
          }
        }
      }
    } else {
      report.rows_success += data.length;
      const statusRows: Record<string, unknown>[] = [];
      for (const d of data as Array<{ id: string; academic_number: string }>) {
        const orig = byAcademic.get(d.academic_number);
        if (!orig) continue;
        statusRows.push({
          student_profile_id: d.id,
          academic_year_id: orig.academic_year_id,
          semester_id: orig.semester_id,
          level_id: orig.level_id,
          enrollment_status: orig.status === "active" ? "enrolled" : orig.status,
        });
      }
      if (statusRows.length) await sb.from("student_academic_status").insert(statusRows);
    }
  }
  return report;
}

export async function importFaculty(rows: ValidatedRow<FacultyRow>[], dryRun = false): Promise<ImportReport> {
  if (dryRun) return dryRunReport(rows);
  const report: ImportReport = { rows_total: rows.length, rows_success: 0, rows_failed: 0, errors: [] };
  const valid = splitRows(rows, report);

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

export async function importStaff(rows: ValidatedRow<StaffRow>[], dryRun = false): Promise<ImportReport> {
  if (dryRun) return dryRunReport(rows);
  const report: ImportReport = { rows_total: rows.length, rows_success: 0, rows_failed: 0, errors: [] };
  const valid = splitRows(rows, report);
  await insertBatched("staff_profiles", valid.map((r) => ({
    rowNumber: r.rowNumber,
    payload: { ...r.parsed },
  })), report);
  return report;
}

export async function importCourses(rows: ValidatedRow<CourseRow>[], dryRun = false): Promise<ImportReport> {
  if (dryRun) return dryRunReport(rows);
  const report: ImportReport = { rows_total: rows.length, rows_success: 0, rows_failed: 0, errors: [] };
  const valid = splitRows(rows, report);
  await insertBatched("courses", valid.map((r) => ({
    rowNumber: r.rowNumber,
    payload: { ...r.parsed },
  })), report);
  return report;
}

export async function importStudyPlans(rows: ValidatedRow<StudyPlanRow>[], dryRun = false): Promise<ImportReport> {
  if (dryRun) return dryRunReport(rows);
  const report: ImportReport = { rows_total: rows.length, rows_success: 0, rows_failed: 0, errors: [] };
  const valid = splitRows(rows, report);

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

// ============================================================
// Lifecycle audit helpers — exposed for UI to emit start/validated/failed
// ============================================================
export async function auditImportStarted(type: ImportType, fileName: string, rowsTotal: number, dryRun: boolean) {
  await safeAudit("import_started", null, { import_type: type, file_name: fileName, rows_total: rowsTotal, dry_run: dryRun });
}

export async function auditImportValidated(type: ImportType, fileName: string, totals: { total: number; valid: number; invalid: number }) {
  await safeAudit("import_validated", null, {
    import_type: type, file_name: fileName,
    rows_total: totals.total, rows_success: totals.valid, rows_failed: totals.invalid,
  });
}

export async function auditImportFailed(type: ImportType, fileName: string, error: string) {
  await safeAudit("import_failed", null, { import_type: type, file_name: fileName, error });
}

export async function finalizeImport(opts: {
  type: ImportType;
  fileName: string;
  report: ImportReport;
  dryRun?: boolean;
  durationMs?: number;
}) {
  // Dry-run: emit audit only, do not write to import_logs (it's not a real import).
  if (opts.dryRun) {
    await safeAudit("import_validated", null, {
      import_type: opts.type,
      file_name: opts.fileName,
      rows_total: opts.report.rows_total,
      rows_success: opts.report.rows_success,
      rows_failed: opts.report.rows_failed,
      duration_ms: opts.durationMs ?? null,
      dry_run: true,
    });
    return { logId: null as string | null };
  }

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
    notes: opts.report.errors.slice(0, 50)
      .map((e) => `R${e.row}${e.column ? ` [${e.column}]` : ""}: ${e.message}`).join(" | ") || null,
  }).select("id").maybeSingle();

  // Legacy per-type audit action (kept for backward compatibility)
  const actionMap: Record<ImportType, string> = {
    students: "students_imported",
    faculty: "faculty_imported",
    staff: "staff_imported",
    courses: "courses_imported",
    study_plans: "study_plans_imported",
    departments: "import_departments",
    programs: "import_programs",
    levels: "import_levels",
  };

  const payload = {
    rows_total: opts.report.rows_total,
    rows_success: opts.report.rows_success,
    rows_failed: opts.report.rows_failed,
    file_name: opts.fileName,
    import_type: opts.type,
    duration_ms: opts.durationMs ?? null,
  };

  await safeAudit(actionMap[opts.type], logRow?.id ?? null, payload);
  await safeAudit(status === "failed" ? "import_failed" : "import_completed", logRow?.id ?? null, payload);

  return { logId: (logRow?.id ?? null) as string | null };
}

export function emptyReport(): ImportReport {
  return { rows_total: 0, rows_success: 0, rows_failed: 0, errors: [] };
}
