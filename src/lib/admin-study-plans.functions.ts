import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const STUDY_PLANS_ADMIN_ROLES = [
  "system_admin",
  "admin",
  "dean",
  "registrar",
] as const;

async function assertStudyPlansAdmin(userId: string) {
  await assertAnyRole(
    userId,
    STUDY_PLANS_ADMIN_ROLES,
    "ليس لديك صلاحية إدارة الخطط والمقررات",
  );
}

export const getStudyPlansLookups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStudyPlansAdmin(context.userId);
    const [deptsRes, progsRes, levelsRes] = await Promise.all([
      supabaseAdmin.from("departments").select("id, name_ar").order("sort_order"),
      supabaseAdmin.from("programs").select("id, name_ar, code, department_id").order("sort_order"),
      supabaseAdmin.from("academic_levels").select("id, name, level_number").order("level_number"),
    ]);
    if (deptsRes.error) throw new Error(deptsRes.error.message);
    if (progsRes.error) throw new Error(progsRes.error.message);
    if (levelsRes.error) throw new Error(levelsRes.error.message);
    return {
      departments: deptsRes.data ?? [],
      programs: progsRes.data ?? [],
      levels: levelsRes.data ?? [],
    };
  });

// ── Courses ────────────────────────────────────────────────────────────────

export const listCourses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStudyPlansAdmin(context.userId);
    const { data, error } = await supabaseAdmin.from("courses").select("*").order("code");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listCoursesMinimal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStudyPlansAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("courses")
      .select("id, code, name_ar, credit_hours")
      .order("code");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listCoursePlanLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStudyPlansAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("study_plan_courses")
      .select("course_id, level_id, semester_code, study_plans(program_id)");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const coursePayloadSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name_ar: z.string().trim().min(1).max(200),
  name_en: z.string().trim().max(200).nullable(),
  credit_hours: z.number().min(0),
  theory_hours: z.number().min(0),
  practical_hours: z.number().min(0),
  department_id: z.string().uuid().nullable(),
  status: z.enum(["active", "inactive"]),
});

export const upsertCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid().optional(), ...coursePayloadSchema.shape }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStudyPlansAdmin(context.userId);
    const payload = {
      code: data.code,
      name_ar: data.name_ar,
      name_en: data.name_en,
      credit_hours: data.credit_hours,
      theory_hours: data.theory_hours,
      practical_hours: data.practical_hours,
      department_id: data.department_id,
      status: data.status,
    };
    const { error } = data.id
      ? await supabaseAdmin.from("courses").update(payload).eq("id", data.id)
      : await supabaseAdmin.from("courses").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStudyPlansAdmin(context.userId);
    const { error } = await supabaseAdmin.from("courses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ── Study plans ────────────────────────────────────────────────────────────

export const listStudyPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStudyPlansAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("study_plans")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listStudyPlansByProgram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ programId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStudyPlansAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("study_plans")
      .select("*")
      .eq("program_id", data.programId)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const studyPlanPayloadSchema = z.object({
  program_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  version: z.string().trim().min(1).max(50),
  total_credit_hours: z.number().min(0),
  status: z.enum(["active", "archived"]),
  is_active: z.boolean(),
});

export const upsertStudyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid().optional(), ...studyPlanPayloadSchema.shape }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStudyPlansAdmin(context.userId);
    const payload = {
      program_id: data.program_id,
      name: data.name,
      version: data.version,
      total_credit_hours: data.total_credit_hours,
      status: data.status,
      is_active: data.is_active,
    };
    const { error } = data.id
      ? await supabaseAdmin.from("study_plans").update(payload).eq("id", data.id)
      : await supabaseAdmin.from("study_plans").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteStudyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStudyPlansAdmin(context.userId);
    const { error } = await supabaseAdmin.from("study_plans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ── Plan courses ───────────────────────────────────────────────────────────

export const listStudyPlanCourses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ studyPlanId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStudyPlansAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("study_plan_courses")
      .select("*")
      .eq("study_plan_id", data.studyPlanId)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const planCoursePayloadSchema = z.object({
  study_plan_id: z.string().uuid(),
  course_id: z.string().uuid(),
  level_id: z.string().uuid(),
  semester_code: z.enum(["first", "second"]),
  is_required: z.boolean(),
  prerequisite_course_id: z.string().uuid().nullable(),
  sort_order: z.number().int().min(0),
});

export const upsertStudyPlanCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid().optional(), ...planCoursePayloadSchema.shape }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStudyPlansAdmin(context.userId);
    const payload = {
      study_plan_id: data.study_plan_id,
      course_id: data.course_id,
      level_id: data.level_id,
      semester_code: data.semester_code,
      is_required: data.is_required,
      prerequisite_course_id: data.prerequisite_course_id,
      sort_order: data.sort_order,
    };
    const { error } = data.id
      ? await supabaseAdmin.from("study_plan_courses").update(payload).eq("id", data.id)
      : await supabaseAdmin.from("study_plan_courses").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteStudyPlanCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStudyPlansAdmin(context.userId);
    const { error } = await supabaseAdmin.from("study_plan_courses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
