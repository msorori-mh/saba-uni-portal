/**
 * TanStack server functions for the Live B1 UI adapter.
 * Session-scoped RPC only — React components never import Supabase.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { hashStepUpPayload } from "@/lib/security/step-up-contract";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { rpcGetAvailableRequestTypes } from "@/lib/student-request-rpc";
import { extractB1SecureAttachmentIds } from "@/lib/student-requests/student-request-submit-contract";
import { normalizeStudentRequestTypeCode } from "@/lib/student-requests/request-type-registry";
import { getRequestServiceAdapter } from "@/lib/student-requests/request-service-adapter";
import { assertB1DetailsRowPresentForStep } from "@/lib/student-requests/b1-details-preflight.server";
import { B1_PANEL_ACTION_LABELS_AR } from "@/lib/student-requests/b1-staff-action-routing";
import { isStepUpSensitiveService } from "@/lib/security/step-up-contract";

import {
  SECURE_ATTACHMENT_FIELD_KEYS,
  SECURE_ATTACHMENT_MAX_BYTES,
  SECURE_ATTACHMENT_SIGNED_URL_SECONDS,
  SECURE_ATTACHMENT_ERRORS,
} from "@/lib/student-requests/secure-attachments-contract";
import {
  loadSecureAttachmentsRuntimeCapability,
  prepareOwnedAttachmentStorageUpload,
  SECURE_ATTACHMENTS_RUNTIME_TECHNICAL_ERROR_AR,
} from "@/lib/student-requests/secure-attachments-capability";
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
import type {
  B1AttachmentDownload,
  B1AttachmentMeta,
  B1StepActionResult,
  B1SubmitResult,
} from "./adapter.types";

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
  clientAction: "approve" | "review" | "apply_decision" | "clear" | "archive" | "return" | "reject",
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
  // No aliasing: the client action must equal the configured action_type literally.
  if (clientAction !== resolved) throw new Error("B1_ACTION_TYPE_MISMATCH");
  return resolved;
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
    /** Single-use biometric step-up proof issued by the server (native app). */
    stepUpProof: z.string().min(16).max(512).nullish(),
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
      stepUpProof: data.stepUpProof ?? null,
      stepUpPayloadHash: data.stepUpProof
        ? await hashStepUpPayload({
            requestId: data.requestId,
            canonicalCode: canonical,
            formData,
            attachmentIds: [...attachmentIds].sort(),
          })
        : null,
    });

    if (result.success !== true) throw new Error("B1_SUBMIT_FAILED");

    const { data: after, error: afterError } = await supabaseAdmin
      .from("student_requests")
      .select("request_number, updated_at, submitted_at")
      .eq("id", data.requestId)
      .maybeSingle();

    if (afterError || !after?.request_number || !after.submitted_at || !after.updated_at) {
      throw new Error("B1_SUBMIT_AUTHORITATIVE_REFRESH_REQUIRED");
    }
    return {
      requestId: data.requestId,
      requestNumber: String(after.request_number),
      submittedAt: String(after.submitted_at),
      updatedAt: String(after.updated_at),
    };
  });

