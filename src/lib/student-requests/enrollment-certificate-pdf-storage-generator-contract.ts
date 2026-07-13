/**
 * PDF + Storage generator readiness for enrollment certificates.
 * Fail-closed capability — no PDF bytes, no Storage uploads from this module.
 *
 * Phase: ENROLLMENT-CERTIFICATE-PDF-STORAGE-GENERATOR-01
 *
 * Primary decision after G0/G1:
 * HOLD_APPROVED_ARABIC_FONT_ASSET_REQUIRED
 *
 * Secondary (also proven):
 * HOLD_PDF_RUNTIME_COMPATIBILITY_NOT_PROVEN
 * — Cloudflare Workers / Nitro has no PDF lib PoC yet; Chromium unavailable.
 */

export const PDF_STORAGE_GENERATOR_DECISION =
  "HOLD_APPROVED_ARABIC_FONT_ASSET_REQUIRED" as const;

export const PDF_RUNTIME_HOLD_CODE =
  "HOLD_PDF_RUNTIME_COMPATIBILITY_NOT_PROVEN" as const;

export const APPROVED_ARABIC_FONT_HOLD_CODE =
  "HOLD_APPROVED_ARABIC_FONT_ASSET_REQUIRED" as const;

export const PDF_STORAGE_GENERATOR_HOLD_MSG_AR =
  "توقّف مولّد شهادة القيد: لا يوجد ملف خط عربي معتمد (TTF/OTF + ترخيص) داخل المستودع للتضمين في PDF خادمي. خطوط Cairo/Tajawal تُحمَّل من CDN فقط ولا تُضمَّن.";

export type PdfStorageGeneratorCapability = {
  ready: false;
  canExecuteStaffIssue: false;
  canGeneratePdf: false;
  canUploadOfficialDocument: false;
  decision: typeof PDF_STORAGE_GENERATOR_DECISION;
  blockers: readonly [
    typeof APPROVED_ARABIC_FONT_HOLD_CODE,
    typeof PDF_RUNTIME_HOLD_CODE,
  ];
  messageAr: string;
  runtimeTarget: "cloudflare_workers_nitro";
  preferredEngineWhenUnblocked: "pdf-lib+fontkit";
  edgeFunctionsPresent: false;
  officialDocumentsBucketPresent: false;
  localArabicFontFilesPresent: false;
  localCollegeLogoPresent: boolean;
  localUniversityLogoBinaryPresent: boolean;
};

/**
 * Inventory used by staff UI and tests — always fail-closed until fonts + engine PoC land.
 */
export function getPdfStorageGeneratorCapability(options?: {
  localCollegeLogoPresent?: boolean;
  localUniversityLogoBinaryPresent?: boolean;
}): PdfStorageGeneratorCapability {
  return {
    ready: false,
    canExecuteStaffIssue: false,
    canGeneratePdf: false,
    canUploadOfficialDocument: false,
    decision: PDF_STORAGE_GENERATOR_DECISION,
    blockers: [APPROVED_ARABIC_FONT_HOLD_CODE, PDF_RUNTIME_HOLD_CODE],
    messageAr: PDF_STORAGE_GENERATOR_HOLD_MSG_AR,
    runtimeTarget: "cloudflare_workers_nitro",
    preferredEngineWhenUnblocked: "pdf-lib+fontkit",
    edgeFunctionsPresent: false,
    officialDocumentsBucketPresent: false,
    localArabicFontFilesPresent: false,
    localCollegeLogoPresent: options?.localCollegeLogoPresent ?? true,
    localUniversityLogoBinaryPresent:
      options?.localUniversityLogoBinaryPresent ?? false,
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
 * Font gate: CDN-only UI fonts are not embeddable assets.
 * Do not download/add a random font — requires an approved licensed file in-repo.
 */
export function evaluateApprovedArabicFontGate(input: {
  localTtfOrOtfCount: number;
  hasOfLicenseAdjacent: boolean;
  cdnOnlyUiFonts: boolean;
}): {
  allowed: false;
  code: typeof APPROVED_ARABIC_FONT_HOLD_CODE;
  messageAr: string;
} {
  void input;
  return {
    allowed: false,
    code: APPROVED_ARABIC_FONT_HOLD_CODE,
    messageAr: PDF_STORAGE_GENERATOR_HOLD_MSG_AR,
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
