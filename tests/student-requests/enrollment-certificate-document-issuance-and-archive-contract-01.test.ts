import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTRACT_DECISION,
  ENROLLMENT_CERTIFICATE_DOCUMENT_TYPE,
  PDF_GENERATION_HOLD_CODE,
  REQUIRED_ISSUANCE_SNAPSHOT_FIELDS,
  VERIFY_DOCUMENT_PUBLIC_FIELDS,
  assertSingleActiveStep,
  evaluateArchivePrerequisites,
  evaluateExistingPdfGenerationPaths,
  evaluateIssuancePrerequisites,
  getEnrollmentCertificateIssuanceCapability,
  isSnapshotComplete,
} from "../../src/lib/student-requests/enrollment-certificate-document-issuance-archive-contract";
import {
  ACTION_TO_TRANSITION_RESULT,
  evaluatePostZeroFeeActorAction,
} from "../../src/lib/student-requests/post-zero-fee-execution-contract";
import { validateStaffActionCapability } from "../../src/lib/student-requests/staff-action-contract";

const ROOT = join(import.meta.dir, "../..");
const MIGRATION =
  "supabase/migrations/20260713210000_enrollment_certificate_document_issuance_and_archive_contract_01.sql";

function readMigration(): string {
  return readFileSync(join(ROOT, MIGRATION), "utf8");
}

const baseIssue = {
  stepKey: "document_issuance",
  stepStatus: "active",
  stepActionType: "issue_document",
  requestStatus: "in_review",
  requestType: ENROLLMENT_CERTIFICATE_DOCUMENT_TYPE,
  registrarSigned: true,
  deanSigned: true,
  feePaymentStatus: "not_required" as const,
  snapshotComplete: true,
  existingActiveDocumentForRequest: false,
  hasMatchingIssuedTransition: true,
  actorIsAssignedOrAdmin: true,
  actorIsStudent: false,
  authUidPresent: true,
  pdfGenerationAvailable: false,
};

