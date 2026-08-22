import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  staffAttachmentIntentSchema,
  staffServiceDecisionSchema,
  staffServiceSubmitSchema,
} from "@/lib/staff-self-service-contracts";

export const STAFF_SELF_SERVICE_LIVE_BINDING_MARKER =
  "PORTAL_STAFF_SELF_SERVICE_STORAGE_BINDING_02B";

const uploadIntentResultSchema = z.object({
  attachment_id: z.string().uuid(),
  storage_bucket: z.literal("staff-service-private"),
  object_path: z.string().min(1).refine((path) => !path.includes("..")),
  upload_status: z.enum(["pending", "uploaded", "abandoned", "rejected"]),
});

const attachmentFinalizeResultSchema = z.object({
  attachment_id: z.string().uuid(),
  upload_status: z.literal("uploaded"),
  scan_state: z.enum(["pending", "clean", "infected", "failed"]),
});

const downloadContractSchema = z.object({
  attachment_id: z.string().uuid(),
  storage_bucket: z.literal("staff-service-private"),
  object_path: z.string().min(1).refine((path) => !path.includes("..")),
  expires_in_seconds: z.literal(300),
});

const requestResultSchema = z.object({
  id: z.string().uuid(),
  request_no: z.string().min(1),
  service_type: z.string().min(1),
  status: z.enum(["draft", "submitted", "in_review", "approved", "rejected", "cancelled"]),
  decision_reason: z.string().nullable().optional(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
}).passthrough();

export type StaffServiceRequestSummary = z.infer<typeof requestResultSchema>;

type RpcError = { message?: string; code?: string } | null;
type RpcResponse = Promise<{ data: unknown; error: RpcError }>;

const rpc = supabase.rpc as unknown as (
  functionName: string,
  params: Record<string, unknown>,
) => RpcResponse;

type ReadQuery = {
  select: (columns: string) => ReadQuery;
  order: (column: string, options: { ascending: boolean }) => RpcResponse;
};

const fromReadModel = supabase.from as unknown as (table: string) => ReadQuery;

const SAFE_ERROR_MESSAGES: Record<string, string> = {
  STAFF_SERVICE_AUTH_REQUIRED: "يلزم تسجيل الدخول إلى بوابة الموظفين.",
  STAFF_SERVICE_ACTIVE_PROFILE_REQUIRED: "لا يوجد ملف وظيفي نشط لهذا الحساب.",
  STAFF_SERVICE_APPROVER_SCOPE_DENIED: "لا تملك صلاحية معالجة هذا الطلب.",
  STAFF_SERVICE_SELF_APPROVAL_DENIED: "لا يمكن اعتماد طلبك الشخصي.",
  STAFF_SERVICE_REJECTION_REASON_REQUIRED: "سبب الرفض إلزامي.",
  STAFF_SERVICE_ATTACHMENT_WINDOW_CLOSED: "تم إغلاق فترة إضافة المرفقات لهذا الطلب.",
  STAFF_SERVICE_ATTACHMENT_ACCESS_DENIED: "لا تملك صلاحية الوصول إلى هذا المرفق.",
  STAFF_SERVICE_STORAGE_OBJECT_NOT_FOUND: "لم يكتمل رفع الملف، حاول مرة أخرى.",
};

function throwSafeRpcError(error: Exclude<RpcError, null>): never {
  const raw = `${error.code ?? ""} ${error.message ?? ""}`;
  const matched = Object.keys(SAFE_ERROR_MESSAGES).find((key) => raw.includes(key));
  throw new Error(
    matched
      ? SAFE_ERROR_MESSAGES[matched]
      : "تعذر إكمال العملية بأمان. حاول مرة أخرى أو تواصل مع الدعم.",
  );
}

async function callRpc<T>(
  name: string,
  params: Record<string, unknown>,
  schema?: z.ZodType<T>,
): Promise<T> {
  const { data, error } = await rpc(name, params);
  if (error) throwSafeRpcError(error);
  return schema ? schema.parse(data) : (data as T);
}

export async function submitStaffServiceRequest(input: {
  serviceType: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}) {
  const parsed = staffServiceSubmitSchema.parse({
    serviceType: input.serviceType,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
  });

  return callRpc(
    "staff_service_submit_request",
    {
      p_service_type: parsed.serviceType,
      p_payload: parsed.payload,
      p_idempotency_key: parsed.idempotencyKey,
    },
    requestResultSchema,
  );
}

export async function decideStaffServiceRequest(input: {
  requestId: string;
  decision: "approved" | "rejected";
  reason?: string | null;
  idempotencyKey?: string;
}) {
  const parsed = staffServiceDecisionSchema.parse({
    ...input,
    idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
  });

  return callRpc(
    "staff_service_decide_request",
    {
      p_request_id: parsed.requestId,
      p_decision: parsed.decision,
      p_reason: parsed.reason ?? null,
      p_idempotency_key: parsed.idempotencyKey,
    },
    requestResultSchema,
  );
}

export async function listAccessibleStaffServiceRequests(): Promise<
  StaffServiceRequestSummary[]
> {
  const { data, error } = await fromReadModel("staff_service_requests")
    .select(
      "id,request_no,service_type,status,decision_reason,created_at,updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) throwSafeRpcError(error);
  return z.array(requestResultSchema).parse(data);
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function uploadStaffServiceAttachment(input: {
  requestId: string;
  file: File;
  idempotencyKey?: string;
}) {
  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
  const checksum = await sha256Hex(input.file);
  const validated = staffAttachmentIntentSchema.parse({
    requestId: input.requestId,
    fileName: input.file.name,
    mimeType: input.file.type,
    sizeBytes: input.file.size,
    sha256: checksum,
    idempotencyKey,
  });

  const intent = await callRpc(
    "staff_service_create_attachment_upload_intent",
    {
      p_request_id: validated.requestId,
      p_original_name: validated.fileName,
      p_mime_type: validated.mimeType,
      p_size_bytes: validated.sizeBytes,
      p_sha256: validated.sha256,
      p_idempotency_key: validated.idempotencyKey,
    },
    uploadIntentResultSchema,
  );

  if (intent.upload_status === "pending") {
    const uploaded = await supabase.storage
      .from(intent.storage_bucket)
      .upload(intent.object_path, input.file, {
        contentType: validated.mimeType,
        upsert: false,
      });
    if (uploaded.error) {
      throw new Error("تعذر رفع المرفق إلى التخزين الخاص.");
    }
  }

  const finalized = await callRpc(
    "staff_service_finalize_attachment_upload",
    {
      p_attachment_id: intent.attachment_id,
      p_idempotency_key: crypto.randomUUID(),
    },
    attachmentFinalizeResultSchema,
  );

  return { intent, finalized };
}

export async function getStaffServiceAttachmentSignedDownload(
  attachmentId: string,
) {
  const validAttachmentId = z.string().uuid().parse(attachmentId);
  const contract = await callRpc(
    "staff_service_authorize_attachment_download",
    { p_attachment_id: validAttachmentId },
    downloadContractSchema,
  );

  const signed = await supabase.storage
    .from(contract.storage_bucket)
    .createSignedUrl(contract.object_path, contract.expires_in_seconds);

  if (signed.error || !signed.data?.signedUrl) {
    throw new Error("تعذر إنشاء رابط تنزيل مؤقت وآمن.");
  }

  return {
    signedUrl: signed.data.signedUrl,
    expiresInSeconds: contract.expires_in_seconds,
  };
}
