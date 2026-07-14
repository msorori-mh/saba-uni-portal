/**
 * Enrollment certificate PDF Storage Saga — production capability & constants.
 * Phase: ENROLLMENT-CERTIFICATE-PDF-STORAGE-SAGA-COMPLETION-01
 */

export const ARABIC_PDF_WORKER_SPIKE_DECISION =
  "PASS_ARABIC_PDF_WORKER_SPIKE_READY_FOR_STORAGE_SAGA_IMPLEMENTATION" as const;

export const PDF_STORAGE_SAGA_DECISION =
  "PASS_ENROLLMENT_CERTIFICATE_PDF_STORAGE_SAGA_CONTRACT_READY" as const;

/** @deprecated Prefer PDF_STORAGE_SAGA_DECISION — kept for older test aliases. */
export const PDF_STORAGE_GENERATOR_DECISION = PDF_STORAGE_SAGA_DECISION;

export const PDF_RUNTIME_HOLD_CODE = "HOLD_PDF_RUNTIME_COMPATIBILITY_NOT_PROVEN" as const;
export const APPROVED_ARABIC_FONT_HOLD_CODE = "HOLD_APPROVED_ARABIC_FONT_ASSET_REQUIRED" as const;
/** Cleared when saga modules + font + bucket contract exist in-repo. */
export const PDF_STORAGE_SAGA_HOLD_CODE = "HOLD_PDF_STORAGE_SAGA_NOT_IMPLEMENTED" as const;

export const PDF_STORAGE_GENERATOR_HOLD_MSG_AR =
  "مسار إصدار شهادة القيد جاهز عقدياً (Prepare/Upload/Finalize). يبقى التنفيذ fail-closed حتى تطبيق Migration وتهيئة Worker/Storage على البيئة.";

export const OFFICIAL_DOCUMENTS_BUCKET = "official-documents" as const;

export const STORAGE_PATH_TEMPLATE =
  "enrollment-certificates/{request_id}/{attempt_id}.pdf" as const;

export const SAGA_RPCS = [
  "prepare_enrollment_certificate_document_generation",
  "mark_enrollment_certificate_document_generating",
  "mark_enrollment_certificate_document_uploaded",
  "finalize_enrollment_certificate_document_generation",
  "fail_enrollment_certificate_document_generation",
] as const;

/** @deprecated alias */
export const PLANNED_TWO_PHASE_RPCS = SAGA_RPCS;
export const PLANNED_STORAGE_BUCKET = OFFICIAL_DOCUMENTS_BUCKET;
export const PLANNED_STORAGE_PATH_TEMPLATE = STORAGE_PATH_TEMPLATE;

export type PdfStorageGeneratorCapability = {
  ready: boolean;
  canExecuteStaffIssue: boolean;
  canGeneratePdf: boolean;
  canUploadOfficialDocument: boolean;
  decision: typeof PDF_STORAGE_SAGA_DECISION;
  arabicPdfWorkerSpikeDecision: typeof ARABIC_PDF_WORKER_SPIKE_DECISION;
  blockers: readonly string[];
  messageAr: string;
  runtimeTarget: "cloudflare_workers_nitro";
  preferredEngineWhenUnblocked: "pdf-lib+fontkit";
  edgeFunctionsPresent: false;
  officialDocumentsBucketPresent: boolean;
  localArabicFontFilesPresent: boolean;
  localCollegeLogoPresent: boolean;
  localUniversityLogoBinaryPresent: boolean;
  sagaRpcsDefined: true;
};

export function buildOfficialDocumentStoragePath(requestId: string, attemptId: string): string {
  return `enrollment-certificates/${requestId}/${attemptId}.pdf`;
}

export function getPdfStorageGeneratorCapability(options?: {
  localCollegeLogoPresent?: boolean;
  localUniversityLogoBinaryPresent?: boolean;
  localArabicFontFilesPresent?: boolean;
  /** Runtime: private bucket configured/reachable. Defaults false (fail-closed). */
  officialDocumentsBucketPresent?: boolean;
  /** Runtime: worker/server PDF path configured. Defaults false (fail-closed). */
  workerConfigPresent?: boolean;
}): PdfStorageGeneratorCapability {
  const fontOk = options?.localArabicFontFilesPresent ?? true;
  const logoOk = options?.localCollegeLogoPresent ?? true;
  const bucketOk = options?.officialDocumentsBucketPresent ?? false;
  const workerOk = options?.workerConfigPresent ?? false;
  const blockers: string[] = [];
  if (!fontOk) blockers.push(APPROVED_ARABIC_FONT_HOLD_CODE);
  if (!workerOk) blockers.push(PDF_RUNTIME_HOLD_CODE);
  if (!bucketOk) blockers.push("HOLD_ENROLLMENT_CERTIFICATE_PDF_STORAGE_BUCKET_MISSING");

  const ready = blockers.length === 0 && logoOk;

  return {
    ready,
    canExecuteStaffIssue: ready,
    canGeneratePdf: ready && fontOk,
    canUploadOfficialDocument: ready && bucketOk,
    decision: PDF_STORAGE_SAGA_DECISION,
    arabicPdfWorkerSpikeDecision: ARABIC_PDF_WORKER_SPIKE_DECISION,
    blockers,
    messageAr: ready
      ? "عقد Storage Saga لشهادة القيد جاهز للتنفيذ على البيئة المهيأة."
      : PDF_STORAGE_GENERATOR_HOLD_MSG_AR,
    runtimeTarget: "cloudflare_workers_nitro",
    preferredEngineWhenUnblocked: "pdf-lib+fontkit",
    edgeFunctionsPresent: false,
    officialDocumentsBucketPresent: bucketOk,
    localArabicFontFilesPresent: fontOk,
    localCollegeLogoPresent: logoOk,
    localUniversityLogoBinaryPresent: options?.localUniversityLogoBinaryPresent ?? false,
    sagaRpcsDefined: true,
  };
}

