/**
 * Source-level capability adapter for graduates-affairs authorization,
 * mirroring the SQL draft GRADUATES-AFFAIRS-AUTHORIZATION-04.
 *
 * This module is a UI/planning helper only — it is NOT a security boundary.
 * The boundary is the SQL authorization layer; every decision here must match
 * it exactly and fail closed. There is no bypass: admin, registrar, dean, or
 * staff from any other unit are denied unless they hold one of the actor
 * capabilities below.
 */

export const GRADUATE_AFFAIRS_UNIT_CODE = "graduate_affairs";
export const GRADUATE_AFFAIRS_MANAGER_ROLE = "graduate_affairs_manager";
export const GRADUATE_AFFAIRS_SPECIALIST_ROLE = "graduate_affairs_specialist";

export interface GraduateAffairsAssignment {
  unitCode: string;
  roleCode: string;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  departmentIds: readonly string[];
}

export interface GraduateAffairsActor {
  userId: string | null;
  /** Graduate record ids owned by the user via student_profiles. */
  ownGraduateRecordIds: readonly string[];
  assignments: readonly GraduateAffairsAssignment[];
  /** Record ids where the user is the assignee of an open|in_progress follow-up. */
  activeFollowupRecordIds: readonly string[];
}

export interface RecordScope {
  recordId: string;
  programId: string;
  departmentId: string;
}

export type AccessDecision =
  | { allowed: true; via: "self" | "manager" | "specialist" | "direct_assignee" }
  | { allowed: false; reason: string };

export interface StaffCapabilities {
  isManager: boolean;
  specialistDepartmentIds: readonly string[];
}

/**
 * An assignment counts only while it is active and inside its validity
 * window. Unparsable boundaries fail closed (assignment treated as inactive).
 */
export function isAssignmentActive(assignment: GraduateAffairsAssignment, at: Date): boolean {
  if (!assignment.isActive || !Number.isFinite(at.getTime())) {
    return false;
  }
  if (assignment.startsAt !== null) {
    const startsAt = Date.parse(assignment.startsAt);
    if (!Number.isFinite(startsAt) || startsAt > at.getTime()) {
      return false;
    }
  }
  if (assignment.endsAt !== null) {
    const endsAt = Date.parse(assignment.endsAt);
    if (!Number.isFinite(endsAt) || endsAt <= at.getTime()) {
      return false;
    }
  }
  return true;
}

/**
 * Resolves staff capabilities from active assignments with the exact
 * graduates-affairs unit/role codes. The manager role is college-scoped (all
 * departments); the specialist role is scoped to the union of its explicit
 * department ids — an empty set means no access.
 */
export function resolveStaffCapabilities(
  actor: GraduateAffairsActor,
  at: Date,
): StaffCapabilities {
  let isManager = false;
  const specialistDepartmentIds = new Set<string>();
  for (const assignment of actor.assignments) {
    if (assignment.unitCode !== GRADUATE_AFFAIRS_UNIT_CODE || !isAssignmentActive(assignment, at)) {
      continue;
    }
    if (assignment.roleCode === GRADUATE_AFFAIRS_MANAGER_ROLE) {
      isManager = true;
    } else if (assignment.roleCode === GRADUATE_AFFAIRS_SPECIALIST_ROLE) {
      for (const departmentId of assignment.departmentIds) {
        specialistDepartmentIds.add(departmentId);
      }
    }
  }
  return { isManager, specialistDepartmentIds: [...specialistDepartmentIds].toSorted() };
}

/**
 * Evaluates record access with a fixed precedence mirroring the SQL actor
 * resolution: self → manager → specialist (department scope) → direct case
 * assignee. Everything else is denied. A null userId is denied regardless of
 * any other field.
 */
export function evaluateRecordAccess(
  actor: GraduateAffairsActor,
  record: RecordScope,
  at: Date,
): AccessDecision {
  if (actor.userId === null) {
    return { allowed: false, reason: "graduate_record_access_denied" };
  }
  if (actor.ownGraduateRecordIds.includes(record.recordId)) {
    return { allowed: true, via: "self" };
  }
  const capabilities = resolveStaffCapabilities(actor, at);
  if (capabilities.isManager) {
    return { allowed: true, via: "manager" };
  }
  if (capabilities.specialistDepartmentIds.includes(record.departmentId)) {
    return { allowed: true, via: "specialist" };
  }
  if (actor.activeFollowupRecordIds.includes(record.recordId)) {
    return { allowed: true, via: "direct_assignee" };
  }
  return { allowed: false, reason: "graduate_record_access_denied" };
}

