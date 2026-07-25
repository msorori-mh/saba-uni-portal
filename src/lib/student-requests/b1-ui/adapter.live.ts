/**
 * Live B1 UI adapter — wires frozen Backend RPC contracts via server functions.
 *
 * Wired (real contracts):
 * - getAvailableB1RequestTypes → get_available_request_types_for_current_student
 * - submitB1Request → submit_b1_student_request_atomic
 * - actOnB1RequestStep → act_on_b1_student_request_step_atomic
 * - confirmB1RevenueReceipt → record_external_university_payment_confirmation
 * - upload/remove attachments → secure attachment RPCs
 *
 * Fail-closed (no safe matching B1 UI read/draft contract yet):
 * - getB1RequestFormOptions, create/get/save draft, getB1RequestDetails,
 *   getAssignedB1Requests, getAssignedB1RequestDetails
 *
 * React components must not import Supabase; this adapter calls server fns only.
 */

import {
  B1AdapterError,
  type B1AssignedRequest,
  type B1AssignedRequestDetails,
  type B1AttachmentMeta,
  type B1AttachmentDownload,
  type B1CanonicalCode,
  type B1Draft,
  type B1FormOptions,
  type B1RequestDetails,
  type B1ServiceAvailability,
  type B1StaffAction,
  type B1StepActionResult,
  type B1SubmitResult,
  type B1UiAdapter,
} from "./adapter.types";
import {
  actOnB1UiRequestStepFn,
  authorizeB1UiAttachmentDownloadFn,
  confirmB1UiRevenueReceiptFn,
  getAvailableB1RequestTypesFn,
  listB1UiRequestAttachmentsFn,
  removeB1UiRequestAttachmentFn,
  submitB1UiRequestFn,
  uploadB1UiRequestAttachmentFn,
} from "./b1-ui.functions";
import {
  SECURE_ATTACHMENT_FIELD_KEYS,
  type SecureAttachmentFieldKey,
} from "@/lib/student-requests/secure-attachments-contract";

const UNSUPPORTED = [
  "getB1RequestFormOptions",
  "createB1RequestDraft",
  "getB1RequestDraft",
  "saveB1RequestDraft",
  "getB1RequestDetails",
  "getAssignedB1Requests",
  "getAssignedB1RequestDetails",
] as const;

export type LiveB1UiAdapterDeps = {
  getAvailableB1RequestTypes: () => Promise<readonly B1ServiceAvailability[]>;
  submitB1Request: (requestId: string, expectedUpdatedAt: string) => Promise<B1SubmitResult>;
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
  listAttachments?: (requestId: string) => Promise<unknown[]>;
  authorizeDownload?: (attachmentId: string) => Promise<B1AttachmentDownload>;
};

function pending(functionName: string): never {
  throw new B1AdapterError(
    "BACKEND_CONTRACT_PENDING",
    `Live B1 adapter: "${functionName}" has no safe matching Backend UI contract yet.`,
  );
}

function mapLiveError(
  error: unknown,
  fallbackCode: B1AdapterError["code"] = "NETWORK_ERROR",
): never {
  if (error instanceof B1AdapterError) throw error;
  const message = error instanceof Error ? error.message : String(error ?? "unknown");
  if (/B1_STALE_REQUEST_VERSION/i.test(message)) {
    throw new B1AdapterError("STALE_VERSION", message);
  }
  if (
    /SERVICE_ACTIVATION_BLOCKED|SECURE_ATTACHMENTS_RUNTIME_NOT_AVAILABLE|BLOCKED_PENDING/i.test(
      message,
    )
  ) {
    throw new B1AdapterError("ACTIVATION_BLOCKED", message);
  }
  if (
    /PERMISSION|AUTH|ASSIGNEE|ACCESS_DENIED|42501|B1_DIRECT_ASSIGNEE|B1_OWNED|B1_SPECIALIZED/i.test(
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
  if (/BACKEND_CONTRACT_PENDING/i.test(message)) {
    throw new B1AdapterError("BACKEND_CONTRACT_PENDING", message);
  }
  throw new B1AdapterError(fallbackCode, message);
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

function defaultDeps(): LiveB1UiAdapterDeps {
  return {
    async getAvailableB1RequestTypes() {
      return getAvailableB1RequestTypesFn();
    },
    async submitB1Request(requestId, expectedUpdatedAt) {
      return submitB1UiRequestFn({ data: { requestId, expectedUpdatedAt } });
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
    async listAttachments(requestId) {
      return listB1UiRequestAttachmentsFn({ data: { studentRequestId: requestId } });
    },
    async authorizeDownload(attachmentId) {
      return authorizeB1UiAttachmentDownloadFn({ data: { attachmentId } });
    },
  };
}

export function createLiveB1UiAdapter(overrides?: Partial<LiveB1UiAdapterDeps>): B1UiAdapter {
  const deps: LiveB1UiAdapterDeps = { ...defaultDeps(), ...overrides };

  return {
    async getAvailableB1RequestTypes(): Promise<readonly B1ServiceAvailability[]> {
      try {
        return await deps.getAvailableB1RequestTypes();
      } catch (error) {
        mapLiveError(error);
      }
    },

    async getB1RequestFormOptions(_serviceCode: B1CanonicalCode): Promise<B1FormOptions> {
      pending("getB1RequestFormOptions");
    },

    async createB1RequestDraft(_serviceCode: B1CanonicalCode): Promise<B1Draft> {
      pending("createB1RequestDraft");
    },

    async getB1RequestDraft(_requestId: string): Promise<B1Draft | null> {
      pending("getB1RequestDraft");
    },

    async saveB1RequestDraft(
      _requestId: string,
      _formData: Record<string, unknown>,
    ): Promise<B1Draft> {
      pending("saveB1RequestDraft");
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

    async submitB1Request(requestId: string, expectedUpdatedAt: string): Promise<B1SubmitResult> {
      try {
        return await deps.submitB1Request(requestId, expectedUpdatedAt);
      } catch (error) {
        mapLiveError(error);
      }
    },

    async getB1RequestDetails(_requestId: string): Promise<B1RequestDetails> {
      pending("getB1RequestDetails");
    },

    async getAssignedB1Requests(): Promise<readonly B1AssignedRequest[]> {
      pending("getAssignedB1Requests");
    },

    async getAssignedB1RequestDetails(_requestId: string): Promise<B1AssignedRequestDetails> {
      pending("getAssignedB1RequestDetails");
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

/** Methods that remain intentionally fail-closed in this bridge. */
export const LIVE_B1_UI_UNSUPPORTED_METHODS: readonly string[] = UNSUPPORTED;
