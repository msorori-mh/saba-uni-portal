import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const ENROLLMENTS_ADMIN_ROLES = [
  "system_admin",
  "admin",
  "dean",
  "registrar",
  "student_affairs",
  "department_head",
] as const;

const enrollmentStatusSchema = z.enum(["enrolled", "dropped", "completed"]);

async function assertEnrollmentsAdmin(userId: string) {
  await assertAnyRole(
    userId,
    ENROLLMENTS_ADMIN_ROLES,
    "ليس لديك صلاحية إدارة تسجيل الطلاب",
  );
}

export const getEnrollmentsLookups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertEnrollmentsAdmin(context.userId);
    const [yearsRes, semestersRes, programsRes, levelsRes] = await Promise.all([
      supabaseAdmin.from("academic_years").select("id, name, is_current").order("start_date", { ascending: false }),
      supabaseAdmin.from("semesters").select("id, academic_year_id, name").order("start_date"),
      supabaseAdmin.from("programs").select("id, name_ar, code").eq("is_active", true).order("name_ar"),
      supabaseAdmin.from("academic_levels").select("id, name, level_number").order("level_number"),
    ]);
    if (yearsRes.error) throw new Error(yearsRes.error.message);
    if (semestersRes.error) throw new Error(semestersRes.error.message);
    if (programsRes.error) throw new Error(programsRes.error.message);
    if (levelsRes.error) throw new Error(levelsRes.error.message);
    return {
      years: yearsRes.data ?? [],
      semesters: semestersRes.data ?? [],
      programs: programsRes.data ?? [],
      levels: levelsRes.data ?? [],
    };
  });

export const listOfferingsForEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      academicYearId: z.string().uuid(),
      semesterId: z.string().uuid(),
      programId: z.string().uuid(),
      levelId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertEnrollmentsAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("course_offerings")
      .select("id, course_id, course:courses(code, name_ar)")
      .eq("academic_year_id", data.academicYearId)
      .eq("semester_id", data.semesterId)
      .eq("program_id", data.programId)
      .eq("level_id", data.levelId)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listSectionsForOfferings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ offeringIds: z.array(z.string().uuid()).min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertEnrollmentsAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("course_sections")
      .select("id, section_code, course_offering_id, capacity")
      .in("course_offering_id", data.offeringIds)
      .eq("status", "active")
      .order("section_code");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listSectionEnrollments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ sectionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertEnrollmentsAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("student_enrollments")
      .select("id, enrollment_status, student:student_profiles(id, academic_number, full_name_ar)")
      .eq("course_section_id", data.sectionId)
      .order("enrolled_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listEligibleStudentsForEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      programId: z.string().uuid(),
      academicYearId: z.string().uuid(),
      semesterId: z.string().uuid(),
      levelId: z.string().uuid(),
      sectionId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertEnrollmentsAdmin(context.userId);

    const [statusesRes, enrollmentsRes] = await Promise.all([
      supabaseAdmin
        .from("student_academic_status")
        .select("student_profile_id, student:student_profiles(id, academic_number, full_name_ar, status, program_id)")
        .eq("academic_year_id", data.academicYearId)
        .eq("semester_id", data.semesterId)
        .eq("level_id", data.levelId)
        .eq("enrollment_status", "active"),
      supabaseAdmin
        .from("student_enrollments")
        .select("student_profile_id")
        .eq("course_section_id", data.sectionId),
    ]);
    if (statusesRes.error) throw new Error(statusesRes.error.message);
    if (enrollmentsRes.error) throw new Error(enrollmentsRes.error.message);

    const enrolledIds = new Set(
      (enrollmentsRes.data ?? []).map((e) => e.student_profile_id as string),
    );

    type StudentRow = {
      student_profile_id: string;
      student: {
        id: string;
        academic_number: string;
        full_name_ar: string;
        status: string;
        program_id: string | null;
      } | null;
    };

    return ((statusesRes.data ?? []) as StudentRow[])
      .map((r) => r.student)
      .filter((s): s is NonNullable<typeof s> => !!s)
      .filter((s) => s.program_id === data.programId && s.status === "active")
      .filter((s) => !enrolledIds.has(s.id))
      .map((s) => ({
        id: s.id,
        academic_number: s.academic_number,
        full_name_ar: s.full_name_ar,
        status: s.status,
      }));
  });

export const createStudentEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      studentProfileId: z.string().uuid(),
      courseSectionId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertEnrollmentsAdmin(context.userId);
    const { error } = await supabaseAdmin.from("student_enrollments").insert({
      student_profile_id: data.studentProfileId,
      course_section_id: data.courseSectionId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateEnrollmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      enrollmentStatus: enrollmentStatusSchema,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertEnrollmentsAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("student_enrollments")
      .update({ enrollment_status: data.enrollmentStatus })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteStudentEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertEnrollmentsAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("student_enrollments")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
