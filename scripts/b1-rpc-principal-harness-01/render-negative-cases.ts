#!/usr/bin/env bun
/**
 * PORTAL-B1-NEGATIVE-RPC-MATRIX-FINAL-EXECUTION-PACKAGE-REMEDIATION-07
 * Offline renderer. NO database connection, NO RPC call, NO role change.
 *
 * Inputs (both in-repository, both pinned):
 *   tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json
 *   scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json
 *
 * Outputs (git-ignored, under generated/):
 *   pins.sql                    - temp-table pins consumed by 00-preflight.sql
 *   cases/case-0001.sql ... 0267.sql
 *   fingerprint-check.sql       - post-run outside-transaction baseline equality
 *   master-negative-matrix.sql  - G9 single-psql master script
 *   MANIFEST.json               - counts + rendered file list
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const MATRIX_PATH = join(REPO, "tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json");
const MANIFEST_PATH = join(HERE, "TARGET-MANIFEST.json");
const FINGERPRINT_PATH = join(HERE, "fingerprint.sql");
const OUT = join(HERE, "generated");
const CASES = join(OUT, "cases");

export const MATRIX_SHA256_LF = "fd2621877d4db1df5927f0583d6de5a269c9e50b258578592c299f373459739d";
export const EXPECTED_NEGATIVE_TOTAL = 267;
/** REMEDIATION-15 G5: every case whose contract sits behind the active-step
 *  gate is now bound to a deterministic ACTIVE Fixture-13 runtime step, so the
 *  blocked partition is empty by contract. A blocked case is no longer a legal
 *  render output: it aborts the render instead of producing a .BLOCKED.sql. */
export const EXPECTED_EXECUTABLE_TOTAL = 267;
export const EXPECTED_BLOCKED_TOTAL = 0;
export const BLOCKED_TOKEN = "BLOCKED_PENDING_ACTIVE_FIXTURE";
/** Backwards-compatible alias: the single canonical blocked token. */
export const TRANSFER_SCOPE_BLOCKED_TOKEN = BLOCKED_TOKEN;
export const BLOCKED_HOLD_TOKEN = "HOLD_B1_NEGATIVE_RPC_MATRIX_ACTIVE_FIXTURES_INCOMPLETE";
/** Fixture package that supplies the 19 ACTIVE TEST_ONLY steps. */
export const FIXTURE_PACKAGE_ID = "B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13";
export const FIXTURE_MARKER = "TEST_ONLY_B1_FIXTURE_13";
export const FIXTURE_HOLD_TOKEN = "HOLD_B1_NEGATIVE_RPC_MATRIX_FIXTURE_PACKAGE_NOT_APPLIED";
export const APPROVED_PROJECT_REF = "wpmicqriltrowwonknox";

