/**
 * Role policy for workflow draft save vs activation (01R-A1).
 * Pure helpers — no DB access.
 */

/** Roles allowed to save draft workflow configs (unchanged from prior policy). */
export const WORKFLOW_DRAFT_SAVE_ROLES = [
  "admin",
  "system_admin",
  "registrar",
  "student_affairs",
] as const;

/** Roles allowed to activate a workflow (status=active / is_active=true). */
export const WORKFLOW_ACTIVATE_ROLES = ["admin", "system_admin"] as const;

export type WorkflowSaveModeRoles = "draft" | "activate";

export function rolesAllowedForWorkflowSaveMode(
  saveMode: WorkflowSaveModeRoles,
): readonly string[] {
  return saveMode === "activate" ? WORKFLOW_ACTIVATE_ROLES : WORKFLOW_DRAFT_SAVE_ROLES;
}

export function canRoleActivateWorkflow(role: string | null | undefined): boolean {
  if (!role) return false;
  return (WORKFLOW_ACTIVATE_ROLES as readonly string[]).includes(role);
}

export function canRoleSaveWorkflowDraft(role: string | null | undefined): boolean {
  if (!role) return false;
  return (WORKFLOW_DRAFT_SAVE_ROLES as readonly string[]).includes(role);
}

export function evaluateWorkflowSaveModeAuthorization(input: {
  saveMode: WorkflowSaveModeRoles;
  userRoles: readonly string[];
}): { allowed: boolean; reasonAr: string | null } {
  const required = rolesAllowedForWorkflowSaveMode(input.saveMode);
  const allowed = input.userRoles.some((r) => required.includes(r));
  if (allowed) return { allowed: true, reasonAr: null };
  if (input.saveMode === "activate") {
    return {
      allowed: false,
      reasonAr: "ليس لديك صلاحية تفعيل دورة حياة الطلبات",
    };
  }
  return {
    allowed: false,
    reasonAr: "ليس لديك صلاحية إعداد دورة حياة الطلبات",
  };
}

/** True when p_workflow payload requests activation. */
export function workflowPayloadRequestsActivation(workflow: {
  status?: string | null;
  is_active?: boolean | null;
}): boolean {
  const status = String(workflow.status ?? "draft").trim();
  if (workflow.is_active === true) return true;
  return status === "active";
}
