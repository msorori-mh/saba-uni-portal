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

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcErrorLike | null }>;
};

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
): Promise<string> {
  const { data, error } = await client.rpc("create_student_request", {
    p_request_type: input.requestType,
    p_title: input.title,
    p_form_data: input.formData,
    p_student_notes: input.studentNotes ?? null,
  });
  if (error) throw new Error(mapStudentRequestRpcError(error));
  if (!data) throw new Error("تعذر إنشاء الطلب");
  return String(data);
}

export async function rpcSubmitStudentRequest(
  client: RpcClient,
  requestId: string,
): Promise<void> {
  const { error } = await client.rpc("submit_student_request", {
    p_request_id: requestId,
  });
  if (error) throw new Error(mapStudentRequestRpcError(error));
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
