/**
 * Fail-closed secure-attachments runtime readiness.
 * Never hardcodes true — derived from get_b1_secure_read_runtime_capability
 * plus presence of create-intent / owned-upload / complete / download RPCs.
 */

export const SECURE_ATTACHMENT_RUNTIME_CAPABILITY_KEYS = [
  "create_intent",
  "upload",
  "complete",
  "download",
] as const;

export type SecureAttachmentRuntimeCapabilityKey =
  (typeof SECURE_ATTACHMENT_RUNTIME_CAPABILITY_KEYS)[number];

/** Existing backend RPCs that must all be present for attachment uploads. */
export const SECURE_ATTACHMENT_RUNTIME_CAPABILITY_RPCS = {
  create_intent: "create_student_request_attachment_upload_intent",
  upload: "get_owned_student_request_attachment_upload",
  complete: "complete_student_request_attachment_upload",
  download: "authorize_student_request_attachment_download",
} as const satisfies Record<SecureAttachmentRuntimeCapabilityKey, string>;

export type SecureAttachmentsRuntimeCapability = {
  available: boolean;
  readsIncludeAttachments: boolean;
  capabilities: Readonly<Record<SecureAttachmentRuntimeCapabilityKey, boolean>>;
  missing: readonly SecureAttachmentRuntimeCapabilityKey[];
};

export const SECURE_ATTACHMENTS_RUNTIME_TECHNICAL_ERROR_AR =
  "تعذر تأكيد جاهزية مسار المرفقات الآمن من الخادم (create_intent/upload/complete/download).";

export function emptySecureAttachmentsRuntimeCapability(
  overrides?: Partial<SecureAttachmentsRuntimeCapability>,
): SecureAttachmentsRuntimeCapability {
  const capabilities = {
    create_intent: false,
    upload: false,
    complete: false,
    download: false,
    ...(overrides?.capabilities ?? {}),
  } as Record<SecureAttachmentRuntimeCapabilityKey, boolean>;
  const missing = SECURE_ATTACHMENT_RUNTIME_CAPABILITY_KEYS.filter((key) => !capabilities[key]);
  return {
    available: false,
    readsIncludeAttachments: false,
    capabilities,
    missing,
    ...overrides,
    capabilities,
    missing: overrides?.missing ?? missing,
  };
}

/** Pure fail-closed resolver — never invents true. */
export function resolveSecureAttachmentsRuntimeAvailable(input: {
  capabilityAvailable: boolean;
  reads: readonly string[] | null | undefined;
  rpcPresence: Partial<Record<SecureAttachmentRuntimeCapabilityKey, boolean>> | null | undefined;
}): SecureAttachmentsRuntimeCapability {
  const readsIncludeAttachments = Array.isArray(input.reads) && input.reads.includes("attachments");
  const capabilities = Object.fromEntries(
    SECURE_ATTACHMENT_RUNTIME_CAPABILITY_KEYS.map((key) => [
      key,
      input.rpcPresence?.[key] === true,
    ]),
  ) as Record<SecureAttachmentRuntimeCapabilityKey, boolean>;
  const missing = SECURE_ATTACHMENT_RUNTIME_CAPABILITY_KEYS.filter((key) => !capabilities[key]);
  const available =
    input.capabilityAvailable === true &&
    readsIncludeAttachments &&
    missing.length === 0;
  return { available, readsIncludeAttachments, capabilities, missing };
}

type RpcErrorLike = { message?: string; code?: string } | null;
type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcErrorLike }>;
};

export function isSecureAttachmentRpcUnavailable(error: RpcErrorLike): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  const code = error.code ?? "";
  return (
    code === "42883" ||
    code === "42P01" ||
    code === "PGRST202" ||
    /schema cache|does not exist|could not find the function|not find the function/i.test(msg)
  );
}

