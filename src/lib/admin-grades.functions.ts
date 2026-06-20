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
