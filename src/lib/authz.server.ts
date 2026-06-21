// Server-only authorization helpers — use from *.functions.ts handlers only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const ROLE_PRIORITY = [
  "system_admin",
  "admin",
  "dean",
  "registrar",
  "student_affairs",
  "finance_officer",
  "hr_officer",
  "department_head",
  "faculty_member",
  "graduate",
  "student",
] as const;

/** Roles allowed to trigger transactional notification emails. */
export const EMAIL_SENDER_ROLES = [
  "admin",
  "system_admin",
  "dean",
  "registrar",
  "student_affairs",
  "finance_officer",
] as const;

/** Roles allowed to view admin communications dashboard aggregates. */
export const COMMUNICATIONS_ADMIN_ROLES = [
  "admin",
  "system_admin",
  "dean",
  "registrar",
  "student_affairs",
] as const;

/** Roles allowed to access executive dashboard analytics. */
export const EXEC_ROLES = ["admin", "system_admin", "dean", "registrar"] as const;

/** Roles allowed read-only access to student records in the admin panel. */
export const STUDENT_READ_ROLES = [
  "admin",
  "system_admin",
  "dean",
  "registrar",
  "student_affairs",
] as const;

/** Roles allowed to manage student records and provision student logins (no dean). */
export const STUDENT_ADMIN_ROLES = [
  "admin",
  "system_admin",
  "registrar",
  "student_affairs",
] as const;

/** Roles for public site faculty CMS (`/admin/faculty`). Matches admin-nav NAV_ITEM_ROLES. */
export const FACULTY_CMS_ROLES = [
  "admin",
  "system_admin",
  "dean",
  "hr_officer",
] as const;

export async function userRoles(userId: string): Promise<string[]> {
  const [legacyRes, assignRes] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin
      .from("user_role_assignments")
      .select("role_code, roles_catalog(app_role_mapping)")
      .eq("user_id", userId),
  ]);
  if (legacyRes.error) throw new Error(legacyRes.error.message);
  if (assignRes.error) throw new Error(assignRes.error.message);

  const roles = new Set<string>();
  for (const row of legacyRes.data ?? []) {
    roles.add(row.role as string);
  }
  for (const row of assignRes.data ?? []) {
    roles.add(row.role_code as string);
    const mapping = (row as { roles_catalog?: { app_role_mapping?: string | null } | null })
      .roles_catalog?.app_role_mapping;
    if (mapping) roles.add(mapping);
  }
  return [...roles];
}

export async function assertAnyRole(
  userId: string,
  allowed: readonly string[],
  message = "ليس لديك صلاحية لتنفيذ هذا الإجراء",
): Promise<void> {
  const roles = await userRoles(userId);
  if (!roles.some((r) => allowed.includes(r))) throw new Error(message);
}

export async function assertAdmin(userId: string): Promise<void> {
  await assertAnyRole(userId, ["admin", "system_admin"], "ليس لديك صلاحية");
}

export async function assertExecRole(userId: string): Promise<void> {
  await assertAnyRole(
    userId,
    EXEC_ROLES,
    "ليس لديك صلاحية الوصول إلى لوحة التحليلات التنفيذية",
  );
}

export async function assertStudentRead(userId: string): Promise<void> {
  await assertAnyRole(userId, STUDENT_READ_ROLES, "ليس لديك صلاحية لعرض الطلاب");
}

export async function assertStudentAdmin(userId: string): Promise<void> {
  await assertAnyRole(userId, STUDENT_ADMIN_ROLES, "ليس لديك صلاحية لإدارة الطلاب");
}

export async function assertFacultyCmsAdmin(userId: string): Promise<void> {
  await assertAnyRole(
    userId,
    FACULTY_CMS_ROLES,
    "ليس لديك صلاحية إدارة صفحة هيئة التدريس بالموقع",
  );
}

export async function assertCommunicationsAdmin(userId: string): Promise<void> {
  await assertAnyRole(
    userId,
    COMMUNICATIONS_ADMIN_ROLES,
    "ليس لديك صلاحية إدارة الاتصالات والإعلانات",
  );
}

export async function primaryActorRole(userId: string): Promise<string | null> {
  const roles = await userRoles(userId);
  for (const p of ROLE_PRIORITY) {
    if (roles.includes(p)) return p;
  }
  return roles[0] ?? null;
}
