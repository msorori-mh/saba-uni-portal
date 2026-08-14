/**
 * Live B1 UI adapter — wires final Secure Read + Secure Draft contracts.
 *
 * React components must not import Supabase; this adapter calls server fns only.
 * runtimeAvailable is never hardcoded true — derived from capability readiness.
 */

import {
  B1AdapterError,
  type B1AssignedRequest,
  type B1AssignedRequestDetails,
  type B1AttachmentDownload,
  type B1AttachmentMeta,
  type B1CanonicalCode,
  type B1Draft,
  type B1FormOptions,
  type B1RequestDetails,
  type B1RuntimeCapability,
  type B1ServiceAvailability,
  type B1StaffAction,
  type B1StepActionResult,
  type B1StudentListItem,
  type B1SubmitResult,
  type B1UiAdapter,
} from "./adapter.types";
import {
  actOnB1UiRequestStepFn,
  authorizeB1UiAttachmentDownloadFn,
  confirmB1UiRevenueReceiptFn,
  getAvailableB1RequestTypesFn,
  removeB1UiRequestAttachmentFn,
  submitB1UiRequestFn,
  uploadB1UiRequestAttachmentFn,
} from "./b1-ui.functions";
import { isB1BusinessRuleError } from "./b1-business-error-mapping";
import { mapBackendRowsToB1Availability } from "./availability";
import {
  SECURE_ATTACHMENT_FIELD_KEYS,
  type SecureAttachmentFieldKey,
} from "@/lib/student-requests/secure-attachments-contract";
import {
  getB1SecureAssignedInbox,
  getB1SecureAssignedRequestDetails,
  getB1SecureDraft,
  getB1SecureFormOptions,
  getB1SecureStudentRequestDetails,
  listB1SecureStudentRequests,
  probeB1SecureReadCapability,
} from "@/lib/student-requests/b1-secure-read/functions";
import { createB1Draft, saveB1Draft } from "@/lib/student-requests/b1-secure-draft/functions";
import { B1SecureReadRpcError } from "@/lib/student-requests/b1-secure-read/rpc";
import { B1SecureDraftRpcError } from "@/lib/student-requests/b1-secure-draft/rpc";

export type LiveB1UiAdapterDeps = {
  getCapability: () => Promise<B1RuntimeCapability>;
  getAvailableRows: () => Promise<readonly { code: string }[]>;
  getFormOptions: (serviceCode: B1CanonicalCode) => Promise<B1FormOptions>;
  createDraft: (serviceCode: B1CanonicalCode) => Promise<B1Draft>;
  getDraft: (requestId: string) => Promise<B1Draft | null>;
  saveDraft: (
    requestId: string,
    formData: Record<string, unknown>,
    expectedUpdatedAt: string,
  ) => Promise<B1Draft>;
  listStudentRequests: () => Promise<readonly B1StudentListItem[]>;
  getStudentDetails: (requestId: string) => Promise<B1RequestDetails>;
  getAssignedInbox: () => Promise<readonly B1AssignedRequest[]>;
  getAssignedDetails: (requestId: string) => Promise<B1AssignedRequestDetails>;
  submitB1Request: (
    requestId: string,
    expectedUpdatedAt: string,
    stepUpProof?: string | null,
  ) => Promise<B1SubmitResult>;
  actOnB1RequestStep: (
    stepId: string,
    action: Exclude<B1StaffAction, "confirm_payment">,
    comment?: string,
  ) => Promise<B1StepActionResult>;
  confirmB1RevenueReceipt: (stepId: string, optionalNote?: string) => Promise<B1StepActionResult>;
  uploadB1RequestAttachment: (
    requestId: string,
    attachmentType: string,
    file: File,
  ) => Promise<B1AttachmentMeta>;
  removeB1RequestAttachment: (requestId: string, attachmentId: string) => Promise<void>;
  downloadAttachment: (attachmentId: string) => Promise<B1AttachmentDownload>;
};

/**
 * Backend domain guards reject a draft when the student does not meet the
 * service preconditions. These are NOT "service disabled" cases, so they must
 * surface a precise Arabic reason instead of the activation message.
 */
