import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ARABIC_PDF_WORKER_SPIKE_DECISION,
  OFFICIAL_DOCUMENTS_BUCKET,
  PDF_STORAGE_SAGA_DECISION,
  PDF_STORAGE_SAGA_HOLD_CODE,
  PUBLIC_VERIFY_SAFE_FIELDS,
  SAGA_RPCS,
  STORAGE_PATH_TEMPLATE,
  buildOfficialDocumentStoragePath,
  evaluateDownloadAuthorization,
  evaluateFinalizeIdempotency,
  evaluatePreparePolicy,
  getPdfStorageGeneratorCapability,
} from "../../src/lib/student-requests/enrollment-certificate-pdf-storage-generator-contract";
import { getEnrollmentCertificateIssuanceCapability } from "../../src/lib/student-requests/enrollment-certificate-document-issuance-archive-contract";
import {
  evaluatePostZeroFeeActorAction,
  mapActorActionToTransitionResult,
} from "../../src/lib/student-requests/post-zero-fee-execution-contract";
import { buildEnrollmentCertificatePdfBytes } from "../../src/lib/documents/enrollment-certificate-pdf";

const ROOT = join(import.meta.dir, "../..");
const SAGA_MIGRATION =
  "supabase/migrations/20260714010000_enrollment_certificate_pdf_storage_saga_completion_01.sql";

function readSagaSql(): string {
  return readFileSync(join(ROOT, SAGA_MIGRATION), "utf8");
}

