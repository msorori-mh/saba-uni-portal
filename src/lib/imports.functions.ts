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
  importStudentEligibility,
  importDocuments,
  type ServerImportContext,
} from "@/lib/imports/engine.server";
import type { ImportReport, ImportType } from "@/lib/imports/types";
import { shouldSkipEligibilityFinalizeServer } from "@/lib/imports/eligibility-import-policy";
import { executeScheduleImport } from "@/lib/imports/class-schedule.server";
import type { ScheduleContext, ScheduleImportReport } from "@/lib/imports/class-schedule";
import {
  assertServerValidationPassed,
  previewBulkImportValidation,
  revalidateBulkImportRows,
} from "@/lib/imports/bulk-import-validation.server";
import type { ValidatedRow } from "@/lib/imports/types";

const IMPORT_PANEL_ROLES = [
  "admin",
  "system_admin",
  "registrar",
  "student_affairs",
  "finance_officer",
] as const;

/** Roles allowed to execute class_schedule import writes (matches class_schedule RLS). */
export const SCHEDULE_IMPORT_WRITE_ROLES = ["admin", "system_admin", "registrar"] as const;

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
  "student_eligibility",
  "documents",
]);

const ACADEMIC_IMPORT_ROLES = ["admin", "system_admin", "registrar", "student_affairs"] as const;

const FINANCE_IMPORT_ROLES = ["admin", "system_admin", "finance_officer"] as const;

const IMPORT_ROLES_BY_TYPE: Record<z.infer<typeof importTypeSchema>, readonly string[]> = {
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
  student_eligibility: ACADEMIC_IMPORT_ROLES,
  faculty: ["admin", "system_admin", "registrar"],
  staff: ["admin", "system_admin", "registrar"],
};

const validatedRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  raw: z.record(z.string(), z.unknown()),
  parsed: z.unknown().nullable(),
  errors: z.array(
    z.object({
      row: z.number().int(),
      column: z.string().optional(),
      message: z.string(),
    }),
  ),
});

const inputSchema = z.object({
  type: importTypeSchema,
  fileName: z.string().min(1).max(255),
  rows: z.array(validatedRowSchema).max(5000),
  dryRun: z.boolean().default(false),
  updateExisting: z.boolean().default(false),
  studyPlanContext: z
    .object({
      departmentId: z.string().uuid(),
      programId: z.string().uuid(),
      planName: z.string().trim().min(1).max(200),
      version: z.string().trim().min(1).max(50),
      planStatus: z.enum(["draft", "active"]).default("active"),
      importMode: z.enum(["full_plan", "single_semester"]),
      semesterCode: z.enum(["first", "second"]).optional().nullable(),
    })
    .optional(),
});

const previewInputSchema = z.object({
  type: importTypeSchema,
  rows: z.array(z.record(z.string(), z.unknown())).max(5000),
  updateExisting: z.boolean().default(false),
  studyPlanContext: z
    .object({
      departmentId: z.string().uuid(),
      programId: z.string().uuid(),
      planName: z.string().trim().min(1).max(200),
      version: z.string().trim().min(1).max(50),
      planStatus: z.enum(["draft", "active"]).default("active"),
      importMode: z.enum(["full_plan", "single_semester"]),
      semesterCode: z.enum(["first", "second"]).optional().nullable(),
    })
    .optional(),
});

type StudyPlanImportContext = z.infer<typeof previewInputSchema>["studyPlanContext"];

