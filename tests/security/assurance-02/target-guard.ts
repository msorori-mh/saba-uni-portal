/**
 * TEST_ONLY_ASSURANCE_02 — target guard.
 *
 * Canonical exact-string matching. The only tolerated variation is a single
 * trailing slash. Everything else — `:443`, empty `?`/`#`, dot segments,
 * encoded traversal, userinfo, backslashes, alternate schemes, foreign hosts —
 * is rejected. There is no environment override, and production identities are
 * denied unconditionally.
 */

export const ASSURANCE_02_NAMESPACE = "TEST_ONLY_ASSURANCE_02";

/** Only allowed backend origin for this phase. */
export const ALLOWED_SUPABASE_ORIGIN = "https://ldjhuutywqhjxabdotmn.supabase.co";
/** Only allowed public app target for this phase. */
export const ALLOWED_APP_ORIGIN = "https://uniportaltest.com";

/** Production identities — never allowed, never overridable. */
const DENIED_FRAGMENTS = ["wpmicqriltrowwonknox", "quboolye.com"] as const;

export class TargetGuardError extends Error {
  constructor(reason: string) {
    super(`ASSURANCE_02_TARGET_REJECTED: ${reason}`);
    this.name = "TargetGuardError";
  }
}

function assertCanonicalOrigin(raw: unknown, expected: string, label: string): string {
  if (typeof raw !== "string") throw new TargetGuardError(`${label} is not a string.`);
  const value = raw.trim();
  if (!value) throw new TargetGuardError(`${label} is empty.`);

  const lowered = value.toLowerCase();
  for (const denied of DENIED_FRAGMENTS) {
    if (lowered.includes(denied)) {
      throw new TargetGuardError(`${label} references a production identity.`);
    }
  }

  // Canonical exact match, tolerating at most one trailing slash. Nothing is
  // "normalized away": `:443`, `?`, `#`, `/.`, `%2e%2e`, `\` all fall through
  // to rejection because they change the literal string.
  if (value !== expected && value !== `${expected}/`) {
    throw new TargetGuardError(
      `${label} is not the canonical allowed origin (must be exactly "${expected}").`,
    );
  }

  // Defence in depth: the canonical string must also parse as a bare origin.
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TargetGuardError(`${label} is not an absolute URL.`);
  }
  if (url.protocol !== "https:") throw new TargetGuardError(`${label} must use HTTPS.`);
  if (url.username || url.password) throw new TargetGuardError(`${label} must not carry userinfo.`);
  if (url.port) throw new TargetGuardError(`${label} must not specify a port.`);
  if (url.search || url.hash) throw new TargetGuardError(`${label} must not carry query or hash.`);
  if (url.pathname !== "/") throw new TargetGuardError(`${label} must not include a path.`);

  return expected;
}

export function assertAllowedSupabaseOrigin(raw: unknown): string {
  return assertCanonicalOrigin(raw, ALLOWED_SUPABASE_ORIGIN, "Supabase origin");
}

export function assertAllowedAppOrigin(raw: unknown): string {
  return assertCanonicalOrigin(raw, ALLOWED_APP_ORIGIN, "App target origin");
}

/** Every request URL must stay inside an allowed origin. */
export function assertRequestUrl(url: string, allowedOrigin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TargetGuardError("request URL is not absolute.");
  }
  const lowered = url.toLowerCase();
  for (const denied of DENIED_FRAGMENTS) {
    if (lowered.includes(denied)) {
      throw new TargetGuardError("request URL references a production identity.");
    }
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
    throw new TargetGuardError("request URL must be plain HTTPS without userinfo or port.");
  }
  if (`${parsed.protocol}//${parsed.hostname}` !== allowedOrigin) {
    throw new TargetGuardError("request URL leaves the allowed origin.");
  }
  return url;
}

export const DEFAULT_TIMEOUT_MS = 15_000;
/** Hard cap on any buffered response body. Bodies are never logged. */
export const MAX_BODY_BYTES = 1024 * 1024;

/** Statuses that must never carry a body. */
const NULL_BODY_STATUS = new Set([101, 103, 204, 205, 304]);

export class BodyLimitError extends Error {
  constructor(message: string) {
    super(`ASSURANCE_02_BODY: ${message}`);
    this.name = "BodyLimitError";
  }
}

/**
 * Consumes the response body under the SAME deadline as the headers, bounded to
 * `maxBytes`, and returns an equivalent Response with the status, statusText and
 * headers preserved. A stalled body trips the caller's AbortController (so it
 * surfaces as a transport failure); overflowing the cap aborts too. The body is
 * only ever buffered — never inspected, logged or reported.
 */
export async function bufferBoundedBody(
  response: Response,
  controller: AbortController,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<Response> {
  const init: ResponseInit = {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  };
  if (NULL_BODY_STATUS.has(response.status) || !response.body) {
    return new Response(null, init);
  }

  const reader = response.body.getReader();
  // The deadline is enforced on the read loop itself: if the controller aborts
  // (timeout) while the body is stalled, the race rejects immediately.
  const aborted = new Promise<never>((_resolve, reject) => {
    if (controller.signal.aborted) {
      reject(new BodyLimitError("response body deadline exceeded"));
      return;
    }
    controller.signal.addEventListener(
      "abort",
      () => reject(new BodyLimitError("response body deadline exceeded")),
      { once: true },
    );
  });
  aborted.catch(() => undefined); // never an unhandled rejection

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        controller.abort();
        throw new BodyLimitError(`response body exceeded ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    // Fire-and-forget: never block the deadline on a stalled cancel.
    void Promise.resolve(reader.cancel()).catch(() => undefined);
  }


  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(buffer, init);
}

/**
 * Bounded, redirect-refusing fetch for any authenticated HTTP call. The timeout
 * covers header AND body reception; the body is buffered under a hard cap.
 */
export async function guardedFetch(
  url: string,
  allowedOrigin: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
  maxBodyBytes = MAX_BODY_BYTES,
): Promise<Response> {
  assertRequestUrl(url, allowedOrigin);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, redirect: "error", signal: controller.signal });
    return await bufferBoundedBody(response, controller, maxBodyBytes);
  } finally {
    clearTimeout(timer);
  }
}


export type RunMode = "dryrun" | "apply";

/** Apply must be requested explicitly; anything else stays a dry run. */
export function resolveRunMode(argv: readonly string[]): RunMode {
  return argv.includes("--apply") ? "apply" : "dryrun";
}
