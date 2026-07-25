/**
 * B1 five-services secure READ contracts — TypeScript DTOs.
 * Aligned with B1UiAdapter read shapes; never exposes storage coordinates.
 */

import { B1_CANONICAL_CODES, type B1CanonicalCode } from "../request-service-adapter";

export { B1_CANONICAL_CODES, type B1CanonicalCode };

export const B1_SECURE_READ_CONTRACT_ID = "B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01" as const;

export const B1_SECURE_READ_RPCS = [
  "get_b1_secure_read_runtime_capability",
  "get_b1_request_form_options",
  "get_b1_request_draft_for_student",
  "get_b1_request_details_for_student",
  "list_b1_requests_for_student",
  "get_b1_assigned_inbox_for_actor",
  "get_b1_assigned_request_details_for_actor",
  "get_b1_step_allowed_actions",
  "list_b1_request_attachments_for_viewer",
] as const;

export type B1SecureReadRpc = (typeof B1_SECURE_READ_RPCS)[number];

export const B1_READ_ACCESS_DENIED = "B1_READ_ACCESS_DENIED" as const;
export const B1_SECURE_READ_UPDATING_MSG =
  "عقود قراءة الخدمات الطلابية قيد التحديث حالياً. حاول لاحقاً.";

/** Write seams opened by B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01 (stacked). */
export const B1_SECURE_READ_WRITES_FAIL_CLOSED = [] as const;
export const B1_SECURE_DRAFT_WRITES_AVAILABLE = ["create_draft", "save_draft"] as const;

export type B1ReferenceOption = { value: string; labelAr: string };

export type B1SecureAttachmentMeta = {
  attachmentId: string;
  attachmentType: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  status: "uploading" | "attached" | "failed";
  /** Opaque ref — never bucket/object_path/object_key. */
  storageRef: string;
};

export type B1SecureFormOptions = {
  serviceCode: B1CanonicalCode;
  academicYears: readonly B1ReferenceOption[];
  semestersByYear: Readonly<Record<string, readonly B1ReferenceOption[]>>;
  currentEnrollments: readonly B1ReferenceOption[];
  availableDepartments: readonly B1ReferenceOption[];
  programsByDepartment: Readonly<Record<string, readonly B1ReferenceOption[]>>;
  currentDepartmentLabelAr?: string | null;
  currentProgramLabelAr?: string | null;
  finalChanceEligibility?: { eligible: boolean; reasonAr?: string } | null;
  excuseReasonTypes: readonly B1ReferenceOption[];
};

export type B1SecureDraft = {
  requestId: string;
  serviceCode: B1CanonicalCode;
  formData: Record<string, unknown>;
  attachments: readonly B1SecureAttachmentMeta[];
  status: "draft";
  updatedAt: string;
};

export type B1SecureWorkflowStepView = {
  key: string;
  labelAr: string;
  status: "completed" | "active" | "pending" | "returned" | "rejected";
  actedAt?: string | null;
  commentAr?: string | null;
};

export type B1SecureRequestDetails = {
  requestId: string;
  requestNumber: string;
  serviceCode: B1CanonicalCode;
  serviceTitleAr: string;
  status:
    | "draft"
    | "submitted"
    | "in_review"
    | "waiting_payment_confirmation"
    | "returned"
    | "completed"
    | "rejected";
  formData: Record<string, unknown>;
  attachments: readonly B1SecureAttachmentMeta[];
  steps: readonly B1SecureWorkflowStepView[];
  studentVisibleMessages: readonly { at: string; fromLabelAr: string; bodyAr: string }[];
  updatedAt: string;
};

export type B1SecureStudentListItem = {
  requestId: string;
  requestNumber: string;
  serviceCode: B1CanonicalCode;
  serviceTitleAr: string;
  status: string;
  submittedAt: string | null;
  updatedAt: string;
};

export type B1SecureStaffAction = "approve" | "review" | "return" | "reject" | "confirm_payment";

export type B1SecureAssignedRequest = {
  requestId: string;
  stepId: string;
  requestNumber: string;
  serviceCode: B1CanonicalCode;
  serviceTitleAr: string;
  studentNameAr: string;
  studentNumber: string;
  stepKey: string;
  stepLabelAr: string;
  allowedAction: B1SecureStaffAction;
  allowedActions?: readonly B1SecureStaffAction[];
  submittedAt: string | null;
};

export type B1SecureAssignedRequestDetails = B1SecureAssignedRequest & {
  formDataSummary: readonly { labelAr: string; valueAr: string }[];
  attachments: readonly B1SecureAttachmentMeta[];
  steps: readonly B1SecureWorkflowStepView[];
  updatedAt: string;
};

export type B1SecureReadCapability = {
  available: boolean;
  contract: typeof B1_SECURE_READ_CONTRACT_ID;
  services: readonly B1CanonicalCode[];
  reads: readonly string[];
  writes_fail_closed: readonly string[];
};

export type B1SecureStepActions = {
  stepId: string;
  requestId: string;
  allowedAction: B1SecureStaffAction | null;
  allowedActions: readonly B1SecureStaffAction[];
};

/** Maps adapter method names to secure-read RPCs (or fail-closed). */
export const B1_ADAPTER_READ_RPC_MAP = {
  getFormOptions: "get_b1_request_form_options",
  getDraft: "get_b1_request_draft_for_student",
  getStudentRequestDetails: "get_b1_request_details_for_student",
  getStudentRequests: "list_b1_requests_for_student",
  getAssignedInbox: "get_b1_assigned_inbox_for_actor",
  getAssignedRequestDetails: "get_b1_assigned_request_details_for_actor",
  refreshAfterAct: "get_b1_assigned_request_details_for_actor",
  refreshAfterConfirmPayment: "get_b1_assigned_request_details_for_actor",
  createDraft: "create_b1_request_draft_for_student",
  saveDraft: "save_b1_request_draft_for_student",
} as const;

export function isB1CanonicalCode(value: string): value is B1CanonicalCode {
  return (B1_CANONICAL_CODES as readonly string[]).includes(value);
}

export function assertNoStorageCoordinates(payload: unknown): void {
  const raw = JSON.stringify(payload ?? null);
  if (/storage_bucket|storage_object_path|"object_key"/i.test(raw)) {
    throw new Error("B1_SECURE_READ_STORAGE_COORDINATE_LEAK");
  }
}

export function normalizeAttachmentMeta(row: Record<string, unknown>): B1SecureAttachmentMeta {
  const id = String(row.attachment_id ?? row.attachmentId ?? "");
  const statusRaw = String(row.status ?? "failed");
  const status =
    statusRaw === "attached" || statusRaw === "uploading" || statusRaw === "failed"
      ? statusRaw
      : "failed";
  return {
    attachmentId: id,
    attachmentType: String(row.attachment_type ?? row.attachmentType ?? ""),
    fileName: String(row.file_name ?? row.fileName ?? ""),
    fileSizeBytes: Number(row.file_size_bytes ?? row.fileSizeBytes ?? 0),
    mimeType: String(row.mime_type ?? row.mimeType ?? ""),
    status,
    storageRef: String(row.storage_ref ?? row.storageRef ?? (id ? `att:${id}` : "")),
  };
}