const B1_ELIGIBILITY_GUARDS: ReadonlyArray<{ test: RegExp; messageAr: string }> = [
  {
    test: /suspension request: student is not currently active/i,
    messageAr: "لا يمكن تقديم طلب وقف القيد لأن قيدك غير نشط حالياً.",
  },
  {
    test: /transfer request: student is currently suspended/i,
    messageAr: "لا يمكن تقديم طلب التحويل أثناء وقف القيد.",
  },
  {
    test: /reinstatement request: student is not currently suspended/i,
    messageAr: "لا يمكن تقديم طلب إعادة القيد لأن قيدك غير موقوف حالياً.",
  },
  {
    test: /student profile is not active|B1_STUDENT_PROFILE_NOT_ACTIVE/i,
    messageAr: "ملفك الطلابي غير نشط حالياً، لذا لا يمكن تقديم هذا الطلب.",
  },
];

function eligibilityMessageAr(message: string): string | null {
  return B1_ELIGIBILITY_GUARDS.find((g) => g.test.test(message))?.messageAr ?? null;
}

/**
 * Only a genuine transport failure may surface as "تعذر الاتصال بالخادم".
 * Local/synchronous client faults must stay distinguishable from network loss.
 */
const NETWORK_FAILURE_PATTERN =
  /failed to fetch|networkerror|fetch failed|load failed|err_network|err_internet_disconnected|connection (refused|reset)|aborted/i;

function classifyFallback(message: string, fallbackCode: B1AdapterError["code"]): B1AdapterError["code"] {
  if (fallbackCode !== "UNEXPECTED_ERROR") return fallbackCode;
  return NETWORK_FAILURE_PATTERN.test(message) ? "NETWORK_ERROR" : "UNEXPECTED_ERROR";
}

function mapLiveError(
  error: unknown,
  fallbackCode: B1AdapterError["code"] = "UNEXPECTED_ERROR",
): never {
  if (error instanceof B1AdapterError) throw error;
  if (error instanceof B1SecureReadRpcError || error instanceof B1SecureDraftRpcError) {
    if (error.unavailable) {
      throw new B1AdapterError("ACTIVATION_BLOCKED", error.message);
    }
    const message = error.message;
    const eligibilityAr = eligibilityMessageAr(message);
    if (eligibilityAr) {
      throw new B1AdapterError("ELIGIBILITY_BLOCKED", eligibilityAr);
    }
    if (/B1_STALE_REQUEST_VERSION/i.test(message) || error.code === "40001") {
      throw new B1AdapterError("STALE_VERSION", message);
    }
    if (isB1BusinessRuleError(message)) {
      throw new B1AdapterError("BUSINESS_RULE_BLOCKED", message);
    }
    if (/B1_READ_ACCESS_DENIED|B1_DRAFT_ACCESS_DENIED|42501|PERMISSION/i.test(message)) {
      throw new B1AdapterError("PERMISSION_DENIED", message);
    }
    if (message.startsWith("B1_INPUT_VALIDATION_FAILED")) {
      const [, field, reason] = message.split(":");
      throw new B1AdapterError(
        "VALIDATION_ERROR",
        message,
        field ? { [field]: reason || "invalid" } : undefined,
      );
    }
    if (/B1_DRAFT_FIELD_TYPE_INVALID|B1_[A-Z_]*INPUT_INVALID/i.test(message)) {
      throw new B1AdapterError("VALIDATION_ERROR", message);
    }
    if (/NOT_FOUND|P0002/i.test(message)) {
      throw new B1AdapterError("NOT_FOUND", message);
    }

    if (/INVALID|VALIDATION|UNEXPECTED_FORM|INPUT_INVALID|IDEMPOTENCY/i.test(message)) {
      throw new B1AdapterError("VALIDATION_ERROR", message);
    }
    throw new B1AdapterError(classifyFallback(message, fallbackCode), message);
  }
  const message = error instanceof Error ? error.message : String(error ?? "unknown");
  const eligibilityArFallback = eligibilityMessageAr(message);
  if (eligibilityArFallback) {
    throw new B1AdapterError("ELIGIBILITY_BLOCKED", eligibilityArFallback);
  }
  if (/B1_STALE_REQUEST_VERSION/i.test(message)) {
    throw new B1AdapterError("STALE_VERSION", message);
  }
  if (
    /SERVICE_ACTIVATION_BLOCKED|SECURE_ATTACHMENTS_RUNTIME_NOT_AVAILABLE|BLOCKED_PENDING|قيد التحديث/i.test(
      message,
    )
  ) {
    throw new B1AdapterError("ACTIVATION_BLOCKED", message);
  }
  // Business precondition rejections are classified BEFORE authorization so a
  // backend rule failure is never rendered as "permission denied".
  if (isB1BusinessRuleError(message)) {
    throw new B1AdapterError("BUSINESS_RULE_BLOCKED", message);
  }
  if (
    /PERMISSION|AUTH|ASSIGNEE|ACCESS_DENIED|42501|B1_DIRECT_ASSIGNEE|B1_OWNED|B1_SPECIALIZED|B1_DRAFT_ACCESS/i.test(
      message,
    )
  ) {
    throw new B1AdapterError("PERMISSION_DENIED", message);
  }
  if (/NOT_FOUND|B1_ACTIVE_STEP_REQUIRED|PAYMENT_CONFIRMATION_STEP_NOT_FOUND/i.test(message)) {
    throw new B1AdapterError("NOT_FOUND", message);
  }
  if (/INVALID|VALIDATION|COMMENT_REQUIRED|ATTACHMENT_|B1_.*INPUT|UNEXPECTED_FORM/i.test(message)) {
    throw new B1AdapterError("VALIDATION_ERROR", message);
  }
  throw new B1AdapterError(classifyFallback(message, fallbackCode), message);
}

