/**
 * Runtime capability gate for graduates-affairs wiring.
 *
 * Presentation/nav helpers only — SQL AUTH-04 RPCs remain the security boundary.
 * Owner gates (OWNER_D1 / OWNER_D2 / OFFICIAL_DECISION_INTAKE) are enforced
 * fail-closed here so UI/adapters never invent authority from student status,
 * candidate lists, or app_role fallbacks.
 */

import {
  evaluateRecordAccess,
  resolveStaffCapabilities,
  type GraduateAffairsActor,
  type RecordScope,
} from "./authorization";
import {
  evaluateAccountContinuityAccess,
  type AccountContinuityPolicy,
  type GraduateAccountCapability,
} from "./account-continuity";

export const GRADUATES_AFFAIRS_AUTH04_RPCS = [
  "graduate_update_own_profile",
  "graduate_grant_consent",
  "graduate_withdraw_consent",
  "graduate_add_contact_point",
  "graduate_revoke_contact_point",
  "graduate_my_contact_points",
  "graduate_my_consents",
  "graduate_list_self_surveys",
  "graduate_report_employment",
  "graduate_submit_survey_response",
  "graduate_withdraw_survey_response",
  "graduate_register_for_event",
  "graduate_cancel_event_registration",
  "graduate_list_visible_opportunities",
  "graduate_list_visible_events",
  "graduate_affairs_get_graduate_file",
  "graduate_affairs_search_records",
  "graduate_affairs_list_assignable_staff",
  "graduate_affairs_list_active_followup_types",
  "graduate_affairs_create_followup",
  "graduate_affairs_transition_followup",
  "graduate_affairs_moderate_opportunity",
  "graduate_affairs_set_employer_verification",
  "graduate_affairs_cohort_employment_report",
  "graduate_affairs_resolve_self_context",
  "graduate_affairs_resolve_staff_record_access",
  // GA-1/2/3 admin configuration RPCs
  "ga_admin_list_followup_types",
  "ga_admin_save_followup_type",
  "ga_admin_list_followup_workflows",
  "ga_admin_save_workflow_draft",
  "ga_admin_publish_workflow",
] as const;

/** Direct table mutation paths are never authorized for this domain. */
export const DIRECT_TABLE_MUTATION_PATHS = [
  "insert",
  "update",
  "delete",
  "upsert",
] as const;

export type GraduatesAffairsAuth04Rpc = (typeof GRADUATES_AFFAIRS_AUTH04_RPCS)[number];

/** app_role values that must never independently grant GA operational access. */
export const NON_AUTHORITATIVE_APP_ROLES = [
  "admin",
  "system_admin",
  "dean",
  "registrar",
  "student_affairs",
  "student_affairs_manager",
  "student_affairs_specialist",
] as const;

export type GraduateFactLifecycle =
  | "approved"
  | "corrected"
  | "revoked"
  | "pending"
  | "absent"
  | "unavailable";

export type RuntimeDenial =
  | { allowed: false; reason: string }
  | { allowed: true; via?: string };

export interface GraduateSelfRuntimeInput {
  featureEnabled: boolean;
  authenticated: boolean;
  /** Never sufficient alone. */
  studentProfileStatus: string | null;
  /** Never sufficient alone. */
  isGraduationCandidate: boolean;
  ownsGraduateRecord: boolean;
  graduateRecordState: GraduateFactLifecycle;
  continuityPolicy: AccountContinuityPolicy;
  capability: GraduateAccountCapability;
  at: string;
}

/**
 * Graduate self-service surface gate.
 * Requires feature flag ON, auth, ownership, approved graduate fact, and
 * continuity approval for the requested capability.
 */
