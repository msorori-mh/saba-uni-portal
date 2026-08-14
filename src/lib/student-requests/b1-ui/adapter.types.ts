/**
 * B1 Five-Services UI Adapter — contract types (frozen).
 *
 * This file is the single integration seam between the B1 student/staff UI
 * and the backend. React components must never import Supabase directly;
 * every read/write goes through `B1UiAdapter`. Cursor's backend contracts
 * will replace the mock/live implementations without touching the forms.
 *
 * Contract functions (see `B1UiAdapter`):
 * - getAvailableB1RequestTypes()
 * - getB1RequestFormOptions(serviceCode)
 * - createB1RequestDraft(serviceCode)
 * - getB1RequestDraft(requestId)
 * - saveB1RequestDraft(requestId, formData, expectedUpdatedAt)
 * - uploadB1RequestAttachment(requestId, attachmentType, file)
 * - removeB1RequestAttachment(requestId, attachmentId)
 * - downloadB1RequestAttachment(attachmentId)
 * - submitB1Request(requestId, expectedUpdatedAt)
 * - listB1StudentRequests()
 * - getB1RequestDetails(requestId)
 * - getAssignedB1Requests()
 * - getAssignedB1RequestDetails(requestId)
 * - actOnB1RequestStep(stepId, action, comment?)
 * - confirmB1RevenueReceipt(stepId, optionalNote?)
 * - getB1RuntimeCapability()
 */

import { b1BusinessRuleMessageAr } from "@/lib/student-requests/b1-ui/b1-business-error-mapping";
import type {
  B1CanonicalCode,
  B1FeePolicy,
  B1WorkflowStep,
} from "@/lib/student-requests/request-service-adapter";

export type { B1CanonicalCode, B1FeePolicy, B1WorkflowStep };

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const B1_ADAPTER_ERROR_CODES = [
  "NETWORK_ERROR",
  "UNEXPECTED_ERROR",
  "PERMISSION_DENIED",
  "STALE_VERSION",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "ACTIVATION_BLOCKED",
  "ELIGIBILITY_BLOCKED",
  "BUSINESS_RULE_BLOCKED",
  "BACKEND_CONTRACT_PENDING",
] as const;

export type B1AdapterErrorCode = (typeof B1_ADAPTER_ERROR_CODES)[number];

export class B1AdapterError extends Error {
  readonly code: B1AdapterErrorCode;
  readonly fieldErrors?: Record<string, string>;