async function fileToBase64(file: File): Promise<string> {
  if (
    typeof Buffer !== "undefined" &&
    typeof (file as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === "function"
  ) {
    const buf = Buffer.from(await file.arrayBuffer());
    return buf.toString("base64");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("NETWORK_ERROR"));
    reader.readAsDataURL(file);
  });
}

function asSecureFieldKey(attachmentType: string): SecureAttachmentFieldKey {
  if ((SECURE_ATTACHMENT_FIELD_KEYS as readonly string[]).includes(attachmentType)) {
    return attachmentType as SecureAttachmentFieldKey;
  }
  throw new B1AdapterError("VALIDATION_ERROR", "ATTACHMENT_FIELD_NOT_ALLOWED", {
    attachmentType: "field_not_allowed",
  });
}

function mapCapability(raw: {
  available: boolean;
  services: readonly B1CanonicalCode[];
  reads: readonly string[];
  writes_available?: readonly string[];
  writes_fail_closed: readonly string[];
  draft_mutations_contract?: string | null;
}): B1RuntimeCapability {
  return {
    available: raw.available === true,
    services: raw.services,
    reads: raw.reads,
    writesAvailable: [...(raw.writes_available ?? [])],
    writesFailClosed: [...raw.writes_fail_closed],
    draftMutationsContract: raw.draft_mutations_contract ?? null,
  };
}

