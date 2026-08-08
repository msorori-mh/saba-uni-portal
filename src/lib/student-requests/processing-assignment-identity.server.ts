/**
 * Shared identity-closure contract for `request_processing_assignments`.
 *
 * Production assignments bind an actor through one of four identity
 * sources (mirroring the backend resolution used by
 * `current_user_has_exact_processing_binding` / the workflow RPCs):
 *
 *   1. assignment_type = 'user'                → user_id = auth uid
 *   2. assignment_type = 'staff_profile'       → staff_profiles.user_id = auth uid
 *   3. assignment_type = 'faculty_profile'     → faculty_profiles.user_id = auth uid
 *   4. assignment_type = 'position_assignment' → position_assignments.user_id = auth uid
 *
 * Application-level guards MUST use this helper instead of querying
 * `user_id` alone: 18 of 26 production rows bind indirectly and have a
 * NULL `user_id`, so a `user_id`-only lookup denies legitimate actors.
 *
 * Window contract (identical for every identity type):
 *   is_active = true
 *   AND (starts_at IS NULL OR starts_at <= now())
 *   AND (ends_at   IS NULL OR ends_at   >  now())
 *
 * This helper only answers "may this user open the processing inbox at
 * all". It grants nothing: every read/write still goes through the
 * per-step RPCs which enforce direct-assignment authorization.
 * No role-name, admin, registrar or dean bypass belongs here.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ProcessingAssignmentIdentityType =
  | "user"
  | "staff_profile"
  | "faculty_profile"
  | "position_assignment";

export const PROCESSING_ASSIGNMENT_IDENTITY_TYPES: ProcessingAssignmentIdentityType[] = [
  "user",
  "staff_profile",
  "faculty_profile",
  "position_assignment",
];

type AssignmentRow = {
  id: string;
  assignment_type: string | null;
  user_id: string | null;
  staff_profile_id: string | null;
  faculty_profile_id: string | null;
  position_assignment_id: string | null;
  is_active: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
};

/** Time-window + is_active predicate, applied to every identity type. */
export function isAssignmentWindowActive(
  row: Pick<AssignmentRow, "is_active" | "starts_at" | "ends_at">,
  now: Date = new Date(),
): boolean {
  if (row.is_active !== true) return false;
  const ts = now.getTime();
  if (row.starts_at && new Date(row.starts_at).getTime() > ts) return false;
  if (row.ends_at && new Date(row.ends_at).getTime() <= ts) return false;
  return true;
}

/**
 * Fail-closed identity match for a single assignment row.
 *
 * The row must carry exactly the identity reference its
 * `assignment_type` declares; a row whose declared type does not match
 * the resolved id set is ambiguous and is rejected.
 */
export function assignmentMatchesIdentity(
  row: AssignmentRow,
  identity: {
    userId: string;
    staffProfileIds: string[];
    facultyProfileIds: string[];
    positionAssignmentIds: string[];
  },
): boolean {
  switch (row.assignment_type) {
    case "user":
      return !!row.user_id && row.user_id === identity.userId;
    case "staff_profile":
      return (
        !!row.staff_profile_id &&
        identity.staffProfileIds.includes(row.staff_profile_id)
      );
    case "faculty_profile":
      return (
        !!row.faculty_profile_id &&
        identity.facultyProfileIds.includes(row.faculty_profile_id)
      );
    case "position_assignment":
      return (
        !!row.position_assignment_id &&
        identity.positionAssignmentIds.includes(row.position_assignment_id)
      );
    default:
      // Unknown / NULL assignment_type → fail closed.
      return false;
  }
}

/**
 * Resolves the full identity closure of `userId` and returns true when at
 * least one ACTIVE processing assignment binds to it through any of the
 * four supported identity sources.
 */
export async function hasActiveProcessingAssignmentForUser(
  userId: string,
): Promise<boolean> {
  const [staffRes, facultyRes, positionRes] = await Promise.all([
    supabaseAdmin.from("staff_profiles").select("id").eq("user_id", userId),
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

  const { data, error } = await supabaseAdmin
    .from("request_processing_assignments")
    .select(
      "id, assignment_type, user_id, staff_profile_id, faculty_profile_id, position_assignment_id, is_active, starts_at, ends_at",
    )
    .eq("is_active", true)
    .or(filters.join(","));
  if (error) throw new Error(error.message);

  const identity = {
    userId,
    staffProfileIds,
    facultyProfileIds,
    positionAssignmentIds,
  };
  const now = new Date();

  return (data ?? []).some(
    (row) =>
      isAssignmentWindowActive(row as AssignmentRow, now) &&
      assignmentMatchesIdentity(row as AssignmentRow, identity),
  );
}
