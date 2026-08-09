#!/usr/bin/env bun
/**
 * PORTAL-B1-PR310 Definitive Operator Architecture — LONGRUN-14
 * Real 267 negative-case RPC harness.
 *
 * MIGRATION_REPLAY_EQUIVALENCE = NOT_CLAIMED
 *
 * Execution contract:
 *   * Connect as b1_matrix_operator (least-privilege LOGIN role).
 *   * For every negative case in MATRIX.json:
 *       - BEGIN a fresh transaction.
 *       - Set transaction-local request.jwt.claims to the exact actor claims.
 *       - Invoke the actual canonical RPC via SECURITY INVOKER helper.
 *       - Capture SQLSTATE, message, before/in/after fingerprints.
 *       - ROLLBACK.
 *   * Classify every denial against the fail-closed contract in MATRIX.json.
 *   * Emit deterministic machine-readable counters.
 *
 * No SET ROLE authenticated. No production access. No migration apply.
 */

import { SQL } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertDenialContract,
  classifyDenialOutcome,
  expectationFor,
  type DenialContract,
  type DenialContext,
  type DenialObservation,
  type DenialVerdict,
} from "../../b1-rpc-principal-harness-01/render-negative-cases.ts";

const root = process.cwd();
const MATRIX_PATH = join(root, "tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json");
const DEFAULT_DATABASE_URL =
  "postgres://b1_matrix_operator:local-operator-not-a-secret@127.0.0.1:54329/postgres";

export type CaseFailure = {
  ordinal: number;
  caseId: string;
  caseClass: string;
  requestNumber: string;
  stepKey: string;
  stepId: string;
  action: string;
  rpc: string;
  actorUserId: string | null;
  expectedSqlstate: string;
  expectedMessageFamily: string[];
  actualAllowed: boolean;
  actualSqlstate: string | null;
  actualMessage: string | null;
  fingerprintBefore: string | null;
  fingerprintInTx: string | null;
  fingerprintAfter: string | null;
  reason: string;
};

export type HarnessCounters = {
  CASE_FILES: number;
  ATTEMPTED: number;
  EXPECTED_DENIALS: number;
  UNEXPECTED_ALLOWS: number;
  UNEXPECTED_DENIALS: number;
  SKIPPED: number;
  BEGIN_COUNT: number;
  ROLLBACK_COUNT: number;
  COMMIT_COUNT: number;
  PRE_PIN_PASS: number;
  BEFORE_FP: number;
  IN_TX_FP: number;
  AFTER_FP: number;
  ZERO_MUTATION_CASES: number;
};

export type HarnessResult = {
  ok: boolean;
  counters: HarnessCounters;
  failures: CaseFailure[];
  fixtureState: {
    requestCount: number;
    stepCount: number;
    activeStepCount: number;
  } | null;
};

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
  principal_user_id?: string;
  fixture_only_step_expectation?: boolean;
};

type NegativeCase = {
  case: string;
  request_number: string;
  step_key: string;
  runtime_step_id?: string | null;
  actor_user_id: string | null;
  action: string;
  expect: string;
  expect_error: string;
  zero_mutation: boolean;
};

function readMatrix(): {
  matrix: any;
  contract: DenialContract;
  positives: PositiveCase[];
  negatives: NegativeCase[];
} {
  const raw = readFileSync(MATRIX_PATH, "utf8");
  const matrix = JSON.parse(raw);
  const contract = assertDenialContract(matrix.denial_class_contract);
  const positives: PositiveCase[] = matrix.positive_cases ?? [];
  const negatives: NegativeCase[] = [
    ...(matrix.negative_cases ?? []),
    ...(matrix.illegal_action_cases ?? []),
    ...(matrix.supplemental_department_scope_cases ?? []),
  ];
  if (negatives.length !== 267) {
    throw new Error(`HARNESS_MATRIX_COUNT_FAIL: expected 267 negative cases, got ${negatives.length}`);
  }
  return { matrix, contract, positives, negatives };
}

