import type { B1CanonicalCode, B1SecureDraft } from "./contracts";
import {
  B1_SECURE_DRAFT_UPDATING_MSG,
  assertNoStorageCoordinates,
  normalizeDraftDto,
} from "./contracts";

export class B1SecureDraftRpcError extends Error {
  readonly code: string;
  readonly unavailable: boolean;
  constructor(message: string, code = "", unavailable = false) {
    super(message);
    this.name = "B1SecureDraftRpcError";
    this.code = code;
    this.unavailable = unavailable;
  }
}

export function isB1SecureDraftRpcUnavailable(
  error: { message?: string } | null | undefined,
): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  return (
    msg.includes("could not find the function") ||
    msg.includes("schema cache") ||
    msg.includes("pgrst202") ||
    msg.includes("does not exist")
  );
}

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};

function mapRpcError(error: { message: string; code?: string }): never {
  if (isB1SecureDraftRpcUnavailable(error)) {
    throw new B1SecureDraftRpcError(B1_SECURE_DRAFT_UPDATING_MSG, error.code ?? "", true);
  }
  const msg = error.message;
  if (msg.includes("B1_DRAFT_ACCESS_DENIED")) {
    throw new B1SecureDraftRpcError("B1_DRAFT_ACCESS_DENIED", "B1_DRAFT_ACCESS_DENIED");
  }
  if (msg.includes("B1_STALE_REQUEST_VERSION")) {
    throw new B1SecureDraftRpcError("B1_STALE_REQUEST_VERSION", "B1_STALE_REQUEST_VERSION");
  }
  if (msg.includes("B1_IDEMPOTENCY_PAYLOAD_MISMATCH")) {
    throw new B1SecureDraftRpcError(
      "B1_IDEMPOTENCY_PAYLOAD_MISMATCH",
      "B1_IDEMPOTENCY_PAYLOAD_MISMATCH",
    );
  }
  if (msg.includes("B1_UNEXPECTED_FORM_FIELD")) {
    throw new B1SecureDraftRpcError("B1_UNEXPECTED_FORM_FIELD", "B1_UNEXPECTED_FORM_FIELD");
  }
  throw new B1SecureDraftRpcError(B1_SECURE_DRAFT_UPDATING_MSG, error.code ?? "");
}

export class B1SecureDraftRpcClient {
  constructor(private readonly supabase: RpcClient) {}

  async createDraft(
    serviceCode: B1CanonicalCode,
    idempotencyKey?: string | null,
  ): Promise<B1SecureDraft> {
    const { data, error } = await this.supabase.rpc("create_b1_request_draft_for_student", {
      p_canonical_code: serviceCode,
      p_idempotency_key: idempotencyKey ?? null,
    });
    if (error) mapRpcError(error);
    assertNoStorageCoordinates(data);
    return normalizeDraftDto(data as Record<string, unknown>);
  }

  async saveDraft(input: {
    requestId: string;
    formData: Record<string, unknown>;
    expectedUpdatedAt: string;
    idempotencyKey?: string | null;
  }): Promise<B1SecureDraft> {
    const { data, error } = await this.supabase.rpc("save_b1_request_draft_for_student", {
      p_request_id: input.requestId,
      p_form_data: input.formData,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_idempotency_key: input.idempotencyKey ?? null,
    });
    if (error) mapRpcError(error);
    assertNoStorageCoordinates(data);
    return normalizeDraftDto(data as Record<string, unknown>);
  }
}
