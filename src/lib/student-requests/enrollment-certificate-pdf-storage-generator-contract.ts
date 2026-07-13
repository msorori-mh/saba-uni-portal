/**
 * PDF + Storage generator readiness for enrollment certificates.
 * Fail-closed for staff issue / Storage saga until the next implementation phase.
 *
 * Font + Worker Arabic PDF spike cleared in:
 * ENROLLMENT-CERTIFICATE-ARABIC-PDF-WORKER-SPIKE-01
 *
 * Spike decision:
 * PASS_ARABIC_PDF_WORKER_SPIKE_READY_FOR_STORAGE_SAGA_IMPLEMENTATION
 *
 * Production issuance remains gated by assert_enrollment_certificate_pdf_generation_ready
 * (Prepare/Finalize + official-documents bucket not implemented in this spike).
 */

export const ARABIC_PDF_WORKER_SPIKE_DECISION =
  "PASS_ARABIC_PDF_WORKER_SPIKE_READY_FOR_STORAGE_SAGA_IMPLEMENTATION" as const;

/** Storage saga / production generator still not implemented. */
export const PDF_STORAGE_GENERATOR_DECISION = "HOLD_PDF_STORAGE_SAGA_NOT_IMPLEMENTED" as const;

export const PDF_RUNTIME_HOLD_CODE = "HOLD_PDF_RUNTIME_COMPATIBILITY_NOT_PROVEN" as const;

export const APPROVED_ARABIC_FONT_HOLD_CODE = "HOLD_APPROVED_ARABIC_FONT_ASSET_REQUIRED" as const;

export const PDF_STORAGE_SAGA_HOLD_CODE = "HOLD_PDF_STORAGE_SAGA_NOT_IMPLEMENTED" as const;

export const PDF_STORAGE_GENERATOR_HOLD_MSG_AR =
  "مولّد شهادة القيد جاهز تقنياً على مستوى Spike (خط Cairo + pdf-lib على Worker)، لكن Saga التخزين/Prepare-Finalize وbucket الوثائق الرسمية غير منفّذة بعد. زر الإصدار يبقى مغلقاً.";

export type PdfStorageGeneratorCapability = {
  ready: false;
  canExecuteStaffIssue: false;
  canGeneratePdf: false;
  canUploadOfficialDocument: false;
  decision: typeof PDF_STORAGE_GENERATOR_DECISION;
  arabicPdfWorkerSpikeDecision: typeof ARABIC_PDF_WORKER_SPIKE_DECISION;
  blockers: readonly [typeof PDF_STORAGE_SAGA_HOLD_CODE];
  messageAr: string;
  runtimeTarget: "cloudflare_workers_nitro";
  preferredEngineWhenUnblocked: "pdf-lib+fontkit";
  edgeFunctionsPresent: false;
  officialDocumentsBucketPresent: false;
  localArabicFontFilesPresent: boolean;
  localCollegeLogoPresent: boolean;
  localUniversityLogoBinaryPresent: boolean;
};

/**
 * Inventory used by staff UI and tests — always fail-closed until Storage saga lands.
 */
export function getPdfStorageGeneratorCapability(options?: {
  localCollegeLogoPresent?: boolean;
  localUniversityLogoBinaryPresent?: boolean;
  localArabicFontFilesPresent?: boolean;
}): PdfStorageGeneratorCapability {
  return {
    ready: false,
    canExecuteStaffIssue: false,
    canGeneratePdf: false,
    canUploadOfficialDocument: false,
    decision: PDF_STORAGE_GENERATOR_DECISION,
    arabicPdfWorkerSpikeDecision: ARABIC_PDF_WORKER_SPIKE_DECISION,
    blockers: [PDF_STORAGE_SAGA_HOLD_CODE],
    messageAr: PDF_STORAGE_GENERATOR_HOLD_MSG_AR,
    runtimeTarget: "cloudflare_workers_nitro",
    preferredEngineWhenUnblocked: "pdf-lib+fontkit",
    edgeFunctionsPresent: false,
    officialDocumentsBucketPresent: false,
    localArabicFontFilesPresent: options?.localArabicFontFilesPresent ?? true,
    localCollegeLogoPresent: options?.localCollegeLogoPresent ?? true,
    localUniversityLogoBinaryPresent: options?.localUniversityLogoBinaryPresent ?? false,
  };
}

/** Two-phase saga names planned after font + engine gates clear. */
export const PLANNED_TWO_PHASE_RPCS = [
  "prepare_enrollment_certificate_document_generation",
  "finalize_enrollment_certificate_document_generation",
  "fail_enrollment_certificate_document_generation",
] as const;

export const PLANNED_STORAGE_BUCKET = "official-documents" as const;

export const PLANNED_STORAGE_PATH_TEMPLATE =
  "enrollment-certificates/{request_id}/{official_document_id}.pdf" as const;

/**
 * Font gate: approved Cairo variable TTF must be vendored with OFL adjacent.
 * CDN UI fonts alone are not sufficient.
 */
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
