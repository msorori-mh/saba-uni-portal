/** Local types for student-request RPCs (migrations may not be applied / generated types stale). */

export const STUDENT_REQUEST_SERVICE_UPDATING_MSG =
  "خدمة الطلبات قيد التحديث. يرجى المحاولة لاحقاً.";

export const STUDENT_REQUEST_INELIGIBLE_DEFAULT_MSG =
  "لا يمكنك تقديم طلبات حالياً بسبب حالة القيد الأكاديمي. يرجى مراجعة شؤون الطلاب.";

export type AvailableRequestTypeRow = {
  id: string;
  code: string;
  name_ar: string;
  description_ar: string | null;
  request_audience: string;
  ineligible_display_mode: string;
  requires_attachment: boolean;
  sort_order: number;
  is_eligible: boolean;
  is_disabled: boolean;
  disabled_reason: string | null;
};

export type MyStudentRequestRow = {
  id: string;
  request_number: string | null;
  request_type: string;
  request_type_name_ar: string | null;
  title: string;
  status: string;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  current_role_key: string | null;
};

type RpcErrorLike = { message?: string; code?: string };

export function mapStudentRequestRpcError(error: RpcErrorLike): string {
  const msg = error.message ?? "";
  const code = error.code ?? "";
  if (
    code === "42883" ||
    /function .* does not exist/i.test(msg) ||
    /could not find the function/i.test(msg) ||
    /schema cache/i.test(msg)
  ) {
    return STUDENT_REQUEST_SERVICE_UPDATING_MSG;
  }
  return msg || "حدث خطأ غير متوقع";
}

export function isStudentRequestCoreRpcUnavailable(error: RpcErrorLike | null | undefined): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  const code = error.code ?? "";
  return (
    code === "42883"
    || /function .* does not exist/i.test(msg)
    || /could not find the function/i.test(msg)
    || /schema cache/i.test(msg)
  );
}

export function isWorkflowRpcUnavailable(error: RpcErrorLike | null | undefined): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  const code = error.code ?? "";
  return (
    isStudentRequestCoreRpcUnavailable(error)
    || /relation .* does not exist/i.test(msg)
    || /student_request_workflow_steps/i.test(msg)
  );
}

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcErrorLike | null }>;
};

/**
 * Atomic P1 submit capability (`submit_student_request_with_details`).
 * P1-06 (atomic submit), P1-07 (transitions/specialized actions), P1-08 (strict
 * runtime assignment) and P1-09 (audit column fix) are APPLIED in production and
 * attested read-only, so the source capability gate is now open.
 */
export const STUDENT_REQUEST_DETAIL_SUBMIT_RUNTIME_AVAILABLE = true as const;

export type AtomicStudentRequestSubmitCapability = {
  rpcName: "submit_student_request_with_details";
  transactionRequired: true;
  validatesBeforeWorkflow: true;
  supportsResubmit: false;
  available: true;
};

export const ATOMIC_STUDENT_REQUEST_SUBMIT_CAPABILITY: AtomicStudentRequestSubmitCapability = {
  rpcName: "submit_student_request_with_details",
  transactionRequired: true,
  validatesBeforeWorkflow: true,
  supportsResubmit: false,
  available: STUDENT_REQUEST_DETAIL_SUBMIT_RUNTIME_AVAILABLE,
};

/** Services served exclusively by the atomic submit RPC (never generic create). */
export const P1_ATOMIC_SUBMIT_SERVICES = [
  "october_exam_entry_form",
  "replacement_student_card",
  "grade_appeal",
] as const;

export type P1AtomicSubmitService = (typeof P1_ATOMIC_SUBMIT_SERVICES)[number];

export function isP1AtomicSubmitService(code: string): code is P1AtomicSubmitService {
  return (P1_ATOMIC_SUBMIT_SERVICES as readonly string[]).includes(code);
}

export type AtomicSubmitInput = {
  requestType: P1AtomicSubmitService;
  title: string;
  formData: Record<string, unknown>;
  studentNotes?: string | null;
  /** TEST_ONLY hidden-path run id; the server re-verifies actor binding. */
  testRunId?: string | null;
};

/**
 * One call = eligibility + request + canonical detail row + submit + workflow,
 * inside a single backend transaction. Any failure rolls the whole thing back,
 * so the client never has to compensate.
 */
