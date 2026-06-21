import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enforceRateLimit, SERVER_RATE_LIMIT_POLICIES } from "@/lib/rate-limit.server";
import {
  emptyReport,
  finalizeImportServer,
  importCourses,
  importDepartments,
  importFaculty,
  importLevels,
  importPrograms,
  importStaff,
  importStudents,
  importStudyPlans,
  importCourseSections,
  importStudentEnrollments,
  importStudentGrades,
  importStudentFees,
  importStudentDiscounts,
  importDocuments,
  type ServerImportContext,
} from "@/lib/imports/engine.server";
import type { ImportReport, ImportType } from "@/lib/imports/types";
import { executeScheduleImport } from "@/lib/imports/class-schedule.server";
import type { ScheduleContext, ScheduleImportReport } from "@/lib/imports/class-schedule";

const IMPORT_PANEL_ROLES = [
  "admin",
  "system_admin",
  "registrar",
  "student_affairs",
  "finance_officer",
] as const;

/** Roles allowed to execute class_schedule import writes (matches class_schedule RLS). */
export const SCHEDULE_IMPORT_WRITE_ROLES = [
  "admin",
  "system_admin",
  "registrar",
] as const;

/** Roles allowed to open schedule import UI (preview); write requires SCHEDULE_IMPORT_WRITE_ROLES. */
export const SCHEDULE_IMPORT_PANEL_ROLES = [
  ...SCHEDULE_IMPORT_WRITE_ROLES,
  "student_affairs",
  "dean",
  "department_head",
] as const;

const importTypeSchema = z.enum([
  "students",
  "faculty",
  "staff",
  "courses",
  "study_plans",
  "departments",
  "programs",
  "levels",
  "course_sections",
  "student_enrollments",
  "student_grades",
  "student_fees",
  "student_discounts",
  "documents",
]);

const ACADEMIC_IMPORT_ROLES = [
  "admin",
  "system_admin",
  "registrar",
  "student_affairs",
] as const;

const FINANCE_IMPORT_ROLES = ["admin", "system_admin", "finance_officer"] as const;

const IMPORT_ROLES_BY_TYPE: Record<
  z.infer<typeof importTypeSchema>,
  readonly string[]
> = {
  students: ACADEMIC_IMPORT_ROLES,
  student_enrollments: ACADEMIC_IMPORT_ROLES,
  student_grades: ACADEMIC_IMPORT_ROLES,
  documents: ACADEMIC_IMPORT_ROLES,
  courses: ACADEMIC_IMPORT_ROLES,
  study_plans: ACADEMIC_IMPORT_ROLES,
  departments: ACADEMIC_IMPORT_ROLES,
  programs: ACADEMIC_IMPORT_ROLES,
  levels: ACADEMIC_IMPORT_ROLES,
  course_sections: ACADEMIC_IMPORT_ROLES,
  student_fees: FINANCE_IMPORT_ROLES,
  student_discounts: FINANCE_IMPORT_ROLES,
  faculty: ["admin", "system_admin", "registrar"],
  staff: ["admin", "system_admin", "registrar"],
};

const validatedRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  raw: z.record(z.string(), z.unknown()),
  parsed: z.unknown().nullable(),
  errors: z.array(z.object({
    row: z.number().int(),
    column: z.string().optional(),
    message: z.string(),
  })),
});

const inputSchema = z.object({
  type: importTypeSchema,
  fileName: z.string().min(1).max(255),
  rows: z.array(validatedRowSchema).max(5000),
  dryRun: z.boolean().default(false),
  updateExisting: z.boolean().default(false),
});

export const runBulkImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(
      context.userId,
      IMPORT_PANEL_ROLES,
      "ليس لديك صلاحية الوصول إلى الاستيراد",
    );
    await assertAnyRole(
      context.userId,
      IMPORT_ROLES_BY_TYPE[data.type],
      "ليس لديك صلاحية استيراد هذا النوع من البيانات",
    );

    if (!data.dryRun) {
      await enforceRateLimit(`import:${context.userId}`, SERVER_RATE_LIMIT_POLICIES.accountImport);
    }

    const ctx: ServerImportContext = {
      userId: context.userId,
      userSupabase: context.supabase,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vrows = data.rows as any[];
    let report: ImportReport = emptyReport();
    const t0 = Date.now();

    switch (data.type) {
      case "students":
        report = await importStudents(vrows, data.dryRun, ctx);
        break;
      case "faculty":
        report = await importFaculty(vrows, data.dryRun);
        break;
      case "staff":
        report = await importStaff(vrows, data.dryRun);
        break;
      case "courses":
        report = await importCourses(vrows, data.dryRun);
        break;
      case "study_plans":
        report = await importStudyPlans(vrows, data.dryRun);
        break;
      case "departments":
        report = await importDepartments(vrows, data.dryRun, data.updateExisting);
        break;
      case "programs":
        report = await importPrograms(vrows, data.dryRun, data.updateExisting);
        break;
      case "levels":
        report = await importLevels(vrows, data.dryRun, data.updateExisting);
        break;
      case "course_sections":
        report = await importCourseSections(vrows, data.dryRun, data.updateExisting);
        break;
      case "student_enrollments":
        report = await importStudentEnrollments(vrows, data.dryRun, data.updateExisting);
        break;
      case "student_grades":
        report = await importStudentGrades(vrows, data.dryRun, data.updateExisting);
        break;
      case "student_fees":
        report = await importStudentFees(vrows, data.dryRun, data.updateExisting);
        break;
      case "student_discounts":
        report = await importStudentDiscounts(vrows, data.dryRun, data.updateExisting);
        break;
      case "documents":
        report = await importDocuments(vrows, data.dryRun, ctx);
        break;
      default:
        throw new Error("نوع استيراد غير مدعوم");
    }

    await finalizeImportServer({
      type: data.type as ImportType,
      fileName: data.fileName,
      report,
      userId: context.userId,
      dryRun: data.dryRun,
      durationMs: Date.now() - t0,
    });

    return report;
  });

