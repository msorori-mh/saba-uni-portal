/**
 * PORTAL-B1-NEGATIVE-RPC-MATRIX-OPERATOR-PACKAGE-CODEX-COMPREHENSIVE-HARDENING-03
 *
 * Renders the 267 negative authorization cases from MATRIX.json into one
 * self-contained, SERIALIZABLE, ROLLBACK-only .sql file per case.
 *
 * OFFLINE ONLY. This script never connects to a database.
 * Output goes to scripts/b1-rpc-principal-harness-01/generated/cases (git-ignored).
 *
 *   bun run scripts/b1-rpc-principal-harness-01/render-negative-cases.ts
 *
 * G6 contract:
 *   - MATRIX.json SHA256 (LF-normalised) is pinned; any drift aborts rendering.
 *   - Every field is validated against a strict schema + character allowlist
 *     BEFORE any file is produced. Injection/breakout characters are rejected.
 *   - File names are purely generated ordinals: case-0001.sql .. case-0267.sql.
 *     No MATRIX-derived value ever reaches a path.
 *   - SQL comments carry only JSON-encoded scalars, which cannot break a line.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Case = {
  case: string;
  request_number: string;
  step_key: string;
  runtime_step_id?: string | null;
  actor_user_id: string | null;
  action: string;
  expect: string;
  expect_error?: string;
  zero_mutation?: boolean;
};

const here = join(process.cwd(), "scripts", "b1-rpc-principal-harness-01");
const matrixPath = join(
  process.cwd(),
  "tests",
  "b1-five-services-rpc-authorization-preflight-01",
  "MATRIX.json",
);

/** G6 — pinned content hash of the reviewed matrix (LF-normalised). */
export const MATRIX_SHA256 =
  "eec8307189adf6ef556ca517596759aa519f14de20a318dbc029a6cdd92fda05";

export const EXPECTED_TOTAL = 267;
export const EXPECTED_SPLIT = { negative_core: 240, illegal_action: 24, department_scope: 3 };

export const ALLOWED_CLASSES = [
  "anonymous_no_jwt",
  "dean_outside_step",
  "department_scope_swap_source_head_on_target_step",
  "department_scope_swap_target_head_on_source_step",
  "illegal_action_by_exact_assignee",
  "next_step_assignee_early",
  "previous_step_assignee_replay",
  "registrar_outside_step",
  "request_owner_student",
  "third_department_head_unrelated",
  "unassigned_admin",
  "unassigned_system_admin",
  "wrong_role_same_unit_or_peer",
  "wrong_unit_principal",
] as const;

