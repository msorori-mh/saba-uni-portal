/**
 * Safe submit-stage tracing for the B1 student form.
 *
 * Records only non-personal execution metadata (stage, service code, request id,
 * error name/code, value shapes). Never records form data, file contents or any
 * personal information. The trace is kept in memory and mirrored on
 * `window.__B1_SUBMIT_TRACE` so a browser session can prove exactly where the
 * submit path stops.
 */

export type B1SubmitStage =
  | "SUBMIT_BEFORE_SAVE"
  | "SUBMIT_AFTER_SAVE"
  | "SUBMIT_BEFORE_SERVER_FN"
  | "SUBMIT_SERVER_FN_INVOKED"
  | "SUBMIT_SERVER_FN_RETURNED"
  | "SUBMIT_THROWN";

export type B1SubmitTraceEntry = {
  stage: B1SubmitStage;
  at: string;
  serviceCode?: string;
  requestId?: string;
  expectedUpdatedAtType?: string;
  expectedUpdatedAtFormat?: string;
  serverFnInvoked?: boolean;
  errorName?: string;
  errorCode?: string;
  safeMessage?: string;
};

const MAX_ENTRIES = 50;
const entries: B1SubmitTraceEntry[] = [];

/** Describes a value's shape without exposing its content. */
export function describeUpdatedAt(value: unknown): {
  expectedUpdatedAtType: string;
  expectedUpdatedAtFormat: string;
} {
  const type = value === null ? "null" : typeof value;
  if (typeof value !== "string") {
    return { expectedUpdatedAtType: type, expectedUpdatedAtFormat: "non_string" };
  }
  if (value.length === 0) return { expectedUpdatedAtType: type, expectedUpdatedAtFormat: "empty" };
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return { expectedUpdatedAtType: type, expectedUpdatedAtFormat: "iso_offset" };
  }
  if (/^\d{4}-\d{2}-\d{2} [\d:.]+([+-]\d{2}(:\d{2})?)?$/.test(value)) {
    return { expectedUpdatedAtType: type, expectedUpdatedAtFormat: "pg_space_separated" };
  }
  return { expectedUpdatedAtType: type, expectedUpdatedAtFormat: "other" };
}

/** Extracts a safe error descriptor: no payloads, no personal data. */
export function describeError(error: unknown): Pick<
  B1SubmitTraceEntry,
  "errorName" | "errorCode" | "safeMessage"
> {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return {
      errorName: error.name,
      errorCode: typeof code === "string" ? code : undefined,
      safeMessage: error.message.slice(0, 200),
    };
  }
  return { errorName: typeof error, safeMessage: String(error ?? "unknown").slice(0, 200) };
}

export function traceB1Submit(
  stage: B1SubmitStage,
  detail: Omit<B1SubmitTraceEntry, "stage" | "at"> = {},
): void {
  const entry: B1SubmitTraceEntry = { stage, at: new Date().toISOString(), ...detail };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
  if (typeof window !== "undefined") {
    (window as unknown as { __B1_SUBMIT_TRACE?: B1SubmitTraceEntry[] }).__B1_SUBMIT_TRACE = entries;
  }
  // Console mirror keeps the stage visible in browser diagnostics.
  console.debug("[b1-submit]", entry);
}

export function readB1SubmitTrace(): readonly B1SubmitTraceEntry[] {
  return entries;
}

export function resetB1SubmitTrace(): void {
  entries.length = 0;
}
