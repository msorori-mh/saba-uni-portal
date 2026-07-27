export const SECURE_ATTACHMENTS_BUCKET = "student-request-secure-attachments" as const;
export const SECURE_ATTACHMENTS_TABLE = "student_request_attachment_uploads" as const;
export const SECURE_ATTACHMENT_FIELD_KEY = "excuse_documents" as const;
export const TRANSFER_SECURE_ATTACHMENT_FIELD_KEY = "secondary_certificate" as const;
export const SECURE_ATTACHMENT_FIELD_KEYS = [SECURE_ATTACHMENT_FIELD_KEY, TRANSFER_SECURE_ATTACHMENT_FIELD_KEY] as const;
export type SecureAttachmentFieldKey = (typeof SECURE_ATTACHMENT_FIELD_KEYS)[number];
export const SECURE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const SECURE_ATTACHMENT_MIN_COUNT = 1;
export const SECURE_ATTACHMENT_MAX_COUNT = 3;
export const SECURE_ATTACHMENT_SIGNED_URL_SECONDS = 300;
export const SECURE_ATTACHMENTS_RUNTIME_AVAILABLE = true as const;
export const SECURE_ATTACHMENT_ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"] as const;

export type SecureStudentRequestAttachmentStatus = "pending" | "uploaded" | "attached" | "rejected";
export type SecureAttachmentErrorCode =
  | "SECURE_ATTACHMENTS_RUNTIME_NOT_AVAILABLE"
  | "ATTACHMENT_REQUEST_NOT_OWNED"
  | "ATTACHMENT_REQUEST_NOT_EDITABLE"
  | "ATTACHMENT_FIELD_NOT_ALLOWED"
  | "ATTACHMENT_MIME_NOT_ALLOWED"
  | "ATTACHMENT_SIZE_EXCEEDED"
  | "ATTACHMENT_COUNT_EXCEEDED"
  | "ATTACHMENT_UPLOAD_NOT_COMPLETED"
  | "ATTACHMENT_OBJECT_MISMATCH"
  | "ATTACHMENT_DIRECT_ASSIGNMENT_REQUIRED"
  | "ATTACHMENT_ACCESS_DENIED";

export const SECURE_ATTACHMENT_ERRORS: Readonly<Record<SecureAttachmentErrorCode, SecureAttachmentErrorCode>> = {
  SECURE_ATTACHMENTS_RUNTIME_NOT_AVAILABLE: "SECURE_ATTACHMENTS_RUNTIME_NOT_AVAILABLE",
  ATTACHMENT_REQUEST_NOT_OWNED: "ATTACHMENT_REQUEST_NOT_OWNED",
  ATTACHMENT_REQUEST_NOT_EDITABLE: "ATTACHMENT_REQUEST_NOT_EDITABLE",
  ATTACHMENT_FIELD_NOT_ALLOWED: "ATTACHMENT_FIELD_NOT_ALLOWED",
  ATTACHMENT_MIME_NOT_ALLOWED: "ATTACHMENT_MIME_NOT_ALLOWED",
  ATTACHMENT_SIZE_EXCEEDED: "ATTACHMENT_SIZE_EXCEEDED",
  ATTACHMENT_COUNT_EXCEEDED: "ATTACHMENT_COUNT_EXCEEDED",
  ATTACHMENT_UPLOAD_NOT_COMPLETED: "ATTACHMENT_UPLOAD_NOT_COMPLETED",
  ATTACHMENT_OBJECT_MISMATCH: "ATTACHMENT_OBJECT_MISMATCH",
  ATTACHMENT_DIRECT_ASSIGNMENT_REQUIRED: "ATTACHMENT_DIRECT_ASSIGNMENT_REQUIRED",
  ATTACHMENT_ACCESS_DENIED: "ATTACHMENT_ACCESS_DENIED",
};