/** G1 — forbidden characters / tokens in ANY MATRIX-derived value. */
export const FORBIDDEN_PATTERNS: Array<[string, RegExp]> = [
  ["newline_or_cr", /[\r\n]/u],
  ["control_char", /[\u0000-\u001F\u007F]/u],
  ["path_separator", /[/\\]/u],
  ["parent_path", /\.\./u],
  ["semicolon", /;/u],
  ["sql_line_comment", /--/u],
  ["sql_block_comment_open", /\/\*/u],
  ["sql_block_comment_close", /\*\//u],
  ["dollar_case_tag", /\$case\$/iu],
  ["tx_control_keyword", /\b(BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\b/iu],
  ["quote", /['"`]/u],
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const REQUEST_NUMBER_RE = /^SR-\d{8}-[0-9A-F]{8}$/u;
const KEY_RE = /^[a-z][a-z0-9_]{2,63}$/u;
const ACTION_RE = /^[a-z][a-z0-9_]{2,63}$/u;

export function sha256Lf(text: string): string {
  return createHash("sha256").update(toLf(text), "utf8").digest("hex");
}

export function assertSafeScalar(label: string, value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) {
    throw new Error(`MATRIX_VALIDATION_FAIL: ${label}: bad length`);
  }
  for (const [name, re] of FORBIDDEN_PATTERNS) {
    if (re.test(value)) throw new Error(`MATRIX_VALIDATION_FAIL: ${label}: ${name}`);
  }
  return value;
}

/** Free-text diagnostics (expect_error) may contain spaces and slashes but never
 *  newlines, control characters, quotes or statement terminators. */
export function assertSafeDiagnostic(label: string, value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 300) {
    throw new Error(`MATRIX_VALIDATION_FAIL: ${label}: bad length`);
  }
  for (const [name, re] of FORBIDDEN_PATTERNS) {
    if (name === "path_separator" || name === "sql_line_comment") continue;
    if (re.test(value)) throw new Error(`MATRIX_VALIDATION_FAIL: ${label}: ${name}`);
  }
  return value;
}

function assertUuid(label: string, value: string): string {
  assertSafeScalar(label, value);
  if (!UUID_RE.test(value)) throw new Error(`MATRIX_VALIDATION_FAIL: ${label}: not a uuid`);
  return value;
}

function lit(value: string): string {
  assertSafeScalar("sql_literal", value);
  return `'${value}'`;
}

function comment(label: string, value: unknown): string {
  const encoded = JSON.stringify(value).replace(/[\r\n]/gu, " ");
  if (/[\r\n]/u.test(encoded)) throw new Error("MATRIX_VALIDATION_FAIL: comment newline");
  return `-- ${label}: ${encoded}`;
}

/** REMEDIATION-57 G1 — every text input is normalized to LF BEFORE it is
 *  parsed, scanned for LIMIT, or hashed. A CRLF checkout must produce a
 *  byte-identical render and an identical SHA256 to an LF checkout. */
export function toLf(text: string): string {
  return text.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n");
}

export function readLf(path: string): string {
  return toLf(readFileSync(path, "utf8"));
}

/** Extracts the single canonical fingerprint expression from fingerprint.sql. */
export function extractFingerprintExpr(rawSql: string): string {
  const sql = toLf(rawSql);
  const start = sql.indexOf("-- BEGIN_FINGERPRINT_EXPR");
  const end = sql.indexOf("-- END_FINGERPRINT_EXPR");
  if (start < 0 || end < 0 || end < start) {
    throw new Error("FINGERPRINT_MARKERS_MISSING");
  }
  const expr = sql.slice(start + "-- BEGIN_FINGERPRINT_EXPR".length, end).trim();
  if (!expr.startsWith("(") || !expr.endsWith(")")) throw new Error("FINGERPRINT_EXPR_MALFORMED");

  // G3: strip block comments first, then line comments, and only then look for
  // LIMIT. A comment that merely mentions LIMIT must never fail the render, and
  // a real LIMIT must never hide inside one.
  const withoutComments = expr
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/--[^\r\n]*/gu, " ");
  if (/\bLIMIT\b/iu.test(withoutComments)) throw new Error("FINGERPRINT_EXPR_HAS_LIMIT");
  return expr;
}

/* ==========================================================================
 * G1 — DENIAL CLASS FAIL-CLOSED CONTRACT
 * A negative case is PASS only when the RPC was denied by the authorization
 * layer itself: SQLSTATE and message family must both match MATRIX.json.
 * Every other outcome is CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL -> HOLD.
 * ========================================================================== */

export type DenialRule = {
  id: string;
  match: { rpc?: string; case_class?: string; runtime_status?: string };
  sqlstate: string;
  message_family: string[];
};

export type DenialContract = {
  version: number;
  fail_closed: boolean;
  authorization_sqlstates: string[];
  resolution_rules: DenialRule[];
  infrastructure_sqlstates: string[];
  infrastructure_message_tokens: string[];
};

export type DenialObservation = {
  allowed: boolean;
  sqlstate?: string | null;
  message?: string | null;
};

export type DenialVerdict = { verdict: "PASS" | "HOLD"; reason: string };

export type DenialContext = { rpc: string; case_class: string; runtime_status: string };

export const CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL = "CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL";
export const CASE_FAIL_ALLOWED = "CASE_FAIL_ALLOWED";

export function assertDenialContract(contract: any): DenialContract {
  if (!contract || contract.fail_closed !== true) throw new Error("DENIAL_CONTRACT_NOT_FAIL_CLOSED");
  if (contract.version < 3) throw new Error("DENIAL_CONTRACT_VERSION_TOO_OLD");
  if (!Array.isArray(contract.authorization_sqlstates) || contract.authorization_sqlstates.length === 0) {
    throw new Error("DENIAL_CONTRACT_NO_AUTHORIZATION_SQLSTATE");
  }
  if (!Array.isArray(contract.infrastructure_sqlstates) || contract.infrastructure_sqlstates.length === 0) {
    throw new Error("DENIAL_CONTRACT_NO_INFRASTRUCTURE_SQLSTATE");
  }
  for (const s of [...contract.authorization_sqlstates, ...contract.infrastructure_sqlstates]) {
    if (!/^[0-9A-Z]{5}$/u.test(s)) throw new Error(`DENIAL_CONTRACT_BAD_SQLSTATE: ${s}`);
  }
  for (const s of contract.authorization_sqlstates) {
    if (contract.infrastructure_sqlstates.includes(s)) throw new Error("DENIAL_CONTRACT_SQLSTATE_OVERLAP");
  }
  if (!Array.isArray(contract.resolution_rules) || contract.resolution_rules.length === 0) {
    throw new Error("DENIAL_CONTRACT_NO_RESOLUTION_RULES");
  }
  for (const rule of contract.resolution_rules as DenialRule[]) {
    assertSafeScalar(`resolution_rules.${rule.id}`, rule.id);
    if (!contract.authorization_sqlstates.includes(rule.sqlstate)) {
      throw new Error(`DENIAL_CONTRACT_BAD_EXPECTED_SQLSTATE: ${rule.id}`);
    }
    if (!Array.isArray(rule.message_family) || rule.message_family.length === 0) {
      throw new Error(`DENIAL_CONTRACT_EMPTY_MESSAGE_FAMILY: ${rule.id}`);
    }
    for (const token of rule.message_family) assertSafeScalar(`message_family.${rule.id}`, token);
    for (const [k, v] of Object.entries(rule.match ?? {})) {
      if (!["rpc", "case_class", "runtime_status"].includes(k)) {
        throw new Error(`DENIAL_CONTRACT_BAD_MATCH_KEY: ${rule.id}.${k}`);
      }
      assertSafeScalar(`match.${rule.id}.${k}`, String(v));
    }
  }
  for (const token of contract.infrastructure_message_tokens ?? []) {
    assertSafeDiagnostic("infrastructure_message_tokens", token);
  }
  return contract as DenialContract;
}

/** First matching rule wins; no match is fail-closed. */
export function expectationFor(contract: DenialContract, ctx: DenialContext): DenialRule {
  const rule = contract.resolution_rules.find(
    (r) =>
      (r.match.rpc === undefined || r.match.rpc === ctx.rpc) &&
      (r.match.case_class === undefined || r.match.case_class === ctx.case_class) &&
      (r.match.runtime_status === undefined || r.match.runtime_status === ctx.runtime_status),
  );
  if (!rule) {
    throw new Error(`DENIAL_CONTRACT_MISSING_EXPECTATION: ${ctx.rpc}/${ctx.case_class}/${ctx.runtime_status}`);
  }
  return rule;
}

/** Pure, offline mirror of the SQL gate emitted into every rendered case.
 *  The (SQLSTATE, message family) pair is compared FIRST; only a pair that does
 *  not match the resolved authorization rule is classified as infrastructure. */
export function classifyDenialOutcome(
  observation: DenialObservation,
  contract: DenialContract,
  ctx: DenialContext,
): DenialVerdict {
  const expected = expectationFor(contract, ctx);
  if (observation.allowed) {
    return { verdict: "HOLD", reason: `${CASE_FAIL_ALLOWED}: RPC succeeded but DENY was required` };
  }
  const sqlstate = (observation.sqlstate ?? "").toUpperCase();
  const message = observation.message ?? "";
  const upper = message.toUpperCase();
  const familyHit = expected.message_family.some((t) => upper.includes(t.toUpperCase()));

  if (sqlstate === expected.sqlstate && familyHit) {
    return { verdict: "PASS", reason: "authorization denial matches the resolved denial class" };
  }
  if (contract.infrastructure_sqlstates.includes(sqlstate)) {
    return { verdict: "HOLD", reason: `${CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL}: infrastructure sqlstate ${sqlstate}` };
  }
  const hit = contract.infrastructure_message_tokens.find((t) => message.toLowerCase().includes(t.toLowerCase()));
  if (hit) {
    return { verdict: "HOLD", reason: `${CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL}: infrastructure message token "${hit}"` };
  }
  if (sqlstate !== expected.sqlstate) {
    return { verdict: "HOLD", reason: `${CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL}: sqlstate ${sqlstate || "<none>"} != ${expected.sqlstate}` };
  }
  return { verdict: "HOLD", reason: `${CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL}: message outside the expected family` };
}


function sqlTextArray(values: string[]): string {
  return `ARRAY[${values.map((v) => `'${v.replace(/'/gu, "''")}'`).join(",")}]::text[]`;
}

