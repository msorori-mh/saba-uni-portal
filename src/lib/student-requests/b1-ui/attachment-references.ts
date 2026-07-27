/**
 * Canonical secure-attachment references inside B1 draft form data.
 *
 * CONTRACT (frozen): `form_data` stores ONLY arrays of lowercase attachment
 * UUID strings under the canonical field of the service. No fieldKey, status,
 * storage coordinates, file metadata, base64, File or Blob ever reach
 * `form_data`. The field key is derived from the service, never trusted from
 * the client payload.
 *
 * The draft-save RPC replaces `form_data` with the allowlisted client payload,
 * so these references must be re-sent on every save. Submit then reads the
 * same UUID arrays back from `form_data`.
 */

export type B1AttachmentReferenceIds = string[];

type MinimalAttachment = {
  attachmentId: string;
  attachmentType: string;
  status?: string;
};

/** canonical service code -> { form_data field, expected attachmentType } */
const CONTRACT: Record<string, { field: string; fieldKey: string }> = {
  excused_absence: { field: "excuse_documents", fieldKey: "excuse_documents" },
  department_transfer: { field: "secondary_certificate_file", fieldKey: "secondary_certificate" },
};

const ATTACHMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function withSecureAttachmentReferences(
  serviceCode: string,
  values: Record<string, unknown>,
  attachments: readonly MinimalAttachment[] | undefined,
): Record<string, unknown> {
  const contract = CONTRACT[serviceCode];
  if (!contract) return values;

  const seen = new Set<string>();
  const ids: B1AttachmentReferenceIds = [];
  for (const item of attachments ?? []) {
    if (!item || item.attachmentType !== contract.fieldKey) continue;
    if ((item.status ?? "attached") !== "attached") continue;
    if (typeof item.attachmentId !== "string" || !ATTACHMENT_ID.test(item.attachmentId)) continue;
    const attachmentId = item.attachmentId.toLowerCase();
    if (seen.has(attachmentId)) continue;
    seen.add(attachmentId);
    ids.push(attachmentId);
  }

  const next = { ...values };
  if (ids.length === 0) {
    delete next[contract.field];
    return next;
  }
  next[contract.field] = ids;
  return next;
}