/** Probe: function-missing => false; any other rejection => present. */
export async function probeSecureAttachmentRpcPresence(
  client: RpcClient,
  key: SecureAttachmentRuntimeCapabilityKey,
): Promise<boolean> {
  const fn = SECURE_ATTACHMENT_RUNTIME_CAPABILITY_RPCS[key];
  const nil = "00000000-0000-4000-8000-000000000000";
  const argsByKey: Record<SecureAttachmentRuntimeCapabilityKey, Record<string, unknown>> = {
    create_intent: {
      p_student_request_id: nil,
      p_field_key: "excuse_documents",
      p_original_file_name: "probe.pdf",
      p_mime_type: "application/pdf",
      p_size_bytes: 1,
      p_checksum_sha256: null,
    },
    upload: { p_attachment_id: nil },
    complete: { p_attachment_id: nil },
    download: { p_attachment_id: nil },
  };
  const { error } = await client.rpc(fn, argsByKey[key]);
  if (!error) return true;
  if (isSecureAttachmentRpcUnavailable(error)) return false;
  return true;
}

export async function loadSecureAttachmentsRuntimeCapability(
  client: RpcClient,
): Promise<SecureAttachmentsRuntimeCapability> {
  const { data, error } = await client.rpc("get_b1_secure_read_runtime_capability");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return emptySecureAttachmentsRuntimeCapability();
  }
  const row = data as Record<string, unknown>;
  const reads = Array.isArray(row.reads) ? row.reads.map(String) : [];
  const rpcPresence = Object.fromEntries(
    await Promise.all(
      SECURE_ATTACHMENT_RUNTIME_CAPABILITY_KEYS.map(async (key) => [
        key,
        await probeSecureAttachmentRpcPresence(client, key),
      ]),
    ),
  ) as Partial<Record<SecureAttachmentRuntimeCapabilityKey, boolean>>;

  return resolveSecureAttachmentsRuntimeAvailable({
    capabilityAvailable: row.available === true,
    reads,
    rpcPresence,
  });
}

const OWNED_UPLOAD_ROW_REQUIRED_KEYS = [
  "upload_status",
  "mime_type",
  "size_bytes",
  "storage_bucket",
  "storage_object_path",
] as const;

function assertValidOwnedUploadRow(row: Record<string, unknown>): Record<string, unknown> {
  for (const key of OWNED_UPLOAD_ROW_REQUIRED_KEYS) {
    const value = row[key];
    if (value === null || value === undefined || String(value).trim() === "") {
      throw new Error("ATTACHMENT_OBJECT_MISMATCH");
    }
  }
  return row;
}

/**
 * Normalize get_owned_student_request_attachment_upload payload.
 * Accepts only a single object or an array of length exactly 1.
 * Rejects null/undefined/empty/multiple/invalid objects fail-closed.
 * Callers must not index [0] without this normalizer.
 */
export function parseOwnedStudentRequestAttachmentUpload(
  data: unknown,
): Record<string, unknown> {
  if (data == null) {
    throw new Error("ATTACHMENT_OBJECT_MISMATCH");
  }
  if (typeof data === "object" && !Array.isArray(data)) {
    return assertValidOwnedUploadRow(data as Record<string, unknown>);
  }
  if (!Array.isArray(data)) {
    throw new Error("ATTACHMENT_OBJECT_MISMATCH");
  }
  if (data.length !== 1) {
    throw new Error("ATTACHMENT_OBJECT_MISMATCH");
  }
  const row = data[0];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("ATTACHMENT_OBJECT_MISMATCH");
  }
  return assertValidOwnedUploadRow(row as Record<string, unknown>);
}

/** Pure gate used by upload path before any storage mutation. */
export function prepareOwnedAttachmentStorageUpload(input: {
  ownedRaw: unknown;
  expectedMimeType: string;
  expectedSizeBytes: number;
  maxBytes: number;
}): { storageBucket: string; storageObjectPath: string; sizeBytes: number; mimeType: string } {
  const row = parseOwnedStudentRequestAttachmentUpload(input.ownedRaw);
  if (row.upload_status !== "pending" || row.mime_type !== input.expectedMimeType) {
    throw new Error("ATTACHMENT_OBJECT_MISMATCH");
  }
  const sizeBytes = Number(row.size_bytes);
  if (
    !Number.isFinite(sizeBytes) ||
    sizeBytes !== input.expectedSizeBytes ||
    sizeBytes > input.maxBytes
  ) {
    throw new Error("ATTACHMENT_OBJECT_MISMATCH");
  }
  return {
    storageBucket: String(row.storage_bucket),
    storageObjectPath: String(row.storage_object_path),
    sizeBytes,
    mimeType: String(row.mime_type),
  };
}
