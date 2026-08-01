/**
 * PORTAL-B1-NEGATIVE-RPC-MATRIX-STALE-BASELINE-INVALIDATION-09
 *
 * Offline, source-only proofs that the expired authoritative baseline is
 * archived as historical evidence and that the canonical ACTIVE baseline is a
 * fail-closed PENDING placeholder.
 *
 * These tests never open a database connection, never call an RPC and never
 * execute a negative-matrix case.
 */
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const pkg = join(root, "scripts/b1-rpc-principal-harness-01");
const ACTIVE_REL = "scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE.json";
const ARCHIVE_REL =
  "scripts/b1-rpc-principal-harness-01/baseline/archive/AUTHORITATIVE-BASELINE-20260729-STALE.json";
const REQUIRED_HEAD = "20260801021541";
const HOLD = "HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/gu, "\n");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const manifest = JSON.parse(read(join(pkg, "TARGET-MANIFEST.json"))) as Record<string, any>;
const baselineBlock = manifest.authoritative_baseline;
const activeRaw = read(join(root, ACTIVE_REL));
const active = JSON.parse(activeRaw) as Record<string, any>;
const archiveRaw = read(join(root, ARCHIVE_REL));
const archive = JSON.parse(archiveRaw) as Record<string, any>;
const launcher = read(join(pkg, "run-negative-matrix.ps1"));
const preflight = read(join(pkg, "00-preflight.sql"));
const pins = read(join(pkg, "generated/pins.sql"));
const fingerprintCheck = read(join(pkg, "generated/fingerprint-check.sql"));

/**
 * Pure re-implementation of the launcher gate, so every fail-closed rule can be
 * exercised offline against synthetic baselines.
 */
function evaluateBaselineGate(input: {
  artifact_path?: string;
  status?: string | null;
  execution_authorized?: boolean;
  fingerprint?: string | null;
  observed_fingerprint?: string | null;
  captured_at_utc?: string | null;
  valid_for_minutes?: number | null;
  reviewed_package_sha?: string | null;
  execution_sha?: string;
  migration_head?: string | null;
  expected_migration_head?: string | null;
  scope?: string[];
  expected_scope?: string[];
  matrix_sha?: string;
  expected_matrix_sha?: string;
  package_source_hash?: string;
  expected_package_source_hash?: string;
  function_graph?: string;
  expected_function_graph?: string;
  service_visibility?: string;
  expected_service_visibility?: string;
  enrollment_certificate_baseline?: string;
  expected_enrollment_certificate_baseline?: string;
  now?: Date;
}): { allowed: boolean; hold?: string; reason?: string } {
  const deny = (reason: string) => ({ allowed: false, hold: HOLD, reason });
  if (input.artifact_path !== ACTIVE_REL) return deny("baseline path is not the canonical active path");
  if (input.status !== "PINNED") return deny("status != PINNED");
  if (input.execution_authorized !== true) return deny("execution_authorized != true");
  if (!input.fingerprint) return deny("fingerprint is null");
  if (!input.captured_at_utc || input.valid_for_minutes == null) return deny("capture window missing");
  const now = input.now ?? new Date();
  const expiresAt = new Date(Date.parse(input.captured_at_utc) + input.valid_for_minutes * 60_000);
  if (now > expiresAt) return deny("baseline is expired");
  if (!input.reviewed_package_sha || input.reviewed_package_sha !== input.execution_sha) {
    return deny("reviewed_package_sha differs from the exact execution SHA");
  }
  if (input.expected_migration_head !== REQUIRED_HEAD || input.migration_head !== REQUIRED_HEAD) {
    return deny("migration head differs from 20260801021541");
  }
  if (input.matrix_sha !== input.expected_matrix_sha) return deny("matrix SHA differs");
  if (input.package_source_hash !== input.expected_package_source_hash) return deny("package-source hash differs");
  if (input.function_graph !== input.expected_function_graph) return deny("function graph differs");
  if ((input.scope ?? []).join(",") !== (input.expected_scope ?? []).join(",")) return deny("request scope differs");
  if (input.service_visibility !== input.expected_service_visibility) return deny("service visibility differs");
  if (input.enrollment_certificate_baseline !== input.expected_enrollment_certificate_baseline) {
    return deny("enrollment_certificate protected baseline differs");
  }
  if (input.observed_fingerprint !== input.fingerprint) return deny("current production fingerprint differs");
  return { allowed: true };
}