function studyPlanCell(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function assertStudyPlanImportContext(
  context: StudyPlanImportContext,
): NonNullable<StudyPlanImportContext> {
  if (!context) throw new Error("يجب إكمال إعدادات سياق الخطة الدراسية قبل المتابعة.");
  if (!context.departmentId) throw new Error("يجب اختيار القسم.");
  if (!context.programId) throw new Error("يجب اختيار البرنامج.");
  if (!context.planName?.trim()) throw new Error("يجب إدخال اسم الخطة.");
  if (!context.version?.trim()) throw new Error("يجب إدخال إصدار الخطة.");
  if (!context.importMode) throw new Error("يجب تحديد نوع الاستيراد.");
  if (context.importMode === "single_semester" && !context.semesterCode) {
    throw new Error("يجب تحديد الفصل الدراسي عند استيراد فصل محدد.");
  }
  return context;
}

async function applyStudyPlanImportContext(
  rows: Record<string, unknown>[],
  context: StudyPlanImportContext,
) {
  const requiredContext = assertStudyPlanImportContext(context);

  const [{ data: program }, { data: existingPlan }] = await Promise.all([
    supabaseAdmin
      .from("programs")
      .select("id, code, department_id")
      .eq("id", requiredContext.programId)
      .maybeSingle(),
    supabaseAdmin
      .from("study_plans")
      .select("id")
      .eq("program_id", requiredContext.programId)
      .eq("version", requiredContext.version)
      .maybeSingle(),
  ]);
  if (!program) throw new Error("البرنامج المختار غير موجود.");
  if (program.department_id !== requiredContext.departmentId) {
    throw new Error("البرنامج المختار لا يتبع القسم المحدد.");
  }
  if (existingPlan) {
    throw new Error("توجد خطة مسبقاً لهذا البرنامج والإصدار.");
  }

  return rows.map((row, idx) => {
    const rowNumber = idx + 2;
    const next = { ...row };
    const fileProgramCode = studyPlanCell(next.program_code);
    if (
      fileProgramCode &&
      fileProgramCode.toLowerCase() !== String(program.code ?? "").toLowerCase()
    ) {
      throw new Error(`صف ${rowNumber}: البرنامج داخل الملف لا يطابق البرنامج المختار من الشاشة.`);
    }
    next.program_code = program.code;
    next.plan_name = requiredContext.planName;
    next.version = requiredContext.version;
    next.plan_status = requiredContext.planStatus;

    if (requiredContext.importMode === "full_plan") {
      if (!studyPlanCell(next.level)) {
        throw new Error(`صف ${rowNumber}: يجب إدخال المستوى عند استيراد خطة كاملة.`);
      }
      if (!studyPlanCell(next.semester)) {
        throw new Error(`صف ${rowNumber}: يجب إدخال الفصل الدراسي عند استيراد خطة كاملة.`);
      }
    } else {
      const fileSemester = studyPlanCell(next.semester);
      if (fileSemester && fileSemester.toLowerCase() !== requiredContext.semesterCode) {
        throw new Error(
          `صف ${rowNumber}: الفصل الدراسي داخل الملف لا يطابق الفصل المحدد في إعدادات الاستيراد.`,
        );
      }
      next.semester = requiredContext.semesterCode;
    }
    return next;
  });
}

export const validateBulkImportPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => previewInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, IMPORT_PANEL_ROLES, "ليس لديك صلاحية الوصول إلى الاستيراد");
    await assertAnyRole(
      context.userId,
      IMPORT_ROLES_BY_TYPE[data.type],
      "ليس لديك صلاحية استيراد هذا النوع من البيانات",
    );
    const rows =
      data.type === "study_plans"
        ? await applyStudyPlanImportContext(data.rows, data.studyPlanContext)
        : data.rows;
    return previewBulkImportValidation(data.type, rows, data.updateExisting);
  });

export const runBulkImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, IMPORT_PANEL_ROLES, "ليس لديك صلاحية الوصول إلى الاستيراد");
    await assertAnyRole(
      context.userId,
      IMPORT_ROLES_BY_TYPE[data.type],
      "ليس لديك صلاحية استيراد هذا النوع من البيانات",
    );

    if (!data.dryRun) {
      await enforceRateLimit(`import:${context.userId}`, SERVER_RATE_LIMIT_POLICIES.accountImport);
    }

    const serverRows =
      data.type === "study_plans"
        ? (
            await previewBulkImportValidation(
              data.type,
              await applyStudyPlanImportContext(
                (data.rows as ValidatedRow[]).map((row) => row.raw),
                data.studyPlanContext,
              ),
              data.updateExisting,
            )
          ).rows
        : await revalidateBulkImportRows(data.type, data.rows as ValidatedRow[]);
    assertServerValidationPassed(serverRows);

    const ctx: ServerImportContext = {
      userId: context.userId,
      userSupabase: context.supabase,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vrows = serverRows as any[];
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
      case "student_eligibility":
        report = await importStudentEligibility(vrows, data.dryRun, {
          userId: context.userId,
          fileName: data.fileName,
        });
        break;
      case "documents":
        report = await importDocuments(vrows, data.dryRun, ctx);
        break;
      default:
        throw new Error("نوع استيراد غير مدعوم");
    }

    if (!shouldSkipEligibilityFinalizeServer(data.type, data.dryRun)) {
      await finalizeImportServer({
        type: data.type as ImportType,
        fileName: data.fileName,
        report,
        userId: context.userId,
        dryRun: data.dryRun,
        durationMs: Date.now() - t0,
      });
    }

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
      supabaseAdmin
        .from("import_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayIso),
      supabaseAdmin
        .from("import_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed"),
      supabaseAdmin
        .from("import_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed"),
    ]);
    const total = all.count ?? 0;
    const okCount = completed.count ?? 0;
    const rate = total > 0 ? Math.round((okCount / total) * 100) : 0;
    return { total, today: today.count ?? 0, completed: okCount, failed: failed.count ?? 0, rate };
  });

