/**
 * Server-only: departments the user heads, by the canonical rule documented in
 * `delivery-monitoring-roles.ts` (active department-head position, plus the
 * legacy role + faculty-profile department). Reads with the admin client
 * because RLS hides position rows from ordinary faculty; it returns ids only
 * and grants nothing — public.cdp_delivery_monitoring stays authoritative.
 * Throws on any read error so the caller can fail closed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  legacyHeadedDepartmentIds,
  positionHeadedDepartmentIds,
} from "@/lib/faculty-portal/delivery-monitoring-roles";

export async function headedDepartmentIdsForUser(
  userId: string,
  roles: readonly string[],
): Promise<string[]> {
  const [assignmentsRes, facultyRes] = await Promise.all([
    supabaseAdmin
      .from("position_assignments")
      .select("position_id, is_active, assigned_from, assigned_to")
      .eq("user_id", userId)
      .eq("is_active", true),
    supabaseAdmin.from("faculty_profiles").select("department_id").eq("user_id", userId),
  ]);
  if (assignmentsRes.error) throw new Error(assignmentsRes.error.message);
  if (facultyRes.error) throw new Error(facultyRes.error.message);

  const assignments = assignmentsRes.data ?? [];
  const positionIds = [...new Set(assignments.map((a) => a.position_id).filter(Boolean))];
  let viaPosition: string[] = [];
  if (positionIds.length > 0) {
    const positionsRes = await supabaseAdmin
      .from("organizational_positions")
      .select("id, is_active, is_department_head_position, department_id")
      .in("id", positionIds)
      .eq("is_active", true)
      .eq("is_department_head_position", true);
    if (positionsRes.error) throw new Error(positionsRes.error.message);
    viaPosition = positionHeadedDepartmentIds(assignments, positionsRes.data ?? []);
  }

  const viaLegacy = legacyHeadedDepartmentIds(
    roles,
    (facultyRes.data ?? []).map((f) => f.department_id),
  );
  return [...new Set([...viaPosition, ...viaLegacy])];
}