export function evaluateGraduateSelfRuntimeAccess(
  input: GraduateSelfRuntimeInput,
): RuntimeDenial {
  if (!input.featureEnabled) {
    return { allowed: false, reason: "graduates_affairs_feature_flag_off" };
  }
  if (!input.authenticated) {
    return { allowed: false, reason: "graduates_affairs_not_authenticated" };
  }
  // Explicitly ignore student status / candidate flags as authority sources.
  void input.studentProfileStatus;
  void input.isGraduationCandidate;
  if (!input.ownsGraduateRecord) {
    return { allowed: false, reason: "graduate_record_not_owned" };
  }
  if (input.graduateRecordState === "corrected") {
    return { allowed: false, reason: "graduate_record_corrected" };
  }
  if (input.graduateRecordState === "revoked") {
    return { allowed: false, reason: "graduate_record_revoked" };
  }
  if (input.graduateRecordState === "pending") {
    return { allowed: false, reason: "graduate_record_not_approved" };
  }
  if (input.graduateRecordState === "absent") {
    return { allowed: false, reason: "graduate_record_absent" };
  }
  if (input.graduateRecordState === "unavailable") {
    return { allowed: false, reason: "graduate_record_unavailable" };
  }
  if (input.graduateRecordState !== "approved") {
    return { allowed: false, reason: "graduate_record_not_current" };
  }
  const continuity = evaluateAccountContinuityAccess(
    input.continuityPolicy,
    input.capability,
    input.at,
  );
  if (!continuity.ok) {
    return { allowed: false, reason: continuity.reason };
  }
  return { allowed: true, via: "self" };
}

export interface StaffRuntimeInput {
  featureEnabled: boolean;
  authenticated: boolean;
  /** Inspected only to prove they never grant access by themselves. */
  appRoles: readonly string[];
  actor: GraduateAffairsActor;
  record: RecordScope;
  at: Date;
}

/**
 * Staff operational gate. app_role (admin/dean/registrar/student_affairs)
 * never grants; only active graduate_affairs assignment scopes / direct
 * case assignee grant staff surface access (self ownership is not staff).
 */
export function evaluateStaffRuntimeAccess(input: StaffRuntimeInput): RuntimeDenial {
  if (!input.featureEnabled) {
    return { allowed: false, reason: "graduates_affairs_feature_flag_off" };
  }
  if (!input.authenticated || input.actor.userId === null) {
    return { allowed: false, reason: "graduates_affairs_not_authenticated" };
  }
  // Document that privileged app roles were considered and rejected as authority.
  void input.appRoles;
  const capabilities = resolveStaffCapabilities(input.actor, input.at);
  if (capabilities.isManager) {
    return { allowed: true, via: "manager" };
  }
  if (capabilities.specialistDepartmentIds.includes(input.record.departmentId)) {
    return { allowed: true, via: "specialist" };
  }
  if (input.actor.activeFollowupRecordIds.includes(input.record.recordId)) {
    return { allowed: true, via: "direct_assignee" };
  }
  // Keep parity with evaluateRecordAccess denial code for unassigned actors.
  const selfDecision = evaluateRecordAccess(input.actor, input.record, input.at);
  if (selfDecision.allowed && selfDecision.via === "self") {
    return { allowed: false, reason: "graduate_staff_surface_requires_staff_actor" };
  }
  return { allowed: false, reason: "graduate_record_access_denied" };
}

/** True only when the RPC name is an approved AUTH-04 client RPC. */
export function isApprovedAuth04Rpc(name: string): name is GraduatesAffairsAuth04Rpc {
  return (GRADUATES_AFFAIRS_AUTH04_RPCS as readonly string[]).includes(name);
}

export type TableMutationKind = "insert" | "update" | "delete" | "upsert";

/**
 * Runtime adapters must never open a direct table mutation path for this
 * domain. Any attempted kind fails closed.
 */
export function assertNoDirectGraduateTableMutation(
  table: string,
  kind: TableMutationKind,
): { ok: false; reason: string } {
  void table;
  void kind;
  return { ok: false, reason: "graduates_affairs_direct_table_mutation_forbidden" };
}

/**
 * Mutations are blocked while the feature flag is OFF even if a caller
 * reaches a server adapter.
 */
export function assertGraduateMutationAllowed(featureEnabled: boolean): RuntimeDenial {
  if (!featureEnabled) {
    return { allowed: false, reason: "graduates_affairs_feature_flag_off" };
  }
  return { allowed: true };
}

/** student_affairs (or other app roles) alone never imply GA staff access. */
export function appRoleAloneGrantsGraduateAffairs(
  appRoles: readonly string[],
  hasGraduateAffairsAssignment: boolean,
): boolean {
  if (hasGraduateAffairsAssignment) {
    return false;
  }
  return appRoles.some((role) =>
    (NON_AUTHORITATIVE_APP_ROLES as readonly string[]).includes(role),
  )
    ? false
    : false;
}
