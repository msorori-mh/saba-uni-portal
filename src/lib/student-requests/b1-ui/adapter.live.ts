/**
 * Live B1 UI adapter — placeholder shell for the Cursor backend wiring.
 *
 * Every function currently throws BACKEND_CONTRACT_PENDING: no function here
 * has a safe server counterpart that can be called without importing
 * supabase-js or TanStack server functions from client code (both forbidden
 * at this layer). The mock adapter is the only working implementation until
 * Cursor lands the real contracts; this file defines the swap shape only.
 */

import {
  B1AdapterError,
  type B1AssignedRequest,
  type B1AssignedRequestDetails,
  type B1AttachmentMeta,
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

function pending(functionName: string): never {
  throw new B1AdapterError(
    "BACKEND_CONTRACT_PENDING",
    `Live B1 adapter: "${functionName}" awaits the Cursor backend contract wiring.`,
  );
}

export function createLiveB1UiAdapter(): B1UiAdapter {
  return {
    async getAvailableB1RequestTypes(): Promise<readonly B1ServiceAvailability[]> {
      pending("getAvailableB1RequestTypes");
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
      _requestId: string,
      _attachmentType: string,
      _file: File,
    ): Promise<B1AttachmentMeta> {
      pending("uploadB1RequestAttachment");
    },
    async removeB1RequestAttachment(_requestId: string, _attachmentId: string): Promise<void> {
      pending("removeB1RequestAttachment");
    },
    async submitB1Request(_requestId: string, _expectedUpdatedAt: string): Promise<B1SubmitResult> {
      pending("submitB1Request");
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
      _stepId: string,
      _action: B1StaffAction,
      _comment?: string,
    ): Promise<B1StepActionResult> {
      pending("actOnB1RequestStep");
    },
    async confirmB1RevenueReceipt(
      _stepId: string,
      _optionalNote?: string,
    ): Promise<B1StepActionResult> {
      pending("confirmB1RevenueReceipt");
    },
  };
}
