/**
 * TanStack server functions for the Live B1 UI adapter.
 * Session-scoped RPC only — React components never import Supabase.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { rpcGetAvailableRequestTypes } from "@/lib/student-request-rpc";
import { extractB1SecureAttachmentIds } from "@/lib/student-requests/student-request-submit-contract";
import { normalizeStudentRequestTypeCode } from "@/lib/student-requests/request-type-registry";
import { getRequestServiceAdapter } from "@/lib/student-requests/request-service-adapter";
import {
  SECURE_ATTACHMENT_FIELD_KEYS,
  SECURE_ATTACHMENT_MAX_BYTES,
  SECURE_ATTACHMENTS_RUNTIME_AVAILABLE,
  SECURE_ATTACHMENT_ERRORS,
} from "@/lib/student-requests/secure-attachments-contract";
import { mapBackendRowsToB1Availability } from "./availability";
import {
  B1_ACT_ON_STEP_ACTIONS,
  type B1ActOnStepAction,
  rpcActOnB1StudentRequestStepAtomic,
  rpcAuthorizeStudentRequestAttachmentDownload,
  rpcCompleteStudentRequestAttachmentUpload,
  rpcCreateStudentRequestAttachmentUploadIntent,
  rpcGetOwnedStudentRequestAttachmentUpload,
  rpcListMyStudentRequestAttachments,
  rpcRecordExternalUniversityPaymentConfirmation,
  rpcRejectStudentRequestAttachment,
  rpcSubmitB1StudentRequestAtomic,
} from "./b1-rpc";
import { isB1ServiceCode } from "./service-config";
import type { B1AttachmentMeta, B1StepActionResult, B1SubmitResult } from "./adapter.types";

const OUTCOME_AR: Readonly<Record<string, string>> = {
  review: "تمت مراجعة الخطوة",
  approve: "تم اعتماد الخطوة",
  clear: "تم إخلاء الطرف",
  apply_decision: "تم تطبيق القرار",
  archive: "تمت الأرشفة",
  return: "تمت إعادة الطلب إلى الطالب لاستكماله",
  reject: "تم رفض الطلب",
  confirm_payment: "تم تأكيد استلام الرسوم في النظام الجامعي الرئيسي",
  payment_confirmed: "تم تأكيد استلام الرسوم في النظام الجامعي الرئيسي",
};

type SessionRpc = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
  from: (table: string) => unknown;
};

async function currentStudentProfileId(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("student_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("ACTIVE_STUDENT_PROFILE_REQUIRED");
  return data.id;
}

function asSessionRpc(supabase: unknown): SessionRpc {
  return supabase as SessionRpc;
}

/** Resolve RPC p_action from UI action + authoritative step action_type. */
export async function resolveB1ActOnRpcAction(
  stepId: string,
  clientAction: "approve" | "review" | "return" | "reject",
): Promise<B1ActOnStepAction> {
  if (clientAction === "return" || clientAction === "reject") return clientAction;

  const { data: stepRow, error } = await supabaseAdmin
    .from("student_request_workflow_steps")
    .select("id, config:request_type_workflow_steps!inner(action_type)")
    .eq("id", stepId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!stepRow) throw new Error("B1_ACTIVE_STEP_REQUIRED");

  const actionType =
    (stepRow as { config?: { action_type?: string | null } }).config?.action_type ?? null;

  if (
    actionType === "confirm_payment" ||
    actionType === "issue_document" ||
    actionType === "sign"
  ) {
    throw new Error("B1_SPECIALIZED_ACTION_RPC_REQUIRED");
  }
  if (!actionType || !(B1_ACT_ON_STEP_ACTIONS as readonly string[]).includes(actionType)) {
    throw new Error("B1_ACTION_NOT_SUPPORTED");
  }

  const resolved = actionType as B1ActOnStepAction;
  if (clientAction === "review") {
    if (resolved !== "review") throw new Error("B1_ACTION_TYPE_MISMATCH");
    return "review";
  }
  // UI collapses clear / apply_decision / archive / approve → "approve".
  if (["approve", "clear", "apply_decision", "archive"].includes(resolved)) {
    return resolved;
  }
  throw new Error("B1_ACTION_TYPE_MISMATCH");
}

