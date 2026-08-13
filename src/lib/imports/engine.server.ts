import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateTemporaryPassword } from "@/lib/password.server";
import { normalizeUniversityLoginEmail } from "@/lib/university-email-auth";
import type { ImportReport, ImportType, ValidatedRow, EligibilityImportSummary } from "./types";
import type {
  CourseRow,
  FacultyRow,
  StaffRow,
  StudentRow,
  StudyPlanRow,
  DepartmentRow,
  ProgramRow,
  LevelRow,
  CourseSectionRow,
  StudentEnrollmentRow,
  StudentGradeRow,
  StudentAcademicStatusRow,
  StudentFeeRow,
  StudentDiscountRow,
  DocumentRow,
  StudentEligibilityRow,
} from "./validators";
import {
  emptyStudentAccountsSummary,
  type StudentAccountRow,
} from "./student-accounts";

export type ServerImportContext = {
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userSupabase: any;
};

export type StudentEligibilityImportContext = {
  userId: string;
  fileName: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabaseAdmin as any;

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

async function safeAudit(
  action: string,
  entityId: string | null,
  payload: Record<string, unknown>,
) {
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

async function safeDocumentAudit(
  action: string,
  documentId: string,
  payload: Record<string, unknown>,
) {
  try {
    await sb.rpc("log_audit", {
      _entity_type: "document",
      _entity_id: documentId,
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
  const report: ImportReport = {
    rows_total: rows.length,
    rows_success: 0,
    rows_failed: 0,
    errors: [],
  };
  for (const r of rows) {
    if (r.parsed === null) {
      report.rows_failed += 1;
      r.errors.forEach((e) => report.errors.push(e));
    } else {
      report.rows_success += 1;
    }
  }
  report.rows_created = report.rows_success;
  return report;
}

export async function importStudents(
  rows: ValidatedRow<StudentRow>[],
  dryRun = false,
  ctx?: ServerImportContext,
): Promise<ImportReport> {
  // Pre-compute the create_login / no-account split for both modes.
  const valid = rows.filter((r) => r.parsed !== null) as Array<
    ValidatedRow<StudentRow> & { parsed: StudentRow }
  >;
  const accountsToCreate = valid.filter((r) => r.parsed.create_login).length;
  const withoutAccount = valid.length - accountsToCreate;
  // Duplicate academic_numbers are already flagged by the validator; surface a count here.
  const dupErrors = rows
    .flatMap((r) => r.errors)
    .filter((e) => e.column === "academic_number" && /مكرر|موجود/.test(e.message));

  if (dryRun) {
    const rep: ImportReport = {
      rows_total: rows.length,
      rows_success: 0,
      rows_failed: 0,
      errors: [],
    };
    for (const r of rows) {
      if (r.parsed === null) {
        rep.rows_failed += 1;
        r.errors.forEach((e) => rep.errors.push(e));
      } else {
        rep.rows_success += 1;
      }
    }
    // Repurpose optional counts for the Dry Run summary:
    //   rows_created = accounts to create, rows_updated = students without account
    rep.rows_created = accountsToCreate;
    rep.rows_updated = withoutAccount;
    if (dupErrors.length) {
      rep.errors.unshift({
        row: 0,
        column: "academic_number",
        message: `أرقام أكاديمية مكررة/موجودة: ${dupErrors.length}`,
      });
    }
    return rep;
  }

  const report: ImportReport = {
    rows_total: rows.length,
    rows_success: 0,
    rows_failed: 0,
    rows_created: 0,
    rows_updated: 0,
    errors: [],
  };
  for (const r of rows) {
    if (r.parsed === null) {
      report.rows_failed += 1;
      r.errors.forEach((e) => report.errors.push(e));
    }
  }

  for (const r of valid) {
    const p = r.parsed;
    const { data: prof, error: pErr } = await sb
      .from("student_profiles")
      .insert({
        academic_number: p.academic_number,
        full_name_ar: p.full_name_ar,
        full_name_en: p.full_name_en,
        national_id: p.national_id,
        phone: p.phone,
        email: p.university_email,
        department_id: p.department_id,
        program_id: p.program_id,
        study_system: p.study_system,
        status: p.status,
        must_change_password: p.must_change_password,
      })
      .select("id")
      .maybeSingle();
    if (pErr || !prof) {
      report.rows_failed += 1;
      report.errors.push({ row: r.rowNumber, message: pErr?.message ?? "تعذّر إنشاء ملف الطالب" });
      continue;
    }

    const { error: sErr } = await sb.from("student_academic_status").insert({
      student_profile_id: prof.id,
      academic_year_id: p.academic_year_id,
      semester_id: p.semester_id,
      level_id: p.level_id,
      enrollment_status: p.status === "active" ? "enrolled" : p.status,
    });
    if (sErr) {
      report.rows_failed += 1;
      report.errors.push({ row: r.rowNumber, message: `الحالة الأكاديمية: ${sErr.message}` });
      continue;
    }

    if (p.create_login) {
      if (!ctx) {
        report.errors.push({ row: r.rowNumber, message: "سياق الخادم مطلوب لإنشاء حساب الدخول" });
      } else {
        try {
          await provisionStudentLoginServer(ctx, {
            profile_id: prof.id,
            academic_number: p.academic_number,
            university_email: p.university_email,
            must_change_password: p.must_change_password,
          });
          report.rows_created = (report.rows_created ?? 0) + 1;
        } catch (e) {
          report.errors.push({
            row: r.rowNumber,
            message: `إنشاء الحساب: ${(e as Error).message}`,
          });
        }
      }
    } else {
      report.rows_updated = (report.rows_updated ?? 0) + 1;
    }
    report.rows_success += 1;
  }
  return report;
}

async function provisionStudentLoginServer(
  ctx: ServerImportContext,
  data: {
    profile_id: string;
    academic_number: string;
    university_email: string | null;
    must_change_password: boolean;
  },
) {
  if (!data.university_email) {
    throw new Error("الإيميل الجامعي مطلوب لإنشاء حساب الدخول");
  }
  const email = normalizeUniversityLoginEmail(data.university_email);
  const password = generateTemporaryPassword();

  const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { kind: "student" },
  });
  if (cErr || !created.user) {
    throw new Error(cErr?.message ?? "تعذّر إنشاء حساب الدخول");
  }

  const newUserId = created.user.id;
  const { error: linkErr } = await ctx.userSupabase.rpc("link_student_user_account", {
    _profile_id: data.profile_id,
    _target_user_id: newUserId,
  });
  if (linkErr) {
    await supabaseAdmin.auth.admin.deleteUser(newUserId);
    throw new Error(linkErr.message);
  }

  await supabaseAdmin.from("user_roles").insert({ user_id: newUserId, role: "student" });

  if (data.must_change_password) {
    const { error: mErr } = await ctx.userSupabase.rpc("admin_mark_student_password_reset", {
      _profile_id: data.profile_id,
    });
    if (mErr) {
      throw new Error(`تم إنشاء الحساب لكن تعذّر ضبط must_change_password: ${mErr.message}`);
    }
  }

  try {
    await sb.rpc("log_audit", {
      _entity_type: "student",
      _entity_id: data.profile_id,
      _action_type: "student_login_provisioned",
      _old: null,
      _new: {
        academic_number: data.academic_number,
        must_change_password: data.must_change_password,
        actor_user_id: ctx.userId,
      },
      _notes: "إنشاء حساب دخول للطالب عبر الاستيراد الجماعي",
    });
  } catch {
    /* best-effort */
  }
}

export async function importFaculty(
  rows: ValidatedRow<FacultyRow>[],
  dryRun = false,
): Promise<ImportReport> {
  if (dryRun) return dryRunReport(rows);
  const report: ImportReport = {
    rows_total: rows.length,
    rows_success: 0,
    rows_failed: 0,
    errors: [],
  };
  const valid = splitRows(rows, report);

  for (const r of valid) {
    const { data: fac, error: e1 } = await sb
      .from("faculty")
      .insert({
        employee_id: r.parsed.employee_number,
        full_name_ar: r.parsed.full_name_ar,
        full_name_en: r.parsed.full_name_en,
        category: "faculty",
        rank: r.parsed.academic_rank,
        is_active: r.parsed.status === "active",
      })
      .select("id")
      .maybeSingle();
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

export async function importStaff(
  rows: ValidatedRow<StaffRow>[],
  dryRun = false,
): Promise<ImportReport> {
  if (dryRun) return dryRunReport(rows);
  const report: ImportReport = {
    rows_total: rows.length,
    rows_success: 0,
    rows_failed: 0,
    errors: [],
  };
  const valid = splitRows(rows, report);
  await insertBatched(
    "staff_profiles",
    valid.map((r) => ({
      rowNumber: r.rowNumber,
      payload: {
        ...r.parsed,
        department_scope: r.parsed!.department_id ? "specific" : "specific",
      },
    })),
    report,
  );

  const withDept = valid.filter((r) => r.parsed?.department_id);
  if (withDept.length) {
    const empNums = withDept.map((r) => r.parsed!.employee_number);
    const { data: profiles } = await sb
      .from("staff_profiles")
      .select("id, employee_number")
      .in("employee_number", empNums);
    const byEmp = new Map(
      (profiles ?? []).map((p: { id: string; employee_number: string }) => [
        p.employee_number,
        p.id,
      ]),
    );
    const links = withDept.flatMap((r) => {
      const profileId = byEmp.get(r.parsed!.employee_number);
      const depId = r.parsed!.department_id;
      return profileId && depId ? [{ staff_profile_id: profileId, department_id: depId }] : [];
    });
    if (links.length) {
      await sb.from("staff_profile_departments").upsert(links, {
        onConflict: "staff_profile_id,department_id",
        ignoreDuplicates: true,
      });
    }
  }
  return report;
}

export async function importCourses(
  rows: ValidatedRow<CourseRow>[],
  dryRun = false,
): Promise<ImportReport> {
  if (dryRun) return dryRunReport(rows);
  const report: ImportReport = {
    rows_total: rows.length,
    rows_success: 0,
    rows_failed: 0,
    errors: [],
  };
  const valid = splitRows(rows, report);
  await insertBatched(
    "courses",
    valid.map((r) => ({
      rowNumber: r.rowNumber,
      payload: { ...r.parsed },
    })),
    report,
  );
  return report;
}

export async function importStudyPlans(
  rows: ValidatedRow<StudyPlanRow>[],
  dryRun = false,
): Promise<ImportReport> {
  if (dryRun) return dryRunReport(rows);
  const report: ImportReport = {
    rows_total: rows.length,
    rows_success: 0,
    rows_failed: 0,
    errors: [],
  };
  const valid = splitRows(rows, report);

  const planCache = new Map<string, string>();
  async function getOrCreatePlan(
    program_id: string,
    name: string,
    version: string,
    status: "draft" | "active",
  ): Promise<string | null> {
    // G-14: plan identity is (program_id, version) — the DB UNIQUE key.
    // Looking up by (program_id, name, version) missed same-version/different-name
    // plans and produced confusing insert violations.
    const key = `${program_id}|${version}`;
    if (planCache.has(key)) return planCache.get(key)!;
    const { data: existing } = await sb
      .from("study_plans")
      .select("id")
      .eq("program_id", program_id)
      .eq("version", version)
      .maybeSingle();
    if (existing) {
      planCache.set(key, existing.id);
      return existing.id;
    }
    const { data: created, error } = await sb
      .from("study_plans")
      .insert({ program_id, name, version, status, is_active: status === "active" })
      .select("id")
      .maybeSingle();
    if (error || !created) {
      // Possible race/constraint on UNIQUE(program_id, version) — re-read before failing.
      const { data: after } = await sb
        .from("study_plans")
        .select("id")
        .eq("program_id", program_id)
        .eq("version", version)
        .maybeSingle();
      if (after) {
        planCache.set(key, after.id);
        return after.id;
      }
      return null;
    }
    planCache.set(key, created.id);
    return created.id;
  }

  for (const r of valid) {
    const planId = await getOrCreatePlan(
      r.parsed.program_id,
      r.parsed.plan_name,
      r.parsed.version,
      r.parsed.plan_status,
    );
    if (!planId) {
      report.rows_failed += 1;
      report.errors.push({
        row: r.rowNumber,
        message: `تعذر إنشاء أو إيجاد الخطة (إصدار ${r.parsed.version})`,
      });
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
// Lifecycle audit — server-side finalize (import_logs + audit)
// ============================================================

export async function finalizeImportServer(opts: {
  type: ImportType;
  fileName: string;
  report: ImportReport;
  userId: string;
  dryRun?: boolean;
  durationMs?: number;
}) {
  if (opts.dryRun) {
    const { data: logRow } = await sb
      .from("import_logs")
      .insert({
        created_by: opts.userId,
        import_type: opts.type,
        file_name: opts.fileName,
        rows_total: opts.report.rows_total,
        rows_success: opts.report.rows_success,
        rows_failed: opts.report.rows_failed,
        status: "dry_run",
        notes:
          opts.report.errors
            .slice(0, 30)
            .map((e) => `R${e.row}${e.column ? ` [${e.column}]` : ""}: ${e.message}`)
            .join(" | ") || "تشغيل تجريبي — لم تُجرَ أي تغييرات",
      })
      .select("id")
      .maybeSingle();

    await safeAudit("import_validated", logRow?.id ?? null, {
      import_type: opts.type,
      file_name: opts.fileName,
      rows_total: opts.report.rows_total,
      rows_success: opts.report.rows_success,
      rows_failed: opts.report.rows_failed,
      duration_ms: opts.durationMs ?? null,
      dry_run: true,
    });
    return { logId: (logRow?.id ?? null) as string | null };
  }

  const status =
    opts.report.rows_failed === 0
      ? "completed"
      : opts.report.rows_success === 0
        ? "failed"
        : "partial";
  const { data: logRow } = await sb
    .from("import_logs")
    .insert({
      created_by: opts.userId,
      import_type: opts.type,
      file_name: opts.fileName,
      rows_total: opts.report.rows_total,
      rows_success: opts.report.rows_success,
      rows_failed: opts.report.rows_failed,
      status,
      notes:
        opts.report.errors
          .slice(0, 50)
          .map((e) => `R${e.row}${e.column ? ` [${e.column}]` : ""}: ${e.message}`)
          .join(" | ") || null,
    })
    .select("id")
    .maybeSingle();

  const actionMap: Record<ImportType, string> = {
    students: "students_imported",
    faculty: "faculty_imported",
    staff: "staff_imported",
    courses: "courses_imported",
    study_plans: "study_plans_imported",
    departments: "import_departments",
    programs: "import_programs",
    levels: "import_levels",
    course_sections: "course_sections_imported",
    student_enrollments: "student_enrollments_imported",
    student_grades: "student_grades_imported",
    student_academic_status: "student_academic_status_imported",
    student_fees: "student_fees_imported",
    student_discounts: "student_discounts_imported",
    student_eligibility: "student_eligibility_data_imported",
    student_accounts: "student_existing_accounts_imported",
    documents: "documents_imported",
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
  await safeAudit(
    status === "failed" ? "import_failed" : "import_completed",
    logRow?.id ?? null,
    payload,
  );

  return { logId: (logRow?.id ?? null) as string | null };
}

export function emptyReport(): ImportReport {
  return {
    rows_total: 0,
    rows_success: 0,
    rows_failed: 0,
    rows_created: 0,
    rows_updated: 0,
    errors: [],
  };
}

// ============================================================
// ACADEMIC-STRUCTURE-IMPORTS-01 — departments, programs, levels
// Support both Insert and Update Existing modes. Never stops at first error.
// ============================================================

function emptyStructReport(total: number): ImportReport {
  return {
    rows_total: total,
    rows_success: 0,
    rows_failed: 0,
    rows_created: 0,
    rows_updated: 0,
    errors: [],
  };
}

function structDryRun<T extends { _existingId: string | null }>(
  rows: ValidatedRow<T>[],
  updateExisting: boolean,
): ImportReport {
  const r = emptyStructReport(rows.length);
  for (const row of rows) {
    if (row.parsed === null) {
      r.rows_failed += 1;
      row.errors.forEach((e) => r.errors.push(e));
    } else {
      r.rows_success += 1;
      if (row.parsed._existingId) {
        if (updateExisting) r.rows_updated! += 1;
      } else {
        r.rows_created! += 1;
      }
    }
  }
  return r;
}

export async function importDepartments(
  rows: ValidatedRow<DepartmentRow>[],
  dryRun = false,
  updateExisting = false,
): Promise<ImportReport> {
  if (dryRun) return structDryRun(rows, updateExisting);
  const report = emptyStructReport(rows.length);
  for (const r of rows) {
    if (r.parsed === null) {
      report.rows_failed += 1;
      r.errors.forEach((e) => report.errors.push(e));
      continue;
    }
    const p = r.parsed;
    const payload = {
      name_ar: p.name_ar,
      name_en: p.name_en,
      description_ar: p.description_ar,
      is_active: p.is_active,
    };
    if (p._existingId) {
      const { error } = await sb.from("departments").update(payload).eq("id", p._existingId);
      if (error) {
        report.rows_failed += 1;
        report.errors.push({ row: r.rowNumber, message: error.message });
      } else {
        report.rows_success += 1;
        report.rows_updated! += 1;
      }
    } else {
      const { error } = await sb.from("departments").insert(payload);
      if (error) {
        report.rows_failed += 1;
        report.errors.push({ row: r.rowNumber, message: error.message });
      } else {
        report.rows_success += 1;
        report.rows_created! += 1;
      }
    }
  }
  return report;
}

export async function importPrograms(
  rows: ValidatedRow<ProgramRow>[],
  dryRun = false,
  updateExisting = false,
): Promise<ImportReport> {
  if (dryRun) return structDryRun(rows, updateExisting);
  const report = emptyStructReport(rows.length);
  for (const r of rows) {
    if (r.parsed === null) {
      report.rows_failed += 1;
      r.errors.forEach((e) => report.errors.push(e));
      continue;
    }
    const p = r.parsed;
    const payload = {
      code: p.code,
      name_ar: p.name_ar,
      name_en: p.name_en,
      department_id: p.department_id,
      degree_type: p.degree_type,
      years: p.years,
      is_active: p.is_active,
      status: p.is_active ? "active" : "inactive",
    };
    if (p._existingId) {
      const { error } = await sb.from("programs").update(payload).eq("id", p._existingId);
      if (error) {
        report.rows_failed += 1;
        report.errors.push({ row: r.rowNumber, message: error.message });
      } else {
        report.rows_success += 1;
        report.rows_updated! += 1;
      }
    } else {
      const { error } = await sb.from("programs").insert(payload);
      if (error) {
        report.rows_failed += 1;
        report.errors.push({ row: r.rowNumber, message: error.message });
      } else {
        report.rows_success += 1;
        report.rows_created! += 1;
      }
    }
  }
  return report;
}

export async function importLevels(
  rows: ValidatedRow<LevelRow>[],
  dryRun = false,
  updateExisting = false,
): Promise<ImportReport> {
  if (dryRun) return structDryRun(rows, updateExisting);
  const report = emptyStructReport(rows.length);
  for (const r of rows) {
    if (r.parsed === null) {
      report.rows_failed += 1;
      r.errors.forEach((e) => report.errors.push(e));
      continue;
    }
    const p = r.parsed;
    const payload = { name: p.name, level_number: p.level_number };
    if (p._existingId) {
      const { error } = await sb.from("academic_levels").update(payload).eq("id", p._existingId);
      if (error) {
        report.rows_failed += 1;
        report.errors.push({ row: r.rowNumber, message: error.message });
      } else {
        report.rows_success += 1;
        report.rows_updated! += 1;
      }
    } else {
      const { error } = await sb.from("academic_levels").insert(payload);
      if (error) {
        report.rows_failed += 1;
        report.errors.push({ row: r.rowNumber, message: error.message });
      } else {
        report.rows_success += 1;
        report.rows_created! += 1;
      }
    }
  }
  return report;
}

function sectionOfferingKey(
  courseId: string,
  ayId: string,
  semId: string,
  progId: string,
  lvlId: string,
) {
  return `${courseId}|${ayId}|${semId}|${progId}|${lvlId}`;
}

export async function importCourseSections(
  rows: ValidatedRow<CourseSectionRow>[],
  dryRun = false,
  updateExisting = false,
): Promise<ImportReport> {
  if (dryRun) return structDryRun(rows, updateExisting);
  const report = emptyStructReport(rows.length);

  const offeringCache = new Map<string, string>();

  async function resolveOffering(p: CourseSectionRow): Promise<string | null> {
    const key = sectionOfferingKey(
      p.course_id,
      p.academic_year_id,
      p.semester_id,
      p.program_id,
      p.level_id,
    );
    if (offeringCache.has(key)) return offeringCache.get(key)!;
    if (p.course_offering_id) {
      offeringCache.set(key, p.course_offering_id);
      return p.course_offering_id;
    }
    const { data: created, error } = await sb
      .from("course_offerings")
      .insert({
        course_id: p.course_id,
        academic_year_id: p.academic_year_id,
        semester_id: p.semester_id,
        program_id: p.program_id,
        level_id: p.level_id,
        status: "active",
      })
      .select("id")
      .maybeSingle();
    if (error || !created) return null;
    offeringCache.set(key, created.id);
    return created.id;
  }

  for (const r of rows) {
    if (r.parsed === null) {
      report.rows_failed += 1;
      r.errors.forEach((e) => report.errors.push(e));
      continue;
    }
    const p = r.parsed;
    const offeringId = await resolveOffering(p);
    if (!offeringId) {
      report.rows_failed += 1;
      report.errors.push({ row: r.rowNumber, message: "تعذّر إنشاء أو إيجاد إسناد المقرر" });
      continue;
    }

    const payload = {
      course_offering_id: offeringId,
      section_code: p.section_code,
      study_system: p.study_system,
      faculty_profile_id: p.faculty_profile_id,
      capacity: p.capacity,
      status: p.status,
    };

    if (p._existingId) {
      const { error } = await sb.from("course_sections").update(payload).eq("id", p._existingId);
      if (error) {
        report.rows_failed += 1;
        report.errors.push({ row: r.rowNumber, message: error.message });
      } else {
        report.rows_success += 1;
        report.rows_updated! += 1;
      }
    } else {
      const { error } = await sb.from("course_sections").insert(payload);
      if (error) {
        report.rows_failed += 1;
        report.errors.push({ row: r.rowNumber, message: error.message });
      } else {
        report.rows_success += 1;
        report.rows_created! += 1;
      }
    }
  }
  return report;
}

export async function importStudentEnrollments(
  rows: ValidatedRow<StudentEnrollmentRow>[],
  dryRun = false,
  updateExisting = false,
): Promise<ImportReport> {
  if (dryRun) return structDryRun(rows, updateExisting);
  const report = emptyStructReport(rows.length);

  for (const r of rows) {
    if (r.parsed === null) {
      report.rows_failed += 1;
      r.errors.forEach((e) => report.errors.push(e));
      continue;
    }
    const p = r.parsed;
    const payload = {
      student_profile_id: p.student_profile_id,
      course_section_id: p.course_section_id,
      enrollment_status: p.enrollment_status,
    };

    if (p._existingId) {
      const { error } = await sb
        .from("student_enrollments")
        .update({ enrollment_status: p.enrollment_status })
        .eq("id", p._existingId);
      if (error) {
        report.rows_failed += 1;
        report.errors.push({ row: r.rowNumber, message: error.message });
      } else {
        report.rows_success += 1;
        report.rows_updated! += 1;
      }
    } else {
      const { error } = await sb.from("student_enrollments").insert(payload);
      if (error) {
        report.rows_failed += 1;
        report.errors.push({ row: r.rowNumber, message: error.message });
      } else {
        report.rows_success += 1;
        report.rows_created! += 1;
      }
    }
  }
  return report;
}

export async function importStudentGrades(
  rows: ValidatedRow<StudentGradeRow>[],
  dryRun = false,
  updateExisting = false,
): Promise<ImportReport> {
  if (dryRun) return structDryRun(rows, updateExisting);
  const report = emptyStructReport(rows.length);

  for (const r of rows) {
    if (r.parsed === null) {
      report.rows_failed += 1;
      r.errors.forEach((e) => report.errors.push(e));
      continue;
    }
    const p = r.parsed;
    const payload: Record<string, unknown> = {
      score: p.score,
      status: p.status,
    };
    if (p.status === "approved") {
      payload.approved_at = new Date().toISOString();
    } else {
      payload.approved_at = null;
      payload.approved_by = null;
    }

    if (p._existingId) {
      const { error } = await sb.from("student_grades").update(payload).eq("id", p._existingId);
      if (error) {
        report.rows_failed += 1;
        report.errors.push({ row: r.rowNumber, message: error.message });
      } else {
        report.rows_success += 1;
        report.rows_updated! += 1;
      }
    } else {
      const { error } = await sb.from("student_grades").insert({
        student_enrollment_id: p.student_enrollment_id,
        grade_component_id: p.grade_component_id,
        score: p.score,
        status: p.status,
        approved_at: p.status === "approved" ? new Date().toISOString() : null,
      });
      if (error) {
        report.rows_failed += 1;
        report.errors.push({ row: r.rowNumber, message: error.message });
      } else {
        report.rows_success += 1;
        report.rows_created! += 1;
      }
    }
  }
  return report;
}

// ============================================================
// ACADEMIC-STATUS-IMPORTER-01 (G-05) — student_academic_status
// Batch-atomic: new rows go in ONE insert statement; updates in ONE upsert
// statement. Postgres applies each statement atomically — a failure aborts
// the whole batch instead of leaving partial writes (ذرّية الدفعة).
// ============================================================
export async function importStudentAcademicStatus(
  rows: ValidatedRow<StudentAcademicStatusRow>[],
  dryRun = false,
  updateExisting = false,
): Promise<ImportReport> {
  if (dryRun) return structDryRun(rows, updateExisting);
  const report = emptyStructReport(rows.length);
  const valid = splitRows(rows, report);

  const now = new Date().toISOString();
  // No silent field loss: every parsed field is mapped into the payload.
  const toPayload = (p: StudentAcademicStatusRow) => ({
    student_profile_id: p.student_profile_id,
    academic_year_id: p.academic_year_id,
    semester_id: p.semester_id,
    level_id: p.level_id,
    enrollment_status: p.enrollment_status,
    updated_at: now,
  });

  const newRows = valid.filter((r) => !r.parsed._existingId);
  const updateRows = valid.filter((r) => r.parsed._existingId);

  if (newRows.length) {
    const { error } = await sb
      .from("student_academic_status")
      .insert(newRows.map((r) => toPayload(r.parsed)));
    if (error) {
      report.rows_failed += newRows.length;
      report.errors.push({
        row: 0,
        message: `فشل الإدراج الذرّي للدفعة (${newRows.length} صف — لم يُدرَج أي صف): ${error.message}`,
      });
    } else {
      report.rows_success += newRows.length;
      report.rows_created! += newRows.length;
    }
  }

  if (updateRows.length) {
    const { error } = await sb
      .from("student_academic_status")
      .upsert(updateRows.map((r) => toPayload(r.parsed)), {
        onConflict: "student_profile_id,academic_year_id,semester_id",
      });
    if (error) {
      report.rows_failed += updateRows.length;
      report.errors.push({
        row: 0,
        message: `فشل التحديث الذرّي للدفعة (${updateRows.length} صف — لم يُحدَّث أي صف): ${error.message}`,
      });
    } else {
      report.rows_success += updateRows.length;
      report.rows_updated! += updateRows.length;
    }
  }

  return report;
}

export async function importStudentFees(
  rows: ValidatedRow<StudentFeeRow>[],
  dryRun = false,
  updateExisting = false,
): Promise<ImportReport> {
  if (dryRun) return structDryRun(rows, updateExisting);
  const report = emptyStructReport(rows.length);

  for (const r of rows) {
    if (r.parsed === null) {
      report.rows_failed += 1;
      r.errors.forEach((e) => report.errors.push(e));
      continue;
    }
    const p = r.parsed;
    const payload = {
      student_profile_id: p.student_profile_id,
      fee_type_id: p.fee_type_id,
      academic_year_id: p.academic_year_id,
      semester_id: p.semester_id,
      amount: p.amount,
      status: p.status,
      notes: p.notes,
    };

    if (p._existingId) {
      const { error } = await sb.from("student_fees").update(payload).eq("id", p._existingId);
      if (error) {
        report.rows_failed += 1;
        report.errors.push({ row: r.rowNumber, message: error.message });
      } else {
        report.rows_success += 1;
        report.rows_updated! += 1;
      }
    } else {
      const { error } = await sb.from("student_fees").insert(payload);
      if (error) {
        report.rows_failed += 1;
        report.errors.push({ row: r.rowNumber, message: error.message });
      } else {
        report.rows_success += 1;
        report.rows_created! += 1;
      }
    }
  }
  return report;
}

async function reapplyStudentDiscount(discountId: string) {
  await sb.rpc("revert_student_discount", { _discount_id: discountId });
  await sb.rpc("apply_student_discount", { _discount_id: discountId });
}

export async function importStudentDiscounts(
  rows: ValidatedRow<StudentDiscountRow>[],
  dryRun = false,
  updateExisting = false,
): Promise<ImportReport> {
  if (dryRun) return structDryRun(rows, updateExisting);
  const report = emptyStructReport(rows.length);

  for (const r of rows) {
    if (r.parsed === null) {
      report.rows_failed += 1;
      r.errors.forEach((e) => report.errors.push(e));
      continue;
    }
    const p = r.parsed;
    const payload = {
      student_profile_id: p.student_profile_id,
      discount_type_id: p.discount_type_id,
      academic_year_id: p.academic_year_id,
      semester_id: p.semester_id,
      value: p.value,
      status: p.status,
      notes: p.notes,
      approved_at: p.status === "active" ? new Date().toISOString() : null,
    };

    if (p._existingId) {
      const { error } = await sb.from("student_discounts").update(payload).eq("id", p._existingId);
      if (error) {
        report.rows_failed += 1;
        report.errors.push({ row: r.rowNumber, message: error.message });
      } else {
        if (p.status === "active") {
          try {
            await reapplyStudentDiscount(p._existingId);
          } catch (e) {
            report.errors.push({
              row: r.rowNumber,
              message: `تم التحديث لكن تعذّر إعادة تطبيق الخصم: ${(e as Error).message}`,
            });
          }
        }
        report.rows_success += 1;
        report.rows_updated! += 1;
      }
    } else {
      const { error } = await sb.from("student_discounts").insert(payload);
      if (error) {
        report.rows_failed += 1;
        report.errors.push({ row: r.rowNumber, message: error.message });
      } else {
        report.rows_success += 1;
        report.rows_created! += 1;
      }
    }
  }
  return report;
}

export function computeEligibilityImportSummary(
  rows: ValidatedRow<StudentEligibilityRow>[],
): EligibilityImportSummary {
  const valid = rows.filter((r) => r.parsed !== null) as Array<
    ValidatedRow<StudentEligibilityRow> & { parsed: StudentEligibilityRow }
  >;
  const sourceRefs = new Set<string>();
  let newCount = 0;
  let repeatCount = 0;
  let transferredCount = 0;
  let priorSuspensionCount = 0;

  for (const row of valid) {
    const p = row.parsed;
    sourceRefs.add(p.source_reference);
    if (p.student_study_status === "new") newCount += 1;
    else repeatCount += 1;
    if (p.transferred_current_year) transferredCount += 1;
    if (p.previous_suspension_semesters_count > 0 || p.consecutive_suspension_years_count > 0) {
      priorSuspensionCount += 1;
    }
  }

  return {
    new_count: newCount,
    repeat_count: repeatCount,
    transferred_count: transferredCount,
    prior_suspension_count: priorSuspensionCount,
    distinct_source_references: sourceRefs.size,
  };
}

function eligibilityDryRunReport(rows: ValidatedRow<StudentEligibilityRow>[]): ImportReport {
  const report: ImportReport = {
    rows_total: rows.length,
    rows_success: 0,
    rows_failed: 0,
    rows_created: 0,
    rows_updated: 0,
    errors: [],
  };

  for (const r of rows) {
    if (r.parsed === null) {
      report.rows_failed += 1;
      r.errors.forEach((e) => report.errors.push(e));
    } else {
      report.rows_success += 1;
      report.rows_updated! += 1;
    }
  }

  report.eligibility_summary = computeEligibilityImportSummary(rows);
  return report;
}

export async function importStudentEligibility(
  rows: ValidatedRow<StudentEligibilityRow>[],
  dryRun = false,
  ctx?: StudentEligibilityImportContext,
): Promise<ImportReport> {
  if (dryRun) return eligibilityDryRunReport(rows);

  const report: ImportReport = {
    rows_total: rows.length,
    rows_success: 0,
    rows_failed: 0,
    rows_created: 0,
    rows_updated: 0,
    errors: [],
  };

  for (const r of rows) {
    if (r.parsed === null) {
      report.rows_failed += 1;
      r.errors.forEach((e) => report.errors.push(e));
      continue;
    }

    const p = r.parsed;
    const { data: existing, error: fetchErr } = await sb
      .from("student_profiles")
      .select(
        "id, student_study_status, transferred_current_year, previous_suspension_semesters_count, consecutive_suspension_years_count",
      )
      .eq("id", p.student_profile_id)
      .maybeSingle();

    if (fetchErr || !existing) {
      report.rows_failed += 1;
      report.errors.push({
        row: r.rowNumber,
        column: "academic_number",
        message: fetchErr?.message ?? "الطالب غير موجود — لم يُحدَّث أي سجل",
      });
      continue;
    }

    const payload = {
      student_study_status: p.student_study_status,
      transferred_current_year: p.transferred_current_year,
      previous_suspension_semesters_count: p.previous_suspension_semesters_count,
      consecutive_suspension_years_count: p.consecutive_suspension_years_count,
    };

    const { data: updated, error: updateErr } = await sb
      .from("student_profiles")
      .update(payload)
      .eq("id", p.student_profile_id)
      .select("id");

    if (updateErr || !updated || updated.length !== 1) {
      report.rows_failed += 1;
      report.errors.push({
        row: r.rowNumber,
        column: "academic_number",
        message: updateErr?.message ?? "فشل تحديث سجل الطالب — لم يُحدَّث بالضبط صف واحد",
      });
      continue;
    }

    report.rows_success += 1;
    report.rows_updated! += 1;

    await safeAudit("student_eligibility_data_imported", p.student_profile_id, {
      old: {
        student_study_status: existing.student_study_status,
        transferred_current_year: existing.transferred_current_year,
        previous_suspension_semesters_count: existing.previous_suspension_semesters_count,
        consecutive_suspension_years_count: existing.consecutive_suspension_years_count,
      },
      new: payload,
      source_reference: p.source_reference,
      import_file_name: ctx?.fileName ?? null,
      actor_user_id: ctx?.userId ?? null,
    });
  }

  report.eligibility_summary = computeEligibilityImportSummary(rows);
  return report;
}

/**
 * STUDENT-EXISTING-ACCOUNTS-IMPORTER-01
 * Creates Auth logins for existing student_profiles only. Never mutates academic columns.
 * Passwords are never returned in the report or audit payloads.
 */
export async function importStudentAccounts(
  rows: ValidatedRow<StudentAccountRow>[],
  dryRun = false,
  ctx?: ServerImportContext,
): Promise<ImportReport> {
  const report = emptyReport();
  report.rows_total = rows.length;
  report.rows_created = 0;
  report.rows_updated = 0;
  const summary = emptyStudentAccountsSummary();

  for (const r of rows) {
    if (!r.parsed) {
      report.rows_failed += 1;
      summary.failed += 1;
      r.errors.forEach((e) => report.errors.push(e));
      continue;
    }

    const p = r.parsed;
    if (p.outcome === "ALREADY_LINKED") {
      report.rows_success += 1;
      report.rows_updated! += 1;
      summary.already_linked += 1;
      summary.skipped += 1;
      continue;
    }

    if (p.outcome !== "READY_TO_CREATE") {
      report.rows_failed += 1;
      summary.failed += 1;
      report.errors.push({
        row: r.rowNumber,
        message: `حالة غير قابلة للتنفيذ: ${p.outcome}`,
      });
      continue;
    }

    summary.ready_to_create += 1;

    if (dryRun) {
      report.rows_success += 1;
      report.rows_created! += 1;
      continue;
    }

    if (!ctx?.userSupabase) {
      report.rows_failed += 1;
      summary.failed += 1;
      report.errors.push({
        row: r.rowNumber,
        message: "مسار إداري آمن غير متاح — تعذّر إنشاء الحساب",
      });
      continue;
    }

    // Re-read profile: ensure still exists, still unlinked, and we touch only login linkage.
    const { data: profile, error: profileErr } = await sb
      .from("student_profiles")
      .select("id, academic_number, user_id, email")
      .eq("id", p.student_profile_id)
      .maybeSingle();

    if (profileErr || !profile) {
      report.rows_failed += 1;
      summary.failed += 1;
      report.errors.push({
        row: r.rowNumber,
        column: "academic_number",
        message: "الطالب غير موجود — يجب استيراد بياناته أولاً",
      });
      continue;
    }

    if ((profile as { user_id: string | null }).user_id) {
      // Idempotent: another concurrent run linked it.
      report.rows_success += 1;
      summary.already_linked += 1;
      summary.skipped += 1;
      continue;
    }

    try {
      await provisionStudentLoginServer(ctx, {
        profile_id: p.student_profile_id,
        academic_number: p.academic_number,
        university_email: p.university_email,
        must_change_password: p.must_change_password,
      });

      await safeAudit("student_existing_account_created", p.student_profile_id, {
        academic_number: p.academic_number,
        university_email: p.university_email,
        must_change_password: p.must_change_password,
        is_active: p.is_active,
        notes: p.notes,
        actor_user_id: ctx.userId,
        // password intentionally omitted
      });

      report.rows_success += 1;
      report.rows_created! += 1;
      summary.created += 1;
    } catch (e) {
      report.rows_failed += 1;
      summary.failed += 1;
      report.errors.push({
        row: r.rowNumber,
        message: `إنشاء الحساب: ${(e as Error).message}`,
      });
    }
  }

  report.student_accounts_summary = summary;
  return report;
}

const DOC_AUDIT_ACTION: Record<string, string> = {
  enrollment_certificate: "certificate_generated",
  student_status_certificate: "certificate_generated",
  official_transcript: "transcript_generated",
  financial_receipt: "financial_receipt_generated",
};

export async function importDocuments(
  rows: ValidatedRow<DocumentRow>[],
  dryRun = false,
  ctx?: ServerImportContext,
): Promise<ImportReport> {
  if (dryRun) return dryRunReport(rows);
  const report: ImportReport = {
    rows_total: rows.length,
    rows_success: 0,
    rows_failed: 0,
    rows_created: 0,
    errors: [],
  };

  for (const r of rows) {
    if (r.parsed === null) {
      report.rows_failed += 1;
      r.errors.forEach((e) => report.errors.push(e));
      continue;
    }
    const p = r.parsed;

    const { data: docNum, error: numErr } = await sb.rpc("generate_document_number");
    if (numErr || !docNum) {
      report.rows_failed += 1;
      report.errors.push({
        row: r.rowNumber,
        message: numErr?.message ?? "تعذّر توليد رقم الوثيقة",
      });
      continue;
    }
    const { data: verCode, error: codeErr } = await sb.rpc("generate_verification_code");
    if (codeErr || !verCode) {
      report.rows_failed += 1;
      report.errors.push({
        row: r.rowNumber,
        message: codeErr?.message ?? "تعذّر توليد رمز التحقق",
      });
      continue;
    }

    const { data: inserted, error } = await sb
      .from("official_documents")
      .insert({
        student_profile_id: p.student_profile_id,
        document_type: p.document_type,
        document_number: docNum,
        verification_code: verCode,
        issued_by: ctx?.userId ?? null,
        issued_at: p.issued_at ?? new Date().toISOString(),
        status: "issued",
        metadata: p.metadata,
      })
      .select("id")
      .maybeSingle();

    if (error || !inserted) {
      report.rows_failed += 1;
      report.errors.push({ row: r.rowNumber, message: error?.message ?? "تعذّر إصدار الوثيقة" });
      continue;
    }

    const auditAction = DOC_AUDIT_ACTION[p.document_type] ?? "document_issued";
    await safeDocumentAudit(auditAction, inserted.id, {
      document_number: docNum,
      document_type: p.document_type,
      student_profile_id: p.student_profile_id,
      verification_code: verCode,
    });

    report.rows_success += 1;
    report.rows_created! += 1;
  }
  return report;
}
