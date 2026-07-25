import {
  B1_READ_ACCESS_DENIED,
  B1_SECURE_READ_UPDATING_MSG,
  assertNoStorageCoordinates,
  isB1CanonicalCode,
  normalizeAttachmentMeta,
  type B1CanonicalCode,
  type B1SecureAssignedRequest,
  type B1SecureAssignedRequestDetails,
  type B1SecureDraft,
  type B1SecureFormOptions,
  type B1SecureReadCapability,
  type B1SecureRequestDetails,
  type B1SecureStaffAction,
  type B1SecureStepActions,
  type B1SecureStudentListItem,
} from "./contracts";

type RpcErrorLike = { message?: string; code?: string };
type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcErrorLike | null }>;
};

export class B1SecureReadRpcError extends Error {
  readonly code: string;
  readonly unavailable: boolean;
  constructor(message: string, code = "", unavailable = false) {
    super(message);
    this.name = "B1SecureReadRpcError";
    this.code = code;
    this.unavailable = unavailable;
  }
}

export function isB1SecureReadRpcUnavailable(error: RpcErrorLike | null | undefined): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  const code = error.code ?? "";
  return (
    code === "42883" ||
    /function .* does not exist/i.test(msg) ||
    /could not find the function/i.test(msg) ||
    /schema cache/i.test(msg)
  );
}

function mapError(error: RpcErrorLike): B1SecureReadRpcError {
  if (isB1SecureReadRpcUnavailable(error)) {
    return new B1SecureReadRpcError(B1_SECURE_READ_UPDATING_MSG, error.code ?? "", true);
  }
  const msg = error.message ?? "";
  if (msg === B1_READ_ACCESS_DENIED || msg.includes(B1_READ_ACCESS_DENIED)) {
    return new B1SecureReadRpcError("لا تملك صلاحية قراءة هذا الطلب.", B1_READ_ACCESS_DENIED);
  }
  if (msg === "AUTHENTICATION_REQUIRED") {
    return new B1SecureReadRpcError("يجب تسجيل الدخول.", msg);
  }
  if (msg === "ACTIVE_STUDENT_PROFILE_REQUIRED") {
    return new B1SecureReadRpcError("يلزم وجود ملف طالب نشط.", msg);
  }
  return new B1SecureReadRpcError(msg || "حدث خطأ غير متوقع", error.code ?? "");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mapAttachments(value: unknown) {
  return asArray(value).map((row) => normalizeAttachmentMeta(asRecord(row)));
}

export class B1SecureReadRpcClient {
  constructor(private readonly client: RpcClient) {}

  private async call(fn: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const { data, error } = await this.client.rpc(fn, args);
    if (error) throw mapError(error);
    assertNoStorageCoordinates(data);
    return data;
  }

  async getCapability(): Promise<B1SecureReadCapability> {
    const data = asRecord(await this.call("get_b1_secure_read_runtime_capability"));
    return {
      available: data.available === true,
      contract: "B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01",
      services: asArray(data.services).map(String).filter(isB1CanonicalCode) as B1CanonicalCode[],
      reads: asArray(data.reads).map(String),
      writes_available: asArray(data.writes_available).map(String),
      writes_fail_closed: asArray(data.writes_fail_closed).map(String),
      draft_mutations_contract:
        data.draft_mutations_contract == null ? null : String(data.draft_mutations_contract),
    };
  }

  async getFormOptions(serviceCode: B1CanonicalCode): Promise<B1SecureFormOptions> {
    const data = asRecord(
      await this.call("get_b1_request_form_options", {
        p_canonical_code: serviceCode,
      }),
    );
    return data as unknown as B1SecureFormOptions;
  }

  async getDraft(requestId: string): Promise<B1SecureDraft> {
    const data = asRecord(
      await this.call("get_b1_request_draft_for_student", {
        p_request_id: requestId,
      }),
    );
    return {
      requestId: String(data.requestId ?? ""),
      serviceCode: String(data.serviceCode ?? "") as B1CanonicalCode,
      formData: asRecord(data.formData),
      attachments: mapAttachments(data.attachments),
      status: "draft",
      updatedAt: String(data.updatedAt ?? ""),
    };
  }

  async getStudentRequestDetails(requestId: string): Promise<B1SecureRequestDetails> {
    const data = asRecord(
      await this.call("get_b1_request_details_for_student", {
        p_request_id: requestId,
      }),
    );
    return {
      ...(data as unknown as B1SecureRequestDetails),
      attachments: mapAttachments(data.attachments),
      formData: asRecord(data.formData),
    };
  }

  async listStudentRequests(limit = 50, offset = 0): Promise<B1SecureStudentListItem[]> {
    const data = await this.call("list_b1_requests_for_student", {
      p_limit: limit,
      p_offset: offset,
    });
    return asArray(data) as B1SecureStudentListItem[];
  }

  async getAssignedInbox(limit = 50, offset = 0): Promise<B1SecureAssignedRequest[]> {
    const data = await this.call("get_b1_assigned_inbox_for_actor", {
      p_limit: limit,
      p_offset: offset,
    });
    return asArray(data) as B1SecureAssignedRequest[];
  }

  async getAssignedRequestDetails(requestId: string): Promise<B1SecureAssignedRequestDetails> {
    const data = asRecord(
      await this.call("get_b1_assigned_request_details_for_actor", {
        p_request_id: requestId,
      }),
    );
    return {
      ...(data as unknown as B1SecureAssignedRequestDetails),
      attachments: mapAttachments(data.attachments),
    };
  }

  async getStepAllowedActions(stepId: string): Promise<B1SecureStepActions> {
    const data = asRecord(
      await this.call("get_b1_step_allowed_actions", {
        p_step_id: stepId,
      }),
    );
    return {
      stepId: String(data.stepId ?? stepId),
      requestId: String(data.requestId ?? ""),
      allowedAction: (data.allowedAction as B1SecureStaffAction | null) ?? null,
      allowedActions: asArray(data.allowedActions) as B1SecureStaffAction[],
    };
  }

  async listAttachmentsForViewer(requestId: string) {
    const data = await this.call("list_b1_request_attachments_for_viewer", {
      p_request_id: requestId,
    });
    return mapAttachments(data);
  }
}
