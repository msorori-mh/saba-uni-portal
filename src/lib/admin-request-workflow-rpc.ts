/** Types and RPC helpers for admin-configurable student request workflows. */

import { mapStudentRequestRpcError } from "@/lib/student-request-rpc";

export const WORKFLOW_SAVE_NOT_AVAILABLE_MSG =
  "حفظ دورة الحياة غير مفعّل حالياً. طبّق migration 20260711040000_enrollment_certificate_workflow_foundation_01a على بيئة آمنة ثم فعّل العلم ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE.";

/**
 * Gate for admin_save_request_workflow_config.
 * Keep false until the remediating migration is applied on the shared Preview/prod DB.
 * Preview and production share the same database — do not probe DB when false.
 */
export const ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE = false;

/** Runtime capability check — returns false immediately when the compile-time flag is off. */
export function isAdminSaveWorkflowRpcAvailable(): boolean {
  return ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE;
}

export type WorkflowStatus = "draft" | "active" | "retired";

export type WorkflowActionType =
  | "review"
  | "approve"
  | "reject"
  | "return_to_student"
  | "request_attachment"
  | "request_payment"
  | "assess_fee"
  | "confirm_payment"
  | "sign"
  | "archive"
  | "issue_document"
  | "complete";

export type WorkflowTransitionResult =
  | "submit"
  | "approve"
  | "reject"
  | "return"
  | "request_attachment"
  | "request_payment"
  | "fee_not_required"
  | "payment_required"
  | "payment_confirmed"
  | "signed"
  | "issued"
  | "archived"
  | "skip"
  | "complete"
  | "cancel";

export type WorkflowConfigWorkflow = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string | null;
  description_ar: string | null;
  version: number;
  status: WorkflowStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type WorkflowConfigStep = {
  id: string;
  workflow_id: string;
  step_key: string;
  step_name_ar: string;
  step_order: number;
  processing_unit_id: string | null;
  processing_role_id: string | null;
  assignment_strategy: string;
  action_type: WorkflowActionType;
  is_required: boolean;
  can_return_to_student: boolean;
  can_reject: boolean;
  can_skip: boolean;
  notify_on_enter: boolean;
  notify_on_complete: boolean;
  visible_to_student: boolean;
};

export type WorkflowConfigTransition = {
  id: string;
  workflow_id: string;
  from_step_id: string | null;
  to_step_id: string | null;
  action_result: string;
  label_ar: string | null;
  is_default: boolean;
};

export type AdminRequestWorkflowConfig = {
  request_type_id: string;
  workflows: WorkflowConfigWorkflow[];
  steps: WorkflowConfigStep[];
  transitions: WorkflowConfigTransition[];
};

export type ProcessingUnitOption = {
  id: string;
  code: string;
  name_ar: string;
  is_active: boolean;
};

export type ProcessingRoleOption = {
  id: string;
  unit_id: string;
  code: string;
  name_ar: string;
  is_active: boolean;
};

export type ProcessingOptionsResult = {
  schemaAvailable: boolean;
  units: ProcessingUnitOption[];
  roles: ProcessingRoleOption[];
  message: string | null;
};

/** Editable draft step for the UI builder (not persisted until save RPC exists). */
export type DraftWorkflowStep = {
  localId: string;
  step_key: string;
  step_name_ar: string;
  step_order: number;
  processing_unit_id: string | null;
  processing_role_id: string | null;
  action_type: WorkflowActionType;
  visible_to_student: boolean;
  notify_on_enter: boolean;
  can_return_to_student: boolean;
  can_reject: boolean;
  can_skip: boolean;
};

export type DraftWorkflowTransition = {
  localId: string;
  from_step_key: string | null;
  to_step_key: string | null;
  action_result: string;
  is_default: boolean;
};

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

export async function rpcAdminGetRequestWorkflowConfig(
  client: RpcClient,
  requestTypeId: string,
): Promise<AdminRequestWorkflowConfig> {
  const { data, error } = await client.rpc("admin_get_request_workflow_config", {
    p_request_type_id: requestTypeId,
  });
  if (error) throw new Error(mapStudentRequestRpcError(error));
  const raw = (data ?? {}) as Partial<AdminRequestWorkflowConfig>;
  return {
    request_type_id: raw.request_type_id ?? requestTypeId,
    workflows: (raw.workflows ?? []) as WorkflowConfigWorkflow[],
    steps: (raw.steps ?? []) as WorkflowConfigStep[],
    transitions: (raw.transitions ?? []) as WorkflowConfigTransition[],
  };
}

export async function rpcAdminSaveRequestWorkflowConfig(
  client: RpcClient,
  payload: {
    requestTypeId: string;
    workflow: Record<string, unknown>;
    steps: DraftWorkflowStep[];
    transitions: DraftWorkflowTransition[];
  },
): Promise<{ workflow_id: string }> {
  if (!ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE) {
    throw new Error(WORKFLOW_SAVE_NOT_AVAILABLE_MSG);
  }

  const { data, error } = await client.rpc("admin_save_request_workflow_config", {
    p_request_type_id: payload.requestTypeId,
    p_workflow: payload.workflow,
    p_steps: payload.steps.map((s) => ({
      step_key: s.step_key,
      step_name_ar: s.step_name_ar,
      step_order: s.step_order,
      processing_unit_id: s.processing_unit_id,
      processing_role_id: s.processing_role_id,
      action_type: s.action_type,
      visible_to_student: s.visible_to_student,
      notify_on_enter: s.notify_on_enter,
      can_return_to_student: s.can_return_to_student,
      can_reject: s.can_reject,
      can_skip: s.can_skip,
    })),
    p_transitions: payload.transitions.map((t) => ({
      from_step_key: t.from_step_key,
      to_step_key: t.to_step_key,
      action_result: t.action_result,
      is_default: t.is_default,
    })),
  });

  if (error) throw new Error(mapStudentRequestRpcError(error));

  const raw = (data ?? {}) as { workflow_id?: string; success?: boolean };
  if (!raw.workflow_id) {
    throw new Error("تعذر حفظ دورة الحياة — لم يُرجَع معرّف workflow");
  }

  return { workflow_id: raw.workflow_id };
}