type PositiveCase = {
  request_type: string;
  request_number: string;
  step_order: number;
  step_key: string;
  runtime_step_id: string;
  runtime_status: string;
  unit: string;
  role: string;
  legal_action: string;
  rpc: string;
  principal_user_id: string;
};

type NegativeCase = {
  case: string;
  request_number: string;
  step_key: string;
  runtime_step_id?: string;
  actor_user_id: string | null;
  action: string;
  expect: string;
  expect_error: string;
  zero_mutation: boolean;
  configured_action_type?: string;
  assignee_is_exact_direct_assignee?: boolean;
  only_negative_variable?: string;
  requires_active_transfer_scope_fixture?: boolean;
  requires_active_step_fixture?: boolean;
  execution_status?: string;
  blocked_reason?: string | null;
};

/** REMEDIATION-09 G3 — per-step production state pinned in MATRIX.json. */
export type StepStatePin = {
  request_type: string;
  step_order: number;
  runtime_step_id: string;
  runtime_status: string;
  processing_unit_code: string;
  processing_role_code: string;
  configured_action_type: string;
  direct_assignee_user_id: string;
  predecessor_incomplete_expected: number | null;
  predecessor_total_expected: number;
  predecessor_set: Array<{ step_key: string; step_order: number; runtime_step_id: string; runtime_status: string }>;
  department_scope: string;
  rpc: string;
};

export type AttestedRequestState = {
  request_type: string;
  request_status: string;
  active_step_count: number;
  active_step_id: string;
  fee_assessment_rows: number;
  source_department_id: string | null;
  target_department_id: string | null;
};

/** REMEDIATION-12 G1 — a case whose contract lives BEHIND the active-step gate
 *  may only execute against an ACTIVE step; otherwise the RPC denies with
 *  B1_ACTIVE_STEP_REQUIRED, which proves neither scope nor the illegal-action
 *  contract. Such a case is blocked, never executed and never counted PASS. */
export function requiresActiveFixture(nc: NegativeCase): boolean {
  return (
    nc.requires_active_transfer_scope_fixture === true ||
    nc.requires_active_step_fixture === true ||
    nc.case === "illegal_action_by_exact_assignee"
  );
}

export function isBlockedCase(nc: NegativeCase, pin: StepStatePin): boolean {
  return requiresActiveFixture(nc) && pin.runtime_status !== "active";
}

/** Deprecated name kept for compatibility with earlier remediation rounds. */
export const isBlockedScopeCase = isBlockedCase;

export function renderBlockedCase(ordinal: number, nc: NegativeCase): string {
  const id = String(ordinal).padStart(4, "0");
  return `-- ============================================================================
-- case-${id} — NOT EXECUTED
${comment("class", nc.case)}
${comment("request_number", nc.request_number)}
${comment("step_key", nc.step_key)}
${comment("execution_status", BLOCKED_TOKEN)}
${comment("blocked_reason", nc.blocked_reason ?? "target step is not active")}
-- This case can NEVER be reported as PASS while it is blocked.
-- This file is excluded from master-negative-matrix.sql. Running it raises.
-- ============================================================================
DO $blocked$
BEGIN
  RAISE EXCEPTION 'CASE_${BLOCKED_TOKEN} case-${id} ${nc.case}: ${BLOCKED_HOLD_TOKEN}';
END
$blocked$;
`;
}

