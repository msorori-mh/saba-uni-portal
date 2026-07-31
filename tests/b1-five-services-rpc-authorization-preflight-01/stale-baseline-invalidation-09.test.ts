import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  B1_SERVICE_CODES,
  BASELINE_HOLD_FAMILY,
  CANONICAL_BASELINE_PATH,
  assertExecutableBaseline,
  type BaselineExpectation,
} from "../../scripts/b1-rpc-principal-harness-01/validate-authoritative-baseline";
import { MATRIX_SHA256_LF } from "../../scripts/b1-rpc-principal-harness-01/render-negative-cases";

const root = process.cwd();
const pkg = join(root, "scripts", "b1-rpc-principal-harness-01");
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));

const canonical = readJson(join(pkg, "baseline", "AUTHORITATIVE-BASELINE.json"));
const archived = readJson(join(pkg, "baseline", "archive", "AUTHORITATIVE-BASELINE-20260729-STALE.json"));
const manifest = readJson(join(pkg, "TARGET-MANIFEST.json"));

const EXPECTED_MIGRATION_HEAD = "20260731203030";
const VALID_FINGERPRINT = "0123456789abcdef0123456789abcdef";

const hidden = { is_active: true, student_visible: false };

const EXPECT: BaselineExpectation = {
  execution_package_sha: "a1a5985c063c9ebe4e58b1e4cb9b9a785ba898f1",
  migration_head: EXPECTED_MIGRATION_HEAD,
  matrix_sha256_lf: MATRIX_SHA256_LF,
  function_graph_closure_size: 28,
  request_scope: ["REQ-CURRENT-1", "REQ-CURRENT-2"],
  service_visibility: Object.fromEntries(B1_SERVICE_CODES.map((c) => [c, hidden])),
  enrollment_certificate: { is_active: true, student_visible: true },
  production_fingerprint: VALID_FINGERPRINT,
  now_utc: "2026-07-31T21:00:00Z",
};

/** A fully valid PINNED baseline: the control case that MUST pass. */
const validBaseline = () => ({
  status: "PINNED",
  execution_authorized: true,
  fingerprint: VALID_FINGERPRINT,
  captured_at_utc: "2026-07-31T20:00:00Z",
  valid_for_minutes: 120,
  reviewed_package_sha: EXPECT.execution_package_sha,
  package_source_equivalence: { verdict: "SOURCE_MATCHES_REVIEWED_PACKAGE" },
  catalog_attestation: { migration_head: EXPECTED_MIGRATION_HEAD },
  function_graph_attestation: { closure_size: 28, mismatched: 0, null_hashes: 0 },
  scope: [...EXPECT.request_scope],
  visibility_attestation: {
    ...Object.fromEntries(B1_SERVICE_CODES.map((c) => [c, hidden])),
    enrollment_certificate: { is_active: true, student_visible: true },
  },
});

const expectHold = (fn: () => void, reason: string) => {
  expect(fn).toThrow(new RegExp(`^${BASELINE_HOLD_FAMILY}:${reason}`, "u"));
};

