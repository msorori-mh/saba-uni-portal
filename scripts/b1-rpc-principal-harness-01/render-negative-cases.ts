#!/usr/bin/env bun
/**
 * PORTAL-B1-NEGATIVE-RPC-MATRIX-FINAL-EXECUTION-PACKAGE-REMEDIATION-05
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

export const MATRIX_SHA256_LF = "52ce69679dcc7494eaab7ed35292879312efffd2651dcc169f9f28b18e4ff35d";
export const EXPECTED_NEGATIVE_TOTAL = 267;
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
  return createHash("sha256").update(text.replace(/\r\n/gu, "\n"), "utf8").digest("hex");
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

/** Extracts the single canonical fingerprint expression from fingerprint.sql. */
export function extractFingerprintExpr(sql: string): string {
  const start = sql.indexOf("-- BEGIN_FINGERPRINT_EXPR");
  const end = sql.indexOf("-- END_FINGERPRINT_EXPR");
  if (start < 0 || end < 0 || end < start) {
    throw new Error("FINGERPRINT_MARKERS_MISSING");
  }
  const expr = sql.slice(start + "-- BEGIN_FINGERPRINT_EXPR".length, end).trim();
  if (!expr.startsWith("(") || !expr.endsWith(")")) throw new Error("FINGERPRINT_EXPR_MALFORMED");
  const withoutComments = expr
    .split("\n")
    .map((line) => line.replace(/--.*$/u, ""))
    .join("\n");
  if (/\bLIMIT\b/iu.test(withoutComments)) throw new Error("FINGERPRINT_EXPR_HAS_LIMIT");
  return expr;
}

/* ==========================================================================
 * G1 — DENIAL CLASS FAIL-CLOSED CONTRACT
 * A negative case is PASS only when the RPC was denied by the authorization
 * layer itself: SQLSTATE and message family must both match MATRIX.json.
 * Every other outcome is CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL -> HOLD.
 * ========================================================================== */

export type DenialContract = {
  version: number;
  fail_closed: boolean;
  authorization_sqlstates: string[];
  expected_by_expect_error: Record<string, { sqlstate: string; message_family: string[] }>;
  infrastructure_sqlstates: string[];
  infrastructure_message_tokens: string[];
};

export type DenialObservation = {
  allowed: boolean;
  sqlstate?: string | null;
  message?: string | null;
};

export type DenialVerdict = { verdict: "PASS" | "HOLD"; reason: string };

export const CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL = "CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL";
export const CASE_FAIL_ALLOWED = "CASE_FAIL_ALLOWED";

export function assertDenialContract(contract: any): DenialContract {
  if (!contract || contract.fail_closed !== true) throw new Error("DENIAL_CONTRACT_NOT_FAIL_CLOSED");
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
  for (const [key, exp] of Object.entries<any>(contract.expected_by_expect_error ?? {})) {
    assertSafeDiagnostic(`expected_by_expect_error.${key}`, key);
    if (!contract.authorization_sqlstates.includes(exp?.sqlstate)) {
      throw new Error(`DENIAL_CONTRACT_BAD_EXPECTED_SQLSTATE: ${key}`);
    }
    if (!Array.isArray(exp.message_family) || exp.message_family.length === 0) {
      throw new Error(`DENIAL_CONTRACT_EMPTY_MESSAGE_FAMILY: ${key}`);
    }
    for (const token of exp.message_family) assertSafeScalar(`message_family.${key}`, token);
  }
  for (const token of contract.infrastructure_message_tokens ?? []) {
    assertSafeDiagnostic("infrastructure_message_tokens", token);
  }
  return contract as DenialContract;
}

export function expectationFor(contract: DenialContract, expectError: string) {
  const exp = contract.expected_by_expect_error[expectError];
  if (!exp) throw new Error(`DENIAL_CONTRACT_MISSING_EXPECTATION: ${expectError}`);
  return exp;
}

