/**
 * Enrollment certificate document issuance + archive contract (01 → saga).
 * Pure policy / gate — no DB writes.
 *
 * Storage Saga contract ready in-repo; production execute still requires
 * migration apply + Worker/Storage env (fail-closed when unavailable).
 */

import {
  PDF_STORAGE_SAGA_DECISION,
  PDF_STORAGE_SAGA_HOLD_CODE,
  PDF_STORAGE_GENERATOR_HOLD_MSG_AR,
  PUBLIC_VERIFY_SAFE_FIELDS,
  getPdfStorageGeneratorCapability,
} from "@/lib/student-requests/enrollment-certificate-pdf-storage-generator-contract";

export const CONTRACT_DECISION = PDF_STORAGE_SAGA_DECISION;

/** Kept as alias — used when capability/env gates issue/archive closed. */
export const PDF_GENERATION_HOLD_CODE = PDF_STORAGE_SAGA_HOLD_CODE;

export const PDF_GENERATION_HOLD_MSG_AR = PDF_STORAGE_GENERATOR_HOLD_MSG_AR;

export const ENROLLMENT_CERTIFICATE_DOCUMENT_TYPE = "enrollment_certificate" as const;

export const SCHEMA_CONTRACT = {
  officialDocumentsStudentRequestId: true,
  enrollmentCertificateDocumentDetails: true,
  uniqueActiveDocumentPerRequest: true,
  documentStatusIncludesArchived: true,
  workflowDecisionIncludesSignedIssuedArchived: true,
  workflowEventIncludesSigned: true,
  generationAttemptsLedger: true,
  privateOfficialDocumentsBucket: true,
} as const;

export const REQUIRED_ISSUANCE_SNAPSHOT_FIELDS = [
  "student_profile_id",
  "academic_number",
  "student_name_ar",
  "department_id",
  "department_name_ar",
  "program_id",
  "program_name_ar",
  "study_system",
  "student_study_status",
  "academic_year_id",
  "academic_year_name",
  "semester_id",
  "semester_name",
  "level_id",
  "level_name",
  "enrollment_status",
  "issued_snapshot_at",
] as const;

export type EnrollmentCertificateSnapshotField = (typeof REQUIRED_ISSUANCE_SNAPSHOT_FIELDS)[number];

export const VERIFY_DOCUMENT_PUBLIC_FIELDS = PUBLIC_VERIFY_SAFE_FIELDS;

export type EnrollmentCertificateIssuanceCapability = {
  canRecordSignature: boolean;
  canIssueDocument: boolean;
  canArchiveDocument: boolean;
  canExecuteStaffIssueButtons: boolean;
  reason:
    | typeof PDF_GENERATION_HOLD_CODE
    | "signature_ready_pdf_blocked"
    | "saga_ready_awaiting_env"
    | "ready";
  messageAr: string;
  decision: typeof CONTRACT_DECISION;
};

/**
 * Staff UI capability. Buttons unlock only when saga assets + bucket/worker config present.
 * Default (no opts): treats in-repo saga as contract-ready but execute gated on env.
 */
export function getEnrollmentCertificateIssuanceCapability(options?: {
  officialDocumentsBucketPresent?: boolean;
  workerConfigPresent?: boolean;
  localArabicFontFilesPresent?: boolean;
}): EnrollmentCertificateIssuanceCapability {
  const cap = getPdfStorageGeneratorCapability({
    localArabicFontFilesPresent: options?.localArabicFontFilesPresent ?? true,
    officialDocumentsBucketPresent: options?.officialDocumentsBucketPresent ?? false,
    workerConfigPresent: options?.workerConfigPresent ?? false,
  });

  if (!cap.ready) {
    return {
      canRecordSignature: true,
      canIssueDocument: false,
      canArchiveDocument: false,
      canExecuteStaffIssueButtons: false,
      reason: "signature_ready_pdf_blocked",
      messageAr: PDF_GENERATION_HOLD_MSG_AR,
      decision: CONTRACT_DECISION,
    };
  }

  return {
    canRecordSignature: true,
    canIssueDocument: true,
    canArchiveDocument: true,
    canExecuteStaffIssueButtons: true,
    reason: "ready",
    messageAr: cap.messageAr,
    decision: CONTRACT_DECISION,
  };
}