  constructor(code: B1AdapterErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "B1AdapterError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isB1AdapterError(error: unknown): error is B1AdapterError {
  return error instanceof B1AdapterError;
}

/** Maps an adapter error code to a safe Arabic message (never raw SQL/servers strings). */
export function b1AdapterErrorMessageAr(error: unknown): string {
  if (isB1AdapterError(error)) {
    switch (error.code) {
      case "NETWORK_ERROR":
        return "تعذر الاتصال بالخادم. تحقق من الاتصال ثم أعد المحاولة.";
      case "UNEXPECTED_ERROR":
        return "تعذر إتمام العملية بسبب خطأ داخلي في الصفحة. أعد تحميل الصفحة ثم حاول مرة أخرى.";
      case "PERMISSION_DENIED":
        return "لا تملك صلاحية تنفيذ هذا الإجراء على هذا الطلب.";
      case "STALE_VERSION":
        return "تغيّرت حالة الطلب منذ آخر تحميل. أعد تحميل الصفحة قبل المتابعة.";
      case "VALIDATION_ERROR":
        // Backend business rejections carry a precise meaning; keep it visible.
        if (/B1_TRANSFER_INPUT_INVALID/i.test(error.message)) {
          return "لا يمكن التحويل إلى القسم الحالي. اختر قسماً مختلفاً.";
        }
        return "بعض الحقول غير مكتملة أو غير صحيحة. راجع الحقول المحددة.";
      case "NOT_FOUND":
        return "تعذر العثور على الطلب المطلوب.";
      case "ACTIVATION_BLOCKED":
        return "هذه الخدمة غير مفعّلة حالياً.";
      case "ELIGIBILITY_BLOCKED":
        return error.message || "لا تستوفي حالياً شروط تقديم هذه الخدمة.";
      case "BUSINESS_RULE_BLOCKED":
        return b1BusinessRuleMessageAr(error.message);
      case "BACKEND_CONTRACT_PENDING":
        return "هذه العملية بانتظار اكتمال الربط الخلفي.";
    }
  }
  return "حدث خطأ غير متوقع. أعد المحاولة لاحقاً.";
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export type B1ReferenceOption = { value: string; labelAr: string };

export type B1ServiceAvailability = {
  code: B1CanonicalCode;
  titleAr: string;
  descriptionAr: string;
  feePolicy: B1FeePolicy;
  /** Backend-driven visibility/activation flags — UI must respect them. */
  studentVisible: boolean;
  runtimeAvailable: boolean;
  activationBlockedReason?: string;
};

export type B1FormOptions = {
  serviceCode: B1CanonicalCode;
  academicYears: readonly B1ReferenceOption[];
  semestersByYear: Readonly<Record<string, readonly B1ReferenceOption[]>>;
  currentEnrollments: readonly B1ReferenceOption[];
  availableDepartments: readonly B1ReferenceOption[];
  programsByDepartment: Readonly<Record<string, readonly B1ReferenceOption[]>>;
  /** Read-only context shown to the student (never editable client-side). */
  currentDepartmentLabelAr?: string;
  currentProgramLabelAr?: string;
  /** Final-chance eligibility, decided server-side only. */
  finalChanceEligibility?: { eligible: boolean; reasonAr?: string };
  excuseReasonTypes: readonly B1ReferenceOption[];
};

export type B1Draft = {
  requestId: string;
  serviceCode: B1CanonicalCode;
  formData: Record<string, unknown>;
  attachments: readonly B1AttachmentMeta[];
  status: "draft";
  updatedAt: string;
};

export type B1AttachmentMeta = {
  attachmentId: string;
  attachmentType: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  status: "uploading" | "attached" | "failed";
  /** Never a public URL — opaque server-side reference only. */
  storageRef: string;
};

/** Short-lived authorized download. Storage coordinates never cross the server boundary. */
export type B1AttachmentDownload = {
  url: string;
  expiresInSeconds: number;
  filename?: string;
  mimeType?: string;
};

export type B1WorkflowStepView = B1WorkflowStep & {
  labelAr: string;
  status: "completed" | "active" | "pending" | "returned" | "rejected";
  actedAt?: string;
  commentAr?: string;
};

export type B1StudentVisibleMessage = { at: string; fromLabelAr: string; bodyAr: string };

export type B1RequestDetails = {
  requestId: string;
  requestNumber: string;
  serviceCode: B1CanonicalCode;
  serviceTitleAr: string;
  status:
    | "draft"
    | "submitted"
    | "in_review"
    | "waiting_payment_confirmation"
    | "returned"
    | "completed"
    | "rejected";
  formData: Record<string, unknown>;
  attachments: readonly B1AttachmentMeta[];
  steps: readonly B1WorkflowStepView[];
  studentVisibleMessages: readonly B1StudentVisibleMessage[];
  updatedAt: string;
};

export type B1SubmitResult = {
  requestId: string;
  requestNumber: string;
  submittedAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Staff side
// ---------------------------------------------------------------------------

export type B1StaffAction =
  | "approve"
  | "review"
  | "apply_decision"
  | "clear"
  | "archive"
  | "return"
  | "reject"
  | "confirm_payment";

export const B1_STAFF_ACTIONS_REQUIRING_COMMENT: readonly B1StaffAction[] = ["return", "reject"];

export type B1StudentListItem = {
  requestId: string;
  requestNumber: string;
  serviceCode: B1CanonicalCode;
  serviceTitleAr: string;
  status: string;
  submittedAt: string | null;
  updatedAt: string;
};

export type B1RuntimeCapability = {
  available: boolean;
  services: readonly B1CanonicalCode[];
  reads: readonly string[];
  writesAvailable: readonly string[];
  writesFailClosed: readonly string[];
  draftMutationsContract: string | null;
};

export type B1AssignedRequest = {
  requestId: string;
  stepId: string;
  requestNumber: string;
  serviceCode: B1CanonicalCode;
  serviceTitleAr: string;
  studentNameAr: string;
  studentNumber: string;
  stepKey: string;
  stepLabelAr: string;
  /** Null when assigned but authoritative action guard denies every primary action. */
  allowedAction: B1StaffAction | null;
  submittedAt: string;
};

export type B1AssignedRequestDetails = B1AssignedRequest & {
  formDataSummary: readonly { labelAr: string; valueAr: string }[];
  attachments: readonly B1AttachmentMeta[];
  steps: readonly B1WorkflowStepView[];
  updatedAt: string;
};

export type B1StepActionResult = {
  accepted: true;
  stepId: string;
  requestId?: string;
  action: B1StaffAction;
};

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export type B1UiAdapter = {
  getB1RuntimeCapability(): Promise<B1RuntimeCapability>;
  getAvailableB1RequestTypes(): Promise<readonly B1ServiceAvailability[]>;
  getB1RequestFormOptions(serviceCode: B1CanonicalCode): Promise<B1FormOptions>;
  createB1RequestDraft(serviceCode: B1CanonicalCode): Promise<B1Draft>;
  getB1RequestDraft(requestId: string): Promise<B1Draft | null>;
  saveB1RequestDraft(
    requestId: string,
    formData: Record<string, unknown>,
    expectedUpdatedAt: string,
  ): Promise<B1Draft>;
  uploadB1RequestAttachment(
    requestId: string,
    attachmentType: string,
    file: File,
  ): Promise<B1AttachmentMeta>;
  removeB1RequestAttachment(requestId: string, attachmentId: string): Promise<void>;
  /** Browser sends attachmentId only; server authorizes then signs. */
  downloadB1RequestAttachment(attachmentId: string): Promise<B1AttachmentDownload>;
  submitB1Request(
    requestId: string,
    expectedUpdatedAt: string,
    stepUpProof?: string | null,
  ): Promise<B1SubmitResult>;
  listB1StudentRequests(): Promise<readonly B1StudentListItem[]>;
  getB1RequestDetails(requestId: string): Promise<B1RequestDetails>;
  getAssignedB1Requests(): Promise<readonly B1AssignedRequest[]>;
  getAssignedB1RequestDetails(requestId: string): Promise<B1AssignedRequestDetails>;
  actOnB1RequestStep(
    stepId: string,
    action: B1StaffAction,
    comment?: string,
  ): Promise<B1StepActionResult>;
  /** Simplified revenue receipt: no amount/currency/invoice — server stamps actor/time. */
  confirmB1RevenueReceipt(stepId: string, optionalNote?: string): Promise<B1StepActionResult>;
};
