import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
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
  type ServerImportContext,
} from "@/lib/imports/engine.server";
import type { ImportReport, ImportType } from "@/lib/imports/types";

const IMPORT_ROLES = [
  "admin",
  "system_admin",
  "registrar",
  "student_affairs",
  "finance_officer",
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
]);

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
      IMPORT_ROLES,
      "ليس لديك صلاحية تنفيذ الاستيراد الجماعي",
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
