/**
 * Round-trip mappers between server workflow config and local editor draft.
 * Pure functions — no network, no defaults that overwrite saved values.
 */

import type {
  AdminRequestWorkflowConfig,
  DraftWorkflowStep,
  DraftWorkflowTransition,
  WorkflowConfigStep,
  WorkflowConfigTransition,
  WorkflowConfigWorkflow,
} from "@/lib/admin-request-workflow-rpc";

/** Prefer saved id, then active, then newest draft, then first available. */
export function selectWorkflowForEditor(
  workflows: WorkflowConfigWorkflow[],
  preferredWorkflowId: string | null | undefined,
): WorkflowConfigWorkflow | null {
  if (workflows.length === 0) return null;

  if (preferredWorkflowId) {
    const preferred = workflows.find((w) => w.id === preferredWorkflowId);
    if (preferred) return preferred;
  }

  const active = workflows.find((w) => w.is_active && w.status === "active");
  if (active) return active;

  const drafts = workflows
    .filter((w) => w.status === "draft")
    .slice()
    .sort((a, b) => {
      if (b.version !== a.version) return b.version - a.version;
      return b.updated_at.localeCompare(a.updated_at);
    });
  if (drafts[0]) return drafts[0];

  return workflows[0] ?? null;
}

/** Map one server step → draft without substituting field defaults. */
export function configStepToDraftStep(step: WorkflowConfigStep): DraftWorkflowStep {
  return {
    localId: step.id,
    step_key: step.step_key,
    step_name_ar: step.step_name_ar,
    step_order: step.step_order,
    processing_unit_id: step.processing_unit_id,
    processing_role_id: step.processing_role_id,
    assignment_strategy: step.assignment_strategy,
    action_type: step.action_type,
    is_required: step.is_required,
    visible_to_student: step.visible_to_student,
    notify_on_enter: step.notify_on_enter,
    notify_on_complete: step.notify_on_complete,
    can_return_to_student: step.can_return_to_student,
    can_reject: step.can_reject,
    can_skip: step.can_skip,
    requires_payment: step.requires_payment,
    produces_document: step.produces_document,
  };
}

/** Map one server transition → draft; preserve label and conditions. */
export function configTransitionToDraftTransition(
  transition: WorkflowConfigTransition,
  stepIdToKey: Map<string, string>,
): DraftWorkflowTransition {
  return {
    localId: transition.id,
    from_step_key: transition.from_step_id
      ? (stepIdToKey.get(transition.from_step_id) ?? null)
      : null,
    to_step_key: transition.to_step_id
      ? (stepIdToKey.get(transition.to_step_id) ?? null)
      : null,
    action_result: transition.action_result,
    label_ar: transition.label_ar,
    is_default: transition.is_default,
    condition_config:
      transition.condition_config ?? transition.condition_schema ?? {},
  };
}

export function mapWorkflowConfigToDraft(
  config: AdminRequestWorkflowConfig,
  workflowId: string | null,
): { steps: DraftWorkflowStep[]; transitions: DraftWorkflowTransition[] } {
  const stepsForWorkflow = workflowId
    ? config.steps.filter((s) => s.workflow_id === workflowId)
    : config.steps;
  const transitionsForWorkflow = workflowId
    ? config.transitions.filter((t) => t.workflow_id === workflowId)
    : config.transitions;

  const stepIdToKey = new Map(stepsForWorkflow.map((s) => [s.id, s.step_key]));

  return {
    steps: stepsForWorkflow.map(configStepToDraftStep),
    transitions: transitionsForWorkflow.map((t) =>
      configTransitionToDraftTransition(t, stepIdToKey),
    ),
  };
}