describe("ENROLLMENT-CERTIFICATE-PDF-STORAGE-SAGA-COMPLETION-01", () => {
  it("1 — saga decision PASS; spike PASS recorded; HOLD code retained for env gate", () => {
    expect(PDF_STORAGE_SAGA_DECISION).toBe(
      "PASS_ENROLLMENT_CERTIFICATE_PDF_STORAGE_SAGA_CONTRACT_READY",
    );
    expect(ARABIC_PDF_WORKER_SPIKE_DECISION).toBe(
      "PASS_ARABIC_PDF_WORKER_SPIKE_READY_FOR_STORAGE_SAGA_IMPLEMENTATION",
    );
    expect(PDF_STORAGE_SAGA_HOLD_CODE).toBe("HOLD_PDF_STORAGE_SAGA_NOT_IMPLEMENTED");
  });

  it("2 — Prepare success policy", () => {
    const r = evaluatePreparePolicy({
      authenticated: true,
      canActOnIssueStep: true,
      requestType: "enrollment_certificate",
      stepKey: "document_issuance",
      stepStatus: "active",
      registrarSigned: true,
      deanSigned: true,
    });
    expect(r).toEqual({ allowed: true, reason: "ok" });
  });

  it("3 — Prepare unauthorized", () => {
    expect(
      evaluatePreparePolicy({
        authenticated: false,
        canActOnIssueStep: true,
        requestType: "enrollment_certificate",
        stepKey: "document_issuance",
        stepStatus: "active",
        registrarSigned: true,
        deanSigned: true,
      }).reason,
    ).toBe("unauthorized");
    expect(
      evaluatePreparePolicy({
        authenticated: true,
        canActOnIssueStep: false,
        requestType: "enrollment_certificate",
        stepKey: "document_issuance",
        stepStatus: "active",
        registrarSigned: true,
        deanSigned: true,
      }).reason,
    ).toBe("unauthorized");
  });

  it("4 — Prepare wrong step", () => {
    expect(
      evaluatePreparePolicy({
        authenticated: true,
        canActOnIssueStep: true,
        requestType: "enrollment_certificate",
        stepKey: "dean_signature",
        stepStatus: "active",
        registrarSigned: true,
        deanSigned: true,
      }).reason,
    ).toBe("wrong_step");
  });

  it("5 — Prepare idempotency: path is deterministic per request+attempt", () => {
    const path = buildOfficialDocumentStoragePath(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    );
    expect(path).toBe(
      "enrollment-certificates/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.pdf",
    );
    expect(STORAGE_PATH_TEMPLATE).toContain("{request_id}");
    expect(STORAGE_PATH_TEMPLATE).toContain("{attempt_id}");
  });

  it("6 — Generate Arabic PDF (local Cairo, no CDN)", async () => {
    const built = await buildEnrollmentCertificatePdfBytes({
      snapshot: {
        student_name_ar: "طالب الاختبار",
        academic_number: "TEST-2026-001",
        department_name_ar: "قسم الحاسوب",
        program_name_ar: "بكالوريوس",
        academic_year_name: "2025/2026",
        semester_name: "الأول",
        level_name: "الأولى",
      },
      documentNumber: "EC-TEST-001",
      verificationUrl: "https://example.invalid/verify-document?code=ABC123XYZ999",
      fontBytes: new Uint8Array(
        readFileSync(join(ROOT, "src/assets/fonts/cairo/Cairo-Variable.ttf")),
      ),
    });
    expect(built.byteLength).toBeGreaterThan(1000);
    expect(built.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(built.pdfBytes[0]).toBe(0x25); // %PDF
  });

  it("7 — Upload success/failure encoded in migration mark/fail RPCs", () => {
    const sql = readSagaSql();
    expect(sql).toContain("mark_enrollment_certificate_document_uploaded");
    expect(sql).toContain("fail_enrollment_certificate_document_generation");
    expect(sql).toContain(
      "Intentionally no workflow mutation, no official_documents row, no storage delete",
    );
  });

  it("8 — Finalize success / repeated / recovery policies", () => {
    expect(
      evaluateFinalizeIdempotency({
        attemptStatus: "uploaded",
        officialDocumentId: null,
      }),
    ).toBe("finalize");
    expect(
      evaluateFinalizeIdempotency({
        attemptStatus: "finalized",
        officialDocumentId: "doc-1",
      }),
    ).toBe("return_existing");
    expect(
      evaluateFinalizeIdempotency({
        attemptStatus: "generating",
        officialDocumentId: null,
      }),
    ).toBe("reject");
  });

  it("9 — No duplicate official document (unique + finalize guard)", () => {
    const sql = readSagaSql();
    expect(sql).toContain("توجد وثيقة فعّالة مرتبطة بهذا الطلب مسبقاً");
    expect(sql).toContain("إنهاء الإصدار يتطلب محاولة بحالة uploaded");
    expect(sql).toContain("idempotent");
  });

  it("10 — Signed download owner/staff/admin/unauthorized", () => {
    expect(
      evaluateDownloadAuthorization({
        isOwner: true,
        isStaffAuthorized: false,
        isAdmin: false,
      }),
    ).toBe(true);
    expect(
      evaluateDownloadAuthorization({
        isOwner: false,
        isStaffAuthorized: true,
        isAdmin: false,
      }),
    ).toBe(true);
    expect(
      evaluateDownloadAuthorization({
        isOwner: false,
        isStaffAuthorized: false,
        isAdmin: true,
      }),
    ).toBe(true);
    expect(
      evaluateDownloadAuthorization({
        isOwner: false,
        isStaffAuthorized: false,
        isAdmin: false,
      }),
    ).toBe(false);
  });

  it("11 — Public verify safe fields (no academic_number / student_name)", () => {
    expect(PUBLIC_VERIFY_SAFE_FIELDS).toContain("valid");
    expect(PUBLIC_VERIFY_SAFE_FIELDS).toContain("document_number");
    expect(PUBLIC_VERIFY_SAFE_FIELDS).not.toContain("academic_number");
    expect(PUBLIC_VERIFY_SAFE_FIELDS).not.toContain("student_name_ar");
    const sql = readSagaSql();
    const verifyFn = sql.slice(
      sql.lastIndexOf("CREATE OR REPLACE FUNCTION public.verify_document"),
    );
    expect(verifyFn).not.toContain("student_name_ar");
    expect(verifyFn).not.toContain("academic_number");
    expect(verifyFn).toContain("'cancelled'");
  });

  it("12 — signed → issued → archived mappings with saga ready", () => {
    expect(mapActorActionToTransitionResult("sign")).toBe("signed");
    expect(mapActorActionToTransitionResult("issue_document")).toBe("issued");
    expect(mapActorActionToTransitionResult("archive")).toBe("archived");

    const issue = evaluatePostZeroFeeActorAction({
      action: "issue_document",
      stepStatus: "active",
      stepActionType: "issue_document",
      hasMatchingTransition: true,
      storageSagaReady: true,
    });
    expect(issue.allowed).toBe(true);
    if (issue.allowed) expect(issue.actionResult).toBe("issued");

    const archive = evaluatePostZeroFeeActorAction({
      action: "archive",
      stepStatus: "active",
      stepActionType: "archive",
      hasMatchingTransition: true,
      storageSagaReady: true,
    });
    expect(archive.allowed).toBe(true);
    if (archive.allowed) expect(archive.actionResult).toBe("archived");
  });

  it("13 — without saga ready, issue/archive stay fail-closed (no hanging runtime path invent)", () => {
    const issue = evaluatePostZeroFeeActorAction({
      action: "issue_document",
      stepStatus: "active",
      stepActionType: "issue_document",
      hasMatchingTransition: true,
    });
    expect(issue.allowed).toBe(false);
  });

  it("14 — zero-fee sign path untouched", () => {
    const sign = evaluatePostZeroFeeActorAction({
      action: "sign",
      stepStatus: "active",
      stepActionType: "sign",
      hasMatchingTransition: true,
    });
    expect(sign.allowed).toBe(true);
    if (sign.allowed) expect(sign.actionResult).toBe("signed");
  });

  it("15 — migration: private bucket, attempts, assert → bucket gate, RPCs", () => {
    const sql = readSagaSql();
    expect(sql).toContain("official-documents");
    expect(sql).toContain("public = EXCLUDED.public");
    expect(sql).toContain("enrollment_certificate_document_generation_attempts");
    expect(sql).toContain("'prepared'");
    expect(sql).toContain("'generating'");
    expect(sql).toContain("'uploaded'");
    expect(sql).toContain("'finalized'");
    expect(sql).toContain("'failed'");
    expect(sql).toContain("HOLD_ENROLLMENT_CERTIFICATE_PDF_STORAGE_BUCKET_MISSING");
    expect(sql).toContain("ENROLLMENT_CERTIFICATE_USE_PDF_STORAGE_SAGA");
    expect(sql).toContain("verification_token_pending");
    for (const rpc of SAGA_RPCS) {
      expect(sql).toContain(rpc);
    }
    expect(OFFICIAL_DOCUMENTS_BUCKET).toBe("official-documents");
  });

  it("16 — orchestrator + PDF builder exist; no client upload", () => {
    expect(
      existsSync(
        join(ROOT, "src/lib/student-requests/enrollment-certificate-pdf-storage-saga.functions.ts"),
      ),
    ).toBe(true);
    const orch = readFileSync(
      join(ROOT, "src/lib/student-requests/enrollment-certificate-pdf-storage-saga.functions.ts"),
      "utf8",
    );
    expect(orch).toContain("supabaseAdmin.storage");
    expect(orch).toContain("createSignedUrl");
    expect(orch).toContain("93807768-a281-42de-bfb4-0c0c03786b20");
    expect(orch).not.toMatch(/upsert:\s*true/);
  });

  it("17 — capability fail-closed by default; ready when bucket+worker present", () => {
    const closed = getPdfStorageGeneratorCapability({
      localArabicFontFilesPresent: true,
      localCollegeLogoPresent: true,
    });
    expect(closed.ready).toBe(false);
    expect(closed.canExecuteStaffIssue).toBe(false);
    expect(closed.blockers.length).toBeGreaterThan(0);

    const open = getPdfStorageGeneratorCapability({
      localArabicFontFilesPresent: true,
      localCollegeLogoPresent: true,
      officialDocumentsBucketPresent: true,
      workerConfigPresent: true,
    });
    expect(open.ready).toBe(true);
    expect(open.canExecuteStaffIssue).toBe(true);

    const ui = getEnrollmentCertificateIssuanceCapability();
    expect(ui.canExecuteStaffIssueButtons).toBe(false);
    const uiReady = getEnrollmentCertificateIssuanceCapability({
      officialDocumentsBucketPresent: true,
      workerConfigPresent: true,
    });
    expect(uiReady.canExecuteStaffIssueButtons).toBe(true);
  });

  it("18 — verify-document page does not render academic_number / student_name_ar", () => {
    const page = readFileSync(join(ROOT, "src/routes/verify-document.tsx"), "utf8");
    expect(page).not.toContain("academic_number");
    expect(page).not.toContain("student_name_ar");
    expect(page).toContain("الرقم المرجعي");
  });
});
