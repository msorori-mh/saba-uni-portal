/**
 * Server loaders for explicit org bindings used by beneficiary reports.
 * SOURCE-ONLY reads via supabaseAdmin — no production writes.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  STAFF_FUNCTIONAL_ROLES,
  staffFunctionalRoleByKey,
} from "@/lib/staff-functional-roles";
import {
  isAssignmentWindowActive,
  assignmentMatchesIdentity,
} from "@/lib/student-requests/processing-assignment-identity.server";
import {
  emptyOrgBindings,
  resolveExplicitOrgBindings,
  staffRoleTypeToUnitKey,
  type ExplicitOrgBindings,
} from "./org-identity";

const APPROVED_UNIT_BY_KEY = new Map(
  STAFF_FUNCTIONAL_ROLES.map((r) => [r.key, r.unitKey] as const),
);

type PositionRow = {
  id: string;
  is_active: boolean | null;
  organizational_positions:
    | { code: string | null; is_active: boolean | null }
    | { code: string | null; is_active: boolean | null }[]
    | null;
};

function positionCodeFromRow(row: PositionRow): string | null {
  const pos = row.organizational_positions;
  const resolved = Array.isArray(pos) ? pos[0] : pos;
  if (!resolved?.code) return null;
  if (resolved.is_active === false) return null;
  return resolved.code;
}

/** Active org position codes held by the user. */
export async function loadActivePositionCodes(
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("position_assignments")
    .select(
      "id, is_active, organizational_positions(code, is_active)",
    )
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  const codes: string[] = [];
  for (const row of (data ?? []) as unknown as PositionRow[]) {
    if (row.is_active !== true) continue;
    const code = positionCodeFromRow(row);
    if (code) codes.push(code);
  }
  return [...new Set(codes)];
}

/**
 * Resolve operational unit codes from:
 * 1) staff_profiles.role_type → unitKey
 * 2) active request_processing_assignments → unit.code
 *
 * Never invents a unit from app_role alone (student_affairs ≠ university VP,
 * and a bare role without staff/assignment binding is NOT_CONFIGURED).
 */
export async function loadOperationalUnitCodes(
  userId: string,
): Promise<string[]> {
  const units = new Set<string>();

  const [staffRes, facultyRes, positionRes] = await Promise.all([
    supabaseAdmin
      .from("staff_profiles")
      .select("id, role_type")
      .eq("user_id", userId),
    supabaseAdmin.from("faculty_profiles").select("id").eq("user_id", userId),
    supabaseAdmin
      .from("position_assignments")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true),
  ]);
  if (staffRes.error) throw new Error(staffRes.error.message);
  if (facultyRes.error) throw new Error(facultyRes.error.message);
  if (positionRes.error) throw new Error(positionRes.error.message);

  for (const row of staffRes.data ?? []) {
    const unit = staffRoleTypeToUnitKey(
      (row as { role_type?: string | null }).role_type,
      APPROVED_UNIT_BY_KEY,
    );
    if (unit) units.add(unit);
    // Keep Map lookup warm for tree-shaking clarity
    void staffFunctionalRoleByKey(
      String((row as { role_type?: string | null }).role_type ?? ""),
    );
  }

  const staffProfileIds = (staffRes.data ?? []).map((r) => r.id);
  const facultyProfileIds = (facultyRes.data ?? []).map((r) => r.id);
  const positionAssignmentIds = (positionRes.data ?? []).map((r) => r.id);

  const filters = [`user_id.eq.${userId}`];
  if (staffProfileIds.length > 0) {
    filters.push(`staff_profile_id.in.(${staffProfileIds.join(",")})`);
  }
  if (facultyProfileIds.length > 0) {
    filters.push(`faculty_profile_id.in.(${facultyProfileIds.join(",")})`);
  }
  if (positionAssignmentIds.length > 0) {
    filters.push(
      `position_assignment_id.in.(${positionAssignmentIds.join(",")})`,
    );
  }

  const { data: assignments, error: assignError } = await supabaseAdmin
    .from("request_processing_assignments")
    .select(
      "id, assignment_type, user_id, staff_profile_id, faculty_profile_id, position_assignment_id, is_active, starts_at, ends_at, unit_id",
    )
    .eq("is_active", true)
    .or(filters.join(","));
  if (assignError) throw new Error(assignError.message);

  const identity = {
    userId,
    staffProfileIds,
    facultyProfileIds,
    positionAssignmentIds,
  };
  const now = new Date();
  const unitIds = new Set<string>();
  for (const row of assignments ?? []) {
    if (
      !isAssignmentWindowActive(row as any, now) ||
      !assignmentMatchesIdentity(row as any, identity)
    ) {
      continue;
    }
    const unitId = (row as { unit_id?: string | null }).unit_id;
    if (unitId) unitIds.add(unitId);
  }

  if (unitIds.size > 0) {
    const { data: unitRows, error: unitError } = await supabaseAdmin
      .from("request_processing_units")
      .select("id, code, is_active")
      .in("id", [...unitIds]);
    if (unitError) throw new Error(unitError.message);
    for (const u of unitRows ?? []) {
      if ((u as { is_active?: boolean }).is_active === false) continue;
      const code = (u as { code?: string }).code;
      if (code) units.add(code);
    }
  }

  return [...units];
}

/** Load full explicit org bindings for a user. */
export async function loadExplicitOrgBindings(
  userId: string,
  roles: readonly string[],
): Promise<ExplicitOrgBindings> {
  try {
    const [positionCodes, operationalUnitCodes] = await Promise.all([
      loadActivePositionCodes(userId),
      loadOperationalUnitCodes(userId),
    ]);
    return resolveExplicitOrgBindings({
      roles,
      positionCodes,
      operationalUnitCodes,
      // No college_id column in current schema — leave null (fail-closed for
      // multi-college dean hub LIVE claims).
      collegeId: null,
    });
  } catch {
    return emptyOrgBindings();
  }
}

/**
 * Map unit codes → processing role codes usable with student_requests.current_role_key.
 */
export async function loadProcessingRoleKeysForUnits(
  unitCodes: readonly string[],
): Promise<string[]> {
  if (unitCodes.length === 0) return [];
  const { data: units, error: unitError } = await supabaseAdmin
    .from("request_processing_units")
    .select("id, code")
    .in("code", [...unitCodes]);
  if (unitError) throw new Error(unitError.message);
  const unitIds = (units ?? []).map((u) => u.id);
  if (unitIds.length === 0) return [];

  const { data: roles, error: roleError } = await supabaseAdmin
    .from("request_processing_roles")
    .select("code, app_role, unit_id, is_active")
    .in("unit_id", unitIds)
    .eq("is_active", true);
  if (roleError) throw new Error(roleError.message);

  const keys = new Set<string>();
  for (const r of roles ?? []) {
    if ((r as { code?: string }).code) keys.add((r as { code: string }).code);
    if ((r as { app_role?: string | null }).app_role) {
      keys.add((r as { app_role: string }).app_role);
    }
  }
  // Also accept unit codes themselves as soft keys when workflows still use them.
  for (const code of unitCodes) keys.add(code);
  return [...keys];
}
