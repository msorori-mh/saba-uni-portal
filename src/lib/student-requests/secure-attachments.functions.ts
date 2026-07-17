import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  SECURE_ATTACHMENTS_RUNTIME_AVAILABLE,
  SECURE_ATTACHMENT_ERRORS,
  SECURE_ATTACHMENT_FIELD_KEY,
  SECURE_ATTACHMENT_MAX_BYTES,
  SECURE_ATTACHMENT_SIGNED_URL_SECONDS,
} from "./secure-attachments-contract";

const unavailable = () => new Error(SECURE_ATTACHMENT_ERRORS.SECURE_ATTACHMENTS_RUNTIME_NOT_AVAILABLE);
const ensureRuntime = () => { if (!SECURE_ATTACHMENTS_RUNTIME_AVAILABLE) throw unavailable(); };
const rpcUnavailable = (error: { code?: string; message?: string } | null) => Boolean(error && (
  error.code === "42883" || error.code === "42P01" || /schema cache|does not exist|not find the function/i.test(error.message ?? "")
));
const throwRpc = (error: { code?: string; message?: string } | null): never => {
  if (rpcUnavailable(error)) throw unavailable();
  throw new Error(error?.message || SECURE_ATTACHMENT_ERRORS.ATTACHMENT_ACCESS_DENIED);
};

const intentSchema = z.object({
  studentRequestId: z.string().uuid(),
  fieldKey: z.literal(SECURE_ATTACHMENT_FIELD_KEY),
  originalFileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  sizeBytes: z.number().int().positive().max(SECURE_ATTACHMENT_MAX_BYTES),
  checksumSha256: z.string().regex(/^[0-9a-f]{64}$/i).optional().nullable(),
}).strict();

export const createStudentRequestAttachmentUploadIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => intentSchema.parse(input))
  .handler(async ({ data, context }) => {
    ensureRuntime();
    const { data: result, error } = await context.supabase.rpc("create_student_request_attachment_upload_intent" as never, {
      p_student_request_id: data.studentRequestId, p_field_key: data.fieldKey, p_original_file_name: data.originalFileName,
      p_mime_type: data.mimeType, p_size_bytes: data.sizeBytes, p_checksum_sha256: data.checksumSha256 ?? null,
    } as never);
    if (error) throwRpc(error);
    const row = result as unknown as Record<string, unknown> | null;
    if (!row?.attachment_id) throw unavailable();
    return { attachmentId: String(row.attachment_id) };
  });

export const uploadStudentRequestAttachmentContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ attachmentId: z.string().uuid(), fileBase64: z.string().min(1), mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]) }).strict().parse(input))
  .handler(async ({ data, context }) => {
    ensureRuntime();
    const { data: rows, error } = await context.supabase.rpc("get_owned_student_request_attachment_upload" as never, { p_attachment_id: data.attachmentId } as never);
    if (error) throwRpc(error);
    const row = Array.isArray(rows) ? rows[0] as Record<string, unknown> | undefined : rows as unknown as Record<string, unknown> | null;
    if (!row || row.upload_status !== "pending" || row.mime_type !== data.mimeType) throw new Error(SECURE_ATTACHMENT_ERRORS.ATTACHMENT_OBJECT_MISMATCH);
    const bytes = Buffer.from(data.fileBase64, "base64");
    if (bytes.byteLength !== Number(row.size_bytes) || bytes.byteLength > SECURE_ATTACHMENT_MAX_BYTES) throw new Error(SECURE_ATTACHMENT_ERRORS.ATTACHMENT_OBJECT_MISMATCH);
    const uploaded = await supabaseAdmin.storage.from(String(row.storage_bucket)).upload(String(row.storage_object_path), bytes, { contentType: data.mimeType, upsert: false });
    if (uploaded.error) throw new Error(uploaded.error.message);
    return { attachmentId: data.attachmentId };
  });

export const completeStudentRequestAttachmentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ attachmentId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    ensureRuntime();
    const { data: result, error } = await context.supabase.rpc("complete_student_request_attachment_upload" as never, { p_attachment_id: data.attachmentId } as never);
    if (error) throwRpc(error);
    return result;
  });

export const listMyStudentRequestAttachments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ studentRequestId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    ensureRuntime();
    const { data: result, error } = await context.supabase.rpc("list_my_student_request_attachments" as never, { p_student_request_id: data.studentRequestId } as never);
    if (error) throwRpc(error);
    return result ?? [];
  });

export const rejectStudentRequestAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ attachmentId: z.string().uuid(), rejectionCode: z.string().trim().min(1).max(80) }).strict().parse(input))
  .handler(async ({ data, context }) => {
    ensureRuntime();
    const { data: result, error } = await context.supabase.rpc("reject_student_request_attachment" as never, { p_attachment_id: data.attachmentId, p_rejection_code: data.rejectionCode } as never);
    if (error) throwRpc(error);
    return result;
  });

export const getStudentRequestAttachmentSignedDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ attachmentId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    ensureRuntime();
    const { data: auth, error } = await context.supabase.rpc("authorize_student_request_attachment_download" as never, { p_attachment_id: data.attachmentId } as never);
    if (error) throwRpc(error);
    const row = auth as unknown as Record<string, unknown> | null;
    if (!row?.storage_bucket || !row?.storage_object_path) throw new Error(SECURE_ATTACHMENT_ERRORS.ATTACHMENT_ACCESS_DENIED);
    const signed = await context.supabase.storage.from(String(row.storage_bucket)).createSignedUrl(String(row.storage_object_path), SECURE_ATTACHMENT_SIGNED_URL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) throw new Error(SECURE_ATTACHMENT_ERRORS.ATTACHMENT_ACCESS_DENIED);
    return { signedUrl: signed.data.signedUrl, expiresInSeconds: SECURE_ATTACHMENT_SIGNED_URL_SECONDS };
  });