export const getAvailableB1RequestTypesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rows = await rpcGetAvailableRequestTypes(asSessionRpc(context.supabase));
    return mapBackendRowsToB1Availability(rows);
  });

const submitSchema = z
  .object({
    requestId: z.string().uuid(),
    expectedUpdatedAt: z.string().min(1),
  })
  .strict();

export const submitB1UiRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitSchema.parse(input))
  .handler(async ({ data, context }): Promise<B1SubmitResult> => {
    const profileId = await currentStudentProfileId(context.userId);
    const session = asSessionRpc(context.supabase);

    const { data: req, error: reqErr } = await supabaseAdmin
      .from("student_requests")
      .select(
        "id, request_number, request_type, status, form_data, updated_at, student_profile_id, submitted_at",
      )
      .eq("id", data.requestId)
      .maybeSingle();
    if (reqErr) throw new Error(reqErr.message);
    if (!req || req.student_profile_id !== profileId) {
      throw new Error("B1_OWNED_SUBMITTABLE_REQUEST_REQUIRED");
    }
    if (!["draft", "returned", "returned_for_completion"].includes(req.status)) {
      throw new Error("B1_OWNED_SUBMITTABLE_REQUEST_REQUIRED");
    }

    const canonical = normalizeStudentRequestTypeCode(req.request_type);
    if (!isB1ServiceCode(canonical) || !getRequestServiceAdapter(canonical)) {
      throw new Error("B1_CANONICAL_CODE_REQUIRED");
    }

    const formData = (req.form_data as Record<string, unknown> | null) ?? {};
    const attachmentIds = extractB1SecureAttachmentIds(canonical, formData);

    const result = await rpcSubmitB1StudentRequestAtomic(session, {
      requestId: data.requestId,
      canonicalCode: canonical,
      formData,
      expectedUpdatedAt: data.expectedUpdatedAt,
      attachmentIds,
    });

    if (result.success !== true) throw new Error("B1_SUBMIT_FAILED");

    const { data: after } = await supabaseAdmin
      .from("student_requests")
      .select("request_number, updated_at, submitted_at")
      .eq("id", data.requestId)
      .maybeSingle();

    const submittedAt = after?.submitted_at ?? new Date().toISOString();
    return {
      requestId: data.requestId,
      requestNumber: String(after?.request_number ?? req.request_number ?? data.requestId),
      submittedAt,
      updatedAt: String(after?.updated_at ?? submittedAt),
    };
  });