export type SecureAttachmentReference = {
  attachmentId: string;
  studentRequestId: string;
  studentProfileId: string;
  fieldKey: SecureAttachmentFieldKey;
  status: "attached";
  mimeType: (typeof SECURE_ATTACHMENT_ALLOWED_MIME)[number];
  sizeBytes: number;
  originalFileName: string;
  checksumSha256?: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const CONTROL_OR_PATH = /[\u0000-\u001f\u007f\\/]|\.\./;

export function isAllowedSecureAttachmentMime(value: unknown): value is SecureAttachmentReference["mimeType"] {
  return typeof value === "string" && (SECURE_ATTACHMENT_ALLOWED_MIME as readonly string[]).includes(value);
}

export function validateSecureAttachmentMetadata(input: { fileName: unknown; mimeType: unknown; sizeBytes: unknown; fieldKey: unknown; checksumSha256?: unknown }): SecureAttachmentErrorCode | null {
  if (!(SECURE_ATTACHMENT_FIELD_KEYS as readonly unknown[]).includes(input.fieldKey)) return "ATTACHMENT_FIELD_NOT_ALLOWED";
  if (!isAllowedSecureAttachmentMime(input.mimeType)) return "ATTACHMENT_MIME_NOT_ALLOWED";
  if (!Number.isInteger(input.sizeBytes) || Number(input.sizeBytes) <= 0 || Number(input.sizeBytes) > SECURE_ATTACHMENT_MAX_BYTES) return "ATTACHMENT_SIZE_EXCEEDED";
  if (typeof input.fileName !== "string" || !input.fileName.trim() || CONTROL_OR_PATH.test(input.fileName) || input.fileName.toLowerCase().includes("placeholder")) return "ATTACHMENT_OBJECT_MISMATCH";
  if (input.checksumSha256 != null && (typeof input.checksumSha256 !== "string" || !SHA256.test(input.checksumSha256))) return "ATTACHMENT_OBJECT_MISMATCH";
  return null;
}

export function buildSecureAttachmentObjectPath(input: { studentProfileId: string; studentRequestId: string; attachmentId: string; mimeType: SecureAttachmentReference["mimeType"] }): string {
  if (![input.studentProfileId, input.studentRequestId, input.attachmentId].every((id) => UUID.test(id))) throw new Error("ATTACHMENT_OBJECT_MISMATCH");
  const ext = input.mimeType === "application/pdf" ? "pdf" : input.mimeType === "image/png" ? "png" : "jpg";
  return `student-requests/${input.studentProfileId}/${input.studentRequestId}/${input.attachmentId}/content.${ext}`;
}

const TRANSITIONS: Readonly<Record<SecureStudentRequestAttachmentStatus, readonly SecureStudentRequestAttachmentStatus[]>> = {
  pending: ["uploaded", "rejected"], uploaded: ["attached", "rejected"], attached: [], rejected: [],
};
export function canTransitionSecureAttachment(from: SecureStudentRequestAttachmentStatus, to: SecureStudentRequestAttachmentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function validateSecureAttachmentCompletion(input: { owner: boolean; status: SecureStudentRequestAttachmentStatus; expectedBucket: string; expectedPath: string; expectedMime: string; expectedSize: number; object?: { bucket: string; path: string; mime: string; size: number } | null }): SecureAttachmentErrorCode | null {
  if (!input.owner) return "ATTACHMENT_REQUEST_NOT_OWNED";
  if (input.status !== "pending") return "ATTACHMENT_UPLOAD_NOT_COMPLETED";
  if (!input.object || input.object.bucket !== input.expectedBucket || input.object.path !== input.expectedPath || input.object.mime !== input.expectedMime || input.object.size !== input.expectedSize) return "ATTACHMENT_OBJECT_MISMATCH";
  return null;
}

export function isSecureAttachmentReference(value: unknown): value is SecureAttachmentReference {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return UUID.test(String(v.attachmentId ?? "")) && UUID.test(String(v.studentRequestId ?? "")) && UUID.test(String(v.studentProfileId ?? ""))
    && (SECURE_ATTACHMENT_FIELD_KEYS as readonly unknown[]).includes(v.fieldKey) && v.status === "attached" && isAllowedSecureAttachmentMime(v.mimeType)
    && Number.isInteger(v.sizeBytes) && Number(v.sizeBytes) > 0 && Number(v.sizeBytes) <= SECURE_ATTACHMENT_MAX_BYTES
    && typeof v.originalFileName === "string" && !CONTROL_OR_PATH.test(v.originalFileName) && !v.originalFileName.toLowerCase().includes("placeholder")
    && !("storagePath" in v) && !("publicUrl" in v) && !("file" in v);
}

export function validateSecureAttachmentSubmit(input: { runtimeAvailable: boolean; requestId: string; studentProfileId: string; references: unknown }): SecureAttachmentErrorCode | null {
  if (!input.runtimeAvailable) return "SECURE_ATTACHMENTS_RUNTIME_NOT_AVAILABLE";
  if (!Array.isArray(input.references) || input.references.length < SECURE_ATTACHMENT_MIN_COUNT) return "ATTACHMENT_UPLOAD_NOT_COMPLETED";
  if (input.references.length > SECURE_ATTACHMENT_MAX_COUNT) return "ATTACHMENT_COUNT_EXCEEDED";
  for (const raw of input.references) {
    if (!isSecureAttachmentReference(raw)) return "ATTACHMENT_UPLOAD_NOT_COMPLETED";
    if (raw.studentRequestId !== input.requestId || raw.studentProfileId !== input.studentProfileId) return "ATTACHMENT_OBJECT_MISMATCH";
  }
  return null;
}

export function canCreateSecureAttachmentIntent(input: { owner: boolean; requestStatus: string; requestType: string; fieldKey: string; currentCount: number; clientSuppliedPath?: unknown; clientSuppliedBucket?: unknown }): SecureAttachmentErrorCode | null {
  if (!input.owner) return "ATTACHMENT_REQUEST_NOT_OWNED";
  if (!["draft", "returned", "returned_for_completion"].includes(input.requestStatus)) return "ATTACHMENT_REQUEST_NOT_EDITABLE";
  const expectedField: SecureAttachmentFieldKey | null = input.requestType === "excused_absence" || input.requestType === "absence_excuse"
    ? SECURE_ATTACHMENT_FIELD_KEY
    : input.requestType === "department_transfer" || input.requestType === "transfer"
      ? TRANSFER_SECURE_ATTACHMENT_FIELD_KEY
      : null;
  if (expectedField === null || input.fieldKey !== expectedField) return "ATTACHMENT_FIELD_NOT_ALLOWED";
  if (input.currentCount >= SECURE_ATTACHMENT_MAX_COUNT) return "ATTACHMENT_COUNT_EXCEEDED";
  if (input.clientSuppliedPath != null || input.clientSuppliedBucket != null) return "ATTACHMENT_OBJECT_MISMATCH";
  return null;
}

export function canDownloadSecureAttachment(input: { authenticated: boolean; owner: boolean; directAssignee: boolean; activeStep: boolean; unitMatches: boolean }): boolean {
  return input.authenticated && input.directAssignee && input.activeStep && input.unitMatches;
}