export function evaluateApprovedArabicFontGate(input: {
  localTtfOrOtfCount: number;
  hasOfLicenseAdjacent: boolean;
  cdnOnlyUiFonts: boolean;
}): {
  allowed: boolean;
  code: typeof APPROVED_ARABIC_FONT_HOLD_CODE | "font_ok";
  messageAr: string;
} {
  if (input.localTtfOrOtfCount >= 1 && input.hasOfLicenseAdjacent) {
    return {
      allowed: true,
      code: "font_ok",
      messageAr: "خط عربي معتمد موجود محلياً مع ترخيص OFL",
    };
  }
  return {
    allowed: false,
    code: APPROVED_ARABIC_FONT_HOLD_CODE,
    messageAr: "لا يوجد ملف خط عربي معتمد (TTF/OTF + ترخيص) داخل المستودع للتضمين في PDF خادمي.",
  };
}

export function evaluatePdfRuntimeCompatibilityGate(input: {
  hasPdfLibraryDependency: boolean;
  hasArabicPdfSpikePassing: boolean;
  runtime: "cloudflare_workers_nitro" | "nodejs" | "supabase_edge" | "unknown";
}): {
  allowed: boolean;
  code: typeof PDF_RUNTIME_HOLD_CODE | "runtime_ok";
  messageAr: string;
} {
  if (
    input.hasPdfLibraryDependency &&
    input.hasArabicPdfSpikePassing &&
    (input.runtime === "cloudflare_workers_nitro" ||
      input.runtime === "supabase_edge" ||
      input.runtime === "nodejs")
  ) {
    return {
      allowed: true,
      code: "runtime_ok",
      messageAr: "Runtime متوافق مع محرك PDF المثبت",
    };
  }
  return {
    allowed: false,
    code: PDF_RUNTIME_HOLD_CODE,
    messageAr:
      "توافق Runtime مع مولّد PDF عربي غير مثبت (Cloudflare Workers بدون Chromium؛ لا PoC لمكتبة PDF في المستودع).",
  };
}

/** Pure policy helpers for saga (unit-tested without DB). */
export function evaluatePreparePolicy(input: {
  authenticated: boolean;
  canActOnIssueStep: boolean;
  requestType: string;
  stepKey: string;
  stepStatus: string;
  registrarSigned: boolean;
  deanSigned: boolean;
}): { allowed: boolean; reason: string } {
  if (!input.authenticated) return { allowed: false, reason: "unauthorized" };
  if (!input.canActOnIssueStep) return { allowed: false, reason: "unauthorized" };
  if (input.requestType !== "enrollment_certificate") {
    return { allowed: false, reason: "wrong_request_type" };
  }
  if (input.stepKey !== "document_issuance" || input.stepStatus !== "active") {
    return { allowed: false, reason: "wrong_step" };
  }
  if (!input.registrarSigned || !input.deanSigned) {
    return { allowed: false, reason: "signatures_incomplete" };
  }
  return { allowed: true, reason: "ok" };
}

export function evaluateFinalizeIdempotency(input: {
  attemptStatus: string;
  officialDocumentId: string | null;
}): "finalize" | "return_existing" | "reject" {
  if (input.attemptStatus === "finalized" && input.officialDocumentId) {
    return "return_existing";
  }
  if (input.attemptStatus === "uploaded") return "finalize";
  return "reject";
}

export function evaluateDownloadAuthorization(input: {
  isOwner: boolean;
  isStaffAuthorized: boolean;
  isAdmin: boolean;
}): boolean {
  return input.isOwner || input.isStaffAuthorized || input.isAdmin;
}

export const PUBLIC_VERIFY_SAFE_FIELDS = [
  "valid",
  "document_type",
  "document_number",
  "status",
  "issued_at",
  "reason",
] as const;
