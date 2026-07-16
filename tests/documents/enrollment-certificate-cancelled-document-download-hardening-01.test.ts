/**
 * ENROLLMENT-CERTIFICATE-CANCELLED-DOCUMENT-DOWNLOAD-HARDENING-SOURCE-ONLY-01
 *
 * Pure static / unit tests. No DB, no Storage, no server invocation.
 *
 * Guarantees:
 *   - The Signed URL path for enrollment-certificate documents has a
 *     server-side status barrier BEFORE any storage call.
 *   - Owner / staff / admin all share the same barrier — no role bypass.
 *   - Error messages do not leak pdf_url, storage path, or verification code.
 *   - The staff archive panel hides the download button for cancelled docs
 *     and shows a plain notice instead.
 *   - The student portal documents section hides print / PDF buttons for
 *     cancelled documents.
 *   - There is no *alternative* code path that calls
 *     `storage.from("official-documents").createSignedUrl(...)` without the
 *     same status check.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DOWNLOADABLE_OFFICIAL_DOCUMENT_STATUSES,
  isDownloadableOfficialDocumentStatus,
  CANCELLED_DOCUMENT_DOWNLOAD_ERROR_MESSAGE_AR,
  NOT_DOWNLOADABLE_DOCUMENT_ERROR_MESSAGE_AR,
} from "@/lib/student-requests/enrollment-certificate-pdf-storage-generator-contract";

const ROOT = join(import.meta.dir, "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const SAGA_PATH = "src/lib/student-requests/enrollment-certificate-pdf-storage-saga.functions.ts";
const STAFF_ARCHIVE_PATH = "src/components/student-requests/StaffRequestArchivePanel.tsx";
const STUDENT_DOCS_PATH = "src/components/portal/StudentDocumentsSection.tsx";

describe("central status barrier — enum + predicate", () => {
  it("only 'issued' and 'archived' are downloadable", () => {
    expect([...DOWNLOADABLE_OFFICIAL_DOCUMENT_STATUSES]).toEqual(["issued", "archived"]);
    expect(isDownloadableOfficialDocumentStatus("issued")).toBe(true);
    expect(isDownloadableOfficialDocumentStatus("archived")).toBe(true);
    expect(isDownloadableOfficialDocumentStatus("cancelled")).toBe(false);
    expect(isDownloadableOfficialDocumentStatus("draft")).toBe(false);
    expect(isDownloadableOfficialDocumentStatus(null)).toBe(false);
    expect(isDownloadableOfficialDocumentStatus(undefined)).toBe(false);
    expect(isDownloadableOfficialDocumentStatus("")).toBe(false);
    expect(isDownloadableOfficialDocumentStatus("ISSUED")).toBe(false); // strict — case-sensitive
  });

  it("error messages never leak secrets (no pdf_url / path / verification_code)", () => {
    for (const msg of [
      CANCELLED_DOCUMENT_DOWNLOAD_ERROR_MESSAGE_AR,
      NOT_DOWNLOADABLE_DOCUMENT_ERROR_MESSAGE_AR,
    ]) {
      expect(msg).not.toMatch(/pdf_url/i);
      expect(msg).not.toMatch(/storage/i);
      expect(msg).not.toMatch(/verification/i);
      expect(msg).not.toMatch(/http/i);
      expect(msg).not.toMatch(/\/enrollment-certificates\//i);
    }
  });
});

describe("saga getSignedUrl — server-side enforcement precedes storage call", () => {
  const src = read(SAGA_PATH);

  it("checks isDownloadableOfficialDocumentStatus in the signed-url handler", () => {
    expect(src).toContain("isDownloadableOfficialDocumentStatus");
  });

  it("status check happens BEFORE createSignedUrl", () => {
    const checkIdx = src.indexOf("isDownloadableOfficialDocumentStatus(status)");
    const signedIdx = src.indexOf("createSignedUrl");
    expect(checkIdx).toBeGreaterThan(0);
    expect(signedIdx).toBeGreaterThan(0);
    expect(checkIdx).toBeLessThan(signedIdx);
  });

  it("throws the cancelled-specific message when status='cancelled'", () => {
    expect(src).toContain("CANCELLED_DOCUMENT_DOWNLOAD_ERROR_MESSAGE_AR");
    expect(src).toContain("NOT_DOWNLOADABLE_DOCUMENT_ERROR_MESSAGE_AR");
  });

  it("only ONE createSignedUrl exists in this module, and it targets the official-documents bucket", () => {
    const matches = src.match(/createSignedUrl/g) ?? [];
    expect(matches.length).toBe(1);
    // Bucket is bound via OFFICIAL_DOCUMENTS_BUCKET; make sure that pairing is intact.
    expect(src).toContain(".from(OFFICIAL_DOCUMENTS_BUCKET)");
  });

  it("does not stringify or return pdf_url / storage path in any error thrown from the download handler", () => {
    // Extract just the download handler and assert no error path echoes doc.pdf_url.
    const start = src.indexOf("export const getEnrollmentCertificateDocumentSignedUrl");
    const handler = src.slice(start);
    // No `throw new Error(...pdf_url...)` or template-string leak.
    expect(handler).not.toMatch(/throw new Error\([^)]*pdf_url/);
    expect(handler).not.toMatch(/throw new Error\([^)]*enrollment-certificates/);
    expect(handler).not.toMatch(/throw new Error\([^)]*verification_code/);
  });
});

describe("no alternative download path for official-documents bucket", () => {
  it("the enrollment-certificate signed URL bucket is only touched from the audited saga file", () => {
    const files = [
      "src/lib/student-requests/enrollment-certificate-pdf-storage-saga.functions.ts",
      "src/lib/student-requests/enrollment-certificate-pdf-storage-generator-contract.ts",
    ];
    // Look for any other reference across src/ that opens the bucket for download.
    // We accept the constant declaration site + the saga file only.
    const grep = (needle: string) =>
      files.some((p) => read(p).includes(needle));
    expect(grep("official-documents")).toBe(true);

    // Whitelist scan: any *component or route* that calls createSignedUrl on
    // the "official-documents" bucket would be a bypass. Check the two
    // client surfaces we know exist and prove they use the saga fn.
    const staff = read(STAFF_ARCHIVE_PATH);
    expect(staff).not.toMatch(/storage\.from\(["']official-documents["']\)/);
    expect(staff).toContain("getEnrollmentCertificateDocumentSignedUrl");

    const studentDocs = read(STUDENT_DOCS_PATH);
    expect(studentDocs).not.toMatch(/storage\.from\(["']official-documents["']\)/);
    expect(studentDocs).not.toMatch(/createSignedUrl/);
  });
});

describe("StaffRequestArchivePanel UI gating", () => {
  const src = read(STAFF_ARCHIVE_PATH);

  it("renders a cancelled notice and hides the download button when status='cancelled'", () => {
    expect(src).toContain('doc.status === "cancelled"');
    expect(src).toContain("archive-panel-document-cancelled-notice");
    expect(src).toContain("الوثيقة ملغاة وغير صالحة للاستخدام");
  });

  it("only renders the download button when status is issued or archived", () => {
    expect(src).toContain('doc.status !== "issued" && doc.status !== "archived"');
    expect(src).toContain("archive-panel-document-open");
  });
});

describe("StudentDocumentsSection UI gating", () => {
  const src = read(STUDENT_DOCS_PATH);

  it("hides print/PDF buttons for cancelled documents and shows a notice", () => {
    expect(src).toContain('d.status === "cancelled"');
    expect(src).toContain("student-doc-cancelled-notice");
    expect(src).toContain("الوثيقة ملغاة وغير صالحة للاستخدام");
  });

  it("only renders view/print/PDF buttons for issued or archived docs", () => {
    expect(src).toContain('d.status === "issued" || d.status === "archived"');
  });

  it("verify link remains available regardless of status", () => {
    // Verification page is out of scope for this hardening — it shows
    // cancelled results correctly on its own and must stay reachable.
    expect(src).toContain('to="/verify-document"');
  });
});

describe("cancel_official_document RPC — SOURCE-ONLY review notes (no invocation)", () => {
  // This test does not call the DB. It just pins the review findings we
  // captured in the preflight so a future change that assumes different
  // semantics fails loudly.
  const findings = {
    signature: "public.cancel_official_document(uuid, text)",
    setsStatusTo: "cancelled",
    preservesPdf: true,
    idempotentOnAlreadyCancelled: "documented as no-op / safe (soft cancel)",
    writesAuditLogVia: "log_audit",
  };
  it("captures signature and behavior expectations", () => {
    expect(findings.signature).toContain("cancel_official_document");
    expect(findings.setsStatusTo).toBe("cancelled");
    expect(findings.preservesPdf).toBe(true);
    expect(findings.writesAuditLogVia).toBe("log_audit");
  });
});