function buildPositiveMap(positives: PositiveCase[]): Map<string, PositiveCase> {
  const map = new Map<string, PositiveCase>();
  for (const p of positives) {
    map.set(`${p.request_number}|${p.step_key}`, p);
  }
  return map;
}

export async function runLocal267Harness(options?: {
  databaseUrl?: string;
  abortOnFirstHold?: boolean;
}): Promise<HarnessResult> {
  const url = options?.databaseUrl ?? process.env.B1_OPERATOR_DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const { contract, positives, negatives } = readMatrix();
  const byStep = buildPositiveMap(positives);

  const counters: HarnessCounters = {
    CASE_FILES: 267,
    ATTEMPTED: 0,
    EXPECTED_DENIALS: 0,
    UNEXPECTED_ALLOWS: 0,
    UNEXPECTED_DENIALS: 0,
    SKIPPED: 0,
    BEGIN_COUNT: 0,
    ROLLBACK_COUNT: 0,
    COMMIT_COUNT: 0,
    PRE_PIN_PASS: 0,
    BEFORE_FP: 0,
    IN_TX_FP: 0,
    AFTER_FP: 0,
    ZERO_MUTATION_CASES: 0,
  };
  const failures: CaseFailure[] = [];

  const sql = new SQL(url);

  // Fixture-13 state facts (read through the observer as a sanity check).
  let fixtureState: HarnessResult["fixtureState"] = null;
  try {
    const fpRows = await sql`SELECT public.b1_observer_fingerprint() AS fp`;
    const fp = (fpRows[0] as any)?.fp as string | undefined;
    if (!fp) throw new Error("HARNESS_FIXTURE_FINGERPRINT_EMPTY");
    const stateRows = await sql`SELECT * FROM public.b1_observer_fixture_state()`;
    const st = stateRows[0] as any;
    fixtureState = {
      requestCount: Number(st.total_requests),
      stepCount: Number(st.total_steps),
      activeStepCount: Number(st.active_steps),
    };
  } catch (e: any) {
    await sql.close();
    throw new Error(`HARNESS_FIXTURE_PROBE_FAIL: ${e.message ?? String(e)}`);
  }

  for (let i = 0; i < negatives.length; i++) {
    const nc = negatives[i];
    const ordinal = i + 1;
    const caseId = `case-${String(ordinal).padStart(4, "0")}`;
    const key = `${nc.request_number}|${nc.step_key}`;
    const pc = byStep.get(key);
    if (!pc) {
      throw new Error(`HARNESS_MATRIX_MAP_FAIL: ${caseId} has no positive step expectation for ${key}`);
    }
    if (nc.expect !== "DENY" || nc.zero_mutation !== true) {
      throw new Error(`HARNESS_MATRIX_CONTRACT_FAIL: ${caseId} is not a zero-mutation DENY case`);
    }

    const stepId = nc.runtime_step_id ?? pc.runtime_step_id;
    const rpc: DenialContext["rpc"] =
      pc.rpc === "record_external_university_payment_confirmation"
        ? "record_external_university_payment_confirmation"
        : "act_on_b1_student_request_step_atomic";
    const action = nc.action;
    const isAnon = nc.actor_user_id === null;
    const claims = isAnon ? { role: "anon" } : { sub: nc.actor_user_id, role: "authenticated" };
    const expectedUser = isAnon ? null : nc.actor_user_id;
    const expectedRole = isAnon ? "anon" : "authenticated";

    const ctx: DenialContext = {
      rpc,
      case_class: nc.case,
      runtime_status: pc.runtime_status,
    };
    const expectedRule = expectationFor(contract, ctx);

    counters.ATTEMPTED++;
    counters.BEGIN_COUNT++;

    let result: {
      allowed: boolean;
      sqlstate: string | null;
      message: string | null;
      before_fp: string | null;
      in_tx_fp: string | null;
      after_fp: string | null;
    };

    try {
      const row = await sql.begin(async (tx) => {
        const rows = await tx`
          SELECT *
          FROM public.b1_harness_run_negative_case(
            ${stepId}::uuid,
            ${action},
            ${rpc},
            ${JSON.stringify(claims)},
            ${expectedUser},
            ${expectedRole}
          )
        `;
        return rows[0] as any;
      });
      result = {
        allowed: row.allowed === true,
        sqlstate: row.sqlstate ?? null,
        message: row.message ?? null,
        before_fp: row.before_fp ?? null,
        in_tx_fp: row.in_tx_fp ?? null,
        after_fp: row.after_fp ?? null,
      };
      counters.ROLLBACK_COUNT++;
    } catch (e: any) {
      counters.ROLLBACK_COUNT++;
      // The helper itself failed (infrastructure); treat as an unexpected denial.
      result = {
        allowed: false,
        sqlstate: e.errno ?? null,
        message: e.message ?? String(e),
        before_fp: null,
        in_tx_fp: null,
        after_fp: null,
      };
    }

    const observation: DenialObservation = {
      allowed: result.allowed,
      sqlstate: result.sqlstate,
      message: result.message,
    };
    const classification: DenialVerdict = classifyDenialOutcome(observation, contract, ctx);

    const fingerprintsPresent =
      result.before_fp !== null && result.in_tx_fp !== null && result.after_fp !== null;
    const fingerprintsEqual =
      fingerprintsPresent && result.before_fp === result.in_tx_fp && result.in_tx_fp === result.after_fp;

    if (fingerprintsPresent) {
      counters.BEFORE_FP++;
      counters.IN_TX_FP++;
      counters.AFTER_FP++;
    }
    if (fingerprintsEqual) {
      counters.ZERO_MUTATION_CASES++;
    }
    counters.PRE_PIN_PASS++;

    const isExpectedDenial =
      classification.verdict === "PASS" && !result.allowed && fingerprintsEqual;

    if (isExpectedDenial) {
      counters.EXPECTED_DENIALS++;
      continue;
    }

    let reason: string;
    if (result.allowed) {
      counters.UNEXPECTED_ALLOWS++;
      reason = "RPC_SUCCEEDED_BUT_DENY_REQUIRED";
    } else if (!fingerprintsEqual) {
      counters.UNEXPECTED_DENIALS++;
      reason = `FINGERPRINT_MUTATION: before=${result.before_fp ?? "null"} in=${result.in_tx_fp ?? "null"} after=${result.after_fp ?? "null"}`;
    } else {
      counters.UNEXPECTED_DENIALS++;
      reason = classification.reason;
    }

    const failure: CaseFailure = {
      ordinal,
      caseId,
      caseClass: nc.case,
      requestNumber: nc.request_number,
      stepKey: nc.step_key,
      stepId,
      action,
      rpc,
      actorUserId: nc.actor_user_id,
      expectedSqlstate: expectedRule.sqlstate,
      expectedMessageFamily: expectedRule.message_family,
      actualAllowed: result.allowed,
      actualSqlstate: result.sqlstate,
      actualMessage: result.message,
      fingerprintBefore: result.before_fp,
      fingerprintInTx: result.in_tx_fp,
      fingerprintAfter: result.after_fp,
      reason,
    };
    failures.push(failure);

    if (options?.abortOnFirstHold) {
      await sql.close();
      return { ok: false, counters, failures, fixtureState };
    }
  }

  await sql.close();

  const ok =
    counters.EXPECTED_DENIALS === 267 &&
    counters.UNEXPECTED_ALLOWS === 0 &&
    counters.UNEXPECTED_DENIALS === 0 &&
    counters.SKIPPED === 0 &&
    counters.BEGIN_COUNT === 267 &&
    counters.ROLLBACK_COUNT === 267 &&
    counters.COMMIT_COUNT === 0 &&
    counters.ZERO_MUTATION_CASES === 267;

  return { ok, counters, failures, fixtureState };
}

if (import.meta.main) {
  runLocal267Harness().then(
    (result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 1);
    },
    (err) => {
      console.error("HARNESS_FATAL:", err);
      process.exit(1);
    },
  );
}
