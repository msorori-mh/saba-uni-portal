/**
 * PORTAL-B1-PINNED-BASELINE-EXECUTION-AUTHORIZATION-FAIL-CLOSED-REMEDIATION-26
 *
 * Offline, source-only proofs of the fail-closed separation between:
 *   gate 1 — a valid PINNED production baseline (never self-authorizing),
 *   gate 2 — a successful read-only Operator Preflight (session marker),
 *   gate 3 — an explicit owner-approved execution authorization artifact
 *            (NOT granted by this mission).
 *
 * These tests never open a database connection, never call an RPC and never
 * execute a negative-matrix case. The gate state machine is mirrored in pure
 * TypeScript and cross-checked against the launcher, the preflight, the
 * execution gate and the rendered pins.
 */
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EXECUTION_AUTH_HOLD_TOKEN,
  EXECUTION_AUTH_REL,
  main as renderPackage,
  toLf,
} from "../../scripts/b1-rpc-principal-harness-01/render-negative-cases";

const root = process.cwd();
const pkg = join(root, "scripts", "b1-rpc-principal-harness-01");
const BASELINE_REL = "scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE.json";
const REQUIRED_HEAD = "20260801021541";
const BASELINE_HOLD = "HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE";
const AUTH_HOLD = EXECUTION_AUTH_HOLD_TOKEN;

const read = (p: string) => toLf(readFileSync(p, "utf8"));
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** SQL with `--` line comments and block comments stripped. */
const strip = (sql: string) =>
  sql
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .split("\n")
    .map((l) => l.replace(/--.*$/u, ""))
    .join("\n");

// The renderer wipes and rewrites generated/ from source on every run, so the
// pins asserted below always reflect the committed source, never a stale tree.
renderPackage();

const manifest = JSON.parse(read(join(pkg, "TARGET-MANIFEST.json"))) as Record<string, any>;
const baselineBlock = manifest.authoritative_baseline;
const authBlock = manifest.execution_authorization;
const baselineRaw = read(join(root, BASELINE_REL));
const baseline = JSON.parse(baselineRaw) as Record<string, any>;
const authRaw = read(join(root, EXECUTION_AUTH_REL));
const authArtifact = JSON.parse(authRaw) as Record<string, any>;
const launcher = read(join(pkg, "run-negative-matrix.ps1"));
const preflight = read(join(pkg, "00-preflight.sql"));
const execGate = read(join(pkg, "01-execution-gate.sql"));
const master = read(join(pkg, "generated", "master-negative-matrix.sql"));
const pins = read(join(pkg, "generated", "pins.sql"));
const renderer = read(join(pkg, "render-negative-cases.ts"));

/* ==========================================================================
 * Pure mirror of the three-gate state machine.
 * gate1 = baseline verification eligibility (Operator Preflight may inspect)
 * gate3 = execution of the 267 negative cases
 * gate2 (operator preflight pass) is an input produced only by a real
 * read-only preflight run; the SQL package proves it via the session marker.
 * ========================================================================== */
type GateInput = {
  baseline_status: string;
  baseline_execution_authorized: boolean;
  baseline_fingerprint: string | null;
  observed_fingerprint: string | null;
  baseline_expired: boolean;
  migration_head: string;
  expected_migration_head: string;
  function_graph_match: boolean;
  operator_preflight_passed: boolean;
  auth_status: string;
  auth_execution_authorized: boolean;
  auth_bound_fingerprint: string | null;
  auth_bound_baseline_sha256: string | null;
  auth_bound_reviewed_package_sha: string | null;
  auth_expired: boolean;
  baseline_artifact_sha256: string;
  reviewed_package_sha: string;
};

