/**
 * Generic official-document download surface.
 *
 * SOURCE-ONLY wrapper: re-exports the existing, already-authorized signed-URL
 * server function under a document-type-neutral name. Authorization, status
 * barrier, and short-lived signed URL behaviour are unchanged.
 */
export { getEnrollmentCertificateDocumentSignedUrl as getOfficialDocumentSignedUrl } from "@/lib/student-requests/enrollment-certificate-pdf-storage-saga.functions";
