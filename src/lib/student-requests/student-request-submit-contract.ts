/**
 * Canonical student request submit contract (P9).
 * Single source of truth for input normalization, validation, and RPC payload shape.
 */

import {
  buildFormValuesSummary,
  getStudentRequestFormDefinition,
  serializeFormValuesForStorage,
  validateStudentRequestFormValues,
} from "@/lib/student-requests/request-form-registry";
import { getRequestServiceAdapter } from "@/lib/student-requests/request-service-adapter";
import {
  getStudentRequestTypeDefinition,
  isCanonicalStudentRequestTypeCode,
  normalizeStudentRequestTypeCode,
} from "@/lib/student-requests/request-type-registry";

export type CanonicalStudentRequestAttachmentMeta = {
  key: string;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

export type CanonicalStudentRequestSubmitInput = {
  /** Optional DB id from request_types picker — not trusted for authorization. */
  requestTypeId?: string | null;
  requestTypeCode: string;
  title: string;
  description?: string | null;
  studentNotes?: string | null;
  formData?: Record<string, unknown> | null;
  attachments?: CanonicalStudentRequestAttachmentMeta[] | null;
  /** In-memory idempotency hint from client — not persisted without DB support. */
  clientRequestId?: string | null;
  /** When set, resubmit an existing returned/draft request instead of creating new. */
  existingRequestId?: string | null;
};

export type CanonicalStudentRequestSubmitResult = {
  id: string;
  requestNumber: string | null;
  status: string;
  submitted: boolean;
  /** Never true until runtime workflow init is verified — P9 does not claim workflow start. */
  workflowInitialized: false;
  clientRequestId: string | null;
};

export type NormalizedStudentRequestSubmitInput = {
  requestTypeId: string | null;
  requestTypeCode: string;
  title: string;
  description: string | null;
  studentNotes: string | null;
  formData: Record<string, unknown>;
  attachments: CanonicalStudentRequestAttachmentMeta[];
  clientRequestId: string | null;
  existingRequestId: string | null;
};

const SECURE_ATTACHMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Extract only opaque attachment ids for the atomic B1 RPC; paths and metadata remain untrusted. */
export function extractB1SecureAttachmentIds(
  requestTypeCode: string,
  formData: Record<string, unknown>,
): string[] {
  const canonical = normalizeStudentRequestTypeCode(requestTypeCode);
  const contract = canonical === "excused_absence"
    ? { field: "excuse_documents", fieldKey: "excuse_documents" }
    : canonical === "department_transfer"
      ? { field: "secondary_certificate_file", fieldKey: "secondary_certificate" }
      : null;
  if (!contract) return [];

  const raw = formData[contract.field];
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const ids = values.map((value) => {
    if (!value || typeof value !== "object") throw new Error("SECURE_ATTACHMENT_REFERENCE_REQUIRED");
    const ref = value as Record<string, unknown>;
    if (ref.fieldKey !== contract.fieldKey || ref.status !== "attached"
      || typeof ref.attachmentId !== "string" || !SECURE_ATTACHMENT_ID.test(ref.attachmentId)) {
      throw new Error("SECURE_ATTACHMENT_REFERENCE_INVALID");
    }
    return ref.attachmentId.toLowerCase();
  });
  if (ids.length < 1 || ids.length > 3 || new Set(ids).size !== ids.length) {
    throw new Error("SECURE_ATTACHMENT_REFERENCE_COUNT_INVALID");
  }
  return ids;
}

const BASE64_DATA_URL = /^data:[^;]+;base64,/i;
const HTML_TAG = /<[^>]+>/;

function stripHtml(text: string): string {
  return text.replace(HTML_TAG, "").trim();
}

function isPlainSerializable(value: unknown): boolean {
  if (value === null) return true;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return true;
  if (Array.isArray(value)) return value.every(isPlainSerializable);
  if (t === "object") {
    if (value instanceof File || value instanceof Blob || value instanceof Date) return false;
    return Object.values(value as Record<string, unknown>).every(isPlainSerializable);
  }
  return false;
}

/** Remove File objects, base64 blobs, placeholders, and non-JSON-safe values from form_data. */
export function sanitizeFormDataForSubmit(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const serialized = serializeFormValuesForStorage(values);
  const out: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(serialized)) {
    if (val === undefined) continue;
    if (val instanceof File || val instanceof Blob) continue;

    if (val && typeof val === "object" && !Array.isArray(val)) {
      const obj = val as Record<string, unknown>;
      if (obj._filePlaceholder === true) continue;
    }

    if (typeof val === "string" && BASE64_DATA_URL.test(val)) continue;

    if (!isPlainSerializable(val)) continue;

    if (typeof val === "string") {
      out[key] = stripHtml(val);
    } else {
      out[key] = val;
    }
  }

  return out;
}

