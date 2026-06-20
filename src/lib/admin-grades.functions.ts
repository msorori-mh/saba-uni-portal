import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const GRADES_ADMIN_ROLES = [
  "system_admin",
  "admin",
  "dean",
  "registrar",
  "department_head",
] as const;

const gradeIdsInput = z.object({
  gradeIds: z.array(z.string().uuid()).min(1).max(5000),
  sectionId: z.string().uuid(),
});

export type GradeEmailTarget = {
  email: string;
  full_name_ar: string | null;
};

export type GradeSectionOption = {
  id: string;
  section_code: string;
  course_code: string;
  course_name: string;
  year_name: string;
  semester_name: string;
};

export type GradeComponentRow = {
  id: string;
  name: string;
  max_score: number;
  sort_order: number;
};

export type SectionGradeRow = {
  enrollmentId: string;
  academic_number: string;
  name: string;
  grades: Record<string, {
    id: string;
    student_enrollment_id: string;
    grade_component_id: string;
    score: number;
    status: string;
    approved_at: string | null;
  } | undefined>;
};

async function assertGradesAdmin(userId: string) {
  await assertAnyRole(userId, GRADES_ADMIN_ROLES, "ليس لديك صلاحية إدارة الدرجات");
}

export const getGradesLookups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ yearId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertGradesAdmin(context.userId);
    const [yearsRes, semsRes] = await Promise.all([
      supabaseAdmin.from("academic_years").select("id, name").order("name"),
      data.yearId
        ? supabaseAdmin.from("semesters").select("id, name").eq("academic_year_id", data.yearId).order("name")
        : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    ]);
    if (yearsRes.error) throw new Error(yearsRes.error.message);
    if (semsRes.error) throw new Error(semsRes.error.message);
    return {
      years: yearsRes.data ?? [],
      semesters: semsRes.data ?? [],
    };
  });

export const listGradeSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      yearId: z.string().uuid().optional(),
      semesterId: z.string().uuid().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertGradesAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("course_sections")
      .select("id, section_code, offering:course_offerings(academic_year_id, semester_id, course:courses(code, name_ar), academic_year:academic_years(name), semester:semesters(name))")
      .eq("status", "active");
    if (error) throw new Error(error.message);

    type Raw = {
      id: string;
      section_code: string;
      offering: {
        academic_year_id: string;
        semester_id: string;
        course: { code: string; name_ar: string } | null;
        academic_year: { name: string } | null;
        semester: { name: string } | null;
      } | null;
    };

    return ((rows ?? []) as Raw[])
      .filter((r) => !data.yearId || r.offering?.academic_year_id === data.yearId)
      .filter((r) => !data.semesterId || r.offering?.semester_id === data.semesterId)
      .map((r): GradeSectionOption => ({
        id: r.id,
        section_code: r.section_code,
        course_code: r.offering?.course?.code ?? "—",
        course_name: r.offering?.course?.name_ar ?? "—",
        year_name: r.offering?.academic_year?.name ?? "",
        semester_name: r.offering?.semester?.name ?? "",
      }));
  });

export const getSectionGradesGrid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ sectionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertGradesAdmin(context.userId);

    const { data: components, error: compErr } = await supabaseAdmin
      .from("grade_components")
      .select("id, name, max_score, sort_order")
      .eq("course_section_id", data.sectionId)
      .order("sort_order");
    if (compErr) throw new Error(compErr.message);

    const { data: enrolls, error: enrErr } = await supabaseAdmin
      .from("student_enrollments")
      .select("id, student:student_profiles(academic_number, full_name_ar)")
      .eq("course_section_id", data.sectionId);
    if (enrErr) throw new Error(enrErr.message);

    type EnRaw = { id: string; student: { academic_number: string; full_name_ar: string } | null };
    const enr = (enrolls ?? []) as EnRaw[];
    const enrIds = enr.map((e) => e.id);

    let grades: Array<{
      id: string;
      student_enrollment_id: string;
      grade_component_id: string;
      score: number;
      status: string;
      approved_at: string | null;
    }> = [];
    if (enrIds.length) {
      const { data: gs, error: gErr } = await supabaseAdmin
        .from("student_grades")
        .select("id, student_enrollment_id, grade_component_id, score, status, approved_at")
        .in("student_enrollment_id", enrIds);
      if (gErr) throw new Error(gErr.message);
      grades = gs ?? [];
    }

    const rows: SectionGradeRow[] = enr.map((e) => {
      const gByComp: SectionGradeRow["grades"] = {};
      for (const g of grades) {
        if (g.student_enrollment_id === e.id) gByComp[g.grade_component_id] = g;
      }
      return {
        enrollmentId: e.id,
        academic_number: e.student?.academic_number ?? "—",
        name: e.student?.full_name_ar ?? "—",
        grades: gByComp,
      };
    });

    return {
      components: (components ?? []) as GradeComponentRow[],
      rows,
    };
  });

export const approveSubmittedGrades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => gradeIdsInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(
      context.userId,
      GRADES_ADMIN_ROLES,
      "ليس لديك صلاحية اعتماد الدرجات",
    );

    const { data: existing } = await supabaseAdmin
      .from("student_grades")
      .select("id, status, student_enrollment_id")
      .in("id", data.gradeIds);
    const toApprove = (existing ?? []).filter((g) => g.status === "submitted");
    if (toApprove.length === 0) {
      return { approvedCount: 0, courseName: "", emailTargets: [] as GradeEmailTarget[] };
    }

    const { data: staff } = await supabaseAdmin
      .from("staff_profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();

    const ids = toApprove.map((g) => g.id);
    const { error } = await supabaseAdmin
      .from("student_grades")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: staff?.id ?? null,
      })
      .in("id", ids);
    if (error) throw new Error(error.message);

    const { data: sec } = await supabaseAdmin
      .from("course_sections")
      .select("offering:course_offerings(course:courses(name_ar))")
      .eq("id", data.sectionId)
      .maybeSingle();
    const courseName =
      (sec as { offering?: { course?: { name_ar?: string } } } | null)?.offering?.course?.name_ar ?? "المقرر";

    const enrIds = [...new Set(toApprove.map((g) => g.student_enrollment_id))];
    const { data: enrs } = await supabaseAdmin
      .from("student_enrollments")
      .select("student:student_profiles(email, full_name_ar)")
      .in("id", enrIds);

    const seen = new Set<string>();
    const emailTargets: GradeEmailTarget[] = [];
    for (const e of enrs ?? []) {
      const student = e.student as { email?: string; full_name_ar?: string } | null;
      const email = student?.email;
      if (!email || seen.has(email)) continue;
      seen.add(email);
      emailTargets.push({ email, full_name_ar: student?.full_name_ar ?? null });
    }

    return { approvedCount: ids.length, courseName, emailTargets };
  });

export const returnSubmittedGrades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      gradeIds: z.array(z.string().uuid()).min(1).max(5000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(
      context.userId,
      GRADES_ADMIN_ROLES,
      "ليس لديك صلاحية إرجاع الدرجات",
    );

    const { data: existing } = await supabaseAdmin
      .from("student_grades")
      .select("id, status")
      .in("id", data.gradeIds);
    const ids = (existing ?? []).filter((g) => g.status === "submitted").map((g) => g.id);
    if (ids.length === 0) return { returnedCount: 0 };

    const { error } = await supabaseAdmin
      .from("student_grades")
      .update({ status: "draft", approved_at: null, approved_by: null })
      .in("id", ids);
    if (error) throw new Error(error.message);
    return { returnedCount: ids.length };
  });
