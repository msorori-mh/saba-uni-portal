/**
 * Graduation Projects MVP — canonical domain types (Package B).
 * Sole authority: docs/PORTAL-GRADUATION-PROJECTS-MVP-SCOPE-AND-CONTRACT-FREEZE-01.md
 *
 * Draft dean/head bypass, completed/corrections_required result vocabulary, and
 * discussion_* product states are not MVP operational paths.
 */

/** Canonical root lifecycle states (binding). */
export const LIFECYCLE_STATES = [
  "draft",
  "submitted",
  "revision_required",
  "rejected",
  "approved",
  "active",
  "defense_scheduled",
  "evaluating",
  "archived",
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/**
 * Legacy draft states retained only so unrouted components typecheck.
 * Unreachable for MVP transitions; actions denied.
 */
export const LEGACY_DRAFT_STATES = [
  "under_review",
  "discussion_requested",
  "discussion_scheduled",
  "corrections_required",
  "completed",
  "cancelled",
] as const;

export type LegacyDraftState = (typeof LEGACY_DRAFT_STATES)[number];

/** Union used by existing UI mirrors until Package C rewires. */
export const PROJECT_STATES = [...LIFECYCLE_STATES, ...LEGACY_DRAFT_STATES] as const;
export type ProjectState = (typeof PROJECT_STATES)[number];

/** Separate from lifecycle_state — nullable until coordinator concludes. */
export const FINAL_DECISIONS = ["passed", "revisions_required", "failed"] as const;
export type FinalDecision = (typeof FINAL_DECISIONS)[number];
export type FinalDecisionValue = FinalDecision | null;

/** Assignment role stored on project assignments (SQL role column). */
export const ASSIGNMENT_ROLES = [
  "student",
  "coordinator",
  "supervisor",
  "committee_member",
] as const;
export type AssignmentRole = (typeof ASSIGNMENT_ROLES)[number];

/**
 * Draft SQL used panel_member; MVP user term is committee member.
 * Components still reference panel_member — alias kept for handwritten DTO compat.
 */
export type ProjectRole =
  | AssignmentRole
  | "panel_member"
  | "department_head"
  | "dean"
  | "administration_viewer";

export type SupervisionAcceptance = "pending" | "accepted" | "declined";

export type StudentTeamCapacity = "leader" | "member";

/** Actor kinds for authorization / UX mirrors (not title bypass). */
export type GpActorKind =
  | "team_leader"
  | "team_member"
  | "coordinator"
  | "supervisor_pending"
  | "supervisor_accepted"
  | "committee_member"
  | "administration_viewer"
  | "unrelated";

export type FileCategory = "proposal" | "progress" | "final";
export type ScanState = "pending" | "clean" | "quarantined" | "rejected";

export type ProjectAction =
  | "read"
  | "create_team"
  | "manage_team"
  | "upsert_proposal"
  | "submit_proposal"
  | "review_proposal"
  | "assign_supervisor"
  | "respond_supervision"
  | "submit_progress"
  | "review_progress"
  | "submit_final"
  | "review_final"
  | "schedule_defense"
  | "assign_committee"
  | "mark_defense_held"
  | "evaluate"
  | "conclude_result"
  | "archive"
  | "signed_download"
  | "admin_overview_read"
  // legacy aliases consumed by unrouted components
  | "edit_proposal"
  | "approve_proposal"
  | "manage_milestones"
  | "submit_deliverable"
  | "comment"
  | "request_discussion"
  | "schedule_discussion"
  | "approve_result"
  | "read_report";

export interface ProjectAuthority {
  actorId: string;
  role: ProjectRole;
  departmentId?: string;
  projectId?: string;
  active: boolean;
  directlyAssigned: boolean;
  /** Student assignments only. */
  isLeader?: boolean;
  /** Supervisor assignments only. */
  supervisionStatus?: SupervisionAcceptance;
}

export interface ProjectScope {
  id: string;
  departmentId: string;
  state: ProjectState;
  finalDecision?: FinalDecisionValue;
}

const TERMINAL_OPERATIONAL: ReadonlySet<ProjectState> = new Set([
  "rejected",
  "archived",
  "completed",
  "cancelled",
]);

const CANONICAL_ACTIONS_BY_ACTOR: Record<GpActorKind, ReadonlySet<ProjectAction>> = {
  team_leader: new Set([
    "read",
    "manage_team",
    "upsert_proposal",
    "submit_proposal",
    "edit_proposal",
    "submit_progress",
    "submit_final",
    "submit_deliverable",
    "signed_download",
  ]),
  team_member: new Set(["read", "signed_download"]),
  coordinator: new Set([
    "read",
    "create_team",
    "manage_team",
    "review_proposal",
    "approve_proposal",
    "assign_supervisor",
    "schedule_defense",
    "schedule_discussion",
    "assign_committee",
    "mark_defense_held",
    "conclude_result",
    "approve_result",
    "archive",
    "signed_download",
    "read_report",
  ]),
  supervisor_pending: new Set(["read", "respond_supervision"]),
  supervisor_accepted: new Set([
    "read",
    "review_progress",
    "review_final",
    "manage_milestones",
    "comment",
    "signed_download",
  ]),
  committee_member: new Set(["read", "evaluate", "signed_download"]),
  administration_viewer: new Set(["admin_overview_read", "read", "read_report"]),
  unrelated: new Set(),
};

export function resolveGpActorKind(authority: ProjectAuthority | null): GpActorKind {
  if (!authority?.active || !authority.directlyAssigned) return "unrelated";
  switch (authority.role) {
    case "student":
      return authority.isLeader ? "team_leader" : "team_member";
    case "coordinator":
      return "coordinator";
    case "supervisor":
      if (authority.supervisionStatus === "accepted") return "supervisor_accepted";
      if (authority.supervisionStatus === "pending") return "supervisor_pending";
      return "unrelated";
    case "committee_member":
    case "panel_member":
      return "committee_member";
    case "administration_viewer":
      return "administration_viewer";
    case "department_head":
    case "dean":
      // Titles alone never grant operational access (freeze hard rule).
      return "unrelated";
    default:
      return "unrelated";
  }
}

export function authorizeProjectAction(
  authority: ProjectAuthority | null,
  project: ProjectScope,
  action: ProjectAction,
): boolean {
  const kind = resolveGpActorKind(authority);
  if (kind === "unrelated") return false;
  if (!authority) return false;
  if (authority.projectId && authority.projectId !== project.id) return false;
  if (authority.departmentId && authority.departmentId !== project.departmentId) return false;
  if (!CANONICAL_ACTIONS_BY_ACTOR[kind].has(action)) return false;
  if (TERMINAL_OPERATIONAL.has(project.state) && !["read", "read_report", "admin_overview_read", "signed_download"].includes(action)) {
    return false;
  }
  return true;
}

/** Canonical MVP transitions (freeze § Allowed transitions). */
const transitions: Partial<Record<ProjectState, readonly ProjectState[]>> = {
  draft: ["submitted"],
  submitted: ["revision_required", "rejected", "approved"],
  revision_required: ["submitted"],
  approved: ["active"],
  active: ["defense_scheduled"],
  defense_scheduled: ["evaluating"],
  evaluating: ["archived"],
};

export function isValidTransition(from: ProjectState, to: ProjectState): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export function isCanonicalLifecycleState(state: string): state is LifecycleState {
  return (LIFECYCLE_STATES as readonly string[]).includes(state);
}

export function isFinalDecision(value: string | null | undefined): value is FinalDecision {
  return value != null && (FINAL_DECISIONS as readonly string[]).includes(value);
}

export function canArchiveByFinalDecision(decision: FinalDecisionValue): boolean {
  return decision === "passed" || decision === "failed";
}

export function isSafePrivateObjectKey(projectId: string, key: string): boolean {
  return (
    key.startsWith(`graduation-projects/${projectId}/`)
    && !key.includes("..")
    && !/^https?:\/\//i.test(key)
  );
}

export const GP_PRIVATE_BUCKET = "graduation-projects";

export interface ProgressInput {
  weight: number;
  completion: number;
  dueAt?: Date;
  completedAt?: Date;
}

/** Optional weighted helper retained for legacy milestone UI mirrors. */
export function calculateProgress(milestones: readonly ProgressInput[], now = new Date()) {
  const valid = milestones.filter((m) => Number.isFinite(m.weight) && m.weight > 0);
  const weight = valid.reduce((sum, m) => sum + m.weight, 0);
  const percent = weight === 0
    ? 0
    : valid.reduce((sum, m) => sum + m.weight * Math.min(100, Math.max(0, m.completion)), 0) / weight;
  const overdue = valid.filter((m) => m.dueAt && m.dueAt < now && !m.completedAt && m.completion < 100).length;
  return { percent: Math.round(percent * 100) / 100, overdue, atRisk: overdue > 0 };
}

/** Defense readiness (user-facing: مناقشة مشروع التخرج). */
export interface DefenseReadiness {
  projectState: ProjectState;
  teamMembers: number;
  acceptedSupervisors: number;
  currentFinalReady: boolean;
  currentFinalClean: boolean;
  committeeMembers: number;
}

export type DiscussionReadiness = DefenseReadiness & {
  /** @deprecated draft fields — ignored by MVP assessor when present */
  activeSupervisors?: number;
  milestoneWeight?: number;
  incompleteMilestones?: number;
  overdueMilestones?: number;
  pendingCorrections?: number;
  cleanFinalFiles?: number;
};

export function assessDefenseReadiness(input: DefenseReadiness) {
  const blockers: string[] = [];
  if (input.projectState !== "active") blockers.push("project_not_active");
  if (input.teamMembers < 1) blockers.push("team_missing");
  if (input.acceptedSupervisors < 1) blockers.push("supervisor_missing");
  if (!input.currentFinalReady) blockers.push("final_not_ready");
  if (!input.currentFinalClean) blockers.push("clean_final_file_missing");
  if (input.committeeMembers > 0 && input.committeeMembers < 2) blockers.push("committee_incomplete");
  return { ready: blockers.length === 0, blockers, atRisk: false };
}

/**
 * Compatibility wrapper for unrouted components still calling assessDiscussionReadiness.
 * Maps legacy milestone fields into MVP defense gates where possible.
 */
export function assessDiscussionReadiness(input: DiscussionReadiness) {
  const accepted = input.acceptedSupervisors ?? input.activeSupervisors ?? 0;
  const cleanFinal = input.currentFinalClean ?? (input.cleanFinalFiles ?? 0) >= 1;
  const finalReady = input.currentFinalReady ?? cleanFinal;
  const result = assessDefenseReadiness({
    projectState: input.projectState,
    teamMembers: input.teamMembers,
    acceptedSupervisors: accepted,
    currentFinalReady: finalReady,
    currentFinalClean: cleanFinal,
    committeeMembers: input.committeeMembers ?? 0,
  });
  const blockers = [...result.blockers];
  if (input.milestoneWeight != null && input.milestoneWeight !== 100) {
    blockers.push("milestone_weight_invalid");
  }
  if ((input.incompleteMilestones ?? 0) > 0) blockers.push("milestones_incomplete");
  if ((input.pendingCorrections ?? 0) > 0) blockers.push("corrections_pending");
  const unique = [...new Set(blockers)];
  return {
    ready: unique.length === 0,
    blockers: unique,
    atRisk: (input.overdueMilestones ?? 0) > 0,
  };
}

export interface ProjectReportRow {
  projectId: string;
  supervisorIds: readonly string[];
  progressPercent: number;
  overdueMilestones: number;
  discussionReady: boolean;
}

export function summarizeProjects(rows: readonly ProjectReportRow[]) {
  const supervisorLoad: Record<string, number> = {};
  for (const row of rows) {
    for (const id of new Set(row.supervisorIds)) {
      supervisorLoad[id] = (supervisorLoad[id] ?? 0) + 1;
    }
  }
  return {
    projects: rows.length,
    delayed: rows.filter((r) => r.overdueMilestones > 0).length,
    readyForDiscussion: rows.filter((r) => r.discussionReady).length,
    supervisorLoad,
  };
}

export function averageSubmittedScores(scores: readonly number[]): number | null {
  if (scores.length === 0) return null;
  const sum = scores.reduce((a, b) => a + b, 0);
  return Math.round((sum / scores.length) * 100) / 100;
}

export function isValidEvaluationScore(score: number): boolean {
  return Number.isFinite(score) && score >= 0 && score <= 100;
}
