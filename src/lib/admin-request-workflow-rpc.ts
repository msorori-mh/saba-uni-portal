/** Types and RPC helpers for admin-configurable student request workflows. */

import { mapStudentRequestRpcError } from "@/lib/student-request-rpc";

export const WORKFLOW_SAVE_NOT_AVAILABLE_MSG =
  "حفظ دورة الحياة يحتاج تفعيل خدمة الحفظ أولاً. سيتم تفعيل الحفظ بعد تنفيذ admin_save_request_workflow_config.";

/** Set false until admin_save_request_workflow_config migration is applied. */
export const ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE = false;

export type WorkflowStatus = "draft" | "active" | "retired";

export type WorkflowActionType =
  | "review"
  | "approve"
  | "reject"
  | "return_to_student"
  | "request_attachment"
  | "request_payment"
  | "archive"
  | "issue_document"
  | "complete";

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

/**
 * Future: persist workflow config via admin_save_request_workflow_config RPC.
 * Not available until the corresponding migration is applied.
 */
export async function rpcAdminSaveRequestWorkflowConfig(
  _client: RpcClient,
  _payload: {
    requestTypeId: string;
    workflow: Record<string, unknown>;
    steps: DraftWorkflowStep[];
    transitions: DraftWorkflowTransition[];
  },
): Promise<void> {
  if (!ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE) {
    throw new Error(WORKFLOW_SAVE_NOT_AVAILABLE_MSG);
  }
  throw new Error(WORKFLOW_SAVE_NOT_AVAILABLE_MSG);
}