export function evaluateExistingPdfGenerationPaths(): {
  hasReusableServerPdfGenerator: boolean;
  hasOfficialDocumentsStorageBucket: boolean;
  hasHtmlPrintRenderer: boolean;
  hasAdHocRowIssuer: boolean;
  holdsIssuance: boolean;
  decision: typeof CONTRACT_DECISION;
  reasons: string[];
} {
  return {
    hasReusableServerPdfGenerator: true,
    hasOfficialDocumentsStorageBucket: true,
    hasHtmlPrintRenderer: true,
    hasAdHocRowIssuer: true,
    holdsIssuance: false,
    decision: CONTRACT_DECISION,
    reasons: [
      "arabic_pdf_worker_ready",
      "storage_saga_rpcs_defined",
      "private_official_documents_bucket_defined",
    ],
  };
}

export type IssuancePrerequisiteInput = {
  stepKey: string;
  stepStatus: string;
  stepActionType: string | null;
  requestStatus: string;
  requestType: string;
  registrarSigned: boolean;
  deanSigned: boolean;
  feePaymentStatus: "not_required" | "paid" | "pending_payment" | "waived" | "cancelled" | null;
  snapshotComplete: boolean;
  existingActiveDocumentForRequest: boolean;
  hasMatchingIssuedTransition: boolean;
  actorIsAssignedOrAdmin: boolean;
  actorIsStudent: boolean;
  authUidPresent: boolean;
  pdfGenerationAvailable: boolean;
};

export type ArchivePrerequisiteInput = {
  stepKey: string;
  stepStatus: string;
  stepActionType: string | null;
  requestStatus: string;
  linkedDocumentStatus: "draft" | "issued" | "cancelled" | "archived" | null;
  linkedDocumentHasAccessibleFile: boolean;
  registrarSigned: boolean;
  deanSigned: boolean;
  actorIsArchiveOfficerOrAdmin: boolean;
  actorIsStudent: boolean;
  authUidPresent: boolean;
  hasMatchingArchivedTransition: boolean;
};

export type GateResult = { allowed: true } | { allowed: false; code: string; messageAr: string };

export function evaluateIssuancePrerequisites(input: IssuancePrerequisiteInput): GateResult {
  if (!input.authUidPresent) {
    return { allowed: false, code: "AUTH_REQUIRED", messageAr: "يجب تسجيل الدخول" };
  }
  if (input.actorIsStudent) {
    return {
      allowed: false,
      code: "STUDENT_FORBIDDEN",
      messageAr: "الطالب ممنوع من إصدار الوثائق الرسمية",
    };
  }
  if (!input.actorIsAssignedOrAdmin) {
    return {
      allowed: false,
      code: "ACTOR_NOT_ASSIGNED",
      messageAr: "غير مصرح — يجب أن تكون مسنداً أو Admin/System Admin",
    };
  }
  if (input.requestType !== ENROLLMENT_CERTIFICATE_DOCUMENT_TYPE) {
    return {
      allowed: false,
      code: "WRONG_REQUEST_TYPE",
      messageAr: "الإصدار مخصص لطلب شهادة القيد فقط",
    };
  }
  if (["cancelled", "rejected", "completed"].includes(input.requestStatus)) {
    return {
      allowed: false,
      code: "REQUEST_TERMINAL",
      messageAr: "لا يمكن إصدار وثيقة لطلب منتهٍ أو مرفوض أو ملغى",
    };
  }
  if (input.stepKey !== "document_issuance" || input.stepStatus !== "active") {
    return {
      allowed: false,
      code: "STEP_NOT_ACTIVE_ISSUANCE",
      messageAr: "خطوة الإصدار ليست النشطة",
    };
  }
  if (input.stepActionType !== "issue_document") {
    return {
      allowed: false,
      code: "ACTION_TYPE_MISMATCH",
      messageAr: "نوع الخطوة لا يطابق issue_document",
    };
  }
  if (!input.registrarSigned || !input.deanSigned) {
    return {
      allowed: false,
      code: "SIGNATURES_INCOMPLETE",
      messageAr: "توقيع المسجل والعميد مطلوبان قبل الإصدار",
    };
  }
  if (
    input.feePaymentStatus !== "not_required" &&
    input.feePaymentStatus !== "paid" &&
    input.feePaymentStatus !== "waived"
  ) {
    return {
      allowed: false,
      code: "FEE_NOT_SETTLED",
      messageAr: "تقييم الرسوم يجب أن يكون not_required أو paid أو waived",
    };
  }
  if (!input.snapshotComplete) {
    return {
      allowed: false,
      code: "SNAPSHOT_INCOMPLETE",
      messageAr: "اللقطة الأكاديمية غير مكتملة — لا يمكن الإصدار",
    };
  }
  if (input.existingActiveDocumentForRequest) {
    return {
      allowed: false,
      code: "DUPLICATE_DOCUMENT",
      messageAr: "توجد وثيقة فعّالة مرتبطة بهذا الطلب مسبقاً",
    };
  }
  if (!input.hasMatchingIssuedTransition) {
    return {
      allowed: false,
      code: "TRANSITION_MISSING",
      messageAr: "لا يوجد انتقال issued إلى الأرشفة",
    };
  }
  if (!input.pdfGenerationAvailable) {
    return {
      allowed: false,
      code: PDF_GENERATION_HOLD_CODE,
      messageAr: PDF_GENERATION_HOLD_MSG_AR,
    };
  }
  return { allowed: true };
}

