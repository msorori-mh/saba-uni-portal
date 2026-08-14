/**
 * Client-side actions for official documents (download / print).
 *
 * Rules enforced here:
 * - Download NEVER calls window.print(). It always resolves a short-lived,
 *   server-authorized signed URL and hands the real application/pdf to the
 *   browser or to the Android system handler.
 * - No public URL and no storage path is ever constructed on the client.
 */

import { openExternalUrl } from "@/lib/native/external-links";
import { isNativePlatform } from "@/lib/native/platform";

export type SignedUrlResult = { signedUrl: string; expiresInSeconds: number };
export type SignedUrlResolver = (documentId: string) => Promise<SignedUrlResult>;

export type DocumentActionResult = { ok: true } | { ok: false; error: string };

/** Statuses whose PDF may be downloaded by the owner. */
export const DOWNLOADABLE_DOCUMENT_STATUSES = ["issued", "archived"] as const;

export function isDownloadableStatus(status: string | null | undefined): boolean {
  return (DOWNLOADABLE_DOCUMENT_STATUSES as readonly string[]).includes(String(status ?? ""));
}

export function documentNotDownloadableMessage(status: string | null | undefined): string {
  return String(status) === "cancelled"
    ? "الوثيقة ملغاة وغير صالحة للتنزيل."
    : "هذه الوثيقة غير متاحة للتنزيل حالياً.";
}

/** Opens an already-signed PDF URL with the right runtime behaviour. */
export async function openSignedPdf(signedUrl: string): Promise<void> {
  if (isNativePlatform()) {
    // Android: hand the real PDF to the system handler (viewer / downloader),
    // where the user can also print via the system print UI.
    await openExternalUrl(signedUrl);
    return;
  }
  if (typeof window !== "undefined") {
    window.open(signedUrl, "_blank", "noopener,noreferrer");
  }
}

/**
 * Downloads a document PDF: authorize -> signed URL -> open.
 * Returns a user-facing error instead of throwing.
 */
export async function downloadOfficialDocumentPdf(
  documentId: string,
  status: string | null | undefined,
  resolve: SignedUrlResolver,
): Promise<DocumentActionResult> {
  if (!isDownloadableStatus(status)) {
    return { ok: false, error: documentNotDownloadableMessage(status) };
  }
  try {
    const { signedUrl } = await resolve(documentId);
    if (!signedUrl) return { ok: false, error: "تعذر إنشاء رابط التنزيل" };
    await openSignedPdf(signedUrl);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "تعذر تنزيل الوثيقة" };
  }
}

/** Label for the print action — Android opens the PDF for system printing. */
export function printActionLabel(native = isNativePlatform()): string {
  return native ? "فتح للطباعة" : "طباعة";
}

/**
 * Print action. On native we never call window.print(); we open the authorized
 * PDF so the user prints from the Android system print UI.
 */
export async function printOfficialDocument(
  documentId: string,
  status: string | null | undefined,
  resolve: SignedUrlResolver,
): Promise<DocumentActionResult> {
  if (isNativePlatform()) {
    return downloadOfficialDocumentPdf(documentId, status, resolve);
  }
  if (typeof window !== "undefined") window.print();
  return { ok: true };
}