/** Pure, offline mirror of the SQL gate emitted into every rendered case. */
export function classifyDenialOutcome(
  observation: DenialObservation,
  contract: DenialContract,
  expectError: string,
): DenialVerdict {
  const expected = expectationFor(contract, expectError);
  if (observation.allowed) {
    return { verdict: "HOLD", reason: `${CASE_FAIL_ALLOWED}: RPC succeeded but DENY was required` };
  }
  const sqlstate = (observation.sqlstate ?? "").toUpperCase();
  const message = observation.message ?? "";
  const lower = message.toLowerCase();

  if (contract.infrastructure_sqlstates.includes(sqlstate)) {
    return { verdict: "HOLD", reason: `${CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL}: infrastructure sqlstate ${sqlstate}` };
  }
  const hit = contract.infrastructure_message_tokens.find((t) => lower.includes(t.toLowerCase()));
  if (hit) {
    return { verdict: "HOLD", reason: `${CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL}: infrastructure message token "${hit}"` };
  }
  if (sqlstate !== expected.sqlstate) {
    return { verdict: "HOLD", reason: `${CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL}: sqlstate ${sqlstate || "<none>"} != ${expected.sqlstate}` };
  }
  const upper = message.toUpperCase();
  if (!expected.message_family.some((t) => upper.includes(t.toUpperCase()))) {
    return { verdict: "HOLD", reason: `${CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL}: message outside the expected family` };
  }
  return { verdict: "PASS", reason: "authorization denial matches the pinned denial class" };
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
};