function renderCase(
  ordinal: number,
  nc: NegativeCase,
  pc: PositiveCase,
  fingerprintExpr: string,
  contract: DenialContract,
  attest: AttestedRequestState,
  pin: StepStatePin,
): string {
  const isAnon = nc.actor_user_id === null;
  const actor = isAnon ? null : assertUuid("actor_user_id", nc.actor_user_id as string);
  const stepId = assertUuid("runtime_step_id", nc.runtime_step_id ?? pc.runtime_step_id);
  const action = assertSafeScalar("action", nc.action);
  if (attest.request_type !== pc.request_type) {
    throw new Error(`MATRIX_VALIDATION_FAIL: attested request_type drift for ${nc.request_number}`);
  }
  const attestedSourceDepartment =
    pc.request_type === "department_transfer"
      ? assertUuid("source_department_id", attest.source_department_id as string)
      : "";
  const attestedTargetDepartment =
    pc.request_type === "department_transfer"
      ? assertUuid("target_department_id", attest.target_department_id as string)
      : "";
  if (!ACTION_RE.test(action)) throw new Error("MATRIX_VALIDATION_FAIL: action shape");
  if (!KEY_RE.test(assertSafeScalar("step_key", nc.step_key))) {
    throw new Error("MATRIX_VALIDATION_FAIL: step_key shape");
  }
  if (!REQUEST_NUMBER_RE.test(assertSafeScalar("request_number", nc.request_number))) {
    throw new Error("MATRIX_VALIDATION_FAIL: request_number shape");
  }
  if (nc.expect !== "DENY") throw new Error("MATRIX_VALIDATION_FAIL: expect must be DENY");
  if (nc.zero_mutation !== true) throw new Error("MATRIX_VALIDATION_FAIL: zero_mutation must be true");
  assertSafeDiagnostic("expect_error", nc.expect_error);
  assertSafeScalar("case_class", nc.case);
  const expected = expectationFor(contract, {
    rpc: pc.rpc,
    case_class: nc.case,
    runtime_status: pc.runtime_status,
  });

  // G6: the payment RPC takes the RUNTIME STEP id, not the request id.
  const rpcCall =
    pc.rpc === "record_external_university_payment_confirmation"
      ? `PERFORM public.record_external_university_payment_confirmation(v_step, 'TEST_ONLY_NEGATIVE_MATRIX');`
      : `PERFORM public.act_on_b1_student_request_step_atomic(v_step, ${lit(action)}, NULL::text, NULL::jsonb);`;

  const claims = isAnon
    ? `'{"role":"anon"}'`
    : `json_build_object('sub', ${lit(actor as string)}, 'role', 'authenticated')::text`;

  const principalAssertion = isAnon
    ? `IF auth.uid() IS NOT NULL OR auth.role() <> 'anon' THEN
      RAISE EXCEPTION 'PRINCIPAL_MISMATCH: anon';
    END IF;`
    : `IF auth.uid()::text IS DISTINCT FROM ${lit(actor as string)} OR auth.role() <> 'authenticated' THEN
      RAISE EXCEPTION 'PRINCIPAL_MISMATCH: %', auth.uid();
    END IF;`;

  // G7: assigned_user_id is NULL in production; the effective assignee is bound
  // through exactly one direct slot (staff / faculty / position assignment) plus
  // exactly one active unit+role processing assignment. Both are pinned.
  // REMEDIATION-15 G3: department-head steps resolve within ONE department, so
  // the unit+role assignment pin must be department-scoped or it would count
  // the source, target and unrelated heads together.
  const scopeDepartmentId = (pin as StepStatePin & { department_scope_department_id?: string | null })
    .department_scope_department_id;
  const scopeDepartmentLiteral = scopeDepartmentId
    ? `${lit(assertUuid("department_scope_department_id", scopeDepartmentId))}`
    : "NULL::text";

  const assigneePin = `IF v_assignee IS NOT NULL THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: assigned_user_id is no longer NULL on step %', v_step;
  END IF;
  SELECT (CASE WHEN w.assigned_staff_profile_id IS NOT NULL THEN 1 ELSE 0 END
        + CASE WHEN w.assigned_faculty_profile_id IS NOT NULL THEN 1 ELSE 0 END
        + CASE WHEN w.assigned_position_assignment_id IS NOT NULL THEN 1 ELSE 0 END)
    INTO v_n
    FROM public.student_request_workflow_steps w WHERE w.id = v_step;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: % direct assignee slots on step % (want 1)', v_n, v_step;
  END IF;
  SELECT count(*) INTO v_n
    FROM public.request_processing_assignments a
    JOIN public.student_request_workflow_steps w ON w.id = v_step
   WHERE a.unit_id = w.processing_unit_id
     AND a.role_id = w.processing_role_id
     AND a.is_active
     AND (a.starts_at IS NULL OR a.starts_at <= now())
     AND (a.ends_at IS NULL OR a.ends_at > now())
     AND (${scopeDepartmentLiteral} IS NULL OR a.department_id = ${scopeDepartmentLiteral}::uuid);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: % effective unit+role assignments for step % (want 1)', v_n, v_step;
  END IF;`;

  const transferScopePin =
    pc.request_type === "department_transfer"
      ? `SELECT count(*) INTO v_n FROM public.transfer_request_details d
   WHERE d.request_id = v_req
     AND d.current_department_id = ${lit(attestedSourceDepartment)}::uuid
     AND d.requested_department_id = ${lit(attestedTargetDepartment)}::uuid
     AND d.current_department_id <> d.requested_department_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: transfer department scope';
  END IF;`
      : `-- no department scope pin for this service`;

  // ---- REMEDIATION-09 G3: full per-step state pin -------------------------
  // Unit, role, configured action_type and the resolved direct assignee are all
  // pinned from MATRIX.json, so a negative case can never pass because the step
  // silently changed owner, unit, role or configured action.
  if (pin.runtime_step_id !== stepId) throw new Error("MATRIX_VALIDATION_FAIL: step pin id drift");
  if (pin.runtime_status !== pc.runtime_status) throw new Error("MATRIX_VALIDATION_FAIL: step pin status drift");
  const pinnedAssignee = assertUuid("direct_assignee_user_id", pin.direct_assignee_user_id);
  const statePin = `SELECT count(*) INTO v_n
    FROM public.student_request_workflow_steps w
    JOIN public.request_processing_units u ON u.id = w.processing_unit_id
    JOIN public.request_processing_roles ro ON ro.id = w.processing_role_id
    JOIN public.request_type_workflow_steps c ON c.id = w.workflow_step_id
   WHERE w.id = v_step
     AND u.code = ${lit(assertSafeScalar("unit", pin.processing_unit_code))}
     AND ro.code = ${lit(assertSafeScalar("role", pin.processing_role_code))}
     AND c.action_type = ${lit(assertSafeScalar("configured_action_type", pin.configured_action_type))};
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: unit/role/action_type pin failed on step %', v_step;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.student_request_workflow_steps w
   WHERE w.id = v_step
     AND ${lit(pinnedAssignee)}::uuid IN (
       coalesce((SELECT sp.user_id FROM public.staff_profiles sp
                  WHERE sp.id = w.assigned_staff_profile_id), '00000000-0000-0000-0000-000000000000'::uuid),
       coalesce((SELECT fp.user_id FROM public.faculty_profiles fp
                  WHERE fp.id = w.assigned_faculty_profile_id), '00000000-0000-0000-0000-000000000000'::uuid),
       coalesce((SELECT pa.user_id FROM public.position_assignments pa
                  WHERE pa.id = w.assigned_position_assignment_id), '00000000-0000-0000-0000-000000000000'::uuid));
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: direct assignee pin failed on step %', v_step;
  END IF;`;

  // G1: an illegal-action case is only meaningful when the actor IS the exact
  // direct assignee and the ONLY negative variable is the action itself.
  const illegalActionPin =
    nc.case === "illegal_action_by_exact_assignee"
      ? (() => {
          if (nc.assignee_is_exact_direct_assignee !== true) {
            throw new Error(`MATRIX_VALIDATION_FAIL: ${nc.case} actor is not the exact direct assignee`);
          }
          if (nc.only_negative_variable !== "action") {
            throw new Error(`MATRIX_VALIDATION_FAIL: ${nc.case} negative variable must be the action`);
          }
          if (actor !== pinnedAssignee) {
            throw new Error(`MATRIX_VALIDATION_FAIL: ${nc.case} actor != pinned direct assignee`);
          }
          if (nc.action === pin.configured_action_type) {
            throw new Error(`MATRIX_VALIDATION_FAIL: ${nc.case} action equals the configured action_type`);
          }
          return `-- G1: exact direct assignee, illegal action only.
  -- The authorization gate runs BEFORE the action_type gate in
  -- act_on_b1_student_request_step_atomic, so the expected denial is
  -- 42501 / B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED, never B1_ACTION_TYPE_MISMATCH.
  IF ${lit(action)} = ${lit(pin.configured_action_type)} THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: illegal action equals configured action_type';
  END IF;`;
        })()
      : `-- not an illegal-action case`;




  // ---- REMEDIATION-12 G6: exact predecessor SET + STATUS pin ---------------
  // Not a count of "unsatisfied" rows: every predecessor runtime step id and its
  // exact status are compared, so a silently completed/reset predecessor can
  // never let a negative case pass.
  const predRows = pin.predecessor_set ?? [];
  if (predRows.length !== (pin.predecessor_total_expected ?? 0)) {
    throw new Error("MATRIX_VALIDATION_FAIL: predecessor set size drift");
  }
  const predIncomplete = predRows.filter((r) => !["completed", "skipped"].includes(r.runtime_status)).length;
  if (predIncomplete !== (pin.predecessor_incomplete_expected ?? 0)) {
    throw new Error("MATRIX_VALIDATION_FAIL: predecessor incomplete pin drift");
  }
  const predecessorPin = `SELECT count(*) INTO v_n FROM public.student_request_workflow_steps w
   WHERE w.student_request_id = v_req AND w.step_order < v_order;
  IF v_n <> ${predRows.length} THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: % predecessor steps (want ${predRows.length})', v_n;
  END IF;
${
    predRows.length === 0
      ? "  -- no predecessor rows for this step"
      : predRows
          .map(
            (r) => `  SELECT count(*) INTO v_n FROM public.student_request_workflow_steps w
   WHERE w.id = ${lit(assertUuid("predecessor_step_id", r.runtime_step_id))}::uuid
     AND w.student_request_id = v_req
     AND w.step_order = ${r.step_order}
     AND w.status = ${lit(assertSafeScalar("predecessor_status", r.runtime_status))};
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: predecessor ${r.step_key} is not ${r.runtime_status}';
  END IF;`,
          )
          .join("\n")
  }
  SELECT count(*) INTO v_n FROM public.student_request_workflow_steps w
   WHERE w.student_request_id = v_req
     AND w.step_order < v_order
     AND w.status NOT IN ('completed','skipped');
  IF v_n <> ${predIncomplete} THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: % unsatisfied predecessor steps (want ${predIncomplete})', v_n;
  END IF;`;

  // ---- REMEDIATION-12 G6: department scope pin -----------------------------
  const expectedScope = pc.request_type === "department_transfer" ? "transfer_department_scope" : "not_applicable";
  if (pin.department_scope !== expectedScope) {
    throw new Error("MATRIX_VALIDATION_FAIL: department scope pin drift");
  }

  const id = String(ordinal).padStart(4, "0");
  return `-- ============================================================================
-- case-${id}
${comment("class", nc.case)}
${comment("request_number", nc.request_number)}
${comment("step_key", nc.step_key)}
${comment("action", nc.action)}
${comment("expect", nc.expect)}
${comment("expect_error", nc.expect_error)}
-- ROLLBACK-ONLY. No COMMIT anywhere in this file.
-- ============================================================================
BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL statement_timeout = '120s';
SET LOCAL idle_in_transaction_session_timeout = '180s';

DO $case$
DECLARE
  v_req      uuid;
  v_step     uuid := ${lit(stepId)}::uuid;
  v_type     text;
  v_status   text;
  v_assignee uuid;
  v_order    int;
  v_n        int;
  v_before   text;
  v_after    text;
  v_allowed  boolean := false;
  v_err      text;
  v_sqlstate text;
  v_status2  text;
  v_assign2  uuid;
BEGIN
  -- ---- G1: the case must run in a genuinely read-write transaction --------
  -- default_transaction_read_only must NEVER be the layer that blocks a write,
  -- otherwise an authorization bypass would be masked as a denial.
  IF current_setting('transaction_read_only') = 'on' THEN
    RAISE EXCEPTION 'CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL case-${id}: transaction is read-only';
  END IF;

  -- ---- G6: no row-lock clause is emitted anywhere. Row-level locking needs
  -- UPDATE privilege and would contradict the pure-observer contract.
  -- Isolation is SERIALIZABLE + ROLLBACK-only, and mutation is proven
  -- impossible by the before/after complete-content fingerprint below.
  SELECT r.id, r.request_type, r.status
    INTO v_req, v_type, v_status
    FROM public.student_requests r
   WHERE r.request_number = ${lit(nc.request_number)};
  IF v_req IS NULL THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: request ${nc.request_number} not visible';
  END IF;
  IF v_status IS DISTINCT FROM ${lit(attest.request_status)} THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: request status % (want ${attest.request_status})', v_status;
  END IF;

  SELECT count(*) INTO v_n FROM public.student_request_workflow_steps w
   WHERE w.student_request_id = v_req AND w.status = 'active';
  IF v_n <> ${attest.active_step_count} THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: % active steps (want ${attest.active_step_count})', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.student_request_fee_assessments f
   WHERE f.request_id = v_req;
  IF v_n <> ${attest.fee_assessment_rows} THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: % fee assessments (want ${attest.fee_assessment_rows})', v_n;
  END IF;

  ${transferScopePin}

  -- ---- G6: state pinning against MATRIX.json ------------------------------
  IF v_type IS DISTINCT FROM ${lit(pc.request_type)} THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: request_type %', v_type;
  END IF;


  SELECT w.status, w.assigned_user_id, w.step_order
    INTO v_status2, v_assignee, v_order
    FROM public.student_request_workflow_steps w
   WHERE w.id = v_step AND w.student_request_id = v_req;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: runtime step % not on request', v_step;
  END IF;
  IF v_status2 IS DISTINCT FROM ${lit(pc.runtime_status)} THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: step status % (want ${pc.runtime_status})', v_status2;
  END IF;
  IF v_order IS DISTINCT FROM ${pc.step_order} THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: step_order %', v_order;
  END IF;
  ${assigneePin}

  ${statePin}

  ${illegalActionPin}

  ${predecessorPin}

  -- ---- G7: complete-content fingerprint BEFORE the RPC --------------------
  v_before := ${fingerprintExpr};

  -- ---- principal switch ---------------------------------------------------
  EXECUTE 'SET LOCAL ROLE ${isAnon ? "anon" : "authenticated"}';
  PERFORM set_config('request.jwt.claims', ${claims}, true);
  ${principalAssertion}

  BEGIN
    ${rpcCall}
    v_allowed := true;
  EXCEPTION WHEN OTHERS THEN
    v_allowed := false;
    v_err := SQLERRM;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
  END;

  PERFORM set_config('request.jwt.claims', NULL, true);
  EXECUTE 'RESET ROLE';

  -- ---- G1: DENIAL CLASS GATE (fail-closed) --------------------------------
  IF v_allowed THEN
    RAISE EXCEPTION 'CASE_FAIL_ALLOWED case-${id} ${nc.case}: RPC succeeded but DENY was required';
  END IF;

  IF v_sqlstate = ANY (${sqlTextArray(contract.infrastructure_sqlstates)}) THEN
    RAISE EXCEPTION 'CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL case-${id} ${nc.case}: infrastructure sqlstate % : %',
      v_sqlstate, left(coalesce(v_err, ''), 160);
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(${sqlTextArray(contract.infrastructure_message_tokens)}) AS t(tok)
     WHERE position(lower(t.tok) in lower(coalesce(v_err, ''))) > 0
  ) THEN
    RAISE EXCEPTION 'CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL case-${id} ${nc.case}: infrastructure message % : %',
      v_sqlstate, left(coalesce(v_err, ''), 160);
  END IF;

  IF v_sqlstate IS DISTINCT FROM ${lit(expected.sqlstate)} THEN
    RAISE EXCEPTION 'CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL case-${id} ${nc.case}: sqlstate % expected ${expected.sqlstate} : %',
      v_sqlstate, left(coalesce(v_err, ''), 160);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM unnest(${sqlTextArray(expected.message_family)}) AS t(tok)
     WHERE position(upper(t.tok) in upper(coalesce(v_err, ''))) > 0
  ) THEN
    RAISE EXCEPTION 'CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL case-${id} ${nc.case}: message outside expected family : %',
      left(coalesce(v_err, ''), 160);
  END IF;

  -- ---- zero-mutation proof ------------------------------------------------
  v_after := ${fingerprintExpr};
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'CASE_FAIL_MUTATION case-${id} ${nc.case}: fingerprint changed';
  END IF;


  SELECT w.status, w.assigned_user_id INTO v_status2, v_assign2
    FROM public.student_request_workflow_steps w WHERE w.id = v_step;
  IF v_status2 IS DISTINCT FROM ${lit(pc.runtime_status)} OR v_assign2 IS DISTINCT FROM v_assignee THEN
    RAISE EXCEPTION 'CASE_FAIL_MUTATION case-${id}: step drift after RPC';
  END IF;

  RAISE NOTICE 'CASE_PASS case-${id} % denied: %', ${lit(nc.case)}, left(coalesce(v_err, ''), 160);
END
$case$;

ROLLBACK;
`;
}

