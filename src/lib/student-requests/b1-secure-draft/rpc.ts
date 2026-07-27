import type { B1CanonicalCode, B1SecureDraft } from "./contracts";
import {
  B1DraftFormFieldError,
  B1_INPUT_VALIDATION_FAILED,
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

/**
 * Backend error identifiers that are safe to surface verbatim to the adapter.
 * Anything outside this list collapses to the generic message so SQL text,
 * stacks, and row values never reach the student.
 */
export const B1_SECURE_DRAFT_KNOWN_CODES = [
  "B1_DRAFT_ACCESS_DENIED",
  "B1_STALE_REQUEST_VERSION",
  "B1_IDEMPOTENCY_PAYLOAD_MISMATCH",
  "B1_UNEXPECTED_FORM_FIELD",
  "B1_DRAFT_FIELD_TYPE_INVALID",
  "B1_DRAFT_FORM_OBJECT_REQUIRED",
  "B1_SUSPENSION_INPUT_INVALID",
  "B1_ABSENCE_INPUT_INVALID",
  "B1_ABSENCE_EFFECT_ALREADY_APPLIED",
  "B1_TRANSFER_INPUT_INVALID",
  "B1_FINAL_CHANCE_INPUT_INVALID",
  "B1_WITHDRAWAL_INPUT_INVALID",
  "B1_STUDENT_PROFILE_NOT_ACTIVE",
  "B1_REFERENCE_NOT_TRUSTED",
  B1_INPUT_VALIDATION_FAILED,
] as const;

function knownCodeIn(message: string): string | null {
  return B1_SECURE_DRAFT_KNOWN_CODES.find((code) => message.includes(code)) ?? null;
}

/**
 * Controlled domain-eligibility messages raised by the backend validators.
 * They carry no student data and must reach the adapter so the student sees a
 * precise Arabic reason instead of the "service disabled" message.
 */
const B1_ELIGIBILITY_PATTERNS: readonly RegExp[] = [
  /suspension request: student is not currently active/i,
  /transfer request: student is currently suspended/i,
  /reinstatement request: student is not currently suspended/i,
  /student profile is not active/i,
];

export const B1_ELIGIBILITY_CODE = "B1_ELIGIBILITY_BLOCKED" as const;

function eligibilityIn(message: string): string | null {
  return B1_ELIGIBILITY_PATTERNS.some((re) => re.test(message)) ? message : null;
}


type ZodLikeIssue = { path?: unknown[]; code?: string };

function zodIssuePaths(error: unknown): string[] | null {
  const issues = (error as { issues?: ZodLikeIssue[] } | null)?.issues;
  if (!Array.isArray(issues)) return null;
  return issues.map((issue) => (issue.path ?? []).join(".") || "(root)");
}

/**
 * Server-log-only diagnostics. Logs shapes and identifiers, never form values,
 * attachment contents, SQL text, or stacks.
 */
export function logB1SecureDraftDiagnostics(
  error: unknown,
  ctx: { operation: string; serviceCode?: string | null; requestId?: string | null },
): void {
  const err = error as { name?: string; code?: string; constructor?: { name?: string } } | null;
  const paths = zodIssuePaths(error);
  console.error("[b1-secure-draft]", {
    operation: ctx.operation,
    serviceCode: ctx.serviceCode ?? null,
    requestId: ctx.requestId ?? null,
    errorClass: err?.constructor?.name ?? typeof error,
    errorName: err?.name ?? null,
    safeCode:
      err?.code ??
      (error instanceof Error ? (knownCodeIn(error.message) ?? "UNMAPPED") : "NON_ERROR"),
    zodIssuePaths: paths,
  });
}

/**
 * Single mapping point for everything thrown on the draft path.
 * Preserves B1SecureDraftRpcError, converts field/Zod validation into
 * B1_INPUT_VALIDATION_FAILED with safe field paths, keeps allow-listed backend
 * codes, and falls back to the generic message for unknown failures.
 */
export function mapB1SecureDraftThrown(
  error: unknown,
  ctx: { operation: string; serviceCode?: string | null; requestId?: string | null },
): never {
  logB1SecureDraftDiagnostics(error, ctx);

  if (error instanceof B1SecureDraftRpcError) throw error;

  if (error instanceof B1DraftFormFieldError) {
    throw new B1SecureDraftRpcError(error.message, B1_INPUT_VALIDATION_FAILED);
  }

  const paths = zodIssuePaths(error);
  if (paths) {
    throw new B1SecureDraftRpcError(
      `${B1_INPUT_VALIDATION_FAILED}:${paths.join(",")}`,
      B1_INPUT_VALIDATION_FAILED,
    );
  }

  if (error instanceof Error) {
    const known = knownCodeIn(error.message);
    if (known) throw new B1SecureDraftRpcError(known, known);
    if (isB1SecureDraftRpcUnavailable({ message: error.message })) {
      throw new B1SecureDraftRpcError(B1_SECURE_DRAFT_UPDATING_MSG, "", true);
    }
  }

  throw new B1SecureDraftRpcError(B1_SECURE_DRAFT_UPDATING_MSG);
}

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};

function mapRpcError(error: { message: string; code?: string }): never {
  // Known backend identifiers win over the "unavailable" heuristic: a domain
  // error may legitimately contain phrases like "does not exist".
  const known = knownCodeIn(error.message);
  if (known) throw new B1SecureDraftRpcError(known, known);
  if (isB1SecureDraftRpcUnavailable(error)) {
    throw new B1SecureDraftRpcError(B1_SECURE_DRAFT_UPDATING_MSG, error.code ?? "", true);
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