export const getStudentImportContextOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(context.userId, IMPORT_PANEL_ROLES, "ليس لديك صلاحية الوصول إلى الاستيراد");

    const [depsRes, progsRes, levelsRes, yearsRes, semsRes] = await Promise.all([
      supabaseAdmin
        .from("departments")
        .select("id, name_ar")
        .eq("is_active", true)
        .order("sort_order"),
      supabaseAdmin
        .from("programs")
        .select("id, code, name_ar, department_id")
        .eq("is_active", true)
        .order("sort_order"),
      supabaseAdmin
        .from("academic_levels")
        .select("id, name, level_number")
        .eq("status", "active")
        .order("level_number"),
      supabaseAdmin
        .from("academic_years")
        .select("id, name, is_current")
        .order("start_date", { ascending: false }),
      supabaseAdmin
        .from("semesters")
        .select("id, name, code, academic_year_id, is_current")
        .order("start_date", { ascending: false }),
    ]);

    const firstError = [depsRes, progsRes, levelsRes, yearsRes, semsRes].find(
      (res) => res.error,
    )?.error;
    if (firstError) throw new Error(firstError.message);

    return {
      studySystems: [
        { value: "regular", label: "نظام عام" },
        { value: "private", label: "نفقة خاصة" },
      ],
      departments: (depsRes.data ?? []).map((department) => ({
        id: department.id,
        code: department.name_ar,
        name: department.name_ar,
        study_system: null as string | null,
      })),
      programs: (progsRes.data ?? []).map((program) => ({
        id: program.id,
        code: program.code,
        name: program.name_ar,
        department_id: program.department_id,
        study_system: null as string | null,
      })),
      levels: (levelsRes.data ?? []).map((level) => ({
        id: level.id,
        code: String(level.level_number),
        name: level.name,
        level_number: level.level_number,
      })),
      academicYears: (yearsRes.data ?? []).map((year) => ({
        id: year.id,
        name: year.name,
        is_current: year.is_current,
      })),
      semesters: (semsRes.data ?? []).map((semester) => ({
        id: semester.id,
        name: semester.name,
        code: semester.code,
        academic_year_id: semester.academic_year_id,
        is_current: semester.is_current,
      })),
    };
  });

export const getStudyPlanImportContextOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(context.userId, IMPORT_PANEL_ROLES, "ليس لديك صلاحية الوصول إلى الاستيراد");
    await assertAnyRole(
      context.userId,
      IMPORT_ROLES_BY_TYPE.study_plans,
      "ليس لديك صلاحية استيراد الخطط الدراسية",
    );

    const [departmentsRes, programsRes, levelsRes, yearsRes, semestersRes, plansRes] =
      await Promise.all([
        supabaseAdmin
          .from("departments")
          .select("id, name_ar")
          .eq("is_active", true)
          .order("sort_order"),
        supabaseAdmin
          .from("programs")
          .select("id, code, name_ar, department_id")
          .eq("is_active", true)
          .order("sort_order"),
        supabaseAdmin
          .from("academic_levels")
          .select("id, name, level_number")
          .eq("status", "active")
          .order("level_number"),
        supabaseAdmin
          .from("academic_years")
          .select("id, name, is_current")
          .order("start_date", { ascending: false }),
        supabaseAdmin
          .from("semesters")
          .select("id, name, code, academic_year_id, is_current")
          .order("start_date", { ascending: false }),
        supabaseAdmin
          .from("study_plans")
          .select("id, name, version, program_id, status, is_active")
          .order("updated_at", { ascending: false }),
      ]);
    const firstError = [
      departmentsRes,
      programsRes,
      levelsRes,
      yearsRes,
      semestersRes,
      plansRes,
    ].find((res) => res.error)?.error;
    if (firstError) throw new Error(firstError.message);

    return {
      departments: departmentsRes.data ?? [],
      programs: programsRes.data ?? [],
      levels: levelsRes.data ?? [],
      academicYears: yearsRes.data ?? [],
      semesters: semestersRes.data ?? [],
      studyPlans: plansRes.data ?? [],
    };
  });

export const listImportHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(context.userId, IMPORT_PANEL_ROLES, "ليس لديك صلاحية");
    const { data, error } = await supabaseAdmin
      .from("import_logs")
      .select(
        "id, created_at, import_type, file_name, rows_total, rows_success, rows_failed, status, notes",
      )
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
      supabaseAdmin
        .from("programs")
        .select("id, code, name_ar")
        .eq("is_active", true)
        .order("name_ar"),
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
    z
      .object({
        fileName: z.string().min(1),
        rowsTotal: z.number().int().min(0),
        rowsSuccess: z.number().int().min(0),
        rowsFailed: z.number().int().min(0),
        status: z.enum(["completed", "failed", "partial"]),
        notes: z.string().nullable().optional(),
      })
      .parse(input),
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
  const status = rep.aborted
    ? ("failed" as const)
    : rep.rows_failed === 0
      ? ("completed" as const)
      : ("partial" as const);
  const notes =
    (rep.abortReason ? `[ABORT] ${rep.abortReason} | ` : "") +
      rep.errors
        .slice(0, 30)
        .map((e) => `R${e.row}: ${e.message}`)
        .join(" | ") || null;

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
