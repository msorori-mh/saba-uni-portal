/**
 * Pure B1 RPC wrappers — exact signatures from
 * docs/B1-FIVE-SERVICES-BACKEND-CONTRACT-FREEZE-01.md and generated types.
 *
 * No createServerFn / React here. Callers (server functions) supply a session
 * RpcClient so auth.uid() is present inside SECURITY DEFINER RPCs.
 */

import { validateExternalPaymentConfirmationInput } from "@/lib/student-requests/external-payment-confirmation-contract";
import {
  SECURE_ATTACHMENT_FIELD_KEYS,
  type SecureAttachmentFieldKey,
} from "@/lib/student-requests/secure-attachments-contract";

export type B1RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

/** Per-service form_data allowlists (freeze authority). */
export const B1_FORM_DATA_ALLOWLISTS = {
  enrollment_suspension: [
    "target_academic_year",
    "target_semester",
    "suspension_reason",
    "suspension_duration_type",
    "notes",
    "terms_acknowledgment",
  ],
  excused_absence: [
    "course_section_id",
    "absence_date",
    "reason_type",
    "absence_reason_detail",
    "excuse_documents",
  ],
  department_transfer: [
    "target_department_id",
    "target_program_id",
    "transfer_reason",
    "secondary_certificate_file",
  ],
  final_chance: ["target_academic_year", "target_semester", "reason", "chance_type"],
  file_withdrawal: ["withdrawal_reason", "impact_acknowledgment"],
} as const;

/** Actions accepted by act_on_b1_student_request_step_atomic (freeze). */
export const B1_ACT_ON_STEP_ACTIONS = [
  "review",
  "approve",
  "clear",
  "apply_decision",
  "archive",
  "reject",
  "return",
] as const;

export type B1ActOnStepAction = (typeof B1_ACT_ON_STEP_ACTIONS)[number];

/** Specialized — must NOT be sent to act_on_b1_student_request_step_atomic. */
export const B1_SPECIALIZED_ACTIONS_FORBIDDEN_ON_ACT_ON = [
  "confirm_payment",
  "issue_document",
  "sign",
] as const;

export type SubmitB1StudentRequestAtomicArgs = {
  requestId: string;
  canonicalCode: string;
  formData: Record<string, unknown>;
  expectedUpdatedAt: string;
  attachmentIds?: readonly string[];
  /**
   * Single-use biometric step-up proof (native app). Sent ONLY when present so
   * the current production signature stays byte-compatible; the enforcement
   * migration adds `p_step_up_proof` and consumes it inside the same
   * transaction as the submit.
   */
  stepUpProof?: string | null;
};

/** Exact RPC arg keys for submit_b1_student_request_atomic. */
export const SUBMIT_B1_ATOMIC_ARG_KEYS = [
  "p_request_id",
  "p_canonical_code",
  "p_form_data",
  "p_expected_updated_at",
  "p_attachment_ids",
] as const;

/** Additional arg key used only when a step-up proof is supplied. */
export const SUBMIT_B1_ATOMIC_STEP_UP_ARG_KEY = "p_step_up_proof" as const;

export async function rpcSubmitB1StudentRequestAtomic(
  client: B1RpcClient,
  input: SubmitB1StudentRequestAtomicArgs,
): Promise<Record<string, unknown>> {
  const args: Record<string, unknown> = {
    p_request_id: input.requestId,
    p_canonical_code: input.canonicalCode,
    p_form_data: input.formData,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_attachment_ids: [...(input.attachmentIds ?? [])],
  };
  if (input.stepUpProof) {
    args[SUBMIT_B1_ATOMIC_STEP_UP_ARG_KEY] = input.stepUpProof;
  }
  const { data, error } = await client.rpc("submit_b1_student_request_atomic", args);
  if (error) throw new Error(error.message ?? "submit_b1_student_request_atomic failed");
  return (data ?? {}) as Record<string, unknown>;
}

export type ActOnB1StudentRequestStepAtomicArgs = {
  stepId: string;
  action: B1ActOnStepAction;
  comment?: string | null;
};

/** Exact RPC arg keys for act_on_b1_student_request_step_atomic. p_payload must be {}. */
export const ACT_ON_B1_ATOMIC_ARG_KEYS = [
  "p_step_id",
  "p_action",
  "p_comment",
  "p_payload",
] as const;

export async function rpcActOnB1StudentRequestStepAtomic(
  client: B1RpcClient,
  input: ActOnB1StudentRequestStepAtomicArgs,
): Promise<Record<string, unknown>> {
  if ((B1_SPECIALIZED_ACTIONS_FORBIDDEN_ON_ACT_ON as readonly string[]).includes(input.action)) {
    throw new Error("B1_SPECIALIZED_ACTION_RPC_REQUIRED");
  }
  if (!(B1_ACT_ON_STEP_ACTIONS as readonly string[]).includes(input.action)) {
    throw new Error("B1_ACTION_NOT_SUPPORTED");
  }
  const args = {
    p_step_id: input.stepId,
    p_action: input.action,
    p_comment: input.comment ?? null,
    p_payload: {},
  };
  const { data, error } = await client.rpc("act_on_b1_student_request_step_atomic", args);
  if (error) throw new Error(error.message ?? "act_on_b1_student_request_step_atomic failed");
  return (data ?? {}) as Record<string, unknown>;
}

export type RecordExternalUniversityPaymentConfirmationArgs = {
  stepId: string;
  note?: string | null;
};

/** Exact RPC arg keys — step + optional note only (no amount/currency/invoice/status). */
export const RECORD_EXTERNAL_PAYMENT_ARG_KEYS = ["p_step_id", "p_note"] as const;

