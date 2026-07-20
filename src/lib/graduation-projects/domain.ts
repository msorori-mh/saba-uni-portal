export const PROJECT_STATES = [
  "draft", "submitted", "under_review", "revision_required", "approved",
  "active", "discussion_requested", "discussion_scheduled", "evaluating",
  "corrections_required", "completed", "archived", "rejected", "cancelled",
] as const;

export type ProjectState = (typeof PROJECT_STATES)[number];
export type ProjectRole = "student" | "supervisor" | "coordinator" | "department_head" | "dean" | "panel_member";
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