describe("ENROLLMENT-CERTIFICATE-DOCUMENT-ISSUANCE-AND-ARCHIVE-CONTRACT-01", () => {
  it("1 — decision is PDF generation HOLD", () => {
    expect(CONTRACT_DECISION).toBe(PDF_GENERATION_HOLD_CODE);
    const paths = evaluateExistingPdfGenerationPaths();
    expect(paths.hasReusableServerPdfGenerator).toBe(false);
    expect(paths.hasOfficialDocumentsStorageBucket).toBe(false);
    expect(paths.holdsIssuance).toBe(true);
  });

  it("2 — registrar sign maps to signed (activates dean when transition exists)", () => {
    expect(ACTION_TO_TRANSITION_RESULT.sign).toBe("signed");
    const gate = evaluatePostZeroFeeActorAction({
      action: "sign",
      stepStatus: "active",
      stepActionType: "sign",
      hasMatchingTransition: true,
    });
    expect(gate.allowed).toBe(true);
  });

  it("3 — dean sign maps to signed (activates document_issuance)", () => {
    const gate = evaluatePostZeroFeeActorAction({
      action: "sign",
      stepStatus: "active",
      stepActionType: "sign",
      hasMatchingTransition: true,
    });
    expect(gate.allowed).toBe(true);
  });

  it("4 — approve on sign step is rejected", () => {
    const gate = evaluatePostZeroFeeActorAction({
      action: "approve",
      stepStatus: "active",
      stepActionType: "sign",
      hasMatchingTransition: true,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toBe("approve_on_sign_step");
  });

  it("5 — student actor is rejected for issuance", () => {
    const gate = evaluateIssuancePrerequisites({
      ...baseIssue,
      actorIsStudent: true,
      actorIsAssignedOrAdmin: false,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.code).toBe("STUDENT_FORBIDDEN");
  });

  it("6 — unassigned non-admin actor is rejected", () => {
    const gate = evaluateIssuancePrerequisites({
      ...baseIssue,
      actorIsAssignedOrAdmin: false,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.code).toBe("ACTOR_NOT_ASSIGNED");
  });

  it("7 — admin/assigned path still HOLDs without PDF", () => {
    const gate = evaluateIssuancePrerequisites({
      ...baseIssue,
      actorIsAssignedOrAdmin: true,
      pdfGenerationAvailable: false,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.code).toBe(PDF_GENERATION_HOLD_CODE);
  });

  it("8 — issuance without both signatures is rejected", () => {
    const gate = evaluateIssuancePrerequisites({
      ...baseIssue,
      registrarSigned: true,
      deanSigned: false,
      pdfGenerationAvailable: true,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.code).toBe("SIGNATURES_INCOMPLETE");
  });

  it("9 — incomplete academic snapshot is rejected", () => {
    expect(isSnapshotComplete({ academic_number: "1" })).toBe(false);
    const gate = evaluateIssuancePrerequisites({
      ...baseIssue,
      snapshotComplete: false,
      pdfGenerationAvailable: true,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.code).toBe("SNAPSHOT_INCOMPLETE");
  });

  it("10 — duplicate active document per request is rejected", () => {
    const gate = evaluateIssuancePrerequisites({
      ...baseIssue,
      existingActiveDocumentForRequest: true,
      pdfGenerationAvailable: true,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.code).toBe("DUPLICATE_DOCUMENT");
  });

  it("11 — PDF/file failure gate blocks issuance (no runtime mutate)", () => {
    const gate = evaluateIssuancePrerequisites({
      ...baseIssue,
      pdfGenerationAvailable: false,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.code).toBe(PDF_GENERATION_HOLD_CODE);
  });

  it("12 — idempotent re-issue blocked when document exists", () => {
    const first = evaluateIssuancePrerequisites({
      ...baseIssue,
      existingActiveDocumentForRequest: false,
      pdfGenerationAvailable: true,
    });
    expect(first.allowed).toBe(true);
    const second = evaluateIssuancePrerequisites({
      ...baseIssue,
      existingActiveDocumentForRequest: true,
      pdfGenerationAvailable: true,
    });
    expect(second.allowed).toBe(false);
  });

  it("13 — archive without linked document is rejected", () => {
    const gate = evaluateArchivePrerequisites({
      stepKey: "archive",
      stepStatus: "active",
      stepActionType: "archive",
      requestStatus: "in_review",
      linkedDocumentStatus: null,
      linkedDocumentHasAccessibleFile: false,
      registrarSigned: true,
      deanSigned: true,
      actorIsArchiveOfficerOrAdmin: true,
      actorIsStudent: false,
      authUidPresent: true,
      hasMatchingArchivedTransition: true,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.code).toBe("NO_LINKED_DOCUMENT");
  });

  it("14 — archive before issued document is rejected", () => {
    const gate = evaluateArchivePrerequisites({
      stepKey: "archive",
      stepStatus: "active",
      stepActionType: "archive",
      requestStatus: "in_review",
      linkedDocumentStatus: "draft",
      linkedDocumentHasAccessibleFile: false,
      registrarSigned: true,
      deanSigned: true,
      actorIsArchiveOfficerOrAdmin: true,
      actorIsStudent: false,
      authUidPresent: true,
      hasMatchingArchivedTransition: true,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.code).toBe("DOCUMENT_NOT_ISSUED");
  });

  it("15 — archive with issued doc but missing file HOLDs", () => {
    const gate = evaluateArchivePrerequisites({
      stepKey: "archive",
      stepStatus: "active",
      stepActionType: "archive",
      requestStatus: "in_review",
      linkedDocumentStatus: "issued",
      linkedDocumentHasAccessibleFile: false,
      registrarSigned: true,
      deanSigned: true,
      actorIsArchiveOfficerOrAdmin: true,
      actorIsStudent: false,
      authUidPresent: true,
      hasMatchingArchivedTransition: true,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.code).toBe(PDF_GENERATION_HOLD_CODE);
  });

  it("16 — verification public fields contract includes student identity", () => {
    expect(VERIFY_DOCUMENT_PUBLIC_FIELDS).toContain("student_name_ar");
    expect(VERIFY_DOCUMENT_PUBLIC_FIELDS).toContain("academic_number");
    expect(VERIFY_DOCUMENT_PUBLIC_FIELDS).toContain("document_number");
    expect(VERIFY_DOCUMENT_PUBLIC_FIELDS).not.toContain("verification_code");
  });

  it("17 — exactly one active step invariant", () => {
    expect(assertSingleActiveStep(["pending", "active", "completed"]).allowed).toBe(true);
    expect(assertSingleActiveStep(["active", "active"]).allowed).toBe(false);
    expect(assertSingleActiveStep(["pending", "pending"]).allowed).toBe(false);
  });

  it("18 — terminal request statuses reject issuance (no stuck write)", () => {
    for (const status of ["cancelled", "rejected", "completed"] as const) {
      const gate = evaluateIssuancePrerequisites({
        ...baseIssue,
        requestStatus: status,
        pdfGenerationAvailable: true,
      });
      expect(gate.allowed).toBe(false);
      if (!gate.allowed) expect(gate.code).toBe("REQUEST_TERMINAL");
    }
  });

  it("19 — migration review: schema link, details, PDF HOLD, verify fields", () => {
    const sql = readMigration();
    expect(sql).toContain("student_request_id");
    expect(sql).toContain("enrollment_certificate_document_details");
    expect(sql).toContain("idx_official_documents_one_active_per_request");
    expect(sql).toContain("issue_enrollment_certificate_from_workflow_step");
    expect(sql).toContain("archive_enrollment_certificate_from_workflow_step");
    expect(sql).toContain("HOLD_ENROLLMENT_CERTIFICATE_PDF_GENERATION_CONTRACT_MISSING");
    expect(sql).toContain("assert_enrollment_certificate_pdf_generation_ready");
    expect(sql).toContain("assert_enrollment_certificate_pdf_generation_ready");
    expect(sql).toContain("student_name_ar");
    expect(sql).toContain("academic_number");
    expect(sql).toContain("'signed'");
    expect(sql).toContain("'archived'");
    // No inventing Storage upload / PDF library calls inside migration
    expect(sql).not.toMatch(/storage\.from\(/i);
    expect(sql).not.toMatch(/jspdf|puppeteer|pdf-lib/i);
  });

  it("20 — staff UI remains fail-closed; capability blocks issue/archive execute", () => {
    const staff = validateStaffActionCapability();
    expect(staff.canExecute).toBe(false);
    const cap = getEnrollmentCertificateIssuanceCapability();
    expect(cap.canIssueDocument).toBe(false);
    expect(cap.canArchiveDocument).toBe(false);
    expect(cap.canExecuteStaffIssueButtons).toBe(false);
    expect(REQUIRED_ISSUANCE_SNAPSHOT_FIELDS.length).toBeGreaterThanOrEqual(10);
  });

  it("21 — auth.uid required encoded in specialized RPCs", () => {
    const sql = readMigration();
    expect(sql).toContain("v_uid uuid := auth.uid()");
    expect(sql).toContain("ERRCODE = '28000'");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.issue_enrollment_certificate_from_workflow_step");
  });
});