export const getImportStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(context.userId, IMPORT_PANEL_ROLES, "ليس لديك صلاحية");
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayIso = startOfToday.toISOString();
    const [all, today, completed, failed] = await Promise.all([
      supabaseAdmin.from("import_logs").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("import_logs").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
      supabaseAdmin.from("import_logs").select("id", { count: "exact", head: true }).eq("status", "completed"),
      supabaseAdmin.from("import_logs").select("id", { count: "exact", head: true }).eq("status", "failed"),
    ]);
    const total = all.count ?? 0;
    const okCount = completed.count ?? 0;
    const rate = total > 0 ? Math.round((okCount / total) * 100) : 0;
    return { total, today: today.count ?? 0, completed: okCount, failed: failed.count ?? 0, rate };
  });

export const listImportHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(context.userId, IMPORT_PANEL_ROLES, "ليس لديك صلاحية");
    const { data, error } = await supabaseAdmin
      .from("import_logs")
      .select("id, created_at, import_type, file_name, rows_total, rows_success, rows_failed, status, notes")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getScheduleImportLookups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(context.userId, SCHEDULE_IMPORT_PANEL_ROLES, "ليس لديك صلاحية");
    const [yearsRes, semRes, progRes, lvlRes] = await Promise.all([
      supabaseAdmin.from("academic_years").select("id, name").order("name", { ascending: false }),
      supabaseAdmin.from("semesters").select("id, name, code").order("name"),
      supabaseAdmin.from("programs").select("id, code, name_ar").eq("is_active", true).order("name_ar"),
      supabaseAdmin.from("academic_levels").select("id, name, level_number").order("level_number"),
    ]);
    if (yearsRes.error) throw new Error(yearsRes.error.message);
    if (semRes.error) throw new Error(semRes.error.message);
    if (progRes.error) throw new Error(progRes.error.message);
    if (lvlRes.error) throw new Error(lvlRes.error.message);
    return {
      academicYears: yearsRes.data ?? [],
      semesters: semRes.data ?? [],
      programs: progRes.data ?? [],
      levels: lvlRes.data ?? [],
    };
  });

export const logScheduleImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      fileName: z.string().min(1),
      rowsTotal: z.number().int().min(0),
      rowsSuccess: z.number().int().min(0),
      rowsFailed: z.number().int().min(0),
      status: z.enum(["completed", "failed", "partial"]),
      notes: z.string().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, SCHEDULE_IMPORT_PANEL_ROLES, "ليس لديك صلاحية");
    const { error } = await supabaseAdmin.from("import_logs").insert({
      created_by: context.userId,
      import_type: "class_schedule",
      file_name: data.fileName,
      rows_total: data.rowsTotal,
      rows_success: data.rowsSuccess,
      rows_failed: data.rowsFailed,
      status: data.status,
      notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const scheduleContextSchema = z.object({
  academic_year_id: z.string().uuid(),
  semester_id: z.string().uuid(),
  program_id: z.string().uuid(),
  level_id: z.string().uuid(),
});

const scheduleImportInputSchema = z.object({
  context: scheduleContextSchema,
  rows: z.array(z.record(z.string(), z.unknown())).max(5000),
  fileName: z.string().min(1).max(255),
});

async function logScheduleImportResult(
  userId: string,
  fileName: string,
  rep: ScheduleImportReport,
) {
  const status = rep.aborted ? "failed" as const
    : rep.rows_failed === 0 ? "completed" as const
    : "partial" as const;
  const notes = (rep.abortReason ? `[ABORT] ${rep.abortReason} | ` : "")
    + rep.errors.slice(0, 30).map((e) => `R${e.row}: ${e.message}`).join(" | ") || null;

  await supabaseAdmin.from("import_logs").insert({
    created_by: userId,
    import_type: "class_schedule",
    file_name: fileName,
    rows_total: rep.rows_total,
    rows_success: rep.rows_inserted,
    rows_failed: rep.rows_failed + (rep.aborted ? rep.rows_total - rep.rows_inserted : 0),
    status,
    notes,
  });
}

export const runScheduleImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scheduleImportInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(
      context.userId,
      SCHEDULE_IMPORT_PANEL_ROLES,
      "ليس لديك صلاحية الوصول إلى استيراد الجداول",
    );
    await assertAnyRole(
      context.userId,
      SCHEDULE_IMPORT_WRITE_ROLES,
      "ليس لديك صلاحية استيراد الجداول الدراسية",
    );

    await enforceRateLimit(
      `schedule-import:${context.userId}`,
      SERVER_RATE_LIMIT_POLICIES.accountImport,
    );

    const rep = await executeScheduleImport(data.context as ScheduleContext, data.rows);

    try {
      await logScheduleImportResult(context.userId, data.fileName, rep);
    } catch {
      // best-effort audit
    }

    return rep;
  });
