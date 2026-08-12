// Server-only scope guards for client-callable audit-logging server functions.
// Authentication alone is NOT sufficient: each audit action must be authorized
// with the same capability contract as the underlying operation it audits.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasAnyRole, STUDENT_READ_ROLES } from "@/lib/authz.server";

/** Roles that legitimately operate the faculty teaching-timetable surface. */
export const FACULTY_SCHEDULE_ROLES = [
  "faculty_member",
  "department_head",
  "dean",
  "admin",
  "system_admin",
] as const;

export async function isStudentActor(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("student_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean((data as { id?: string } | null)?.id);
}

export async function isFacultyActor(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("faculty_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if ((data as { id?: string } | null)?.id) return true;
  return hasAnyRole(userId, FACULTY_SCHEDULE_ROLES);
}

/** Authorize a schedule audit event against the surface it claims to come from. */
export async function assertScheduleAuditScope(
  userId: string,
  viewType: "student" | "faculty",
): Promise<void> {
  const ok = viewType === "student"
    ? await isStudentActor(userId)
    : await isFacultyActor(userId);
  if (!ok) throw new Error("ليس لديك صلاحية تسجيل هذا الحدث");
}

/** Authorize an academic-report audit event; reports are privileged surfaces only. */
export async function assertAcademicAuditScope(
  userId: string,
  entityId?: string,
): Promise<void> {
  if (!(await hasAnyRole(userId, STUDENT_READ_ROLES))) {
    throw new Error("ليس لديك صلاحية تسجيل هذا الحدث");
  }
  if (entityId) {
    const { data } = await supabaseAdmin
      .from("student_profiles")
      .select("id")
      .eq("id", entityId)
      .maybeSingle();
    if (!(data as { id?: string } | null)?.id) throw new Error("سجل غير صالح");
  }
}
