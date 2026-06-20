import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const COURSE_OFFERINGS_ADMIN_ROLES = [
  "system_admin",
  "admin",
  "dean",
  "registrar",
  "department_head",
] as const;

async function assertCourseOfferingsAdmin(userId: string) {
  await assertAnyRole(
    userId,
    COURSE_OFFERINGS_ADMIN_ROLES,
    "ليس لديك صلاحية إدارة إسناد المقررات والمجموعات",
  );
}

function normalizeSemesterCode(rawCode: string | null | undefined): string | null {
  if (!rawCode) return null;
  if (rawCode === "first" || rawCode === "second") return rawCode;
  if (rawCode.endsWith("-1")) return "first";
  if (rawCode.endsWith("-2")) return "second";
  return rawCode;
}

export const getCourseOfferingsLookups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCourseOfferingsAdmin(context.userId);
    const [
      coursesRes, yearsRes, semestersRes, programsRes,
      levelsRes, departmentsRes, facultyRes,
    ] = await Promise.all([
      supabaseAdmin.from("courses").select("id, code, name_ar").order("code"),
      supabaseAdmin.from("academic_years").select("id, name, is_current").order("start_date", { ascending: false }),
      supabaseAdmin.from("semesters").select("id, academic_year_id, name, code").order("start_date"),
      supabaseAdmin.from("programs").select("id, name_ar, code, department_id").order("sort_order"),
      supabaseAdmin.from("academic_levels").select("id, name, level_number").order("level_number"),
      supabaseAdmin.from("departments").select("id, name_ar").order("name_ar"),
      supabaseAdmin.from("faculty_profiles").select("id, full_name_ar, employee_number").order("full_name_ar"),
    ]);

    const firstErr = [coursesRes, yearsRes, semestersRes, programsRes, levelsRes, departmentsRes, facultyRes]
      .find((r) => r.error)?.error;
    if (firstErr) throw new Error(firstErr.message);

    return {
      courses: coursesRes.data ?? [],
      years: yearsRes.data ?? [],
      semesters: semestersRes.data ?? [],
      programs: programsRes.data ?? [],
      levels: levelsRes.data ?? [],
      departments: departmentsRes.data ?? [],
      faculty: facultyRes.data ?? [],
    };
  });

// ── Course offerings ─────────────────────────────────────────────────────────

export const listCourseOfferings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCourseOfferingsAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("course_offerings")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const offeringPayloadSchema = z.object({
  course_id: z.string().uuid(),
  academic_year_id: z.string().uuid(),
  semester_id: z.string().uuid(),
  program_id: z.string().uuid(),
  level_id: z.string().uuid(),
  status: z.enum(["active", "inactive"]),
});

export const upsertCourseOffering = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid().optional(), ...offeringPayloadSchema.shape }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCourseOfferingsAdmin(context.userId);
    const payload = {
      course_id: data.course_id,
      academic_year_id: data.academic_year_id,
      semester_id: data.semester_id,
      program_id: data.program_id,
      level_id: data.level_id,
      status: data.status,
    };
    const { error } = data.id
      ? await supabaseAdmin.from("course_offerings").update(payload).eq("id", data.id)
      : await supabaseAdmin.from("course_offerings").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteCourseOffering = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCourseOfferingsAdmin(context.userId);
    const { error } = await supabaseAdmin.from("course_offerings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getPlanCoursesForOffering = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      programId: z.string().uuid(),
      levelId: z.string().uuid(),
      semesterId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCourseOfferingsAdmin(context.userId);

    const { data: semester, error: semErr } = await supabaseAdmin
      .from("semesters")
      .select("code")
      .eq("id", data.semesterId)
      .maybeSingle();
    if (semErr) throw new Error(semErr.message);

    const semesterCode = normalizeSemesterCode(semester?.code);
    if (!semesterCode) return { noPlan: true, courses: [] };

    const { data: plans, error: pErr } = await supabaseAdmin
      .from("study_plans")
      .select("id")
      .eq("program_id", data.programId)
      .eq("is_active", true)
      .eq("status", "active");
    if (pErr) throw new Error(pErr.message);
    if (!plans || plans.length === 0) return { noPlan: true, courses: [] };

    const planIds = plans.map((p) => p.id as string);
    const { data: spc, error: sErr } = await supabaseAdmin
      .from("study_plan_courses")
      .select("course_id, sort_order")
      .in("study_plan_id", planIds)
      .eq("level_id", data.levelId)
      .eq("semester_code", semesterCode)
      .order("sort_order");
    if (sErr) throw new Error(sErr.message);

    const ids = Array.from(new Set((spc ?? []).map((r) => r.course_id as string)));
    if (ids.length === 0) return { noPlan: false, courses: [] };

    const { data: cs, error: cErr } = await supabaseAdmin
      .from("courses")
      .select("id, code, name_ar")
      .in("id", ids);
    if (cErr) throw new Error(cErr.message);

    const order = new Map(ids.map((id, i) => [id, i]));
    const courses = (cs ?? []).slice().sort(
      (a, b) => (order.get(a.id as string) ?? 0) - (order.get(b.id as string) ?? 0),
    );

    return { noPlan: false, courses };
  });

// ── Course sections (المجموعات) ────────────────────────────────────────────

export const listCourseSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCourseOfferingsAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("course_sections")
      .select("*")
      .order("section_code");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const sectionPayloadSchema = z.object({
  course_offering_id: z.string().uuid(),
  section_code: z.string().trim().min(1).max(20),
  faculty_profile_id: z.string().uuid().nullable(),
  capacity: z.number().int().min(1).nullable(),
  status: z.enum(["active", "inactive"]),
});

export const upsertCourseSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid().optional(), ...sectionPayloadSchema.shape }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCourseOfferingsAdmin(context.userId);
    const payload = {
      course_offering_id: data.course_offering_id,
      section_code: data.section_code.toUpperCase(),
      faculty_profile_id: data.faculty_profile_id,
      capacity: data.capacity,
      status: data.status,
    };
    const { error } = data.id
      ? await supabaseAdmin.from("course_sections").update(payload).eq("id", data.id)
      : await supabaseAdmin.from("course_sections").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteCourseSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCourseOfferingsAdmin(context.userId);
    const { error } = await supabaseAdmin.from("course_sections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ── Schedule stats (read-only) ─────────────────────────────────────────────

export const getClassScheduleStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCourseOfferingsAdmin(context.userId);
    const [totalRes, publishedRes] = await Promise.all([
      supabaseAdmin.from("class_schedule").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("class_schedule").select("id", { count: "exact", head: true }).eq("status", "published"),
    ]);
    if (totalRes.error) throw new Error(totalRes.error.message);
    if (publishedRes.error) throw new Error(publishedRes.error.message);
    return {
      total: totalRes.count ?? 0,
      published: publishedRes.count ?? 0,
    };
  });