export async function rpcSubmitStudentRequestWithDetails(
  client: RpcClient,
  input: AtomicSubmitInput,
): Promise<
  | { id: string; rpcUnavailable: false }
  | { id: null; rpcUnavailable: true; error: RpcErrorLike }
> {
  const { data, error } = await client.rpc("submit_student_request_with_details", {
    p_request_type: input.requestType,
    p_title: input.title,
    p_form_data: input.formData,
    p_student_notes: input.studentNotes ?? null,
    p_test_run_id: input.testRunId ?? null,
  });
  if (error) {
    if (isStudentRequestCoreRpcUnavailable(error)) {
      return { id: null, rpcUnavailable: true, error };
    }
    throw new Error(mapStudentRequestRpcError(error));
  }
  if (!data) throw new Error("تعذر إرسال الطلب");
  return { id: String(data), rpcUnavailable: false };
}


export async function rpcGetAvailableRequestTypes(
  client: RpcClient,
): Promise<AvailableRequestTypeRow[]> {
  const { data, error } = await client.rpc(
    "get_available_request_types_for_current_student",
  );
  if (error) throw new Error(mapStudentRequestRpcError(error));
  return (data ?? []) as AvailableRequestTypeRow[];
}

export async function rpcCreateStudentRequest(
  client: RpcClient,
  input: {
    requestType: string;
    title: string;
    formData: Record<string, unknown>;
    studentNotes?: string | null;
  },
): Promise<{ id: string; rpcUnavailable: false } | { id: null; rpcUnavailable: true; error: RpcErrorLike }> {
  const { data, error } = await client.rpc("create_student_request", {
    p_request_type: input.requestType,
    p_title: input.title,
    p_form_data: input.formData,
    p_student_notes: input.studentNotes ?? null,
  });
  if (error) {
    if (isStudentRequestCoreRpcUnavailable(error)) {
      return { id: null, rpcUnavailable: true, error };
    }
    throw new Error(mapStudentRequestRpcError(error));
  }
  if (!data) throw new Error("تعذر إنشاء الطلب");
  return { id: String(data), rpcUnavailable: false };
}

export async function rpcSubmitStudentRequest(
  client: RpcClient,
  requestId: string,
): Promise<{ ok: true; rpcUnavailable: false } | { ok: false; rpcUnavailable: true; error: RpcErrorLike }> {
  const { error } = await client.rpc("submit_student_request", {
    p_request_id: requestId,
  });
  if (error) {
    if (isStudentRequestCoreRpcUnavailable(error)) {
      return { ok: false, rpcUnavailable: true, error };
    }
    throw new Error(mapStudentRequestRpcError(error));
  }
  return { ok: true, rpcUnavailable: false };
}

export async function rpcGetMyStudentRequests(
  client: RpcClient,
  limit = 50,
  offset = 0,
): Promise<MyStudentRequestRow[]> {
  const { data, error } = await client.rpc("get_my_student_requests", {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(mapStudentRequestRpcError(error));
  return (data ?? []) as MyStudentRequestRow[];
}

export type ActorInboxRow = {
  workflow_step_runtime_id: string;
  student_request_id: string;
  request_type_code: string;
  request_type_name_ar: string | null;
  student_id: string;
  student_name: string | null;
  department_id: string | null;
  department_name_ar: string | null;
  step_key: string;
  step_name_ar: string | null;
  step_status: string;
  processing_unit_name_ar: string | null;
  processing_role_name_ar: string | null;
  submitted_at: string | null;
  is_actionable: boolean;
};

export async function rpcGetMyRequestActorInbox(
  client: RpcClient,
  filters: Record<string, unknown> = {},
  limit = 100,
  offset = 0,
): Promise<{ rows: ActorInboxRow[]; error: RpcErrorLike | null }> {
  const { data, error } = await client.rpc("get_my_request_actor_inbox", {
    p_filters: filters,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return { rows: [], error };
  return { rows: (data ?? []) as ActorInboxRow[], error: null };
}

export async function rpcGetStudentRequestDetailForActor(
  client: RpcClient,
  requestId: string,
): Promise<{ detail: Record<string, unknown> | null; error: RpcErrorLike | null }> {
  const { data, error } = await client.rpc("get_student_request_detail_for_actor", {
    p_request_id: requestId,
  });
  if (error) return { detail: null, error };
  return { detail: (data ?? null) as Record<string, unknown> | null, error: null };
}