export function normalizeStudentRequestSubmitInput(
  raw: CanonicalStudentRequestSubmitInput,
): NormalizedStudentRequestSubmitInput {
  const requestTypeCode = normalizeStudentRequestTypeCode(raw.requestTypeCode);
  const title = stripHtml((raw.title ?? "").trim());
  const description = raw.description != null ? stripHtml(String(raw.description).trim()) : null;
  const studentNotes =
    raw.studentNotes != null ? stripHtml(String(raw.studentNotes).trim()) : description;
  const formData = sanitizeFormDataForSubmit(raw.formData ?? {});

  const def = getStudentRequestFormDefinition(requestTypeCode);
  if (def) {
    formData._formCode = def.code;
    formData._formVersion = "p4-foundation";
  }

  return {
    requestTypeId: raw.requestTypeId?.trim() || null,
    requestTypeCode,
    title,
    description,
    studentNotes: studentNotes || null,
    formData,
    attachments: Array.isArray(raw.attachments)
      ? raw.attachments.filter((a) => a && typeof a.key === "string")
      : [],
    clientRequestId: raw.clientRequestId?.trim() || null,
    existingRequestId: raw.existingRequestId?.trim() || null,
  };
}

export type StudentRequestSubmitValidationResult =
  | { ok: true; normalized: NormalizedStudentRequestSubmitInput }
  | { ok: false; message: string; field?: string };

export function validateStudentRequestSubmitInput(
  raw: CanonicalStudentRequestSubmitInput,
): StudentRequestSubmitValidationResult {
  const normalized = normalizeStudentRequestSubmitInput(raw);

  if (!normalized.requestTypeCode) {
    return { ok: false, message: "نوع الطلب مطلوب", field: "requestTypeCode" };
  }

  if (!isCanonicalStudentRequestTypeCode(normalized.requestTypeCode)) {
    return { ok: false, message: "نوع الطلب غير مدعوم", field: "requestTypeCode" };
  }

  if (!normalized.title) {
    return { ok: false, message: "عنوان الطلب مطلوب", field: "title" };
  }

  if (normalized.title.length > 200) {
    return { ok: false, message: "عنوان الطلب طويل جداً", field: "title" };
  }

  if (normalized.studentNotes && normalized.studentNotes.length > 4000) {
    return { ok: false, message: "ملاحظات الطالب طويلة جداً", field: "studentNotes" };
  }

  const def = getStudentRequestFormDefinition(normalized.requestTypeCode);
  if (!def) {
    return { ok: false, message: "نموذج هذا النوع غير متاح", field: "requestTypeCode" };
  }

  const formValidation = validateStudentRequestFormValues(def, normalized.formData);
  if (!formValidation.valid) {
    const missing = formValidation.missingLabels.slice(0, 3).join("، ");
    return {
      ok: false,
      message: missing ? `يرجى إكمال الحقول: ${missing}` : "يرجى إكمال جميع الحقول المطلوبة",
      field: "formData",
    };
  }

  const typeDef = getStudentRequestTypeDefinition(normalized.requestTypeCode);
  // Secure attachment identity is deliberately not validated here. requestId and
  // studentProfileId in form data are client-controlled. The source-only secure
  // runtime binds exact attachment IDs to the authenticated owner inside the
  // submit transaction; the runtime flag remains closed until that RPC is applied.
  if (typeDef?.requiresAttachment && normalized.requestTypeCode !== "excused_absence") {
    const hasRealAttachment = normalized.attachments.some(
      (a) => a.fileName && !a.fileName.startsWith("placeholder"),
    );
    if (!hasRealAttachment) {
      return {
        ok: false,
        message: "يتطلب هذا النوع مرفقاً — رفع المرفقات غير مفعّل حالياً في هذه الواجهة.",
        field: "attachments",
      };
    }
  }

  if (normalized.attachments.some((a) => a.fileName?.includes("placeholder"))) {
    return {
      ok: false,
      message: "لا يمكن إرسال مرفق وهمي — الرفع غير مفعّل.",
      field: "attachments",
    };
  }

  return { ok: true, normalized };
}

export function buildStudentRequestSubmitPayload(
  normalized: NormalizedStudentRequestSubmitInput,
): {
  requestType: string;
  title: string;
  formData: Record<string, unknown>;
  studentNotes: string | null;
  description: string | null;
} {
  const def = getStudentRequestFormDefinition(normalized.requestTypeCode);
  const summary =
    def != null
      ? buildFormValuesSummary(def, normalized.formData)
      : normalized.studentNotes ?? normalized.description;

  return {
    requestType: normalized.requestTypeCode,
    title: normalized.title,
    formData: normalized.formData,
    studentNotes: summary?.trim() || normalized.studentNotes,
    description: normalized.description ?? summary ?? null,
  };
}

export type StudentRequestDetailPersistencePlan = {
  canonicalCode: string;
  storedCodes: readonly string[];
  validatorKey: string;
  detailContractKey: string;
  transactionRequired: true;
  workflowStartsAfterValidation: true;
  supportsResubmit: true;
  runtimeAvailable: false;
};

/** Source-only extension metadata. It never writes detail tables from the client. */
export function buildStudentRequestDetailPersistencePlan(
  requestTypeCode: string,
): StudentRequestDetailPersistencePlan | null {
  const adapter = getRequestServiceAdapter(requestTypeCode);
  if (!adapter) return null;
  return {
    canonicalCode: adapter.canonicalCode,
    storedCodes: adapter.storedCodes,
    validatorKey: adapter.submit.validatorKey,
    detailContractKey: adapter.detailBinding.contractKey,
    transactionRequired: true,
    workflowStartsAfterValidation: true,
    supportsResubmit: true,
    runtimeAvailable: false,
  };
}
