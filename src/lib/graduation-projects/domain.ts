export const PROJECT_STATES = [
  "draft", "submitted", "under_review", "revision_required", "approved",
  "active", "discussion_requested", "discussion_scheduled", "evaluating",
  "corrections_required", "completed", "archived", "rejected", "cancelled",
] as const;

export type ProjectState = (typeof PROJECT_STATES)[number];
export type ProjectRole = "student" | "supervisor" | "co_supervisor" | "coordinator" | "department_head" | "dean" | "panel_member";
export type ProjectAction =
  | "read" | "edit_proposal" | "manage_team" | "approve_proposal"
  | "manage_milestones" | "submit_deliverable" | "comment" | "request_discussion"
  | "schedule_discussion" | "evaluate" | "approve_result" | "archive" | "read_report";

export interface ProjectAuthority {
  actorId: string;
  role: ProjectRole;
  departmentId?: string;
  projectId?: string;
  active: boolean;
  directlyAssigned: boolean;
}

export interface ProjectScope {
  id: string;
  departmentId: string;
  state: ProjectState;
}

const immutableStates = new Set<ProjectState>(["completed", "archived", "rejected", "cancelled"]);

const actionsByRole: Record<ProjectRole, ReadonlySet<ProjectAction>> = {
  student: new Set(["read", "edit_proposal", "manage_team", "submit_deliverable", "request_discussion"]),
  supervisor: new Set(["read", "comment", "manage_milestones", "request_discussion"]),
  co_supervisor: new Set(["read"]),
  coordinator: new Set(["read", "approve_proposal", "manage_milestones", "schedule_discussion", "read_report"]),
  department_head: new Set(["read", "approve_proposal", "schedule_discussion", "approve_result", "read_report"]),
  dean: new Set(["read", "approve_result", "archive", "read_report"]),
  panel_member: new Set(["read", "evaluate"]),
};

export function authorizeProjectAction(
  authority: ProjectAuthority | null,
  project: ProjectScope,
  action: ProjectAction,
): boolean {
  if (!authority?.active || !authority.directlyAssigned) return false;
  if (authority.projectId !== project.id) return false;
  if (authority.departmentId !== project.departmentId) return false;
  if (!actionsByRole[authority.role].has(action)) return false;
  if (immutableStates.has(project.state) && !["read", "read_report"].includes(action)) return false;
  return true;
}

const transitions: Partial<Record<ProjectState, readonly ProjectState[]>> = {
  draft: ["submitted", "cancelled"],
  submitted: ["under_review", "revision_required", "rejected"],
  under_review: ["revision_required", "approved", "rejected"],
  revision_required: ["submitted"],
  approved: ["active"],
  active: ["discussion_requested", "cancelled"],
  discussion_requested: ["discussion_scheduled", "active"],
  discussion_scheduled: ["evaluating"],
  evaluating: ["corrections_required", "completed"],
  corrections_required: ["evaluating"],
  completed: ["archived"],
};

export function isValidTransition(from: ProjectState, to: ProjectState): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export interface ProgressInput {
  weight: number;
  completion: number;
  dueAt?: Date;
  completedAt?: Date;
}

export function calculateProgress(milestones: readonly ProgressInput[], now = new Date()) {
  const valid = milestones.filter((m) => Number.isFinite(m.weight) && m.weight > 0);
  const weight = valid.reduce((sum, m) => sum + m.weight, 0);
  const percent = weight === 0 ? 0 : valid.reduce((sum, m) => sum + m.weight * Math.min(100, Math.max(0, m.completion)), 0) / weight;
  const overdue = valid.filter((m) => m.dueAt && m.dueAt < now && !m.completedAt && m.completion < 100).length;
  return { percent: Math.round(percent * 100) / 100, overdue, atRisk: overdue > 0 };
}

export function isSafePrivateObjectKey(projectId: string, key: string): boolean {
  return key.startsWith(`graduation-projects/${projectId}/`) && !key.includes("..") && !/^https?:\/\//i.test(key);
}

export interface DiscussionReadiness {
  projectState: ProjectState;
  teamMembers: number;
  activeSupervisors: number;
  milestoneWeight: number;
  incompleteMilestones: number;
  overdueMilestones: number;
  pendingCorrections: number;
  cleanFinalFiles: number;
}

export function assessDiscussionReadiness(input: DiscussionReadiness) {
  const blockers: string[] = [];
  if (input.projectState !== "active") blockers.push("project_not_active");
  if (input.teamMembers < 1) blockers.push("team_missing");
  if (input.activeSupervisors < 1) blockers.push("supervisor_missing");
  if (input.milestoneWeight !== 100) blockers.push("milestone_weight_invalid");
  if (input.incompleteMilestones > 0) blockers.push("milestones_incomplete");
  if (input.pendingCorrections > 0) blockers.push("corrections_pending");
  if (input.cleanFinalFiles < 1) blockers.push("clean_final_file_missing");
  return { ready: blockers.length === 0, blockers, atRisk: input.overdueMilestones > 0 };
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
  for (const row of rows) for (const id of new Set(row.supervisorIds)) supervisorLoad[id] = (supervisorLoad[id] ?? 0) + 1;
  return {
    projects: rows.length,
    delayed: rows.filter((r) => r.overdueMilestones > 0).length,
    readyForDiscussion: rows.filter((r) => r.discussionReady).length,
    supervisorLoad,
  };
}
