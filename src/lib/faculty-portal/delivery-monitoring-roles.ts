/**
 * Faculty-portal gate for «متابعة سير العملية التعليمية» (delivery monitoring).
 *
 * Owner rule: inside the FACULTY PORTAL the tab is for the dean (college-wide)
 * and for department heads (their departments) only. Registrar / student
 * affairs / admins keep their RPC access but reach it from the admin surface.
 *
 * "Departments this user heads" is ONE canonical rule, mirrored by the SQL
 * helper public.delivery_monitoring_headed_departments(uuid):
 *   1. an ACTIVE department-head administrative position — the position is
 *      active and flagged is_department_head_position, the assignment is active
 *      and inside its [assigned_from, assigned_to] window; the department is the
 *      POSITION's department_id (never the holder's faculty-profile department);
 *   2. the legacy rule of public.is_department_head_of — user role
 *      `department_head` AND a faculty profile in that department.
 *
 * UI gate only: the page and public.cdp_delivery_monitoring stay authoritative.
 */
export const DELIVERY_MONITORING_LABEL = "متابعة سير العملية التعليمية";

/** Roles that see the tab college-wide in the faculty portal. */
export const DELIVERY_MONITORING_COLLEGE_ROLES = ["dean"] as const;

export type HeadPositionAssignmentRow = {
  position_id: string | null;
  is_active: boolean | null;
  assigned_from: string | null;
  assigned_to: string | null;
};

export type HeadPositionRow = {
  id: string;
  is_active: boolean | null;
  is_department_head_position: boolean | null;
  department_id: string | null;
};

/** `YYYY-MM-DD` in UTC — the same day `current_date` yields in the database. */
export function isoDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Rule 1 — departments headed through an active department-head position. */
export function positionHeadedDepartmentIds(
  assignments: readonly HeadPositionAssignmentRow[],
  positions: readonly HeadPositionRow[],
  today: string = isoDay(),
): string[] {
  const headPositions = new Map<string, string>();
  for (const p of positions) {
    if (p.is_active === true && p.is_department_head_position === true && p.department_id) {
      headPositions.set(p.id, p.department_id);
    }
  }
  const out = new Set<string>();
  for (const a of assignments) {
    if (a.is_active !== true || !a.position_id) continue;
    // A missing start date is ambiguous → fail closed.
    if (!a.assigned_from || a.assigned_from.slice(0, 10) > today) continue;
    if (a.assigned_to && a.assigned_to.slice(0, 10) < today) continue;
    const dept = headPositions.get(a.position_id);
    if (dept) out.add(dept);
  }
  return [...out];
}

/** Rule 2 — legacy public.is_department_head_of. */
export function legacyHeadedDepartmentIds(
  roles: readonly string[],
  facultyProfileDepartmentIds: readonly (string | null)[],
): string[] {
  if (!roles.includes("department_head")) return [];
  return [...new Set(facultyProfileDepartmentIds.filter((d): d is string => !!d))];
}

export function canSeeDeliveryMonitoring(input: {
  roles: readonly string[];
  headedDepartmentIds: readonly string[];
}): boolean {
  if (input.roles.some((r) => (DELIVERY_MONITORING_COLLEGE_ROLES as readonly string[]).includes(r))) {
    return true;
  }
  return input.headedDepartmentIds.length > 0;
}