export const GRADUATE_PROFILE_MUTABLE_FIELDS = [
  "public_display_name",
  "preferred_contact_channel",
  "career_summary",
  "profile_visibility",
] as const;

export type GraduateProfileMutableField = (typeof GRADUATE_PROFILE_MUTABLE_FIELDS)[number];

export const PREFERRED_CONTACT_CHANNELS = ["email", "phone", "none"] as const;
export const PROFILE_VISIBILITIES = ["private", "graduates_affairs", "public_opt_in"] as const;

export type PreferredContactChannel = (typeof PREFERRED_CONTACT_CHANNELS)[number];
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];

export interface GraduateProfilePatch {
  public_display_name?: string;
  preferred_contact_channel?: PreferredContactChannel;
  career_summary?: string;
  profile_visibility?: ProfileVisibility;
}

export type ProfilePatchValidation =
  | { ok: true; fields: GraduateProfilePatch }
  | { ok: false; reason: string };

const PROFILE_ENUM_FIELDS: Readonly<Record<string, readonly string[]>> = {
  preferred_contact_channel: PREFERRED_CONTACT_CHANNELS,
  profile_visibility: PROFILE_VISIBILITIES,
};

/**
 * Fail-closed validation of a graduate profile patch, mirroring the SQL
 * RPC's full-replacement validation: any key outside the mutable-field
 * allowlist rejects the whole patch, enum fields accept only their listed
 * values, and every value must be a string. An empty patch is valid and
 * carries zero fields (a no-op replacement).
 */
export function validateProfilePatch(patch: Record<string, unknown>): ProfilePatchValidation {
  const fields: GraduateProfilePatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!(GRADUATE_PROFILE_MUTABLE_FIELDS as readonly string[]).includes(key)) {
      return { ok: false, reason: "graduate_profile_field_not_mutable" };
    }
    const allowedValues = PROFILE_ENUM_FIELDS[key];
    if (typeof value !== "string" || (allowedValues !== undefined && !allowedValues.includes(value))) {
      return { ok: false, reason: "graduate_profile_invalid_value" };
    }
    fields[key as GraduateProfileMutableField] = value as never;
  }
  return { ok: true, fields };
}

export type FollowupState = "open" | "in_progress" | "completed" | "cancelled";

export const FOLLOWUP_TERMINAL_STATES = ["completed", "cancelled"] as const;

const FOLLOWUP_TRANSITIONS: Readonly<Record<FollowupState, readonly FollowupState[]>> = {
  open: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

/** Mirrors the SQL follow-up state machine; terminal states accept nothing. */
export function canTransitionFollowup(from: FollowupState, to: FollowupState): boolean {
  return FOLLOWUP_TRANSITIONS[from].includes(to);
}

export type EmployerVerificationState = "unverified" | "in_review" | "verified" | "rejected";

const EMPLOYER_VERIFICATION_TRANSITIONS: Readonly<
  Record<EmployerVerificationState, readonly EmployerVerificationState[]>
> = {
  unverified: ["in_review"],
  in_review: ["verified", "rejected"],
  verified: [],
  rejected: [],
};

/** Mirrors the SQL employer verification state machine. */
export function canTransitionEmployerVerification(
  from: EmployerVerificationState,
  to: EmployerVerificationState,
): boolean {
  return EMPLOYER_VERIFICATION_TRANSITIONS[from].includes(to);
}

/**
 * Audience-scope matching for opportunities/surveys/events: the scope must be
 * a plain object carrying either all_graduates = true, or a program_ids /
 * department_ids array containing the record's ids. Anything else (null,
 * non-object, empty object, non-matching arrays) does not match.
 */
export function matchesAudienceScope(
  scope: unknown,
  programId: string,
  departmentId: string,
): boolean {
  if (scope === null || typeof scope !== "object" || Array.isArray(scope)) {
    return false;
  }
  const candidate = scope as Record<string, unknown>;
  if (candidate.all_graduates === true) {
    return true;
  }
  if (Array.isArray(candidate.program_ids) && candidate.program_ids.includes(programId)) {
    return true;
  }
  if (Array.isArray(candidate.department_ids) && candidate.department_ids.includes(departmentId)) {
    return true;
  }
  return false;
}

export const MINIMUM_REPORT_CELL_SIZE = 3;
export const DEFAULT_REPORT_CELL_SIZE = 5;

export { canTransitionOpportunity } from "./foundation";