export const RECORD_EXTERNAL_PAYMENT_FORBIDDEN_CLIENT_KEYS = [
  "amount",
  "currency",
  "invoice",
  "confirmed_by",
  "confirmed_at",
  "status",
  "p_status",
  "p_amount",
  "p_currency",
  "p_invoice",
] as const;

export function buildRecordExternalPaymentRpcArgs(
  input: RecordExternalUniversityPaymentConfirmationArgs,
): { p_step_id: string; p_note: string | null } {
  const validated = validateExternalPaymentConfirmationInput({
    stepId: input.stepId,
    note: input.note,
  });
  if (!validated.valid) {
    throw new Error(
      validated.error === "note_too_long"
        ? "PAYMENT_CONFIRMATION_NOTE_TOO_LONG"
        : "PAYMENT_CONFIRMATION_STEP_NOT_FOUND",
    );
  }
  return {
    p_step_id: validated.normalized.stepId,
    p_note: validated.normalized.note,
  };
}

export async function rpcRecordExternalUniversityPaymentConfirmation(
  client: B1RpcClient,
  input: RecordExternalUniversityPaymentConfirmationArgs,
): Promise<Record<string, unknown>> {
  const args = buildRecordExternalPaymentRpcArgs(input);
  const { data, error } = await client.rpc("record_external_university_payment_confirmation", args);
  if (error) {
    throw new Error(error.message ?? "record_external_university_payment_confirmation failed");
  }
  return (data ?? {}) as Record<string, unknown>;
}

export type CreateAttachmentUploadIntentArgs = {
  studentRequestId: string;
  fieldKey: SecureAttachmentFieldKey;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256?: string | null;
};

export const CREATE_ATTACHMENT_INTENT_ARG_KEYS = [
  "p_student_request_id",
  "p_field_key",
  "p_original_file_name",
  "p_mime_type",
  "p_size_bytes",
  "p_checksum_sha256",
] as const;

export async function rpcCreateStudentRequestAttachmentUploadIntent(
  client: B1RpcClient,
  input: CreateAttachmentUploadIntentArgs,
): Promise<{ attachment_id: string }> {
  if (!(SECURE_ATTACHMENT_FIELD_KEYS as readonly string[]).includes(input.fieldKey)) {
    throw new Error("ATTACHMENT_FIELD_NOT_ALLOWED");
  }
  const args = {
    p_student_request_id: input.studentRequestId,
    p_field_key: input.fieldKey,
    p_original_file_name: input.originalFileName,
    p_mime_type: input.mimeType,
    p_size_bytes: input.sizeBytes,
    p_checksum_sha256: input.checksumSha256 ?? null,
  };
  const { data, error } = await client.rpc("create_student_request_attachment_upload_intent", args);
  if (error)
    throw new Error(error.message ?? "create_student_request_attachment_upload_intent failed");
  const row = data as { attachment_id?: string } | null;
  if (!row?.attachment_id) throw new Error("ATTACHMENT_ACCESS_DENIED");
  return { attachment_id: String(row.attachment_id) };
}

export async function rpcCompleteStudentRequestAttachmentUpload(
  client: B1RpcClient,
  attachmentId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await client.rpc("complete_student_request_attachment_upload", {
    p_attachment_id: attachmentId,
  });
  if (error) throw new Error(error.message ?? "complete_student_request_attachment_upload failed");
  return (data ?? {}) as Record<string, unknown>;
}

export async function rpcListMyStudentRequestAttachments(
  client: B1RpcClient,
  studentRequestId: string,
): Promise<unknown[]> {
  const { data, error } = await client.rpc("list_my_student_request_attachments", {
    p_student_request_id: studentRequestId,
  });
  if (error) throw new Error(error.message ?? "list_my_student_request_attachments failed");
  return (data ?? []) as unknown[];
}

/** Returns the raw RPC payload (object or array). Callers must parse with parseOwnedStudentRequestAttachmentUpload. */
export async function rpcGetOwnedStudentRequestAttachmentUpload(
  client: B1RpcClient,
  attachmentId: string,
): Promise<unknown> {
  const { data, error } = await client.rpc("get_owned_student_request_attachment_upload", {
    p_attachment_id: attachmentId,
  });
  if (error) throw new Error(error.message ?? "get_owned_student_request_attachment_upload failed");
  return data;
}

export async function rpcRejectStudentRequestAttachment(
  client: B1RpcClient,
  attachmentId: string,
  rejectionCode: string,
): Promise<boolean> {
  const { data, error } = await client.rpc("reject_student_request_attachment", {
    p_attachment_id: attachmentId,
    p_rejection_code: rejectionCode,
  });
  if (error) throw new Error(error.message ?? "reject_student_request_attachment failed");
  return data === true;
}

export async function rpcAuthorizeStudentRequestAttachmentDownload(
  client: B1RpcClient,
  attachmentId: string,
): Promise<{ storage_bucket: string; storage_object_path: string }> {
  const { data, error } = await client.rpc("authorize_student_request_attachment_download", {
    p_attachment_id: attachmentId,
  });
  if (error)
    throw new Error(error.message ?? "authorize_student_request_attachment_download failed");
  const row = data as { storage_bucket?: string; storage_object_path?: string } | null;
  if (!row?.storage_bucket || !row?.storage_object_path) {
    throw new Error("ATTACHMENT_ACCESS_DENIED");
  }
  return {
    storage_bucket: String(row.storage_bucket),
    storage_object_path: String(row.storage_object_path),
  };
}