describe("PORTAL-B1-NEGATIVE-RPC-MATRIX-STALE-BASELINE-INVALIDATION-09", () => {
  it("control: a fully valid PINNED baseline passes the gate", () => {
    expect(() => assertExecutableBaseline(CANONICAL_BASELINE_PATH, validBaseline(), EXPECT)).not.toThrow();
  });

  it("1: PENDING blocks execution", () => {
    expect(canonical.status).toBe("PENDING");
    expectHold(
      () => assertExecutableBaseline(CANONICAL_BASELINE_PATH, canonical, EXPECT),
      "STATUS_NOT_PINNED",
    );
  });

  it("2: an expired PINNED baseline blocks execution", () => {
    const expired = { ...validBaseline(), captured_at_utc: "2026-07-31T10:00:00Z" };
    expectHold(() => assertExecutableBaseline(CANONICAL_BASELINE_PATH, expired, EXPECT), "BASELINE_EXPIRED");
  });

  it("3: a wrong package SHA blocks execution", () => {
    const wrong = { ...validBaseline(), reviewed_package_sha: "a1c86ea42b600e67f38c69a1cd610a916a33c312" };
    expectHold(() => assertExecutableBaseline(CANONICAL_BASELINE_PATH, wrong, EXPECT), "PACKAGE_SHA_MISMATCH");
  });

  it("4: a wrong migration head blocks execution", () => {
    const wrong = {
      ...validBaseline(),
      catalog_attestation: { migration_head: "20260729173359" },
    };
    expectHold(() => assertExecutableBaseline(CANONICAL_BASELINE_PATH, wrong, EXPECT), "MIGRATION_HEAD_MISMATCH");
  });

  it("5: a null fingerprint blocks execution", () => {
    const nullFp = { ...validBaseline(), fingerprint: null };
    expectHold(
      () => assertExecutableBaseline(CANONICAL_BASELINE_PATH, nullFp, EXPECT),
      "NULL_OR_INVALID_FINGERPRINT",
    );
  });

  it("6: a wrong production fingerprint blocks execution", () => {
    const drifted = { ...EXPECT, production_fingerprint: "ffffffffffffffffffffffffffffffff" };
    expectHold(
      () => assertExecutableBaseline(CANONICAL_BASELINE_PATH, validBaseline(), drifted),
      "PRODUCTION_FINGERPRINT_MISMATCH",
    );
  });

  it("7: a stale request scope blocks execution (deleted TEST_ONLY scope)", () => {
    const staleScope = {
      ...validBaseline(),
      scope: [
        "SR-20260727-42393846",
        "SR-20260727-50BEDCE2",
        "SR-20260727-3C550070",
        "SR-20260727-88D885F0",
        "SR-20260727-695EC35B",
        "SR-20260713-2DE64041",
        "SR-20260715-FEDCB3E1",
        "SR-20260716-26BAD4C8",
      ],
    };
    expectHold(
      () => assertExecutableBaseline(CANONICAL_BASELINE_PATH, staleScope, EXPECT),
      "REQUEST_SCOPE_MISMATCH",
    );
  });

  it("8: archived baseline files can never be selected", () => {
    expect(archived.status).toBe("STALE");
    expect(archived.execution_authorized).toBe(false);
    expect(archived.selectable).toBe(false);
    expect(archived.executable).toBe(false);
    expectHold(
      () =>
        assertExecutableBaseline(
          "scripts/b1-rpc-principal-harness-01/baseline/archive/AUTHORITATIVE-BASELINE-20260729-STALE.json",
          validBaseline(),
          EXPECT,
        ),
      "ARCHIVED_BASELINE_NOT_SELECTABLE",
    );
  });

  it("9: only the canonical baseline path is accepted", () => {
    for (const bad of [
      "scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE-COPY.json",
      "scripts/b1-rpc-principal-harness-01/baseline/../baseline/AUTHORITATIVE-BASELINE.json",
      "baseline/AUTHORITATIVE-BASELINE.json",
      "scripts/b1-rpc-principal-harness-01/baseline",
    ]) {
      expectHold(() => assertExecutableBaseline(bad, validBaseline(), EXPECT), "NON_CANONICAL_BASELINE_PATH");
    }
  });

  it("9b: execution without explicit authorization blocks", () => {
    const unauthorized = { ...validBaseline(), execution_authorized: false };
    expectHold(
      () => assertExecutableBaseline(CANONICAL_BASELINE_PATH, unauthorized, EXPECT),
      "EXECUTION_NOT_AUTHORIZED",
    );
  });

  it("9c: a drifted matrix SHA blocks execution", () => {
    const drifted = { ...EXPECT, matrix_sha256_lf: "0".repeat(64) };
    expectHold(
      () => assertExecutableBaseline(CANONICAL_BASELINE_PATH, validBaseline(), drifted),
      "MATRIX_SHA_MISMATCH",
    );
  });

  it("10: Operator Preflight remains unexecuted", () => {
    expect(canonical.operator_preflight_executed).toBe(false);
    expect(canonical.held_back.operator_preflight_executed).toBe(false);
    expect(manifest.authoritative_baseline.operator_preflight_executed).toBe(false);
    expect(archived.held_back.operator_preflight_executed).toBe(false);
  });

  it("11: production RPC count remains zero", () => {
    expect(canonical.negative_cases_executed).toBe(0);
    expect(canonical.held_back.negative_cases_executed).toBe(0);
    expect(manifest.authoritative_baseline.negative_cases_executed).toBe(0);
    expect(archived.held_back.negative_cases_executed).toBe(0);
    expect(archived.capture_transaction.workflow_rpc_calls).toBe(0);
    expect(archived.capture_transaction.production_writes).toBe(0);
  });

  it("contract: the next capture is bound to migration head 20260731203030", () => {
    expect(canonical.next_capture_contract.expected_migration_head).toBe(EXPECTED_MIGRATION_HEAD);
    expect(canonical.next_capture_contract.expected_matrix_sha256_lf).toBe(MATRIX_SHA256_LF);
    expect(canonical.next_capture_contract.expected_function_graph_closure_size).toBe(28);
    expect(manifest.authoritative_baseline.expected_migration_head).toBe(EXPECTED_MIGRATION_HEAD);
    expect(canonical.fingerprint).toBeNull();
    expect(canonical.captured_at_utc).toBeNull();
    expect(canonical.reviewed_package_sha).toBeNull();
    expect(canonical.migration_head).toBeNull();
    expect(canonical.scope).toEqual([]);
    expect(canonical.execution_authorized).toBe(false);
    expect(canonical.contains_secrets).toBe(false);
  });

  it("contract: archive preserves the invalidation evidence", () => {
    expect(archived.invalidated_after_migration).toBe(EXPECTED_MIGRATION_HEAD);
    const reasons = archived.invalidated_reason.join(" ");
    expect(reasons).toContain("EXPIRED");
    expect(reasons).toContain("PACKAGE_SHA_MISMATCH");
    expect(reasons).toContain("MIGRATION_HEAD_MISMATCH");
    expect(reasons).toContain("REQUEST_SCOPE_CHANGE");
    expect(reasons).toContain("DELETED_TEST_ONLY_REQUESTS");
    expect(manifest.authoritative_baseline.archived_stale_baseline.path).toBe(
      "scripts/b1-rpc-principal-harness-01/baseline/archive/AUTHORITATIVE-BASELINE-20260729-STALE.json",
    );
  });
});