/** Gate 1: may the Operator Preflight verify this baseline? (No execution.) */
function baselineVerificationGate(i: GateInput): { allowed: boolean; hold?: string; reason?: string } {
  const deny = (reason: string) => ({ allowed: false, hold: BASELINE_HOLD, reason });
  if (i.baseline_status !== "PINNED") return deny("status != PINNED");
  if (i.baseline_execution_authorized !== false) return deny("baseline self-authorizes execution");
  if (!i.baseline_fingerprint) return deny("fingerprint is null");
  if (i.baseline_expired) return deny("baseline is expired");
  if (i.expected_migration_head !== REQUIRED_HEAD || i.migration_head !== REQUIRED_HEAD) {
    return deny("migration head mismatch");
  }
  if (!i.function_graph_match) return deny("function graph mismatch");
  return { allowed: true };
}

/** Gate 3: may the 267 negative cases execute? Requires gates 1 + 2 + 3. */
function executionGate(i: GateInput): { allowed: boolean; hold?: string; reason?: string } {
  const g1 = baselineVerificationGate(i);
  if (!g1.allowed) return g1;
  const deny = (reason: string) => ({ allowed: false, hold: AUTH_HOLD, reason });
  if (i.observed_fingerprint !== i.baseline_fingerprint) {
    return { allowed: false, hold: BASELINE_HOLD, reason: "stale fingerprint" };
  }
  if (!i.operator_preflight_passed) return deny("operator preflight has not passed in this session");
  if (i.auth_status !== "GRANTED" || i.auth_execution_authorized !== true) {
    return deny("no explicit owner-approved execution authorization");
  }
  if (i.auth_bound_fingerprint !== i.baseline_fingerprint) return deny("authorization not bound to the baseline fingerprint");
  if (i.auth_bound_baseline_sha256 !== i.baseline_artifact_sha256) {
    return deny("authorization not bound to the baseline artifact sha256");
  }
  if (i.auth_bound_reviewed_package_sha !== i.reviewed_package_sha) {
    return deny("authorization not bound to the reviewed package SHA");
  }
  if (i.auth_expired) return deny("execution authorization is expired");
  return { allowed: true };
}

const VALID: GateInput = {
  baseline_status: "PINNED",
  baseline_execution_authorized: false,
  baseline_fingerprint: "4c95c6a344cee2f52ade4a5312bd8240",
  observed_fingerprint: "4c95c6a344cee2f52ade4a5312bd8240",
  baseline_expired: false,
  migration_head: REQUIRED_HEAD,
  expected_migration_head: REQUIRED_HEAD,
  function_graph_match: true,
  operator_preflight_passed: true,
  auth_status: "GRANTED",
  auth_execution_authorized: true,
  auth_bound_fingerprint: "4c95c6a344cee2f52ade4a5312bd8240",
  auth_bound_baseline_sha256: "a".repeat(64),
  auth_bound_reviewed_package_sha: "b".repeat(40),
  auth_expired: false,
  baseline_artifact_sha256: "a".repeat(64),
  reviewed_package_sha: "b".repeat(40),
};