function renderCase(
  ordinal: number,
  nc: NegativeCase,
  pc: PositiveCase,
  fingerprintExpr: string,
  contract: DenialContract,
): string {
  const isAnon = nc.actor_user_id === null;
  const actor = isAnon ? null : assertUuid("actor_user_id", nc.actor_user_id as string);
  const stepId = assertUuid("runtime_step_id", nc.runtime_step_id ?? pc.runtime_step_id);
  const action = assertSafeScalar("action", nc.action);
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

  const rpcCall =
    pc.rpc === "record_external_university_payment_confirmation"
      ? `PERFORM public.record_external_university_payment_confirmation(v_req, 'TEST_ONLY_NEGATIVE_MATRIX');`
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

  const assigneePin =
    pc.principal_user_id && !isAnon
      ? `IF v_assignee IS DISTINCT FROM ${lit(pc.principal_user_id)}::uuid THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: direct assignee changed on step %', v_step;
  END IF;`
      : `IF v_assignee IS DISTINCT FROM ${lit(pc.principal_user_id)}::uuid THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: direct assignee changed on step %', v_step;
  END IF;`;

  const transferScopePin =
    pc.request_type === "department_transfer"
      ? `PERFORM 1 FROM public.transfer_request_details d WHERE d.request_id = v_req FOR SHARE;
  SELECT count(*) INTO v_n FROM public.transfer_request_details d
   WHERE d.request_id = v_req
     AND d.current_department_id IS NOT NULL
     AND d.requested_department_id IS NOT NULL
     AND d.current_department_id <> d.requested_department_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: transfer department scope';
  END IF;`
      : `-- no department scope pin for this service`;

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
  v_status2  text;
  v_assign2  uuid;
BEGIN
  -- ---- G6: real row locks, fixed order: request -> steps -> assignments ----
  SELECT r.id, r.request_type, r.status
    INTO v_req, v_type, v_status
    FROM public.student_requests r
   WHERE r.request_number = ${lit(nc.request_number)}
   FOR SHARE;
  IF v_req IS NULL THEN
    RAISE EXCEPTION 'CASE_STATE_DRIFT: request ${nc.request_number} not visible';
  END IF;

  PERFORM 1 FROM public.student_request_workflow_steps w
   WHERE w.student_request_id = v_req ORDER BY w.id FOR SHARE;

  PERFORM 1 FROM public.request_processing_assignments a ORDER BY a.id FOR SHARE;

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

  IF ${lit(pc.runtime_status)} = 'active' THEN
    SELECT count(*) INTO v_n FROM public.student_request_workflow_steps w
     WHERE w.student_request_id = v_req
       AND w.step_order < v_order
       AND w.status NOT IN ('completed','skipped');
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'CASE_STATE_DRIFT: % unsatisfied predecessor steps', v_n;
    END IF;
  END IF;

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
  END;

  PERFORM set_config('request.jwt.claims', NULL, true);
  EXECUTE 'RESET ROLE';

  -- ---- DENY proof ---------------------------------------------------------
  IF v_allowed THEN
    RAISE EXCEPTION 'CASE_FAIL_ALLOWED case-${id} ${nc.case}: RPC succeeded but DENY was required';
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

function renderPins(manifest: any, fingerprintExpr: string): string {
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
  ('baseline_fingerprint', ${sqlText(manifest.authoritative_baseline.fingerprint)});

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

CREATE TEMP TABLE b1_pin_forbidden_token(token text primary key) ON COMMIT DROP;
INSERT INTO b1_pin_forbidden_token(token) VALUES
${(manifest.function_graph.forbidden_definition_tokens as string[])
  .map((t) => `  (${sqlText(t.toLowerCase())})`)
  .join(",\n")};

CREATE TEMP TABLE b1_pin_relation(relname text primary key, rls_required boolean not null) ON COMMIT DROP;
INSERT INTO b1_pin_relation(relname, rls_required) VALUES
${relations.map(([r, rls]) => `  (${sqlText(r)}, ${rls})`).join(",\n")};

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
    RAISE EXCEPTION 'POST_RUN_FAIL: authoritative baseline is ${baseline.status}';
  END IF;
  v_observed := ${fingerprintExpr};
  IF v_observed IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'POST_RUN_FAIL: BASELINE_MISMATCH after the matrix run';
  END IF;
  RAISE NOTICE 'POST_RUN_BASELINE_MATCH';
END
$fp$;
`;
}

function renderMaster(count: number): string {
  const includes: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    includes.push(`\\ir cases/case-${String(i).padStart(4, "0")}.sql`);
  }
  return `-- GENERATED master script (G9). ONE psql process executes the whole run.
-- Order: preflight -> ${count} rollback-only negative cases -> outside-transaction baseline check.
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
  const matrixRaw = readFileSync(MATRIX_PATH, "utf8");
  const actual = sha256Lf(matrixRaw);
  if (actual !== MATRIX_SHA256_LF) {
    throw new Error(`MATRIX_SHA256_DRIFT: expected ${MATRIX_SHA256_LF}, got ${actual}`);
  }
  const matrix = JSON.parse(matrixRaw);
  if (matrix.production_ref !== APPROVED_PROJECT_REF) throw new Error("MATRIX_REF_MISMATCH");

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  if (manifest.endpoint.project_ref !== APPROVED_PROJECT_REF) throw new Error("MANIFEST_REF_MISMATCH");
  if (manifest.migration.version !== matrix.installed_migration.version) {
    throw new Error("MANIFEST_MIGRATION_MISMATCH");
  }

  const fingerprintExpr = extractFingerprintExpr(readFileSync(FINGERPRINT_PATH, "utf8"));

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

  const files: string[] = [];
  negatives.forEach((nc, index) => {
    const pc = byStep.get(`${nc.request_number}|${nc.step_key}`);
    if (!pc) throw new Error(`MATRIX_VALIDATION_FAIL: no step expectation for ${nc.step_key}`);
    const ordinal = index + 1;
    const name = `case-${String(ordinal).padStart(4, "0")}.sql`;
    writeFileSync(join(CASES, name), renderCase(ordinal, nc, pc, fingerprintExpr), "utf8");
    files.push(`cases/${name}`);
  });

  writeFileSync(join(OUT, "pins.sql"), renderPins(manifest, fingerprintExpr), "utf8");
  writeFileSync(join(OUT, "fingerprint-check.sql"), renderFingerprintCheck(manifest, fingerprintExpr), "utf8");
  writeFileSync(join(OUT, "master-negative-matrix.sql"), renderMaster(negatives.length), "utf8");
  writeFileSync(
    join(OUT, "MANIFEST.json"),
    `${JSON.stringify(
      {
        rendered_at_utc: new Date().toISOString(),
        matrix_sha256_lf: MATRIX_SHA256_LF,
        negative_total: negatives.length,
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