export const ALLOWED_ACTIONS = [
  "apply_decision",
  "approve",
  "archive",
  "clear",
  "confirm_payment",
  "review",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REQUEST_NUMBER_RE = /^SR-\d{8}-[0-9A-F]{8}$/;
const STEP_KEY_RE = /^[a-z][a-z0-9_]{2,63}$/;

/** Characters / tokens that must never appear in any MATRIX-derived value. */
const FORBIDDEN_PATTERNS: Array<[string, RegExp]> = [
  ["newline_or_cr", /[\r\n]/],
  ["null_byte", /\0/],
  ["control_char", /[\u0000-\u001f\u007f]/],
  ["path_separator", /[/\\]/],
  ["parent_path", /\.\./],
  ["psql_meta_command", /\\/],
  ["semicolon", /;/],
  ["sql_line_comment", /--/],
  ["sql_block_comment_open", /\/\*/],
  ["sql_block_comment_close", /\*\//],
  ["dollar_case_tag", /\$case\$/i],
  ["tx_control_keyword", /\b(BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\b/i],
  ["quote", /['"`]/],
];

export class MatrixValidationError extends Error {}

function assertSafeScalar(field: string, value: string): void {
  for (const [name, re] of FORBIDDEN_PATTERNS) {
    if (re.test(value)) {
      throw new MatrixValidationError(
        `B1_MATRIX_FIELD_REJECTED: field=${field} rule=${name}`,
      );
    }
  }
}

/** G6 — strict per-case schema validation. Throws on the first violation. */
export function validateCase(c: Case, index: number): void {
  const at = `case[${index}]`;
  if (typeof c !== "object" || c === null) {
    throw new MatrixValidationError(`B1_MATRIX_FIELD_REJECTED: ${at} not_an_object`);
  }
  for (const [field, value] of Object.entries({
    case: c.case,
    request_number: c.request_number,
    step_key: c.step_key,
    action: c.action,
    expect: c.expect,
  })) {
    if (typeof value !== "string" || value.length === 0 || value.length > 128) {
      throw new MatrixValidationError(`B1_MATRIX_FIELD_REJECTED: ${at}.${field} bad_scalar`);
    }
    assertSafeScalar(`${at}.${field}`, value);
  }
  if (!(ALLOWED_CLASSES as readonly string[]).includes(c.case)) {
    throw new MatrixValidationError(`B1_MATRIX_FIELD_REJECTED: ${at}.case not_in_enum`);
  }
  if (!(ALLOWED_ACTIONS as readonly string[]).includes(c.action)) {
    throw new MatrixValidationError(`B1_MATRIX_FIELD_REJECTED: ${at}.action not_in_enum`);
  }
  if (c.expect !== "DENY") {
    throw new MatrixValidationError(`B1_MATRIX_FIELD_REJECTED: ${at}.expect not_deny`);
  }
  if (!REQUEST_NUMBER_RE.test(c.request_number)) {
    throw new MatrixValidationError(`B1_MATRIX_FIELD_REJECTED: ${at}.request_number bad_format`);
  }
  if (!STEP_KEY_RE.test(c.step_key)) {
    throw new MatrixValidationError(`B1_MATRIX_FIELD_REJECTED: ${at}.step_key bad_format`);
  }
  if (c.actor_user_id !== null) {
    if (typeof c.actor_user_id !== "string" || !UUID_RE.test(c.actor_user_id)) {
      throw new MatrixValidationError(`B1_MATRIX_FIELD_REJECTED: ${at}.actor_user_id bad_uuid`);
    }
  }
  if (c.runtime_step_id !== undefined && c.runtime_step_id !== null) {
    if (typeof c.runtime_step_id !== "string" || !UUID_RE.test(c.runtime_step_id)) {
      throw new MatrixValidationError(`B1_MATRIX_FIELD_REJECTED: ${at}.runtime_step_id bad_uuid`);
    }
  }
  if (c.expect_error !== undefined) {
    if (typeof c.expect_error !== "string" || c.expect_error.length > 256) {
      throw new MatrixValidationError(`B1_MATRIX_FIELD_REJECTED: ${at}.expect_error bad_scalar`);
    }
    // expect_error is documentation only and is emitted JSON-encoded, but it
    // still may not contain line-breaking or comment-breakout characters.
    for (const [name, re] of ([
      ["newline_or_cr", /[\r\n]/],
      ["null_byte", /\0/],
      ["control_char", /[\u0000-\u001f\u007f]/],
      ["psql_meta_command", /\\/],
    ] as Array<[string, RegExp]>)) {
      if (re.test(c.expect_error)) {
        throw new MatrixValidationError(
          `B1_MATRIX_FIELD_REJECTED: ${at}.expect_error rule=${name}`,
        );
      }
    }
  }
  if (c.zero_mutation !== undefined && typeof c.zero_mutation !== "boolean") {
    throw new MatrixValidationError(`B1_MATRIX_FIELD_REJECTED: ${at}.zero_mutation bad_boolean`);
  }
}

export function sha256Lf(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
}

/** Loads MATRIX.json, pins its SHA256 and validates every case. */
export function loadNegativeCases(rawOverride?: string): Case[] {
  const raw = rawOverride ?? readFileSync(matrixPath, "utf8");
  const digest = sha256Lf(raw);
  if (digest !== MATRIX_SHA256) {
    throw new MatrixValidationError(
      `B1_MATRIX_SHA_DRIFT: expected ${MATRIX_SHA256}, got ${digest}`,
    );
  }
  const matrix = JSON.parse(raw);
  if (matrix.production_ref !== "wpmicqriltrowwonknox") {
    throw new MatrixValidationError("B1_RENDER_PRODUCTION_REF_MISMATCH");
  }
  if (
    matrix.negative_cases.length !== EXPECTED_SPLIT.negative_core ||
    matrix.illegal_action_cases.length !== EXPECTED_SPLIT.illegal_action ||
    matrix.supplemental_department_scope_cases.length !== EXPECTED_SPLIT.department_scope
  ) {
    throw new MatrixValidationError("B1_RENDER_CASE_SPLIT_MISMATCH");
  }
  const cases: Case[] = [
    ...matrix.negative_cases,
    ...matrix.illegal_action_cases,
    ...matrix.supplemental_department_scope_cases,
  ];
  if (cases.length !== EXPECTED_TOTAL) {
    throw new MatrixValidationError(
      `B1_RENDER_CASE_COUNT_MISMATCH: expected ${EXPECTED_TOTAL}, got ${cases.length}`,
    );
  }
  cases.forEach(validateCase);
  return cases;
}

export const negativeCases: Case[] = loadNegativeCases();

/** G7 — the single canonical fingerprint expression, read from fingerprint.sql. */
export function fingerprintExpression(): string {
  const sql = readFileSync(join(here, "fingerprint.sql"), "utf8").replace(/\r\n/g, "\n");
  const start = sql.indexOf("-- BEGIN_FINGERPRINT_EXPR");
  const end = sql.indexOf("-- END_FINGERPRINT_EXPR");
  if (start < 0 || end < 0 || end < start) {
    throw new MatrixValidationError("B1_FINGERPRINT_EXPR_MARKERS_MISSING");
  }
  return sql
    .slice(start + "-- BEGIN_FINGERPRINT_EXPR".length, end)
    .trim();
}

/** Safe SQL string literal for values already proven free of quotes/controls. */
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
/** JSON-encoded comment scalar: cannot contain a raw newline. */
const cmt = (v: unknown) => JSON.stringify(v ?? null);

export function caseFileName(index: number): string {
  return `case-${String(index + 1).padStart(4, "0")}.sql`;
}

export function renderCase(c: Case, index: number, fpExpr = fingerprintExpression()): string {
  validateCase(c, index);

  const anonymous = c.actor_user_id === null;
  const principalRole = anonymous ? "anon" : "authenticated";
  const claims = anonymous
    ? `'{"role":"anon"}'`
    : `json_build_object('sub', ${lit(c.actor_user_id!)}, 'role', 'authenticated')::text`;
  const expectedUid = anonymous ? "NULL::uuid" : `${lit(c.actor_user_id!)}::uuid`;
  const rpc =
    c.action === "confirm_payment"
      ? `PERFORM public.record_external_university_payment_confirmation(v_step, 'B1_NEG_OPERATOR_HARNESS');`
      : `PERFORM public.act_on_b1_student_request_step_atomic(v_step, ${lit(c.action)}, 'B1_NEG_OPERATOR_HARNESS', '{}'::jsonb);`;

  return `-- ============================================================================
-- B1 negative authorization case ${String(index + 1).padStart(4, "0")} of ${EXPECTED_TOTAL}
-- class          = ${cmt(c.case)}
-- request_number = ${cmt(c.request_number)}
-- step_key       = ${cmt(c.step_key)}
-- action         = ${cmt(c.action)}
-- principal_role = ${cmt(principalRole)}
-- actor_user_id  = ${cmt(c.actor_user_id)}
-- expect         = "DENY" (${cmt(c.expect_error ?? "denial")})
--
-- One case = one SERIALIZABLE transaction = one unconditional ROLLBACK.
-- No retry on serialization failure: the launcher stops instead.
-- ============================================================================
\\set ON_ERROR_STOP on

BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

-- ---------------------------------------------------------------------------
-- G5 phase 1 (observer): fixed-order locking, state pinning, before fingerprint
-- ---------------------------------------------------------------------------
DO $pin$
DECLARE
  v_request uuid;
  v_step    uuid;
  v_before  text;
  r         record;
BEGIN
  IF current_setting('row_security', true) <> 'on' THEN
    RAISE EXCEPTION 'B1_CASE_ROW_SECURITY_OFF';
  END IF;
  IF (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = session_user) THEN
    RAISE EXCEPTION 'B1_CASE_OPERATOR_HAS_BYPASS';
  END IF;

  SELECT r0.id INTO v_request FROM public.student_requests r0
   WHERE r0.request_number = ${lit(c.request_number)};
  IF v_request IS NULL THEN
    RAISE EXCEPTION 'B1_CASE_REQUEST_NOT_FOUND';
  END IF;

  -- Fixed lock order: request -> runtime steps -> processing assignments.
  -- Transaction-scoped advisory locks are used instead of SELECT ... FOR UPDATE
  -- because the G3 operator contract forbids any UPDATE privilege on the scope
  -- relations (Postgres requires UPDATE privilege for row-level locking).
  -- SERIALIZABLE + explicit state pinning below provides the drift proof.
  PERFORM pg_advisory_xact_lock(hashtext('b1_request:' || v_request::text));
  FOR r IN
    SELECT w.id FROM public.student_request_workflow_steps w
     WHERE w.student_request_id = v_request ORDER BY w.id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('b1_step:' || r.id::text));
  END LOOP;
  FOR r IN
    SELECT a.id FROM public.request_processing_assignments a
     WHERE a.is_active ORDER BY a.id
  LOOP
    PERFORM pg_advisory_xact_lock_shared(hashtext('b1_assignment:' || r.id::text));
  END LOOP;

  -- state pinning: the runtime step must still be exactly what MATRIX.json saw
  SELECT w.id INTO v_step
    FROM public.student_request_workflow_steps w
   WHERE w.student_request_id = v_request AND w.step_key = ${lit(c.step_key)};
${
  c.runtime_step_id
    ? `  IF v_step IS DISTINCT FROM ${lit(c.runtime_step_id)}::uuid THEN
    RAISE EXCEPTION 'B1_CASE_STEP_ID_DRIFT: %', v_step;
  END IF;`
    : `  IF v_step IS NULL THEN
    RAISE EXCEPTION 'B1_CASE_STEP_NOT_FOUND';
  END IF;`
}

  PERFORM set_config('b1.case_request_id', v_request::text, true);
  PERFORM set_config('b1.case_step_id', v_step::text, true);

  SELECT ${fpExpr} INTO v_before;
  IF v_before IS NULL THEN
    RAISE EXCEPTION 'B1_CASE_FINGERPRINT_NULL_BEFORE';
  END IF;
  PERFORM set_config('b1.case_fp_before', v_before, true);
END
$pin$;

-- ---------------------------------------------------------------------------
-- G4 phase 2: the exact principal for this case (${principalRole})
-- ---------------------------------------------------------------------------
SET LOCAL ROLE ${principalRole};

DO $case$
DECLARE
  v_step     uuid := current_setting('b1.case_step_id', true)::uuid;
  v_observed text := 'ALLOW';
  v_state    text;
  v_msg      text;
BEGIN
  IF current_user <> ${lit(principalRole)} THEN
    RAISE EXCEPTION 'B1_CASE_ROLE_MISMATCH: %', current_user;
  END IF;
  IF current_setting('row_security', true) <> 'on' THEN
    RAISE EXCEPTION 'B1_CASE_ROW_SECURITY_OFF';
  END IF;
  IF (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'B1_CASE_PRINCIPAL_HAS_BYPASS';
  END IF;

  PERFORM set_config('request.jwt.claims', ${claims}, true);

  IF auth.role() <> ${lit(principalRole)} THEN
    RAISE EXCEPTION 'B1_CASE_AUTH_ROLE_MISMATCH: %', auth.role();
  END IF;
  IF auth.uid() IS DISTINCT FROM ${expectedUid} THEN
    RAISE EXCEPTION 'B1_CASE_AUTH_UID_MISMATCH: %', auth.uid();
  END IF;

  BEGIN
    ${rpc}
  EXCEPTION WHEN OTHERS THEN
    v_observed := 'DENY';
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_state IN ('40001', '40P01') THEN
      RAISE EXCEPTION 'B1_NEG_SERIALIZATION_FAILURE sqlstate=%', v_state;
    END IF;
  END;

  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('b1.case_observed', v_observed, true);
  PERFORM set_config('b1.case_sqlstate', coalesce(v_state, ''), true);
  PERFORM set_config('b1.case_message', coalesce(v_msg, ''), true);
END
$case$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- G5 phase 3 (observer): DENY proof + after fingerprint + drift proof
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_after   text;
  v_before  text := current_setting('b1.case_fp_before', true);
  v_step    uuid := current_setting('b1.case_step_id', true)::uuid;
  v_request uuid := current_setting('b1.case_request_id', true)::uuid;
  v_now     uuid;
BEGIN
  IF current_setting('b1.case_observed', true) <> 'DENY' THEN
    RAISE EXCEPTION 'B1_NEG_UNEXPECTED_ALLOW class=% request=% step=% action=%',
      ${lit(c.case)}, ${lit(c.request_number)}, ${lit(c.step_key)}, ${lit(c.action)};
  END IF;

  -- current step / direct assignee must not have drifted underneath the case
  SELECT w.id INTO v_now FROM public.student_request_workflow_steps w
   WHERE w.student_request_id = v_request AND w.step_key = ${lit(c.step_key)};
  IF v_now IS DISTINCT FROM v_step THEN
    RAISE EXCEPTION 'B1_NEG_CONCURRENT_DRIFT_STEP request=%', ${lit(c.request_number)};
  END IF;

  SELECT ${fpExpr} INTO v_after;
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'B1_NEG_MUTATION_DETECTED class=% request=%',
      ${lit(c.case)}, ${lit(c.request_number)};
  END IF;

  RAISE NOTICE 'B1_NEG_CASE_PASS idx=% class=% request=% step=% action=% role=% sqlstate=% msg=%',
    ${index + 1}, ${lit(c.case)}, ${lit(c.request_number)}, ${lit(c.step_key)},
    ${lit(c.action)}, ${lit(principalRole)},
    current_setting('b1.case_sqlstate', true), current_setting('b1.case_message', true);
END
$verify$;

-- UNCONDITIONAL: one case = one transaction = one ROLLBACK.
ROLLBACK;
`;
}

function main() {
  const cases = loadNegativeCases();
  const fpExpr = fingerprintExpression();

  // G9 step 1: the renderer owns (and clears) ONLY generated/cases.
  const out = join(here, "generated", "cases");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const manifest: Array<Record<string, unknown>> = [];
  cases.forEach((c, i) => {
    const file = caseFileName(i);
    writeFileSync(join(out, file), renderCase(c, i, fpExpr), "utf8");
    manifest.push({
      index: i + 1,
      file,
      class: c.case,
      request_number: c.request_number,
      step_key: c.step_key,
      actor_user_id: c.actor_user_id,
      principal_role: c.actor_user_id === null ? "anon" : "authenticated",
      action: c.action,
      expect: "DENY",
    });
  });
  writeFileSync(
    join(here, "generated", "MANIFEST.json"),
    JSON.stringify(
      {
        matrix_sha256: MATRIX_SHA256,
        total: manifest.length,
        split: EXPECTED_SPLIT,
        cases: manifest,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`rendered ${manifest.length} rollback-only negative cases -> ${out}`);
}

if (import.meta.main) main();