function renderPins(manifest: any, fingerprintExpr: string, blockedTotal: number, executableTotal: number): string {
  const fn = manifest.function_graph.functions as any[];
  const trg = manifest.migration_29_triggers as any[];
  const m29 = new Set<string>(manifest.migration_29_functions);

  const relations: Array<[string, boolean]> = [
    ["student_requests", true],
    ["student_request_workflow_steps", true],
    ["student_request_workflow_events", true],
    ["request_processing_assignments", true],
    ["student_request_attachment_uploads", true],
    ["student_request_attachments", true],
    ["student_request_fee_assessments", true],
    ["payment_receipts", true],
    ["official_documents", true],
    ["enrollment_certificate_document_details", true],
    ["transfer_request_details", true],
    ["enrollment_suspension_details", true],
    ["absence_excuse_details", true],
    ["extra_chance_details", true],
    ["file_withdrawal_details", true],
    ["student_excused_absences", true],
    ["student_extra_chances", true],
    ["student_academic_status", true],
    ["student_enrollments", true],
    ["student_profiles", true],
    ["notifications", true],
    ["audit_logs", true],
    ["request_types", true],
  ];

  const sqlText = (v: unknown) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/gu, "''")}'`);

  return `-- GENERATED by render-negative-cases.ts from TARGET-MANIFEST.json. DO NOT EDIT.
-- Pins are in-repository only; nothing here can be supplied from the CLI.
CREATE TEMP TABLE b1_pin_scalar(key text primary key, value text) ON COMMIT DROP;
INSERT INTO b1_pin_scalar(key, value) VALUES
  ('project_ref', ${sqlText(manifest.endpoint.project_ref)}),
  ('approved_pgdatabase', ${sqlText(manifest.endpoint.approved_pgdatabase)}),
  ('approved_pguser_regex', ${sqlText(manifest.endpoint.approved_pguser_regex)}),
  ('migration_version', ${sqlText(manifest.migration.version)}),
  ('migration_name', ${sqlText(manifest.migration.name)}),
  ('probe_sub', ${sqlText(manifest.probe_sub)}),
  ('baseline_status', ${sqlText(manifest.authoritative_baseline.status)}),
  ('baseline_fingerprint', ${sqlText(manifest.authoritative_baseline.fingerprint)}),
  ('baseline_execution_authorized', ${sqlText(
    manifest.authoritative_baseline.execution_authorized === true ? "true" : "false",
  )}),
  ('baseline_expected_migration_head', ${sqlText(manifest.authoritative_baseline.expected_migration_head)}),
  ('baseline_migration_head', ${sqlText(manifest.authoritative_baseline.migration_head)}),
  ('baseline_reviewed_package_sha', ${sqlText(manifest.authoritative_baseline.reviewed_package_sha)}),
  ('baseline_artifact_path', ${sqlText(manifest.authoritative_baseline.artifact_path)}),
  ('blocked_case_total', ${sqlText(String(blockedTotal))}),
  ('executable_case_total', ${sqlText(String(executableTotal))}),
  ('blocked_hold_token', ${sqlText(BLOCKED_HOLD_TOKEN)});

CREATE TEMP TABLE b1_pin_function(
  signature text primary key,
  entry_point boolean not null default false,
  migration_29 boolean not null default false,
  definition_sha256 text,
  security text,
  owner text,
  search_path text
) ON COMMIT DROP;
INSERT INTO b1_pin_function(signature, entry_point, migration_29, definition_sha256, security, owner, search_path) VALUES
${fn
  .map(
    (f) =>
      `  (${sqlText(f.signature)}, ${f.entry_point ? "true" : "false"}, ${m29.has(f.signature) ? "true" : "false"}, ${sqlText(
        f.definition_sha256,
      )}, ${sqlText(f.security)}, ${sqlText(f.owner)}, ${sqlText(f.search_path)})`,
  )
  .join(",\n")};

CREATE TEMP TABLE b1_pin_trigger(
  table_name text not null,
  tgname text not null,
  function_signature text not null,
  tgtype int not null,
  tgenabled text not null,
  update_columns text[] not null,
  primary key (table_name, tgname)
) ON COMMIT DROP;
INSERT INTO b1_pin_trigger(table_name, tgname, function_signature, tgtype, tgenabled, update_columns) VALUES
${trg
  .map(
    (t) =>
      `  (${sqlText(t.table)}, ${sqlText(t.tgname)}, ${sqlText(t.function_signature)}, ${t.tgtype}, ${sqlText(
        t.tgenabled,
      )}, ARRAY[${(t.update_columns as string[]).map(sqlText).join(",")}]::text[])`,
  )
  .join(",\n")};

CREATE TEMP TABLE b1_pin_forbidden_pattern(id text primary key, regex text not null) ON COMMIT DROP;
INSERT INTO b1_pin_forbidden_pattern(id, regex) VALUES
${(manifest.function_graph.forbidden_definition_patterns as Array<{ id: string; regex: string }>)
  .map((p) => `  (${sqlText(p.id)}, ${sqlText(p.regex)})`)
  .join(",\n")};

CREATE TEMP TABLE b1_pin_relation(relname text primary key, rls_required boolean not null) ON COMMIT DROP;
INSERT INTO b1_pin_relation(relname, rls_required) VALUES
${relations.map(([r, rls]) => `  (${sqlText(r)}, ${rls})`).join(",\n")};

-- G5: relations the RPC entry points can write; every enabled trigger on them
-- must map to a pinned function, and seeds the transitive closure walk.
CREATE TEMP TABLE b1_pin_dml_relation(relname text primary key) ON COMMIT DROP;
INSERT INTO b1_pin_dml_relation(relname) VALUES
${(manifest.function_graph.trigger_aware_closure.dml_relations as string[])
  .map((r) => `  (${sqlText(r)})`)
  .join(",\n")};

CREATE TEMP TABLE b1_observed_fingerprint(fingerprint text) ON COMMIT DROP;
INSERT INTO b1_observed_fingerprint(fingerprint) SELECT ${fingerprintExpr};
`;
}

