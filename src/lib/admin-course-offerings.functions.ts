import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole, userRoles } from "@/lib/authz.server";
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

/**
 * Department scope for teaching assignment.
 *
 * admin / system_admin / dean / registrar manage every department. A user who
 * is ONLY a department head is limited to offerings whose course belongs to
 * their own department (faculty_profiles.department_id — the same source as
 * public.is_department_head_of). The role check alone used to let any head
 * create, reassign or delete sections of every other department.
 */
const COLLEGE_WIDE_OFFERING_ROLES = ["system_admin", "admin", "dean", "registrar"] as const;
const OUT_OF_SCOPE_MSG = "لا يمكنك إدارة إسناد مقررات قسم آخر.";

export type OfferingScope = { all: true } | { all: false; departmentId: string };

async function resolveOfferingScope(userId: string): Promise<OfferingScope> {
  const roles = await userRoles(userId);
  if (roles.some((r) => (COLLEGE_WIDE_OFFERING_ROLES as readonly string[]).includes(r))) {
    return { all: true };
  }
  if (!roles.includes("department_head")) {
    throw new Error("ليس لديك صلاحية إدارة إسناد المقررات والمجموعات");
  }
  const { data, error } = await supabaseAdmin
    .from("faculty_profiles")
    .select("department_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("تعذر التحقق من قسم رئيس القسم.");
  if (!data?.department_id) {
    // Fail closed: a head without a department manages nothing.
    throw new Error("لم يُحدَّد قسمك في ملف عضو هيئة التدريس؛ تواصل مع إدارة النظام.");
  }
  return { all: false, departmentId: data.department_id as string };
}

async function assertCourseInScope(scope: OfferingScope, courseId: string): Promise<void> {
  if (scope.all) return;
  const { data, error } = await supabaseAdmin
    .from("courses")
    .select("department_id")
    .eq("id", courseId)
    .maybeSingle();
  if (error) throw new Error("تعذر التحقق من قسم المقرر.");
  if (!data || data.department_id !== scope.departmentId) throw new Error(OUT_OF_SCOPE_MSG);
}

async function assertOfferingInScope(scope: OfferingScope, offeringId: string): Promise<void> {
  if (scope.all) return;
  const { data, error } = await supabaseAdmin
    .from("course_offerings")
    .select("course_id")
    .eq("id", offeringId)
    .maybeSingle();
  if (error) throw new Error("تعذر التحقق من إسناد المقرر.");
  if (!data) throw new Error(OUT_OF_SCOPE_MSG);
  await assertCourseInScope(scope, data.course_id as string);
}

async function assertSectionInScope(scope: OfferingScope, sectionId: string): Promise<void> {
  if (scope.all) return;
  const { data, error } = await supabaseAdmin
    .from("course_sections")
    .select("course_offering_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (error) throw new Error("تعذر التحقق من المجموعة الدراسية.");
  if (!data) throw new Error(OUT_OF_SCOPE_MSG);
  await assertOfferingInScope(scope, data.course_offering_id as string);
}

/** Offering ids a department head may see; null = no restriction. */
async function scopedOfferingIds(scope: OfferingScope): Promise<string[] | null> {
  if (scope.all) return null;
  const { data, error } = await supabaseAdmin
    .from("course_offerings")
    .select("id, courses!inner(department_id)")
    .eq("courses.department_id", scope.departmentId);
  if (error) throw new Error("تعذر تحميل إسناد مقررات القسم.");
  return ((data ?? []) as Array<{ id: string }>).map((o) => o.id);
}

const IN_CHUNK = 150;

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
    const scope = await resolveOfferingScope(context.userId);
    const ids = await scopedOfferingIds(scope);
    if (ids && ids.length === 0) return [];
    const rows: any[] = [];
    for (let i = 0; i < (ids ? ids.length : 1); i += IN_CHUNK) {
      let q = supabaseAdmin.from("course_offerings").select("*");
      if (ids) q = q.in("id", ids.slice(i, i + IN_CHUNK));
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw new Error("تعذر تحميل إسناد المقررات.");
      rows.push(...(data ?? []));
      if (!ids) break;
    }
    return rows;
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
    const scope = await resolveOfferingScope(context.userId);
    // Both the existing row and the requested course must be in scope, so a
    // head can neither take over nor move an offering across departments.
    if (data.id) await assertOfferingInScope(scope, data.id);
    await assertCourseInScope(scope, data.course_id);
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
    await assertOfferingInScope(await resolveOfferingScope(context.userId), data.id);
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
    const scope = await resolveOfferingScope(context.userId);
    const ids = await scopedOfferingIds(scope);
    if (ids && ids.length === 0) return [];
    const sections: any[] = [];
    for (let i = 0; i < (ids ? ids.length : 1); i += IN_CHUNK) {
      let q = supabaseAdmin.from("course_sections").select("*");
      if (ids) q = q.in("course_offering_id", ids.slice(i, i + IN_CHUNK));
      const { data, error } = await q.order("section_code");
      if (error) throw new Error("تعذر تحميل المجموعات الدراسية.");
      sections.push(...(data ?? []));
      if (!ids) break;
    }

    // Teaching-assignment consistency: the section's lecturer (grades,
    // materials, lecture execution) vs. the lecturer named on its imported
    // LECTURE timetable rows ("جدولي"). Labs/tutorials may legitimately differ.
    const lectureFacultyBySection = new Map<string, Set<string>>();
    const sectionIds = sections.map((s) => s.id as string);
    for (let i = 0; i < sectionIds.length; i += IN_CHUNK) {
      const { data: sched } = await supabaseAdmin
        .from("class_schedule")
        .select("course_section_id, faculty_profile_id, schedule_type, status")
        .in("course_section_id", sectionIds.slice(i, i + IN_CHUNK))
        .eq("schedule_type", "lecture")
        .neq("status", "cancelled");
      for (const row of (sched ?? []) as Array<{ course_section_id: string; faculty_profile_id: string | null }>) {
        if (!row.faculty_profile_id) continue;
        const set = lectureFacultyBySection.get(row.course_section_id) ?? new Set<string>();
        set.add(row.faculty_profile_id);
        lectureFacultyBySection.set(row.course_section_id, set);
      }
    }
    return sections.map((s) => {
      const lectureIds = [...(lectureFacultyBySection.get(s.id) ?? [])];
      return {
        ...s,
        schedule_lecture_faculty_ids: lectureIds,
        schedule_faculty_mismatch: lectureIds.some((id) => id !== s.faculty_profile_id),
      };
    });
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
    const scope = await resolveOfferingScope(context.userId);
    if (data.id) await assertSectionInScope(scope, data.id);
    await assertOfferingInScope(scope, data.course_offering_id);
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
    await assertSectionInScope(await resolveOfferingScope(context.userId), data.id);
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
