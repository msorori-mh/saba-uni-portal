/**
 * B1 draft-save error classification (PORTAL-B1-PAYMENT-CONFIRMATION-AUTHORIZATION-HARDENING-01 / G4).
 *
 * A failed draft save during an attachment upload/refetch must NEVER be shown
 * as "هذه الخدمة غير مفعّلة حالياً". ACTIVATION_BLOCKED is only truthful when a
 * capability/availability probe actually proved the service unavailable — the
 * save path never proves that, so the same code arriving from a save is treated
 * as a retryable transient failure instead of a fatal banner.
 *
 * No error is ever swallowed: a transient classification still surfaces a
 * visible retryable message, and genuinely fatal codes stay fatal.
 */
import { B1AdapterError, type B1AdapterErrorCode, b1AdapterErrorMessageAr } from "./adapter.types";

export type B1SavePhase = "manual_save" | "autosave" | "attachment_sync";

export type B1SaveErrorSeverity = "fatal" | "transient";

export type B1SaveErrorClassification = {
  severity: B1SaveErrorSeverity;
  /** The adapter code, or "UNKNOWN" for a non-adapter error. */
  code: B1AdapterErrorCode | "UNKNOWN";
  /** Safe Arabic message for the user. Never a raw backend string. */
  messageAr: string;
  retryable: boolean;
  /** Sanitized diagnostic token for internal logging (no PII, no storage coordinates). */
  diagnosticCode: string;
};

export const B1_TRANSIENT_SAVE_MESSAGE_AR =
  "تعذر حفظ التغييرات مؤقتاً. أعد المحاولة، فالبيانات المدخلة لم تُفقد.";

/** Codes that a save may legitimately hit without the service being inactive. */
const TRANSIENT_SAVE_CODES: ReadonlySet<string> = new Set<string>([
  "NETWORK_ERROR",
  "UNEXPECTED_ERROR",
  // Proven only by a capability/availability probe, never by a save attempt.
  "ACTIVATION_BLOCKED",
]);

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Reduces a raw backend message to a short, safe token: uppercase machine codes
 * only. UUIDs, URLs, storage paths, file names, digits and Arabic prose are
 * dropped so nothing identifying can reach a log sink.
 */
export function sanitizeB1DiagnosticCode(raw: unknown): string {
  const text = typeof raw === "string" ? raw : raw instanceof Error ? raw.message : "";
  if (!text) return "NO_CODE";
  const withoutIds = text.replace(UUID_PATTERN, "").replace(/https?:\/\/\S+/gi, "");
  const tokens = withoutIds.match(/\b[A-Z][A-Z0-9_]{3,}\b/g);
  if (!tokens || tokens.length === 0) return "NO_CODE";
  return Array.from(new Set(tokens)).slice(0, 3).join("|");
}

export function classifyB1SaveError(
  error: unknown,
  phase: B1SavePhase,
  options: { capabilityProvenUnavailable?: boolean } = {},
): B1SaveErrorClassification {
  const code: B1AdapterErrorCode | "UNKNOWN" =
    error instanceof B1AdapterError ? error.code : "UNKNOWN";
  const diagnosticCode = sanitizeB1DiagnosticCode(error);

  // Only a proven capability probe may report the service as inactive.
  if (code === "ACTIVATION_BLOCKED" && options.capabilityProvenUnavailable === true) {
    return {
      severity: "fatal",
      code,
      messageAr: b1AdapterErrorMessageAr(error),
      retryable: false,
      diagnosticCode,
    };
  }

  if (code === "UNKNOWN" || TRANSIENT_SAVE_CODES.has(code)) {
    return {
      severity: "transient",
      code,
      messageAr:
        code === "NETWORK_ERROR" ? b1AdapterErrorMessageAr(error) : B1_TRANSIENT_SAVE_MESSAGE_AR,
      retryable: true,
      diagnosticCode,
    };
  }

  // STALE_VERSION, PERMISSION_DENIED, VALIDATION_ERROR, NOT_FOUND,
  // ELIGIBILITY_BLOCKED, BACKEND_CONTRACT_PENDING keep their precise meaning.
  return {
    severity: "fatal",
    code,
    messageAr: b1AdapterErrorMessageAr(error),
    retryable: false,
    diagnosticCode,
  };
}

/** Internal, PII-free diagnostic breadcrumb. */
export function logB1SaveDiagnostic(
  phase: B1SavePhase,
  classification: B1SaveErrorClassification,
  sink: (payload: Record<string, string>) => void = (payload) =>
    // eslint-disable-next-line no-console -- deliberate, sanitized diagnostic breadcrumb
    console.warn("[b1][draft-save]", payload),
): void {
  sink({
    phase,
    severity: classification.severity,
    code: classification.code,
    diagnostic: classification.diagnosticCode,
  });
}
