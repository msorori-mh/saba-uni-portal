/** Types and RPC helpers for admin-configurable student request workflows. */

import { mapStudentRequestRpcError } from "@/lib/student-request-rpc";

export const WORKFLOW_SAVE_NOT_AVAILABLE_MSG =
  "حفظ دورة الحياة غير مفعّل في هذا الإصدار من التطبيق.";

/** Shown when the RPC is missing from PostgREST schema cache after deploy/sync lag. */
export const WORKFLOW_SAVE_RPC_TEMPORARILY_UNAVAILABLE_MSG =
  "خدمة حفظ دورة الحياة غير متاحة مؤقتًا. أعد تحميل الصفحة أو راجع مزامنة قاعدة البيانات.";

/**
 * Gate for admin_save_request_workflow_config.
 * Enabled after migrations 20260711040000 / 20260711050000 were applied on
 * production Supabase ref wpmicqriltrowwonknox (01B enablement).
 * The guard inside rpcAdminSaveRequestWorkflowConfig remains — do not remove it.
 * Opening the page must not probe or write to the database for this flag.
 */
export const ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE = true;

/** Runtime capability check — returns false immediately when the compile-time flag is off. */
export function isAdminSaveWorkflowRpcAvailable(): boolean {
  return ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE;
}

export type WorkflowSaveMode = "draft" | "activate";

/** Maps UI save mode to RPC workflow status / is_active — no DB access. */
export function workflowMetaForSaveMode(saveMode: WorkflowSaveMode): {
  status: WorkflowStatus;
  is_active: boolean;
} {
  if (saveMode === "activate") {
    return { status: "active", is_active: true };
  }
  return { status: "draft", is_active: false };
}

/** Pure UI gate for save buttons — no network, no DB. */
export function canSubmitWorkflowSave(opts: {
  saveRpcAvailable: boolean;
  saveLoading: WorkflowSaveMode | null;
  dryRunOk: boolean;
  saveMode: WorkflowSaveMode;
}): boolean {
  if (!opts.saveRpcAvailable) return false;
  if (opts.saveLoading !== null) return false;
  if (opts.saveMode === "activate" && !opts.dryRunOk) return false;
  return true;
}

export function isWorkflowSaveRpcMissingError(error: {
  message?: string;
  code?: string;
} | null | undefined): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  const code = error.code ?? "";
  return (
    code === "42883" ||
    code === "PGRST202" ||
    /function_not_found/i.test(msg) ||
    /function .* does not exist/i.test(msg) ||
    /could not find the function/i.test(msg) ||
    /schema cache/i.test(msg)
  );
}

export function mapWorkflowSaveRpcError(error: {
  message?: string;
  code?: string;
}): string {
  if (isWorkflowSaveRpcMissingError(error)) {
    return WORKFLOW_SAVE_RPC_TEMPORARILY_UNAVAILABLE_MSG;
  }
  return mapStudentRequestRpcError(error);
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
  assignment_strategy?: string;
  is_required?: boolean;
  visible_to_student: boolean;
  notify_on_enter: boolean;
  notify_on_complete?: boolean;
  can_return_to_student: boolean;
  can_reject: boolean;
  can_skip: boolean;
  requires_payment?: boolean;
  produces_document?: boolean;
};

export type DraftWorkflowTransition = {
  localId: string;
  from_step_key: string | null;
  to_step_key: string | null;
  action_result: string;
  label_ar?: string | null;
  is_default: boolean;
  condition_config?: Record<string, unknown>;
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
      assignment_strategy: s.assignment_strategy ?? "role_pool",
      is_required: s.is_required ?? true,
      visible_to_student: s.visible_to_student,
      notify_on_enter: s.notify_on_enter,
      notify_on_complete: s.notify_on_complete ?? true,
      can_return_to_student: s.can_return_to_student,
      can_reject: s.can_reject,
      can_skip: s.can_skip,
      requires_payment: s.requires_payment,
      produces_document: s.produces_document,
    })),
    p_transitions: payload.transitions.map((t) => ({
      from_step_key: t.from_step_key,
      to_step_key: t.to_step_key,
      action_result: t.action_result,
      label_ar: t.label_ar ?? null,
      is_default: t.is_default,
      condition_config: t.condition_config ?? {},
    })),
  });

  // No automatic retry — operator must reload / re-sync schema cache if RPC is missing.
  if (error) throw new Error(mapWorkflowSaveRpcError(error));

  const raw = (data ?? {}) as { workflow_id?: string; success?: boolean };
  if (!raw.workflow_id) {
    throw new Error("تعذر حفظ دورة الحياة — لم يُرجَع معرّف workflow");
  }

  return { workflow_id: raw.workflow_id };
}