function renderFingerprintCheck(manifest: any, fingerprintExpr: string): string {
  const baseline = manifest.authoritative_baseline;
  const pinned = baseline.fingerprint ? `'${baseline.fingerprint}'` : "NULL";
  return `-- GENERATED. Post-run, OUTSIDE any transaction, read-only.
\\set ON_ERROR_STOP on
DO $fp$
DECLARE
  v_expected text := ${pinned};
  v_observed text;
BEGIN
  IF v_expected IS NULL THEN
    RAISE EXCEPTION 'POST_RUN_FAIL: HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE: authoritative baseline is ${baseline.status}';
  END IF;
  v_observed := ${fingerprintExpr};
  IF v_observed IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'POST_RUN_FAIL: HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE: BASELINE_MISMATCH after the matrix run';
  END IF;
  RAISE NOTICE 'POST_RUN_BASELINE_MATCH';
END
$fp$;
`;
}

function renderMaster(executable: string[], total: number): string {
  const includes: string[] = executable.map((f) => `\\ir ${f}`);
  const count = executable.length;
  return `-- GENERATED master script (G9). ONE psql process executes the whole run.
-- Order: preflight -> ${count} rollback-only negative cases -> outside-transaction baseline check.
-- MATRIX total = ${total}; blocked and excluded = ${total - count} (must be 0).
-- Blocked rendering is abolished: an unbound case aborts the render with
-- ${FIXTURE_HOLD_TOKEN}, and the preflight halts the run with ${BLOCKED_HOLD_TOKEN}.
-- ON_ERROR_STOP aborts the entire run at the first failure. No COMMIT anywhere.
\\set ON_ERROR_STOP on
\\timing off
\\set QUIET on
\\pset pager off

\\echo === B1 NEGATIVE RPC MATRIX: PREFLIGHT ===
\\ir ../00-preflight.sql

\\echo === B1 NEGATIVE RPC MATRIX: ${count} NEGATIVE CASES ===
${includes.join("\n")}

\\echo === B1 NEGATIVE RPC MATRIX: POST-RUN BASELINE CHECK ===
\\ir fingerprint-check.sql

\\echo B1_NEGATIVE_RPC_MATRIX_COMPLETE
`;
}

