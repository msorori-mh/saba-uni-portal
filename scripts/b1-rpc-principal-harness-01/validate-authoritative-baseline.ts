/**
 * PORTAL-B1-NEGATIVE-RPC-MATRIX-STALE-BASELINE-INVALIDATION-09
 *
 * Fail-closed validator for the authoritative production baseline.
 *
 * Execution of the negative RPC matrix is forbidden unless EVERY rule below
 * holds. Any violation throws the failure family
 * `HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE:<REASON>`.
 *
 * This module is pure and offline: it never connects to any database and
 * never reads credentials. The operator/launcher path must call
 * `assertExecutableBaseline` on the loaded baseline artifact before any
 * production session is opened.
 */

import { MATRIX_SHA256_LF } from "./render-negative-cases";

export const CANONICAL_BASELINE_PATH =
  "scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE.json";

export const BASELINE_HOLD_FAMILY = "HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE";

export const B1_SERVICE_CODES = [
  "enrollment_suspension",
  "excused_absence",
  "department_transfer",
  "final_chance",
  "file_withdrawal",
] as const;

export interface VisibilityPin {
  is_active: boolean;
  student_visible: boolean;
}

export interface BaselineExpectation {
  /** SHA of the externally reviewed execution package (git commit). */
  execution_package_sha: string;
  /** Required production migration head (currently 20260731203030). */
  migration_head: string;
  /** Required MATRIX.json LF SHA256. */
  matrix_sha256_lf: string;
  /** Required function-graph closure size (currently 28). */
  function_graph_closure_size: number;
  /** Required request scope (exact set of request numbers). */
  request_scope: string[];
  /** Required visibility pins for the five B1 services. */
  service_visibility: Record<string, VisibilityPin>;
  /** Required protected enrollment_certificate visibility pin. */
  enrollment_certificate: VisibilityPin;
  /** Fingerprint observed from production at execution time. */
  production_fingerprint: string;
  /** Injectable clock (ISO UTC) for deterministic offline tests. */
  now_utc?: string;
}

export class BaselineHold extends Error {
  public readonly reason: string;
  constructor(reason: string, detail?: string) {
    super(`${BASELINE_HOLD_FAMILY}:${reason}${detail ? `: ${detail}` : ""}`);
    this.name = "BaselineHold";
    this.reason = reason;
  }
}
const FINGERPRINT_RE = /^[0-9a-f]{32}$/u;

function hold(reason: string, detail?: string): never {
  throw new BaselineHold(reason, detail);
}