const VALID = {
  artifact_path: ACTIVE_REL,
  status: "PINNED",
  execution_authorized: true,
  fingerprint: "a".repeat(32),
  observed_fingerprint: "a".repeat(32),
  captured_at_utc: "2026-08-01T00:00:00Z",
  valid_for_minutes: 120,
  reviewed_package_sha: "b".repeat(40),
  execution_sha: "b".repeat(40),
  migration_head: REQUIRED_HEAD,
  expected_migration_head: REQUIRED_HEAD,
  scope: ["SR-A", "SR-B"],
  expected_scope: ["SR-A", "SR-B"],
  matrix_sha: "m",
  expected_matrix_sha: "m",
  package_source_hash: "p",
  expected_package_source_hash: "p",
  function_graph: "28/28",
  expected_function_graph: "28/28",
  service_visibility: "hidden",
  expected_service_visibility: "hidden",
  enrollment_certificate_baseline: "ec",
  expected_enrollment_certificate_baseline: "ec",
  now: new Date("2026-08-01T00:30:00Z"),
};

describe("G1: the stale baseline is archived as historical evidence", () => {
  it("the archive file exists with explicit archival metadata", () => {
    expect(existsSync(join(root, ARCHIVE_REL))).toBe(true);
    expect(archive.status).toBe("STALE");
    expect(archive.execution_authorized).toBe(false);
    expect(archive.invalidated_after_migration).toBe(REQUIRED_HEAD);
    expect(archive.selectable_by_launcher).toBe(false);
    expect(archive.on_selection_attempt).toBe(HOLD);
  });

  it("records every invalidation reason", () => {
    const reasons = (archive.invalidated_reason as string[]).join(" | ");
    expect(reasons).toContain("expired valid_for_minutes");
    expect(reasons).toContain("reviewed_package_sha mismatch");
    expect(reasons).toContain("migration-head mismatch");
    expect(reasons).toContain("request scope changed after Stage 3 cleanup");
    expect(reasons).toContain("TEST_ONLY requests were deleted");
  });

  it("preserves the historical captured values", () => {
    const h = archive.historical_record;
    expect(h.status).toBe("PINNED");
    expect(h.fingerprint).toBe("be5040a4fd34fc1fbab235e118c509d0");
    expect(h.captured_at_utc).toBe("2026-07-29T23:20:07Z");
    expect(h.valid_for_minutes).toBe(120);
    expect(h.reviewed_package_sha).toBe("a1c86ea42b600e67f38c69a1cd610a916a33c312");
    expect(h.catalog_attestation.migration_head).toBe("20260729173359");
    expect(h.scope.length).toBe(8);
    expect(h.held_back.negative_cases_executed).toBe(0);
    expect(h.held_back.operator_preflight_executed).toBe(false);
  });

  it("the archived baseline can never be selected by the launcher", () => {
    expect(launcher).toContain("archived baseline is not selectable");
    expect(launcher).not.toContain("AUTHORITATIVE-BASELINE-20260729-STALE.json");
    expect(launcher).toContain(`$canonicalBaselineRelative = '${ACTIVE_REL}'`);
    expect(
      evaluateBaselineGate({ ...VALID, artifact_path: ARCHIVE_REL }),
    ).toMatchObject({ allowed: false, hold: HOLD });
  });

  it("the manifest references the archived baseline as non-selectable", () => {
    const archived = baselineBlock.archived_stale_baselines[0];
    expect(archived.path).toBe(ARCHIVE_REL);
    expect(archived.status).toBe("STALE");
    expect(archived.execution_authorized).toBe(false);
    expect(archived.selectable_by_launcher).toBe(false);
    expect(archived.sha256).toBe(sha256(archiveRaw));
  });
});

describe("G2/G3: the active baseline is a freshly captured PINNED baseline", () => {
  it("has the exact required PINNED state", () => {
    expect(active.status).toBe("PINNED");
    expect(active.fingerprint).toMatch(/^[0-9a-f]{32}$/u);
    expect(active.captured_at_utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u);
    expect(active.valid_for_minutes).toBe(120);
    expect(active.reviewed_package_sha).toMatch(/^[0-9a-f]{40}$/u);
    expect(active.migration_head).toBe(REQUIRED_HEAD);
    expect(active.scope).toHaveLength(8);
    expect(active.execution_authorized).toBe(true);
    expect(active.operator_preflight_executed).toBe(false);
    expect(active.negative_cases_executed).toBe(0);
    expect(active.contains_secrets).toBe(false);
  });

  it("carries no value from the stale baseline", () => {
    expect(activeRaw).not.toContain("be5040a4fd34fc1fbab235e118c509d0");
    expect(activeRaw).not.toContain("a1c86ea42b600e67f38c69a1cd610a916a33c312");
  });

  it("the manifest mirrors the PINNED state and pins the artifact hash", () => {
    expect(baselineBlock.status).toBe("PINNED");
    expect(baselineBlock.execution_authorized).toBe(true);
    expect(baselineBlock.fingerprint).toBe(active.fingerprint);
    expect(baselineBlock.artifact_path).toBe(ACTIVE_REL);
    expect(baselineBlock.artifact_sha256).toBe(sha256(activeRaw));
    expect(baselineBlock.on_mismatch).toBe(HOLD);
  });

  it("G3: the baseline attests exactly the current production head", () => {
    expect(active.expected_migration_head).toBe(REQUIRED_HEAD);
    expect(baselineBlock.expected_migration_head).toBe(REQUIRED_HEAD);
    expect(baselineBlock.migration_head).toBe(REQUIRED_HEAD);
    expect(launcher).toContain(`$requiredMigrationHead = '${REQUIRED_HEAD}'`);
    expect(preflight).toContain(`'${REQUIRED_HEAD}'`);
    expect(pins).toContain(`('baseline_expected_migration_head', '${REQUIRED_HEAD}')`);
  });
});