export function main(): void {
  const matrixRaw = readLf(MATRIX_PATH);
  const actual = sha256Lf(matrixRaw);
  if (actual !== MATRIX_SHA256_LF) {
    throw new Error(`MATRIX_SHA256_DRIFT: expected ${MATRIX_SHA256_LF}, got ${actual}`);
  }
  const matrix = JSON.parse(matrixRaw);
  const contract = assertDenialContract(matrix.denial_class_contract);
  if (matrix.production_ref !== APPROVED_PROJECT_REF) throw new Error("MATRIX_REF_MISMATCH");

  const manifest = JSON.parse(readLf(MANIFEST_PATH));
  if (manifest.endpoint.project_ref !== APPROVED_PROJECT_REF) throw new Error("MANIFEST_REF_MISMATCH");
  if (manifest.migration.version !== matrix.installed_migration.version) {
    throw new Error("MANIFEST_MIGRATION_MISMATCH");
  }

  if (manifest.matrix?.sha256_lf !== MATRIX_SHA256_LF) throw new Error("MANIFEST_MATRIX_SHA_MISMATCH");
  for (const f of manifest.function_graph.functions as Array<{ signature: string; definition_sha256: string }>) {
    if (!/^[0-9a-f]{64}$/u.test(f.definition_sha256 ?? "")) {
      throw new Error(`FUNCTION_GRAPH_UNPINNED: ${f.signature}`);
    }
  }

  const fingerprintExpr = extractFingerprintExpr(readLf(FINGERPRINT_PATH));

  const attestation = matrix.production_readonly_attestation?.requests as
    | Record<string, AttestedRequestState>
    | undefined;
  if (!attestation) throw new Error("MATRIX_MISSING_PRODUCTION_READONLY_ATTESTATION");

  const positives: PositiveCase[] = matrix.positive_cases;
  const byStep = new Map<string, PositiveCase>();
  for (const p of positives) byStep.set(`${p.request_number}|${p.step_key}`, p);

  const negatives: NegativeCase[] = [
    ...matrix.negative_cases,
    ...matrix.illegal_action_cases,
    ...matrix.supplemental_department_scope_cases,
  ];
  if (negatives.length !== EXPECTED_NEGATIVE_TOTAL) {
    throw new Error(`MATRIX_COUNT_DRIFT: ${negatives.length}`);
  }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(CASES, { recursive: true });

  const stepPins = matrix.step_state_pins as Record<string, StepStatePin> | undefined;
  if (!stepPins) throw new Error("MATRIX_MISSING_STEP_STATE_PINS");

  const files: string[] = [];
  const executable: string[] = [];
  const blocked: string[] = [];
  const blockedByClass: Record<string, number> = {};
  negatives.forEach((nc, index) => {
    const key = `${nc.request_number}|${nc.step_key}`;
    const pc = byStep.get(key);
    if (!pc) throw new Error(`MATRIX_VALIDATION_FAIL: no step expectation for ${nc.step_key}`);
    const attest = attestation[nc.request_number];
    if (!attest) throw new Error(`MATRIX_VALIDATION_FAIL: no attested state for ${nc.request_number}`);
    const pin = stepPins[key];
    if (!pin) throw new Error(`MATRIX_VALIDATION_FAIL: no step state pin for ${key}`);
    const ordinal = index + 1;
    if (isBlockedCase(nc, pin)) {
      // REMEDIATION-15 G5: blocked rendering is abolished. A case that is not
      // bound to an ACTIVE runtime step is a package defect, not an output.
      throw new Error(
        `${FIXTURE_HOLD_TOKEN}: ${key} is not bound to an ACTIVE step; apply ${FIXTURE_PACKAGE_ID}`,
      );
    }
    const name = `case-${String(ordinal).padStart(4, "0")}.sql`;
    writeFileSync(join(CASES, name), renderCase(ordinal, nc, pc, fingerprintExpr, contract, attest, pin), "utf8");
    files.push(`cases/${name}`);
    executable.push(`cases/${name}`);
  });

  if (executable.length !== EXPECTED_EXECUTABLE_TOTAL) {
    throw new Error(`MATRIX_EXECUTABLE_COUNT_DRIFT: ${executable.length}`);
  }
  if (blocked.length !== EXPECTED_BLOCKED_TOTAL) {
    throw new Error(`MATRIX_BLOCKED_COUNT_DRIFT: ${blocked.length}`);
  }
  if (executable.length + blocked.length !== EXPECTED_NEGATIVE_TOTAL) {
    throw new Error("MATRIX_PARTITION_DRIFT");
  }

  writeFileSync(join(OUT, "pins.sql"), renderPins(manifest, fingerprintExpr, blocked.length, executable.length), "utf8");
  writeFileSync(join(OUT, "fingerprint-check.sql"), renderFingerprintCheck(manifest, fingerprintExpr), "utf8");
  writeFileSync(join(OUT, "master-negative-matrix.sql"), renderMaster(executable, negatives.length), "utf8");
  writeFileSync(
    join(OUT, "MANIFEST.json"),
    `${JSON.stringify(
      {
        rendered_at_utc: new Date().toISOString(),
        matrix_sha256_lf: MATRIX_SHA256_LF,
        negative_total: negatives.length,
        executable_negative_total: executable.length,
        blocked_negative_total: blocked.length,
        blocked_reason: blocked.length ? BLOCKED_TOKEN : null,
        blocked_files: blocked,
        blocked_by_class: blockedByClass,
        final_pass_allowed: blocked.length === 0,
        hold_token_when_blocked: BLOCKED_HOLD_TOKEN,
        positive_rendered: 0,
        commits: 0,
        files: ["pins.sql", "fingerprint-check.sql", "master-negative-matrix.sql", ...files],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  process.stdout.write(`rendered ${negatives.length} negative cases + master into ${OUT}\n`);
}

if (import.meta.main) {
  if (!existsSync(MATRIX_PATH)) throw new Error("MATRIX_NOT_FOUND");
  main();
}