const actSchema = z
  .object({
    stepId: z.string().uuid(),
    action: z.enum(["approve", "review", "apply_decision", "clear", "archive", "return", "reject"]),
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
    // Fail-closed preflight: forward actions require the service details row.
    await assertB1DetailsRowPresentForStep({
      stepId: data.stepId,
      action: data.action,
      actionLabelAr: B1_PANEL_ACTION_LABELS_AR[data.action] ?? null,
    });
    const rpcAction = await resolveB1ActOnRpcAction(data.stepId, data.action);

    const result = await rpcActOnB1StudentRequestStepAtomic(asSessionRpc(context.supabase), {
      stepId: data.stepId,
      action: rpcAction,
      comment: data.comment ?? null,
    });
    if (result.success !== true) throw new Error("B1_ACTION_FAILED");

    return {
      accepted: true,
      stepId: String(result.step_id ?? data.stepId),
      action: data.action,
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
      accepted: true,
      stepId: String(result.step_id ?? data.stepId),
      ...(result.request_id ? { requestId: String(result.request_id) } : {}),
      action: "confirm_payment",
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

async function ensureSecureAttachmentsRuntime(session: SessionRpc): Promise<void> {
  const capability = await loadSecureAttachmentsRuntimeCapability(session);
  if (!capability.available) {
    throw new Error(
      `${SECURE_ATTACHMENT_ERRORS.SECURE_ATTACHMENTS_RUNTIME_NOT_AVAILABLE}: ${SECURE_ATTACHMENTS_RUNTIME_TECHNICAL_ERROR_AR}`,
    );
  }
}

export const uploadB1UiRequestAttachmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => uploadIntentSchema.parse(input))
  .handler(async ({ data, context }): Promise<B1AttachmentMeta> => {
    const session = asSessionRpc(context.supabase);
    await ensureSecureAttachmentsRuntime(session);
    const intent = await rpcCreateStudentRequestAttachmentUploadIntent(session, {
      studentRequestId: data.studentRequestId,
      fieldKey: data.fieldKey as (typeof SECURE_ATTACHMENT_FIELD_KEYS)[number],
      originalFileName: data.originalFileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      checksumSha256: data.checksumSha256 ?? null,
    });

    const ownedRaw = await rpcGetOwnedStudentRequestAttachmentUpload(session, intent.attachment_id);
    const bytes = Buffer.from(data.fileBase64, "base64");
    // Fail-closed owned-row normalizer runs before any storage mutation.
    let prepared;
    try {
      prepared = prepareOwnedAttachmentStorageUpload({
        ownedRaw,
        expectedMimeType: data.mimeType,
        expectedSizeBytes: bytes.byteLength,
        maxBytes: SECURE_ATTACHMENT_MAX_BYTES,
      });
    } catch {
      throw new Error(SECURE_ATTACHMENT_ERRORS.ATTACHMENT_OBJECT_MISMATCH);
    }
    const uploaded = await supabaseAdmin.storage
      .from(prepared.storageBucket)
      .upload(prepared.storageObjectPath, bytes, {
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
    const session = asSessionRpc(context.supabase);
    await ensureSecureAttachmentsRuntime(session);
    await rpcRejectStudentRequestAttachment(
      session,
      data.attachmentId,
      "REMOVED_BY_STUDENT",
    );
  });

const listAttachmentsSchema = z.object({ studentRequestId: z.string().uuid() }).strict();

export const listB1UiRequestAttachmentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listAttachmentsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const session = asSessionRpc(context.supabase);
    await ensureSecureAttachmentsRuntime(session);
    return rpcListMyStudentRequestAttachments(session, data.studentRequestId);
  });

const downloadAuthSchema = z.object({ attachmentId: z.string().uuid() }).strict();

type AuthorizedDownloadClient = SessionRpc & {
  storage: {
    from: (bucketName: string) => {
      createSignedUrl: (
        objectName: string,
        expiresIn: number,
      ) => Promise<{
        data: { signedUrl?: string } | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

export async function createAuthorizedB1AttachmentDownload(
  client: AuthorizedDownloadClient,
  attachmentId: string,
): Promise<B1AttachmentDownload> {
  let authorization: { storage_bucket: string; storage_object_path: string };
  try {
    authorization = await rpcAuthorizeStudentRequestAttachmentDownload(client, attachmentId);
  } catch {
    throw new Error(SECURE_ATTACHMENT_ERRORS.ATTACHMENT_ACCESS_DENIED);
  }

  const signed = await client.storage
    .from(authorization.storage_bucket)
    .createSignedUrl(authorization.storage_object_path, SECURE_ATTACHMENT_SIGNED_URL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(SECURE_ATTACHMENT_ERRORS.ATTACHMENT_ACCESS_DENIED);
  }
  return {
    url: signed.data.signedUrl,
    expiresInSeconds: SECURE_ATTACHMENT_SIGNED_URL_SECONDS,
  };
}

export const authorizeB1UiAttachmentDownloadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => downloadAuthSchema.parse(input))
  .handler(async ({ data, context }) => {
    const session = asSessionRpc(context.supabase);
    await ensureSecureAttachmentsRuntime(session);
    return createAuthorizedB1AttachmentDownload(
      context.supabase as unknown as AuthorizedDownloadClient,
      data.attachmentId,
    );
  });
