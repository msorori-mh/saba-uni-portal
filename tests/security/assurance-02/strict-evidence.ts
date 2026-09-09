/**
 * TEST_ONLY_ASSURANCE_02 — strict evidence classifier.
 *
 * Deliberately does NOT reuse `tests/security/assertions.ts`, which classifies
 * HTTP 405, an HTTP 500 body merely mentioning "forbidden", and PGRST301
 * (JWT expired) as successful denials.
 *
 * A database authorization denial only counts when BOTH hold:
 *   - the paired positive control (the owner reading that exact same new row,
 *     with the returned id validated against the requested fixture id)
 *     succeeded, AND
 *   - the probe either returned PostgREST `42501` (insufficient_privilege) with
 *     HTTP 401/403, or returned HTTP 200 with a valid, EMPTY JSON array.
 *
 * Anything else — HTML challenge, 404/405/429/4xx/5xx, any JWT/credential
 * error, an unknown API error, or a 200 whose body is not a JSON array — is
 * ERROR or BLOCKED. It is never PASS.
 */

export type Verdict = "PASS" | "FAIL" | "BLOCKED" | "ERROR";

export interface HttpEvidence {
  status: number;
  /** Non-PII marker only: PostgREST error code, if any. */
  errorCode?: string | null;
  /** True when the response body was HTML (challenge/interstitial page). */
  html?: boolean;
  /** True when the response body parsed as a JSON array. */
  validJsonArray?: boolean;
  /** Row count returned; PII is never carried. */
  rowCount?: number;
  /**
   * True when every returned row's `id` equals the exact new fixture id that
   * was requested. Only this boolean is retained — never the row body.
   */
  validatedIdMatch?: boolean;
  /**
   * Adapter-measured HTTP time: request dispatch through bounded body
   * reception. This is network + API service time, NOT SQL execution time and
   * NOT a browser LCP figure. It excludes the harness's own pacing pause.
   */
  durationMs?: number;
  /**
   * Total probe wall time including the deliberate <=1 req/sec pacing wait.
   * Never attribute this to the backend.
   */
  pacedElapsedMs?: number;
  /** Transport-level failure marker (no response was received). */
  transportError?: boolean;
}

export interface DenialEvaluation {
  verdict: Verdict;
  reason: string;
  /** Raw non-PII evidence retained alongside every verdict. */
  evidence: HttpEvidence;
}

/** PostgREST codes that indicate a credential/JWT problem, not authorization. */
const JWT_ERROR_CODES = new Set(["PGRST301", "PGRST302", "PGRST303", "PGRST300"]);
/** The only error code that proves a database authorization denial. */
export const INSUFFICIENT_PRIVILEGE = "42501";

/** Statuses that can never be interpreted as a successful authorization denial. */
export function isInfrastructureFailure(ev: HttpEvidence): string | null {
  if (ev.transportError) return "transport failure — no HTTP response";
  if (ev.html) return "HTML challenge/interstitial response";
  if (ev.errorCode && JWT_ERROR_CODES.has(ev.errorCode)) {
    return `${ev.errorCode} — credential/JWT problem, not an authorization decision`;
  }
  if (ev.errorCode === "PGRST202") return "PGRST202 — RPC/schema missing";
  if (ev.status === 404) return "HTTP 404 — endpoint or row route missing";
  if (ev.status === 405) return "HTTP 405 — method not allowed, not an authorization decision";
  if (ev.status === 429) return "HTTP 429 — rate limited";
  if (ev.status >= 500) return `HTTP ${ev.status} — server error`;
  if (ev.status === 400) return "HTTP 400 — malformed payload or schema mismatch";
  return null;
}

/**
 * Positive control: the owner of the row must read exactly that row back, with
 * the returned identity validated against the requested new fixture id.
 */
