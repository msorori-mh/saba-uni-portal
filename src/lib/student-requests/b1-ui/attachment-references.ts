/**
 * Secure attachment references inside B1 draft form data.
 *
 * The draft-save RPC replaces `form_data` with the allowlisted client payload,
 * so the secure attachment reference must be re-sent on every save. Submit then
 * reads those references back from `form_data`.
 */

export type B1AttachmentReference = {
  fieldKey: string;
  status: "attached";
  attachmentId: string;
};

type MinimalAttachment = {
  attachmentId: string;
  attachmentType: string;
  status?: string;
};

/** canonical service code -> { form_data field, secure fieldKey } */
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
  const refs: B1AttachmentReference[] = [];
  for (const item of attachments ?? []) {
    if (item.attachmentType !== contract.fieldKey) continue;
    if ((item.status ?? "attached") !== "attached") continue;
    if (typeof item.attachmentId !== "string" || !ATTACHMENT_ID.test(item.attachmentId)) continue;
    const attachmentId = item.attachmentId.toLowerCase();
    if (seen.has(attachmentId)) continue;
    seen.add(attachmentId);
    refs.push({ fieldKey: contract.fieldKey, status: "attached", attachmentId });
  }

  const next = { ...values };
  if (refs.length === 0) {
    delete next[contract.field];
    return next;
  }
  next[contract.field] = refs;
  return next;
}