describe("G4: fail-closed validation rules", () => {
  it("the intact contract is the only allowed shape", () => {
    expect(evaluateBaselineGate(VALID).allowed).toBe(true);
  });

  const cases: Array<[string, Record<string, unknown>]> = [
    ["PENDING baseline blocks execution", { status: "PENDING", fingerprint: null }],
    ["execution_authorized false blocks execution", { execution_authorized: false }],
    ["null fingerprint blocks execution", { fingerprint: null }],
    ["expired PINNED baseline blocks execution", { now: new Date("2026-08-01T05:00:00Z") }],
    ["wrong reviewed_package_sha blocks execution", { reviewed_package_sha: "c".repeat(40) }],
    ["wrong migration head blocks execution", { migration_head: "20260729173359" }],
    ["stale request scope blocks execution", { scope: ["SR-OLD"] }],
    ["fingerprint mismatch blocks execution", { observed_fingerprint: "d".repeat(32) }],
    ["matrix SHA drift blocks execution", { matrix_sha: "other" }],
    ["package-source hash drift blocks execution", { package_source_hash: "other" }],
    ["function graph drift blocks execution", { function_graph: "27/28" }],
    ["service visibility drift blocks execution", { service_visibility: "visible" }],
    ["enrollment_certificate baseline drift blocks execution", { enrollment_certificate_baseline: "changed" }],
    ["non-canonical baseline path blocks execution", { artifact_path: ARCHIVE_REL }],
  ];

  for (const [name, patch] of cases) {
    it(name, () => {
      const result = evaluateBaselineGate({ ...VALID, ...patch });
      expect(result.allowed).toBe(false);
      expect(result.hold).toBe(HOLD);
    });
  }

  it("the current committed baseline is rejected by the gate (PENDING)", () => {
    const result = evaluateBaselineGate({
      ...VALID,
      artifact_path: baselineBlock.artifact_path,
      status: baselineBlock.status,
      execution_authorized: baselineBlock.execution_authorized,
      fingerprint: baselineBlock.fingerprint,
    });
    expect(result.allowed).toBe(false);
    expect(result.hold).toBe(HOLD);
  });

  it("the launcher enforces the same rules and exits with the HOLD family", () => {
    expect(launcher).toContain(HOLD);
    for (const rule of [
      "status is",
      "execution_authorized is not true",
      "fingerprint is null",
      "baseline is expired",
      "reviewed_package_sha differs from the exact execution SHA",
      "migration head is not",
      "request scope differs from the manifest scope",
      "baseline artifact sha256 differs from the manifest pin",
      "baseline path is not the canonical active path",
    ]) {
      expect(launcher).toContain(rule);
    }
  });

  it("the SQL preflight and post-run check fail closed with the HOLD family", () => {
    expect(preflight).toContain(HOLD);
    expect(preflight).toContain("baseline_execution_authorized");
    expect(preflight).toContain("baseline_artifact_path");
    expect(fingerprintCheck).toContain("v_expected text := NULL");
    expect(fingerprintCheck).toContain(HOLD);
    expect(pins).toContain("('baseline_status', 'PENDING')");
    expect(pins).toContain("('baseline_fingerprint', NULL)");
    expect(pins).toContain("('baseline_execution_authorized', 'false')");
  });
});

describe("G5: no execution occurred in this mission", () => {
  it("operator preflight remains unexecuted and zero negative cases ran", () => {
    expect(active.operator_preflight_executed).toBe(false);
    expect(active.negative_cases_executed).toBe(0);
    expect(archive.historical_record.held_back.operator_preflight_executed).toBe(false);
    expect(archive.historical_record.held_back.negative_cases_executed).toBe(0);
  });

  it("production RPC count remains zero in both baselines", () => {
    expect(archive.historical_record.capture_transaction.workflow_rpc_calls).toBe(0);
    expect(archive.historical_record.capture_transaction.production_writes).toBe(0);
    expect(active.capture_requirements.join(" | ")).toContain("no production write, no workflow RPC");
  });

  it("neither baseline artifact contains secrets", () => {
    expect(active.contains_secrets).toBe(false);
    expect(archive.contains_secrets).toBe(false);
    expect(activeRaw).not.toMatch(/PGPASSWORD|password\s*=/iu);
    expect(archiveRaw).not.toMatch(/PGPASSWORD|password\s*=/iu);
  });
});