export function evaluatePositiveControl(ev: HttpEvidence): DenialEvaluation {
  const infra = isInfrastructureFailure(ev);
  if (infra) return { verdict: "ERROR", reason: infra, evidence: ev };
  if (ev.status !== 200) {
    return { verdict: "ERROR", reason: `owner read returned HTTP ${ev.status}`, evidence: ev };
  }
  if (ev.errorCode) {
    return { verdict: "ERROR", reason: `owner read returned API error ${ev.errorCode}`, evidence: ev };
  }
  if (ev.validJsonArray !== true) {
    return { verdict: "ERROR", reason: "owner read body was not a valid JSON array", evidence: ev };
  }
  if ((ev.rowCount ?? 0) < 1) {
    return {
      verdict: "BLOCKED",
      reason: "owner read returned zero rows — fixture not readable",
      evidence: ev,
    };
  }
  if (ev.validatedIdMatch !== true) {
    return {
      verdict: "ERROR",
      reason: "owner read returned a row whose id is not the requested fixture id",
      evidence: ev,
    };
  }
  return { verdict: "PASS", reason: `owner read returned ${ev.rowCount} matching row(s)`, evidence: ev };
}

/**
 * Cross-tenant / anonymous denial. `control` is the paired owner read of the
 * exact same row; without a passing control any empty result is vacuous.
 */
export function evaluateDenial(ev: HttpEvidence, control: DenialEvaluation): DenialEvaluation {
  if (control.verdict !== "PASS") {
    return {
      verdict: "BLOCKED",
      reason: `positive control not established (${control.reason})`,
      evidence: ev,
    };
  }
  const infra = isInfrastructureFailure(ev);
  if (infra) return { verdict: "ERROR", reason: infra, evidence: ev };

  if (ev.status === 401 || ev.status === 403) {
    if (ev.errorCode === INSUFFICIENT_PRIVILEGE) {
      return {
        verdict: "PASS",
        reason: `denied with HTTP ${ev.status} and PostgREST ${INSUFFICIENT_PRIVILEGE}`,
        evidence: ev,
      };
    }
    return {
      verdict: "ERROR",
      reason: `HTTP ${ev.status} without PostgREST ${INSUFFICIENT_PRIVILEGE} (code=${ev.errorCode ?? "none"}) — not a proven authorization denial`,
      evidence: ev,
    };
  }

  if (ev.status === 200) {
    if (ev.errorCode) {
      return { verdict: "ERROR", reason: `unknown API error ${ev.errorCode} on HTTP 200`, evidence: ev };
    }
    if (ev.validJsonArray !== true) {
      return { verdict: "ERROR", reason: "HTTP 200 body was not a valid JSON array", evidence: ev };
    }
    if ((ev.rowCount ?? 0) === 0) {
      return {
        verdict: "PASS",
        reason: "RLS filtered the row set to zero while the owner reads the same row",
        evidence: ev,
      };
    }
    return { verdict: "FAIL", reason: `unauthorized read returned ${ev.rowCount} row(s)`, evidence: ev };
  }

  return { verdict: "ERROR", reason: `unexpected HTTP ${ev.status}`, evidence: ev };
}

/** Global request budget for the authenticated runner. */
export class RequestBudget {
  private used = 0;
  private transportFailures = 0;
  private lastAt = 0;
  /** Once latched, no further request may ever be issued by this process. */
  private abortReason: string | null = null;

  constructor(
    private readonly maxRequests = 100,
    private readonly minIntervalMs = 1000,
  ) {}

  get spent(): number {
    return this.used;
  }
  get aborted(): string | null {
    return this.abortReason;
  }

  /** Permanent latch: a caller catching the error cannot re-enable the network. */
  latchAbort(reason: string): never {
    this.abortReason ??= reason;
    throw new Error(`ASSURANCE_02_ABORT: ${this.abortReason}`);
  }

  async take(): Promise<void> {
    if (this.abortReason) throw new Error(`ASSURANCE_02_ABORT: ${this.abortReason}`);
    if (this.used >= this.maxRequests) {
      this.latchAbort(`request cap ${this.maxRequests} reached`);
    }
    const wait = this.lastAt + this.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastAt = Date.now();
    this.used += 1;
  }

  /** Abort conditions: 429, any 5xx, HTML challenge. */
  checkAbort(ev: HttpEvidence): void {
    if (ev.status === 429) this.latchAbort("HTTP 429");
    if (ev.status >= 500) this.latchAbort(`HTTP ${ev.status}`);
    if (ev.html) this.latchAbort("HTML challenge response");
  }

  transportFailure(): void {
    this.transportFailures += 1;
    if (this.transportFailures >= 2) this.latchAbort("two transport failures");
  }
}