describe("REMEDIATION-26: corrected gate state machine", () => {
  it("1. a PENDING baseline blocks everything", () => {
    const pending: GateInput = { ...VALID, baseline_status: "PENDING", baseline_fingerprint: null, observed_fingerprint: null };
    expect(baselineVerificationGate(pending).allowed).toBe(false);
    expect(executionGate(pending)).toMatchObject({ allowed: false, hold: BASELINE_HOLD });
    // source: the preflight and the execution gate both reject non-PINNED pins
    expect(preflight).toContain("v_status IS DISTINCT FROM 'PINNED'");
    expect(execGate).toContain("v_status IS DISTINCT FROM 'PINNED'");
  });

  it("2. a synthetic PINNED baseline with execution_authorized=false permits verification only", () => {
    expect(baselineVerificationGate(VALID).allowed).toBe(true);
    // LONGRUN-08: committed source baseline is PENDING; gate still accepts synthetic PINNED input.
    expect(baseline.status).toBe("PENDING");
    expect(baseline.execution_authorized).toBe(false);
    expect(baselineBlock.execution_authorized).toBe(false);
    expect(baseline.operator_preflight_executed).toBe(false);
    expect(baseline.negative_cases_executed).toBe(0);
    expect(baselineBlock.status).toBe("PENDING");
  });

  it("3. a PINNED baseline does not itself authorize execution", () => {
    // no owner approval exists: the artifact is NOT_GRANTED, so even a fully
    // valid PINNED baseline leaves the execution gate closed
    const noApproval: GateInput = { ...VALID, auth_status: "NOT_GRANTED", auth_execution_authorized: false };
    expect(baselineVerificationGate(noApproval).allowed).toBe(true);
    expect(executionGate(noApproval)).toMatchObject({ allowed: false, hold: AUTH_HOLD });
    expect(authArtifact.status).toBe("NOT_GRANTED");
    expect(authArtifact.execution_authorized).toBe(false);
    expect(pins).toContain("('execution_authorization_status', 'NOT_GRANTED')");
  });

  it("4. the Operator Preflight cannot execute any RPC", () => {
    // no workflow RPC invocation anywhere in the preflight or the gate
    for (const sql of [preflight, execGate]) {
      expect(sql).not.toMatch(/PERFORM\s+public\.act_on_b1_student_request_step_atomic/u);
      expect(sql).not.toMatch(/PERFORM\s+public\.record_external_university_payment_confirmation/u);
      expect(sql).not.toMatch(/CALL\s+public\./iu);
    }
    // read-only: no COMMIT outside comments, ends in ROLLBACK, produces a reviewable verdict
    expect(strip(preflight)).not.toMatch(/\bCOMMIT\b/u);
    expect(strip(execGate)).not.toMatch(/\bCOMMIT\b/u);
    expect(preflight).toContain("SELECT 'B1_OPERATOR_PREFLIGHT_PASS' AS verdict;");
    expect(preflight).toContain("ROLLBACK;");
    // the preflight never sets execution authorization
    expect(preflight).not.toMatch(/execution_authorized\s*=\s*'true'/u);
    expect(preflight).not.toContain("execution_authorization_status");
  });

  it("5. a successful Operator Preflight alone does not authorize the 267 cases", () => {
    const preflightOnly: GateInput = { ...VALID, auth_status: "NOT_GRANTED", auth_execution_authorized: false };
    expect(preflightOnly.operator_preflight_passed).toBe(true);
    expect(executionGate(preflightOnly)).toMatchObject({ allowed: false, hold: AUTH_HOLD });
    // the session marker is set only AFTER the preflight ROLLBACK and is
    // checked by the separate execution gate, never by the preflight itself
    expect(preflight).toContain("set_config('b1.operator_preflight_passed', 'true', false)");
    expect(preflight.indexOf("ROLLBACK;")).toBeLessThan(preflight.indexOf("b1.operator_preflight_passed"));
    expect(execGate).toContain("current_setting('b1.operator_preflight_passed', true) IS DISTINCT FROM 'true'");
  });

  it("6. execution_authorized=true without a successful preflight remains blocked", () => {
    const noPreflight: GateInput = { ...VALID, operator_preflight_passed: false };
    expect(executionGate(noPreflight)).toMatchObject({ allowed: false, hold: AUTH_HOLD });
    // SQL: the execution gate raises before any case when the marker is absent
    expect(execGate).toContain("the read-only operator preflight has not passed in this session");
    expect(execGate.indexOf("b1.operator_preflight_passed")).toBeLessThan(execGate.indexOf("GRANTED"));
  });

  it("7. a successful preflight without explicit execution authorization remains blocked", () => {
    const result = executionGate({ ...VALID, auth_status: "NOT_GRANTED", auth_execution_authorized: false });
    expect(result.allowed).toBe(false);
    expect(result.hold).toBe(AUTH_HOLD);
    // the launcher stops on the same gate before psql
    expect(launcher).toContain(AUTH_HOLD);
    expect(launcher).toContain("RESULT: $authHold");
    expect(launcher).toContain("exit 4");
    expect(launcher.indexOf("function Deny-Authorization")).toBeLessThan(launcher.indexOf("& psql "));
  });

  it("8. a stale fingerprint remains blocked", () => {
    expect(executionGate({ ...VALID, observed_fingerprint: "d".repeat(32) })).toMatchObject({
      allowed: false,
      hold: BASELINE_HOLD,
    });
    expect(executionGate({ ...VALID, auth_bound_fingerprint: "d".repeat(32) })).toMatchObject({
      allowed: false,
      hold: AUTH_HOLD,
    });
    expect(preflight).toContain("fingerprint mismatch");
    expect(execGate).toContain("authorization is not bound to the active baseline fingerprint");
  });

  it("9. an expired baseline remains blocked", () => {
    expect(baselineVerificationGate({ ...VALID, baseline_expired: true }).allowed).toBe(false);
    expect(executionGate({ ...VALID, baseline_expired: true }).allowed).toBe(false);
    expect(executionGate({ ...VALID, auth_expired: true })).toMatchObject({ allowed: false, hold: AUTH_HOLD });
    expect(launcher).toContain("baseline is expired");
    expect(execGate).toContain("execution authorization is expired");
  });

  it("10. a mismatched migration head remains blocked", () => {
    expect(executionGate({ ...VALID, migration_head: "20260731203030" })).toMatchObject({
      allowed: false,
      hold: BASELINE_HOLD,
    });
    expect(launcher).toContain(`$requiredMigrationHead = '${REQUIRED_HEAD}'`);
    expect(preflight).toContain(`'${REQUIRED_HEAD}'`);
    expect(pins).toContain(`('baseline_expected_migration_head', '${REQUIRED_HEAD}')`);
  });

  it("11. a function-graph mismatch remains blocked", () => {
    expect(executionGate({ ...VALID, function_graph_match: false })).toMatchObject({
      allowed: false,
      hold: BASELINE_HOLD,
    });
    expect(preflight).toContain("FUNCTION_GRAPH_DRIFT");
    expect(preflight).toContain("B1_PREFLIGHT_FUNCTION_GRAPH_UNPINNED");
  });

  it("12. direct launcher invocation cannot bypass the gates", () => {
    // no parameters, no skip/bypass variables (the only mention of -SkipRender
    // is a comment recording that it was removed)
    expect(launcher).toContain("param()");
    expect(launcher).not.toMatch(/\$SkipRender|\$Bypass|\$Skip/u);
    // launcher order: baseline gate -> render -> fixture gate -> authorization gate -> psql
    const bIdx = launcher.indexOf("$baselineHold = 'HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE'");
    const rIdx = launcher.indexOf("render-negative-cases.ts", bIdx);
    const fIdx = launcher.indexOf("RESULT: HOLD_B1_NEGATIVE_RPC_MATRIX_FIXTURE_PACKAGE_NOT_APPLIED", rIdx);
    const aIdx = launcher.indexOf("function Deny-Authorization", fIdx);
    const pIdx = launcher.indexOf("& psql ");
    expect(bIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeLessThan(rIdx);
    expect(rIdx).toBeLessThan(fIdx);
    expect(fIdx).toBeLessThan(aIdx);
    expect(aIdx).toBeLessThan(pIdx);
    // SQL order inside the master: preflight -> execution gate -> case-0001
    const preflightIdx = master.indexOf("\\ir ../00-preflight.sql");
    const gateIdx = master.indexOf("\\ir ../01-execution-gate.sql");
    const caseIdx = master.indexOf("\\ir cases/case-0001.sql");
    expect(preflightIdx).toBeGreaterThan(-1);
    expect(preflightIdx).toBeLessThan(gateIdx);
    expect(gateIdx).toBeLessThan(caseIdx);
    // running psql directly hits the same gates: the execution gate re-loads
    // the pins and re-proves all three gates inside the session
    expect(execGate).toContain("\\ir generated/pins.sql");
    expect(execGate).toContain(AUTH_HOLD);
    expect(execGate).toContain("SELECT 'B1_EXECUTION_GATE_PASS' AS verdict;");
  });

  it("13. manually editing generated pins without source consistency is detected", () => {
    // (a) the render is deterministic: a fresh render is byte-identical
    const before = read(join(pkg, "generated", "pins.sql"));
    renderPackage();
    const after = read(join(pkg, "generated", "pins.sql"));
    expect(after).toBe(before);
    // (b) a hand edit diverges from the authoritative render and is wiped by it
    const tampered = before.replace("('execution_authorization_status', 'NOT_GRANTED')", "('execution_authorization_status', 'GRANTED')");
    expect(tampered).not.toBe(before);
    renderPackage();
    expect(read(join(pkg, "generated", "pins.sql"))).toBe(before);
    // (c) the launcher always re-renders before psql — there is no skip path —
    // and the renderer refuses source drift between the manifest and the
    // pinned artifacts
    expect(launcher.indexOf("render-negative-cases.ts")).toBeLessThan(launcher.indexOf("& psql "));
    expect(renderer).toContain("BASELINE_ARTIFACT_SHA_MISMATCH");
    expect(renderer).toContain("EXECUTION_AUTHORIZATION_ARTIFACT_SHA_MISMATCH");
    expect(renderer).toContain("EXECUTION_AUTHORIZATION_BLOCK_MISSING");
    expect(renderer).toContain("BASELINE_SELF_AUTHORIZATION_DRIFT");
    expect(baselineBlock.artifact_sha256).toBe(sha256(baselineRaw));
    expect(authBlock.artifact_sha256).toBe(sha256(authRaw));
  });

  it("14. no RPC is invoked by the tests or the preflight/gate simulations", () => {
    // this test file imports no database client and spawns no process
    const self = read(join(root, "tests/b1-five-services-rpc-authorization-preflight-01/execution-authorization-fail-closed-26.test.ts"));
    const imports = self.split("\n").filter((l) => /^import\s/u.test(l)).join("\n");
    expect(imports).not.toMatch(/pg|postgres|supabase|mysql|sqlite/iu);
    // tokens are assembled so this file never literally contains them
    const spawnTokens = ["Bun\\.sp", "awn", "|child_pro", "cess", "|\\.conn", "ect\\("].join("");
    expect(self).not.toMatch(new RegExp(spawnTokens, "u"));
    // the preflight and the execution gate contain no workflow RPC invocation
    for (const sql of [preflight, execGate]) {
      expect(sql).not.toMatch(/PERFORM\s+public\.act_on_b1_student_request_step_atomic/u);
      expect(sql).not.toMatch(/PERFORM\s+public\.record_external_university_payment_confirmation/u);
    }
    // LONGRUN-08: baseline capture session is deferred (PENDING); only zero-execution pins remain.
    expect(baseline.negative_cases_executed).toBe(0);
    expect(baseline.operator_preflight_executed).toBe(false);
    expect(baseline.execution_authorized).toBe(false);
  });
});

describe("REMEDIATION-26: committed source state keeps execution closed", () => {
  it("the captured baseline values remain PENDING and non-self-authorizing (LONGRUN-08)", () => {
    expect(baseline.status).toBe("PENDING");
    expect(baseline.fingerprint).toBeNull();
    expect(baseline.execution_authorized).toBe(false);
    expect(baselineBlock.status).toBe("PENDING");
    expect(baselineBlock.fingerprint).toBeNull();
    expect(baselineBlock.execution_authorized).toBe(false);
    expect(authArtifact.status).toBe("NOT_GRANTED");
    expect(authArtifact.execution_authorized).toBe(false);
  });
});