function defaultDeps(): LiveB1UiAdapterDeps {
  return {
    async getCapability() {
      try {
        const cap = await probeB1SecureReadCapability({ data: {} });
        return mapCapability(cap);
      } catch (error) {
        if (error instanceof B1SecureReadRpcError && error.unavailable) {
          return {
            available: false,
            services: [],
            reads: [],
            writesAvailable: [],
            writesFailClosed: ["create_draft", "save_draft"],
            draftMutationsContract: null,
          };
        }
        mapLiveError(error, "ACTIVATION_BLOCKED");
      }
    },
    async getAvailableRows() {
      // Session-scoped via existing server fn path used by live availability.
      return getAvailableB1RequestTypesFn().then((items) =>
        items.filter((i) => i.studentVisible).map((i) => ({ code: i.code })),
      );
    },
    async getFormOptions(serviceCode) {
      return (await getB1SecureFormOptions({
        data: { serviceCode },
      })) as B1FormOptions;
    },
    async createDraft(serviceCode) {
      return (await createB1Draft({
        data: { serviceCode, idempotencyKey: null },
      })) as B1Draft;
    },
    async getDraft(requestId) {
      try {
        return (await getB1SecureDraft({ data: { requestId } })) as B1Draft;
      } catch (error) {
        if (error instanceof B1SecureReadRpcError && /NOT_FOUND|لا تملك/i.test(error.message)) {
          return null;
        }
        throw error;
      }
    },
    async saveDraft(requestId, formData, expectedUpdatedAt) {
      if (!expectedUpdatedAt) {
        throw new B1AdapterError("STALE_VERSION", "B1_STALE_REQUEST_VERSION");
      }
      return (await saveB1Draft({
        data: { requestId, formData, expectedUpdatedAt, idempotencyKey: null },
      })) as B1Draft;
    },
    async listStudentRequests() {
      return (await listB1SecureStudentRequests({
        data: { limit: 50, offset: 0 },
      })) as B1StudentListItem[];
    },
    async getStudentDetails(requestId) {
      return (await getB1SecureStudentRequestDetails({
        data: { requestId },
      })) as B1RequestDetails;
    },
    async getAssignedInbox() {
      return (await getB1SecureAssignedInbox({
        data: { limit: 50, offset: 0 },
      })) as B1AssignedRequest[];
    },
    async getAssignedDetails(requestId) {
      return (await getB1SecureAssignedRequestDetails({
        data: { requestId },
      })) as B1AssignedRequestDetails;
    },
    async submitB1Request(requestId, expectedUpdatedAt, stepUpProof) {
      return submitB1UiRequestFn({
        data: { requestId, expectedUpdatedAt, stepUpProof: stepUpProof ?? null },
      });
    },
    async actOnB1RequestStep(stepId, action, comment) {
      return actOnB1UiRequestStepFn({ data: { stepId, action, comment: comment ?? null } });
    },
    async confirmB1RevenueReceipt(stepId, optionalNote) {
      return confirmB1UiRevenueReceiptFn({
        data: { stepId, note: optionalNote ?? null },
      });
    },
    async uploadB1RequestAttachment(requestId, attachmentType, file) {
      const fieldKey = asSecureFieldKey(attachmentType);
      const fileBase64 = await fileToBase64(file);
      return uploadB1UiRequestAttachmentFn({
        data: {
          studentRequestId: requestId,
          fieldKey,
          originalFileName: file.name,
          mimeType: file.type as "application/pdf" | "image/jpeg" | "image/png",
          sizeBytes: file.size,
          fileBase64,
        },
      });
    },
    async removeB1RequestAttachment(_requestId, attachmentId) {
      await removeB1UiRequestAttachmentFn({ data: { attachmentId } });
    },
    async downloadAttachment(attachmentId) {
      return authorizeB1UiAttachmentDownloadFn({ data: { attachmentId } });
    },
  };
}

