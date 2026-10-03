import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ASSIGN_ROLES = ["system_admin", "admin", "registrar"] as const;
const READ_ROLES = ["system_admin", "admin", "dean", "registrar"] as const;

const ERRORS: Record<string, string> = {
  FORBIDDEN: "ليس لديك صلاحية تعيين الخطط الدراسية",
  PLAN_NOT_FOUND: "الخطة الدراسية غير موجودة",
  PLAN_PROGRAM_MISMATCH: "الخطة المختارة لا تتبع برنامج الطالب",
  TOO_MANY_STUDENTS: "عدد الطلاب كبير جداً لعملية واحدة",
};

/** Plans of one program (for the student form / bulk dialog). */
export const listPlansForProgram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ programId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, READ_ROLES, "غير مصرح");
    const { data: rows, error } = await supabaseAdmin
      .from("study_plans")
      .select("id, name, version, is_active")
      .eq("program_id", data.programId)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Students matching program + level + academic year (bulk target preview). */
export const previewPlanAssignmentTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      programId: z.string().uuid(),
      levelId: z.string().uuid(),
      academicYearId: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, ASSIGN_ROLES, "غير مصرح");
    const { data: sas, error } = await supabaseAdmin
      .from("student_academic_status")
      .select("student_profile_id")
      .eq("level_id", data.levelId)
      .eq("academic_year_id", data.academicYearId);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((sas ?? []).map((r) => r.student_profile_id as string)));
    if (!ids.length) return { studentIds: [] as string[], alreadyAssigned: 0 };
    const { data: sp, error: e2 } = await supabaseAdmin
      .from("student_profiles")
      .select("id, study_plan_id")
      .in("id", ids)
      .eq("program_id", data.programId);
    if (e2) throw new Error(e2.message);
    return {
      studentIds: (sp ?? []).map((s) => s.id as string),
      alreadyAssigned: (sp ?? []).filter((s) => s.study_plan_id).length,
    };
  });

/** Assign (or clear with null) a plan. Runs as the caller so the RPC's own role check applies. */
export const assignStudentsStudyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      studentIds: z.array(z.string().uuid()).min(1).max(2000),
      studyPlanId: z.string().uuid().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, ASSIGN_ROLES, ERRORS.FORBIDDEN);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: n, error } = await (context.supabase as any).rpc("admin_assign_student_study_plan", {
      p_student_ids: data.studentIds,
      p_study_plan_id: data.studyPlanId,
    });
    if (error) {
      const key = Object.keys(ERRORS).find((k) => error.message?.includes(k));
      throw new Error(key ? ERRORS[key] : "تعذّر تعيين الخطة الدراسية");
    }
    return { updated: Number(n ?? 0) };
  });

/** plan_id -> number of explicitly assigned students. */
export const getPlanAssignmentCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(context.userId, READ_ROLES, "غير مصرح");
    const { data, error } = await supabaseAdmin
      .from("student_profiles")
      .select("study_plan_id")
      .not("study_plan_id", "is", null);
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {};
    for (const r of data ?? []) {
      const k = r.study_plan_id as string;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  });

/** Current assignment of one student (for the edit form). */
export const getStudentPlanAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ studentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, READ_ROLES, "غير مصرح");
    const { data: row, error } = await supabaseAdmin
      .from("student_profiles")
      .select("study_plan_id")
      .eq("id", data.studentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { studyPlanId: (row?.study_plan_id as string | null) ?? null };
  });