const actSchema = z
  .object({
    stepId: z.string().uuid(),
    action: z.enum(["approve", "review", "return", "reject"]),
    comment: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

export const actOnB1UiRequestStepFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => actSchema.parse(input))
  .handler(async ({ data, context }): Promise<B1StepActionResult> => {
    if ((data.action === "return" || data.action === "reject") && !data.comment?.trim()) {
      throw new Error("B1_COMMENT_REQUIRED");
    }
    const rpcAction = await resolveB1ActOnRpcAction(data.stepId, data.action);
    const result = await rpcActOnB1StudentRequestStepAtomic(asSessionRpc(context.supabase), {
      stepId: data.stepId,
      action: rpcAction,
      comment: data.comment ?? null,
    });
    if (result.success !== true) throw new Error("B1_ACTION_FAILED");

    const { data: stepRow } = await supabaseAdmin
      .from("student_request_workflow_steps")
      .select("student_request_id")
      .eq("id", data.stepId)
      .maybeSingle();

    const actedAt = new Date().toISOString();
    return {
      stepId: String(result.step_id ?? data.stepId),
      requestId: String(stepRow?.student_request_id ?? ""),
      outcomeAr: OUTCOME_AR[String(result.action_result ?? rpcAction)] ?? "تم تنفيذ الإجراء",
      actedAt,
    };
  });

const confirmSchema = z
  .object({
    stepId: z.string().uuid(),
    note: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

export const confirmB1UiRevenueReceiptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => confirmSchema.parse(input))
  .handler(async ({ data, context }): Promise<B1StepActionResult> => {
    const result = await rpcRecordExternalUniversityPaymentConfirmation(
      asSessionRpc(context.supabase),
      { stepId: data.stepId, note: data.note ?? null },
    );
    if (result.success !== true) throw new Error("PAYMENT_CONFIRMATION_FAILED");
    return {
      stepId: String(result.step_id ?? data.stepId),
      requestId: String(result.request_id ?? ""),
      outcomeAr: OUTCOME_AR.payment_confirmed!,
      actedAt: new Date().toISOString(),
    };
  });

const uploadIntentSchema = z
  .object({
    studentRequestId: z.string().uuid(),
    fieldKey: z.enum(["excuse_documents", "secondary_certificate"]),
    originalFileName: z.string().trim().min(1).max(255),
    mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
    sizeBytes: z.number().int().positive().max(SECURE_ATTACHMENT_MAX_BYTES),
    checksumSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/i)
      .optional()
      .nullable(),
    fileBase64: z.string().min(1),
  })
  .strict();

function ensureSecureAttachmentsRuntime(): void {
  if (!SECURE_ATTACHMENTS_RUNTIME_AVAILABLE) {
    throw new Error(SECURE_ATTACHMENT_ERRORS.SECURE_ATTACHMENTS_RUNTIME_NOT_AVAILABLE);
  }
}

export const uploadB1UiRequestAttachmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => uploadIntentSchema.parse(input))
  .handler(async ({ data, context }): Promise<B1AttachmentMeta> => {
    ensureSecureAttachmentsRuntime();
    const session = asSessionRpc(context.supabase);
    const intent = await rpcCreateStudentRequestAttachmentUploadIntent(session, {
      studentRequestId: data.studentRequestId,
      fieldKey: data.fieldKey as (typeof SECURE_ATTACHMENT_FIELD_KEYS)[number],
      originalFileName: data.originalFileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      checksumSha256: data.checksumSha256 ?? null,
    });

    const owned = await rpcGetOwnedStudentRequestAttachmentUpload(session, intent.attachment_id);
    const row = owned[0] as Record<string, unknown> | undefined;
    if (!row || row.upload_status !== "pending" || row.mime_type !== data.mimeType) {
      throw new Error(SECURE_ATTACHMENT_ERRORS.ATTACHMENT_OBJECT_MISMATCH);
    }
    const bytes = Buffer.from(data.fileBase64, "base64");
    if (
      bytes.byteLength !== Number(row.size_bytes) ||
      bytes.byteLength > SECURE_ATTACHMENT_MAX_BYTES
    ) {
      throw new Error(SECURE_ATTACHMENT_ERRORS.ATTACHMENT_OBJECT_MISMATCH);
    }
    const uploaded = await supabaseAdmin.storage
      .from(String(row.storage_bucket))
      .upload(String(row.storage_object_path), bytes, {
        contentType: data.mimeType,
        upsert: false,
      });
    if (uploaded.error) throw new Error(uploaded.error.message);

    await rpcCompleteStudentRequestAttachmentUpload(session, intent.attachment_id);

    return {
      attachmentId: intent.attachment_id,
      attachmentType: data.fieldKey,
      fileName: data.originalFileName,
      fileSizeBytes: data.sizeBytes,
      mimeType: data.mimeType,
      status: "attached",
      storageRef: `secure://${intent.attachment_id}`,
    };
  });

const removeSchema = z
  .object({
    attachmentId: z.string().uuid(),
  })
  .strict();

export const removeB1UiRequestAttachmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => removeSchema.parse(input))
  .handler(async ({ data, context }): Promise<void> => {
    ensureSecureAttachmentsRuntime();
    await rpcRejectStudentRequestAttachment(
      asSessionRpc(context.supabase),
      data.attachmentId,
      "REMOVED_BY_STUDENT",
    );
  });

const listAttachmentsSchema = z.object({ studentRequestId: z.string().uuid() }).strict();

export const listB1UiRequestAttachmentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listAttachmentsSchema.parse(input))
  .handler(async ({ data, context }) => {
    ensureSecureAttachmentsRuntime();
    return rpcListMyStudentRequestAttachments(
      asSessionRpc(context.supabase),
      data.studentRequestId,
    );
  });

const downloadAuthSchema = z.object({ attachmentId: z.string().uuid() }).strict();

export const authorizeB1UiAttachmentDownloadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => downloadAuthSchema.parse(input))
  .handler(async ({ data, context }) => {
    ensureSecureAttachmentsRuntime();
    return rpcAuthorizeStudentRequestAttachmentDownload(
      asSessionRpc(context.supabase),
      data.attachmentId,
    );
  });