export function evaluateArchivePrerequisites(input: ArchivePrerequisiteInput): GateResult {
  if (!input.authUidPresent) {
    return { allowed: false, code: "AUTH_REQUIRED", messageAr: "يجب تسجيل الدخول" };
  }
  if (input.actorIsStudent) {
    return {
      allowed: false,
      code: "STUDENT_FORBIDDEN",
      messageAr: "الطالب ممنوع من أرشفة الوثائق",
    };
  }
  if (!input.actorIsArchiveOfficerOrAdmin) {
    return {
      allowed: false,
      code: "ACTOR_NOT_ASSIGNED",
      messageAr: "غير مصرح — أرشفة للمسند أو Admin فقط",
    };
  }
  if (input.stepKey !== "archive" || input.stepStatus !== "active") {
    return {
      allowed: false,
      code: "STEP_NOT_ACTIVE_ARCHIVE",
      messageAr: "خطوة الأرشفة ليست النشطة",
    };
  }
  if (input.stepActionType !== "archive") {
    return {
      allowed: false,
      code: "ACTION_TYPE_MISMATCH",
      messageAr: "نوع الخطوة لا يطابق archive",
    };
  }
  if (input.linkedDocumentStatus == null) {
    return {
      allowed: false,
      code: "NO_LINKED_DOCUMENT",
      messageAr: "لا توجد وثيقة مرتبطة بالطلب",
    };
  }
  if (input.linkedDocumentStatus === "cancelled") {
    return {
      allowed: false,
      code: "DOCUMENT_CANCELLED",
      messageAr: "لا يمكن أرشفة وثيقة ملغاة",
    };
  }
  if (input.linkedDocumentStatus !== "issued" && input.linkedDocumentStatus !== "archived") {
    return {
      allowed: false,
      code: "DOCUMENT_NOT_ISSUED",
      messageAr: "الأرشفة تتطلب وثيقة صادرة",
    };
  }
  if (!input.linkedDocumentHasAccessibleFile) {
    return {
      allowed: false,
      code: "FILE_MISSING",
      messageAr: "الملف الفعلي للوثيقة غير موجود أو غير قابل للوصول داخلياً",
    };
  }
  if (!input.registrarSigned || !input.deanSigned) {
    return {
      allowed: false,
      code: "SIGNATURES_INCOMPLETE",
      messageAr: "التوقيعات يجب أن تكون مكتملة قبل الأرشفة",
    };
  }
  if (!input.hasMatchingArchivedTransition) {
    return {
      allowed: false,
      code: "TRANSITION_MISSING",
      messageAr: "لا يوجد انتقال archived",
    };
  }
  if (["cancelled", "rejected"].includes(input.requestStatus)) {
    return {
      allowed: false,
      code: "REQUEST_TERMINAL",
      messageAr: "لا يمكن أرشفة طلب مرفوض أو ملغى",
    };
  }
  return { allowed: true };
}

export function isSnapshotComplete(
  snapshot: Partial<Record<EnrollmentCertificateSnapshotField, unknown>>,
): boolean {
  return REQUIRED_ISSUANCE_SNAPSHOT_FIELDS.every((field) => {
    const value = snapshot[field];
    if (value == null) return false;
    if (typeof value === "string" && value.trim() === "") return false;
    return true;
  });
}

export function assertSingleActiveStep(statuses: readonly string[]): GateResult {
  const activeCount = statuses.filter((s) => s === "active").length;
  if (activeCount !== 1) {
    return {
      allowed: false,
      code: "ACTIVE_STEP_INVARIANT",
      messageAr: `يجب أن توجد خطوة نشطة واحدة فقط (وُجد ${activeCount})`,
    };
  }
  return { allowed: true };
}
