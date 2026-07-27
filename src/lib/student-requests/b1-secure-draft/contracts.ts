/**
 * B1 five-services secure DRAFT mutation contracts.
 * Create/save only — submit remains submit_b1_student_request_atomic.
 */

import {
  B1_CANONICAL_CODES,
  normalizeAttachmentMeta,
  type B1CanonicalCode,
  type B1SecureDraft,
} from "../b1-secure-read/contracts";

export { B1_CANONICAL_CODES, type B1CanonicalCode, type B1SecureDraft };

export const B1_SECURE_DRAFT_MUTATIONS_CONTRACT_ID =
  "B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01" as const;

export const B1_SECURE_DRAFT_RPCS = [
  "create_b1_request_draft_for_student",
  "save_b1_request_draft_for_student",
] as const;

export type B1SecureDraftRpc = (typeof B1_SECURE_DRAFT_RPCS)[number];

export const B1_DRAFT_ACCESS_DENIED = "B1_DRAFT_ACCESS_DENIED" as const;
export const B1_SECURE_DRAFT_UPDATING_MSG =
  "عقود مسودات الخدمات الطلابية قيد التحديث حالياً. حاول لاحقاً.";

/** Freeze allowlists reused for draft save (strict DENY on extras). */
export const B1_DRAFT_FORM_ALLOWLIST: Readonly<Record<B1CanonicalCode, readonly string[]>> = {
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
};

export const B1_ADAPTER_DRAFT_RPC_MAP = {
  createDraft: "create_b1_request_draft_for_student",
  saveDraft: "save_b1_request_draft_for_student",
  submit: "submit_b1_student_request_atomic",
} as const;

/**
 * Secure-attachment reference fields. The backend contract
 * (`b1_assert_uuid_array_field`) accepts ONLY an absent key or an array of
 * attachment UUIDs. The form registry seeds file fields with `null`, which the
 * backend rejects with B1_DRAFT_FIELD_TYPE_INVALID, so empty references are
 * normalized to an absent key here (uploads are tracked by the attachments
 * subsystem, never by raw form values).
 */
export const B1_ATTACHMENT_REFERENCE_FIELDS = [
  "excuse_documents",
  "secondary_certificate_file",
] as const;

export type B1AttachmentReferenceField = (typeof B1_ATTACHMENT_REFERENCE_FIELDS)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const B1_INPUT_VALIDATION_FAILED = "B1_INPUT_VALIDATION_FAILED" as const;

/** Field-scoped input rejection — carries a safe field name, never values. */
export class B1DraftFormFieldError extends Error {
  readonly field: string;
  readonly reason: string;
  constructor(field: string, reason: string) {
    super(`${B1_INPUT_VALIDATION_FAILED}:${field}:${reason}`);
    this.name = "B1DraftFormFieldError";
    this.field = field;
    this.reason = reason;
  }
}

function isAttachmentReferenceField(key: string): key is B1AttachmentReferenceField {
  return (B1_ATTACHMENT_REFERENCE_FIELDS as readonly string[]).includes(key);
}

/**
 * Normalizes browser form values into the exact jsonb shape the draft RPC
 * accepts. Strict: malformed attachment references are rejected by field name
 * instead of being silently dropped.
 */
export function normalizeB1DraftFormData(
  formData: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(formData)) {
    if (value === undefined) continue;
    if (!isAttachmentReferenceField(key)) {
      out[key] = value;
      continue;
    }
    if (value === null || value === "") continue;
    if (!Array.isArray(value)) {
      throw new B1DraftFormFieldError(key, "attachment_reference_invalid");
    }
    if (value.length === 0) continue;
    for (const item of value) {
      if (typeof item !== "string" || !UUID_RE.test(item)) {
        throw new B1DraftFormFieldError(key, "attachment_reference_invalid");
      }
    }
    out[key] = value;
  }
  return out;
}


export function assertNoStorageCoordinates(value: unknown, path = "$"): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoStorageCoordinates(item, `${path}[${i}]`));
    return;
  }
  if (typeof value !== "object") return;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = k.toLowerCase();
    if (
      key === "storage_bucket" ||
      key === "storage_object_path" ||
      key === "object_key" ||
      key.includes("storage_bucket") ||
      key.includes("object_path")
    ) {
      throw new Error(`B1_DTO_STORAGE_LEAK:${path}.${k}`);
    }
    assertNoStorageCoordinates(v, `${path}.${k}`);
  }
}

export function normalizeDraftDto(raw: Record<string, unknown>): B1SecureDraft {
  assertNoStorageCoordinates(raw);
  const serviceCode = String(raw.serviceCode ?? "");
  if (!B1_CANONICAL_CODES.includes(serviceCode as B1CanonicalCode)) {
    throw new Error("B1_DRAFT_DTO_SERVICE_INVALID");
  }
  return {
    requestId: String(raw.requestId ?? ""),
    serviceCode: serviceCode as B1CanonicalCode,
    formData: (raw.formData as Record<string, unknown>) ?? {},
    // Draft-mutation RPCs return attachment metas in backend snake_case; the UI
    // contract is camelCase. Normalizing here keeps attachments visible after save.
    attachments: Array.isArray(raw.attachments)
      ? (raw.attachments as Record<string, unknown>[]).map(normalizeAttachmentMeta)
      : [],
    status: "draft",
    updatedAt: String(raw.updatedAt ?? ""),
  };
}