export function createLiveB1UiAdapter(overrides?: Partial<LiveB1UiAdapterDeps>): B1UiAdapter {
  const deps: LiveB1UiAdapterDeps = { ...defaultDeps(), ...overrides };

  return {
    async getB1RuntimeCapability(): Promise<B1RuntimeCapability> {
      try {
        return await deps.getCapability();
      } catch (error) {
        mapLiveError(error, "ACTIVATION_BLOCKED");
      }
    },

    async getAvailableB1RequestTypes(): Promise<readonly B1ServiceAvailability[]> {
      try {
        const [capability, availability] = await Promise.all([
          deps.getCapability(),
          deps.getAvailableRows().catch(() => []),
        ]);
        // Re-map with capability so runtimeAvailable is never hardcoded true.
        return mapBackendRowsToB1Availability(availability, capability);
      } catch (error) {
        mapLiveError(error);
      }
    },

    async getB1RequestFormOptions(serviceCode: B1CanonicalCode): Promise<B1FormOptions> {
      try {
        return await deps.getFormOptions(serviceCode);
      } catch (error) {
        mapLiveError(error);
      }
    },

    async createB1RequestDraft(serviceCode: B1CanonicalCode): Promise<B1Draft> {
      try {
        return await deps.createDraft(serviceCode);
      } catch (error) {
        mapLiveError(error);
      }
    },

    async getB1RequestDraft(requestId: string): Promise<B1Draft | null> {
      try {
        return await deps.getDraft(requestId);
      } catch (error) {
        mapLiveError(error);
      }
    },

    async saveB1RequestDraft(
      requestId: string,
      formData: Record<string, unknown>,
      expectedUpdatedAt: string,
    ): Promise<B1Draft> {
      try {
        return await deps.saveDraft(requestId, formData, expectedUpdatedAt);
      } catch (error) {
        mapLiveError(error);
      }
    },

    async uploadB1RequestAttachment(
      requestId: string,
      attachmentType: string,
      file: File,
    ): Promise<B1AttachmentMeta> {
      try {
        return await deps.uploadB1RequestAttachment(requestId, attachmentType, file);
      } catch (error) {
        mapLiveError(error, "VALIDATION_ERROR");
      }
    },

    async removeB1RequestAttachment(requestId: string, attachmentId: string): Promise<void> {
      try {
        await deps.removeB1RequestAttachment(requestId, attachmentId);
      } catch (error) {
        mapLiveError(error, "VALIDATION_ERROR");
      }
    },

    async downloadB1RequestAttachment(attachmentId: string): Promise<B1AttachmentDownload> {
      try {
        return await deps.downloadAttachment(attachmentId);
      } catch (error) {
        mapLiveError(error, "PERMISSION_DENIED");
      }
    },

    async submitB1Request(
      requestId: string,
      expectedUpdatedAt: string,
      stepUpProof?: string | null,
    ): Promise<B1SubmitResult> {
      try {
        return await deps.submitB1Request(requestId, expectedUpdatedAt, stepUpProof ?? null);
      } catch (error) {
        mapLiveError(error);
      }
    },

    async listB1StudentRequests(): Promise<readonly B1StudentListItem[]> {
      try {
        return await deps.listStudentRequests();
      } catch (error) {
        mapLiveError(error);
      }
    },

    async getB1RequestDetails(requestId: string): Promise<B1RequestDetails> {
      try {
        return await deps.getStudentDetails(requestId);
      } catch (error) {
        mapLiveError(error);
      }
    },

    async getAssignedB1Requests(): Promise<readonly B1AssignedRequest[]> {
      try {
        return await deps.getAssignedInbox();
      } catch (error) {
        mapLiveError(error);
      }
    },

    async getAssignedB1RequestDetails(requestId: string): Promise<B1AssignedRequestDetails> {
      try {
        return await deps.getAssignedDetails(requestId);
      } catch (error) {
        mapLiveError(error);
      }
    },

    async actOnB1RequestStep(
      stepId: string,
      action: B1StaffAction,
      comment?: string,
    ): Promise<B1StepActionResult> {
      if (action === "confirm_payment") {
        throw new B1AdapterError(
          "PERMISSION_DENIED",
          "B1_SPECIALIZED_ACTION_RPC_REQUIRED: use confirmB1RevenueReceipt(stepId, note?) only.",
        );
      }
      try {
        return await deps.actOnB1RequestStep(stepId, action, comment);
      } catch (error) {
        mapLiveError(error, "PERMISSION_DENIED");
      }
    },

    async confirmB1RevenueReceipt(
      stepId: string,
      optionalNote?: string,
    ): Promise<B1StepActionResult> {
      try {
        return await deps.confirmB1RevenueReceipt(stepId, optionalNote);
      } catch (error) {
        mapLiveError(error, "PERMISSION_DENIED");
      }
    },
  };
}

/** No remaining intentional fail-closed adapter methods after final contract wiring. */
export const LIVE_B1_UI_UNSUPPORTED_METHODS: readonly string[] = [];