function sameSet(a: unknown, b: string[]): boolean {
  if (!Array.isArray(a)) return false;
  const sa = [...a].map(String).sort();
  const sb = [...b].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

function visibilityMatches(actual: unknown, pin: VisibilityPin): boolean {
  if (typeof actual !== "object" || actual === null) return false;
  const a = actual as Record<string, unknown>;
  return a.is_active === pin.is_active && a.student_visible === pin.student_visible;
}

/**
 * Assert that a loaded baseline artifact permits matrix execution.
 * Pure function — throws BaselineHold on the first violated rule.
 */
export function assertExecutableBaseline(
  candidatePath: string,
  baseline: unknown,
  expected: BaselineExpectation,
): void {
  // 1. Only the canonical path is selectable; archive files can never execute.
  const normalized = candidatePath.replace(/\\/gu, "/");
  if (normalized.includes("/archive/")) {
    hold("ARCHIVED_BASELINE_NOT_SELECTABLE", normalized);
  }
  if (normalized !== CANONICAL_BASELINE_PATH) {
    hold("NON_CANONICAL_BASELINE_PATH", normalized);
  }

  if (typeof baseline !== "object" || baseline === null) {
    hold("BASELINE_UNREADABLE");
  }
  const b = baseline as Record<string, any>;

  // 2. Status must be PINNED (PENDING / STALE / anything else fails closed).
  if (b.status !== "PINNED") {
    hold("STATUS_NOT_PINNED", String(b.status ?? "MISSING"));
  }

  // 3. Explicit execution authorization flag.
  if (b.execution_authorized !== true) {
    hold("EXECUTION_NOT_AUTHORIZED");
  }

  // 4. Fingerprint must be a real 32-hex value.
  if (typeof b.fingerprint !== "string" || !FINGERPRINT_RE.test(b.fingerprint)) {
    hold("NULL_OR_INVALID_FINGERPRINT");
  }

  // 5. Validity window must exist and be unexpired.
  if (typeof b.captured_at_utc !== "string" || typeof b.valid_for_minutes !== "number") {
    hold("MISSING_VALIDITY_WINDOW");
  }
  const capturedMs = Date.parse(b.captured_at_utc);
  const nowMs = Date.parse(expected.now_utc ?? new Date().toISOString());
  if (Number.isNaN(capturedMs) || Number.isNaN(nowMs)) {
    hold("MISSING_VALIDITY_WINDOW");
  }
  if (nowMs - capturedMs >= b.valid_for_minutes * 60_000) {
    hold("BASELINE_EXPIRED", b.captured_at_utc);
  }

  // 6. Execution package SHA must equal the reviewed SHA.
  if (b.reviewed_package_sha !== expected.execution_package_sha) {
    hold("PACKAGE_SHA_MISMATCH", String(b.reviewed_package_sha ?? "MISSING"));
  }

  // 7. Package source equivalence must attest no drift vs the reviewed SHA.
  if (b.package_source_equivalence?.verdict !== "SOURCE_MATCHES_REVIEWED_PACKAGE") {
    hold("PACKAGE_SOURCE_MISMATCH", String(b.package_source_equivalence?.verdict ?? "MISSING"));
  }

  // 8. Migration head must equal the required head.
  const migrationHead = b.migration_head ?? b.catalog_attestation?.migration_head;
  if (migrationHead !== expected.migration_head) {
    hold("MIGRATION_HEAD_MISMATCH", String(migrationHead ?? "MISSING"));
  }

  // 8b. The caller-supplied matrix SHA must equal the repository-pinned
  // canonical MATRIX.json SHA; any drift fails closed.
  if (expected.matrix_sha256_lf !== MATRIX_SHA256_LF) {
    hold("MATRIX_SHA_MISMATCH", expected.matrix_sha256_lf);
  }

  // 9. Function graph must match the required closure.
  if (b.function_graph_attestation?.closure_size !== expected.function_graph_closure_size) {
    hold(
      "FUNCTION_GRAPH_MISMATCH",
      String(b.function_graph_attestation?.closure_size ?? "MISSING"),
    );
  }
  if (
    (b.function_graph_attestation?.mismatched ?? 0) !== 0 ||
    (b.function_graph_attestation?.null_hashes ?? 0) !== 0
  ) {
    hold("FUNCTION_GRAPH_MISMATCH", "mismatched/null hashes present");
  }

  // 10. Request scope must be the exact current scope.
  if (!sameSet(b.scope, expected.request_scope)) {
    hold("REQUEST_SCOPE_MISMATCH");
  }

  // 11. Service visibility must match the pinned five-hidden contract.
  const visibility = (b.visibility_attestation ?? {}) as Record<string, unknown>;
  for (const code of B1_SERVICE_CODES) {
    const pin = expected.service_visibility[code];
    if (!pin || !visibilityMatches(visibility[code], pin)) {
      hold("VISIBILITY_MISMATCH", code);
    }
  }

  // 12. Protected enrollment_certificate baseline must not drift.
  if (!visibilityMatches(visibility.enrollment_certificate, expected.enrollment_certificate)) {
    hold("ENROLLMENT_CERTIFICATE_BASELINE_MISMATCH");
  }

  // 13. Production fingerprint observed at execution time must match.
  if (b.fingerprint !== expected.production_fingerprint) {
    hold("PRODUCTION_FINGERPRINT_MISMATCH");
  }
}
