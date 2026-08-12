/**
 * Course syllabus (official academic source of the lecture plan).
 *
 * All authorization is enforced by the database RPCs (syllabus_*, cdp_*),
 * never by the UI. Importing creates a DRAFT version; approving it makes it
 * the single current version and instantiates the delivery-plan snapshot for
 * every active section of that course that has no current plan.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createHash } from "crypto";
import {
  validateCourseSyllabusRows,
  type SyllabusCourseGroup,
} from "@/lib/imports/course-syllabus";

export type SyllabusImportCourseResult = {
  course_code: string;
  status: "created" | "duplicate" | "failed";
  syllabus_id: string | null;
  version: number | null;
  sessions: number;
  message: string | null;
};

export type SyllabusImportReport = {
  aborted: boolean;
  abortReason?: string;
  totalRows: number;
  errors: { row: number; message: string }[];
  courses: SyllabusImportCourseResult[];
};

function fingerprint(group: SyllabusCourseGroup): string {
  const payload = JSON.stringify({
    course: group.course_code,
    description: group.description_ar,
    objectives: group.objectives_ar,
    references: group.references_ar,
    sessions: group.sessions.map((s) => [s.session_number, s.week_number, s.title_ar, s.topics_ar]),
  });
  return createHash("sha256").update(payload).digest("hex");
}

export const runCourseSyllabusImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: Record<string, unknown>[] }) => input)
  .handler(async ({ data, context }): Promise<SyllabusImportReport> => {
    const validation = validateCourseSyllabusRows(data.rows ?? []);
    if (!validation.valid) {
      return {
        aborted: true,
        abortReason: "الملف يحتوي صفوفاً غير صالحة. صحّح الأخطاء ثم أعد الرفع.",
        totalRows: validation.totalRows,
        errors: validation.errors.slice(0, 50),
        courses: [],
      };
    }

    const courses: SyllabusImportCourseResult[] = [];
    for (const group of validation.courses) {
      const { data: result, error } = await context.supabase.rpc("syllabus_import_version", {
        p_course_code: group.course_code,
        p_meta: {
          description_ar: group.description_ar,
          objectives_ar: group.objectives_ar,
          references_ar: group.references_ar,
        },
        p_sessions: group.sessions.map((s) => ({
          session_number: s.session_number,
          week_number: s.week_number,
          title_ar: s.title_ar,
          topics_ar: s.topics_ar,
        })),
        p_fingerprint: fingerprint(group),
      });

      if (error) {
        courses.push({
          course_code: group.course_code,
          status: "failed",
          syllabus_id: null,
          version: null,
          sessions: group.sessions.length,
          message: error.message,
        });
        continue;
      }

      const payload = (result ?? {}) as {
        syllabus_id?: string;
        version?: number;
        duplicate?: boolean;
      };
      courses.push({
        course_code: group.course_code,
        status: payload.duplicate ? "duplicate" : "created",
        syllabus_id: payload.syllabus_id ?? null,
        version: payload.version ?? null,
        sessions: group.sessions.length,
        message: payload.duplicate ? "نفس التوصيف مستورد مسبقاً — لم يُنشأ إصدار جديد" : null,
      });
    }

    return {
      aborted: false,
      totalRows: validation.totalRows,
      errors: [],
      courses,
    };
  });

export type CourseSyllabusRow = {
  id: string;
  course_id: string;
  course_code: string;
  course_name_ar: string;
  version: number;
  status: "draft" | "approved" | "superseded";
  is_current: boolean;
  planned_session_count: number;
  approved_at: string | null;
  created_at: string;
};

export const listCourseSyllabi = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CourseSyllabusRow[]> => {
    const { data, error } = await context.supabase
      .from("course_syllabi")
      .select(
        "id, course_id, version, status, is_current, planned_session_count, approved_at, created_at, courses(code, name_ar)",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const course = (row as { courses?: { code?: string; name_ar?: string } | null }).courses;
      return {
        id: row.id,
        course_id: row.course_id,
        course_code: course?.code ?? "",
        course_name_ar: course?.name_ar ?? "",
        version: row.version,
        status: row.status as CourseSyllabusRow["status"],
        is_current: row.is_current,
        planned_session_count: row.planned_session_count,
        approved_at: row.approved_at,
        created_at: row.created_at,
      };
    });
  });

export const approveCourseSyllabus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { syllabusId: string }) => input)
  .handler(async ({ data, context }): Promise<{ plansCreated: number }> => {
    const { data: result, error } = await context.supabase.rpc("syllabus_approve_version", {
      p_syllabus_id: data.syllabusId,
    });
    if (error) throw new Error(error.message);
    return { plansCreated: ((result ?? {}) as { plans_created?: number }).plans_created ?? 0 };
  });

export const regenerateSectionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sectionId: string }) => input)
  .handler(
    async ({ data, context }): Promise<{ planId: string | null; preservedHistory: boolean }> => {
      const { data: result, error } = await context.supabase.rpc("cdp_regenerate_section_plan", {
        p_course_section_id: data.sectionId,
      });
      if (error) throw new Error(error.message);
      const payload = (result ?? {}) as { plan_id?: string; preserved_history?: boolean };
      return {
        planId: payload.plan_id ?? null,
        preservedHistory: payload.preserved_history ?? false,
      };
    },
  );
