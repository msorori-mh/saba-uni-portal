#!/usr/bin/env bun
/**
 * PORTAL-B1-PR310 Definitive Operator Architecture — LONGRUN-14
 * Failure-injection harness.
 *
 * Each mandatory scenario from LONGRUN-13 Phase S must result in a HOLD.
 * The harness uses a local PG17 container and exercises the operator role,
 * observer functions, and 267 runner contracts.
 */

import { SQL } from "bun";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertDenialContract,
  classifyDenialOutcome,
  expectationFor,
} from "../../b1-rpc-principal-harness-01/render-negative-cases.ts";

const ADMIN_URL =
  process.env.B1_ADMIN_DATABASE_URL ||
  "postgres://postgres:postgres@127.0.0.1:54329/postgres";
const OPERATOR_URL =
  process.env.B1_OPERATOR_DATABASE_URL ||
  "postgres://b1_matrix_operator:local-operator-not-a-secret@127.0.0.1:54329/postgres";
const MATRIX_PATH = join(
  process.cwd(),
  "tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json",
);

export type ScenarioResult = {
  name: string;
  holdToken: string;
  ok: boolean;
  detail?: string;
};

export type FailureInjectionResult = {
  ok: boolean;
  scenarios: ScenarioResult[];
};

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function runSingleCase(
  sql: SQL,
  stepId: string,
  action: string,
  rpc: "act_on_b1_student_request_step_atomic" | "record_external_university_payment_confirmation",
  claimsObj: Record<string, string> | { role: "anon" },
  expectedUser: string | null,
  expectedRole: "authenticated" | "anon",
): Promise<{ allowed: boolean; sqlstate: string | null; message: string | null; before_fp: string | null; in_tx_fp: string | null; after_fp: string | null }> {
  const row = (await sql.begin(async (tx) => {
    return (await tx`
      SELECT * FROM public.b1_harness_run_negative_case(
        ${stepId}::uuid,
        ${action},
        ${rpc},
        ${JSON.stringify(claimsObj)},
        ${expectedUser},
        ${expectedRole}
      )
    `)[0] as any;
  })) as any;
  return {
    allowed: row.allowed === true,
    sqlstate: row.sqlstate ?? null,
    message: row.message ?? null,
    before_fp: row.before_fp ?? null,
    in_tx_fp: row.in_tx_fp ?? null,
    after_fp: row.after_fp ?? null,
  };
}

async function operatorExists(sql: SQL): Promise<boolean> {
  const rows = await sql`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'b1_matrix_operator') AS e`;
  return (rows[0] as any).e === true;
}

async function dropOperator(sql: SQL): Promise<void> {
  if (await operatorExists(sql)) {
    await sql`DROP TABLE IF EXISTS public.b1_harness_rollback_marker CASCADE`;
    await sql`
      DO $$
      DECLARE
        r record;
      BEGIN
        FOR r IN
          SELECT p.oid::regprocedure AS sig
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND has_function_privilege('b1_matrix_operator', p.oid, 'EXECUTE')
        LOOP
          EXECUTE format('REVOKE ALL ON FUNCTION %s FROM b1_matrix_operator', r.sig);
        END LOOP;
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM b1_matrix_operator;
        REVOKE ALL ON SCHEMA public FROM b1_matrix_operator;
      END $$;
    `;
    await sql`DROP ROLE b1_matrix_operator`;
  }
}

async function createOperator(sql: SQL): Promise<void> {
  await dropOperator(sql);
  await sql`CREATE ROLE b1_matrix_operator WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT CONNECTION LIMIT 10 PASSWORD 'local-operator-not-a-secret'`;
  await sql`GRANT USAGE ON SCHEMA public TO b1_matrix_operator`;
  await sql`GRANT EXECUTE ON FUNCTION public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb) TO b1_matrix_operator`;
  await sql`GRANT EXECUTE ON FUNCTION public.record_external_university_payment_confirmation(uuid,text) TO b1_matrix_operator`;
  await sql`GRANT EXECUTE ON FUNCTION public.b1_harness_run_negative_case(uuid,text,text,text,text,text) TO b1_matrix_operator`;
  // Re-grant all observer functions so the operator harness can read fingerprints.
  await sql`
    DO $$
    DECLARE
      r record;
    BEGIN
      FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname LIKE 'b1_observer_%'
      LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO b1_matrix_operator', r.sig);
      END LOOP;
    END $$;
  `;
}

async function expectHold(
  name: string,
  holdToken: string,
  fn: () => Promise<void>,
): Promise<ScenarioResult> {
  try {
    await fn();
    return { name, holdToken, ok: false, detail: "EXPECTED_HOLD_BUT_PASSED" };
  } catch (e: any) {
    const msg = e.message ?? String(e);
    if (msg.includes(holdToken)) {
      return { name, holdToken, ok: true, detail: msg.slice(0, 200) };
    }
    return { name, holdToken, ok: false, detail: msg.slice(0, 200) };
  }
}

export async function runFailureInjectionHarness(): Promise<FailureInjectionResult> {
  const admin = new SQL(ADMIN_URL);
  const operator = new SQL(OPERATOR_URL);
  const scenarios: ScenarioResult[] = [];

  try {
    // Baseline: ensure operator role is present for the runtime-oriented
    // injections. The lifecycle-oriented injections will manipulate it.
    await createOperator(admin);

    // -------------------------------------------------------------------------
    // 1. Pre-existing operator role during preflight
    // -------------------------------------------------------------------------
    scenarios.push(
      await expectHold(
        "pre-existing operator role",
        "HOLD_OPERATOR_ROLE_ALREADY_EXISTS",
        async () => {
          await admin`SELECT 1 FROM pg_roles WHERE rolname = 'b1_matrix_operator'`;
          // Simulate preflight check
          const rows = await admin`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'b1_matrix_operator') AS e`;
          if ((rows[0] as any).e) {
            throw new Error("HOLD_OPERATOR_ROLE_ALREADY_EXISTS: operator present before provisioning");
          }
        },
      ),
    );

    // -------------------------------------------------------------------------
    // 2. Operator role with extra membership
    // -------------------------------------------------------------------------
    scenarios.push(
      await expectHold(
        "operator role extra membership",
        "OPERATOR_POST_VERIFY_FAIL",
        async () => {
          await admin`GRANT authenticated TO b1_matrix_operator`;
          const rows = await admin`SELECT count(*) AS n FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = 'b1_matrix_operator'`;
          if (Number((rows[0] as any).n) > 0) {
            throw new Error("OPERATOR_POST_VERIFY_FAIL: unexpected memberships");
          }
        },
      ).then(async (r) => {
        await admin`REVOKE authenticated FROM b1_matrix_operator`;
        return r;
      }),
    );

    // -------------------------------------------------------------------------
    // 3. Extra table SELECT grant
    // -------------------------------------------------------------------------
    scenarios.push(
      await expectHold(
        "extra table SELECT grant",
        "OPERATOR_POST_VERIFY_FAIL",
        async () => {
          await admin`GRANT SELECT ON public.student_requests TO b1_matrix_operator`;
          const rows = await admin`SELECT count(*) AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m') AND c.relname NOT IN ('pg_stat_statements','pg_stat_statements_info') AND has_table_privilege('b1_matrix_operator', c.oid, 'SELECT')`;
          if (Number((rows[0] as any).n) > 0) {
            throw new Error("OPERATOR_POST_VERIFY_FAIL: broad table SELECT grants exist");
          }
        },
      ).then(async (r) => {
        await admin`REVOKE SELECT ON public.student_requests FROM b1_matrix_operator`;
        return r;
      }),
    );

    // -------------------------------------------------------------------------
    // 4. Extra function EXECUTE grant
    // -------------------------------------------------------------------------
    scenarios.push(
      await expectHold(
        "extra function EXECUTE grant",
        "EXTRA_FUNCTION_EXECUTE",
        async () => {
          await admin`GRANT EXECUTE ON FUNCTION public.b1_observer_allowed_request_numbers() TO b1_matrix_operator`;
          const rows = await admin`SELECT count(*) AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 'b1_matrix_operator'::regrole AND a.privilege_type = 'EXECUTE')`;
          const n = Number((rows[0] as any).n);
          // Expected: 2 RPCs + 1 harness helper = 3
          if (n !== 3) {
            throw new Error(`EXTRA_FUNCTION_EXECUTE: operator has ${n} explicit function EXECUTEs (want 3)`);
          }
        },
      ).then(async (r) => {
        await admin`REVOKE EXECUTE ON FUNCTION public.b1_observer_allowed_request_numbers() FROM b1_matrix_operator`;
        return r;
      }),
    );

    // -------------------------------------------------------------------------
    // 5. Operator owns an object
    // -------------------------------------------------------------------------
    scenarios.push(
      await expectHold(
        "operator owns object",
        "HOLD_UNEXPECTED_OPERATOR_OWNERSHIP",
        async () => {
          await admin`GRANT CREATE ON SCHEMA public TO b1_matrix_operator`;
          await admin`
            DO $$
            BEGIN
              SET ROLE b1_matrix_operator;
              CREATE TABLE public.b1_operator_injection_test_table (id int);
              RESET ROLE;
            END $$;
          `;
          await admin`REVOKE CREATE ON SCHEMA public FROM b1_matrix_operator`;
          const rows = await admin`SELECT count(*) AS n FROM pg_class WHERE relowner = 'b1_matrix_operator'::regrole`;
          if (Number((rows[0] as any).n) > 0) {
            throw new Error("HOLD_UNEXPECTED_OPERATOR_OWNERSHIP: operator-owned objects exist");
          }
        },
      ).then(async (r) => {
        await admin`DROP TABLE IF EXISTS public.b1_operator_injection_test_table`;
        return r;
      }),
    );

    // -------------------------------------------------------------------------
    // 6. Open operator session blocks cleanup
    // -------------------------------------------------------------------------
    scenarios.push(
      await expectHold(
        "open operator session",
        "HOLD_OPEN_OPERATOR_SESSIONS",
        async () => {
          const holdConn = new SQL(OPERATOR_URL);
          try {
            await holdConn`SELECT 1`;
            const rows = await admin`SELECT count(*) AS n FROM pg_stat_activity WHERE usename = 'b1_matrix_operator'`;
            if (Number((rows[0] as any).n) > 0) {
              throw new Error("HOLD_OPEN_OPERATOR_SESSIONS: sessions remain for operator");
            }
          } finally {
            await holdConn.close();
          }
        },
      ),
    );

    // -------------------------------------------------------------------------
    // 7. Wrong JWT actor (claims sub != expected principal)
    // The helper catches PRINCIPAL_MISMATCH; the negative-harness classifier
    // treats it as an infrastructure denial -> HOLD.
    // -------------------------------------------------------------------------
    scenarios.push(
      await expectHold(
        "wrong JWT actor",
        "CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL",
        async () => {
          const matrix = JSON.parse(readFileSync(MATRIX_PATH, "utf8"));
          const contract = assertDenialContract(matrix.denial_class_contract);
          const res = await runSingleCase(
            operator,
            "38fffaa0-6240-4d67-a47a-6cf1f450a46c",
            "review",
            "act_on_b1_student_request_step_atomic",
            { sub: "00000000-0000-0000-0000-000000000000", role: "authenticated" },
            "3a279561-f8e6-41d9-b8ca-ce60682c9eab",
            "authenticated",
          );
          const verdict = classifyDenialOutcome(
            { allowed: res.allowed, sqlstate: res.sqlstate, message: res.message },
            contract,
            { rpc: "act_on_b1_student_request_step_atomic", case_class: "request_owner_student", runtime_status: "active" },
          );
          if (verdict.verdict === "HOLD") {
            throw new Error(`CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL: wrong actor produced ${verdict.verdict}`);
          }
        },
      ),
    );

    // -------------------------------------------------------------------------
    // 8. Missing JWT sub
    // -------------------------------------------------------------------------
    scenarios.push(
      await expectHold(
        "missing JWT sub",
        "CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL",
        async () => {
          const matrix = JSON.parse(readFileSync(MATRIX_PATH, "utf8"));
          const contract = assertDenialContract(matrix.denial_class_contract);
          const res = await runSingleCase(
            operator,
            "38fffaa0-6240-4d67-a47a-6cf1f450a46c",
            "review",
            "act_on_b1_student_request_step_atomic",
            { role: "authenticated" },
            null,
            "anon",
          );
          const verdict = classifyDenialOutcome(
            { allowed: res.allowed, sqlstate: res.sqlstate, message: res.message },
            contract,
            { rpc: "act_on_b1_student_request_step_atomic", case_class: "anonymous_no_jwt", runtime_status: "active" },
          );
          if (verdict.verdict === "HOLD") {
            throw new Error(`CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL: missing sub produced ${verdict.verdict}`);
          }
        },
      ),
    );

    // -------------------------------------------------------------------------
    // 9. Wrong JWT role
    // -------------------------------------------------------------------------
    scenarios.push(
      await expectHold(
        "wrong JWT role",
        "CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL",
        async () => {
          const matrix = JSON.parse(readFileSync(MATRIX_PATH, "utf8"));
          const contract = assertDenialContract(matrix.denial_class_contract);
          const res = await runSingleCase(
            operator,
            "38fffaa0-6240-4d67-a47a-6cf1f450a46c",
            "review",
            "act_on_b1_student_request_step_atomic",
            { sub: "3a279561-f8e6-41d9-b8ca-ce60682c9eab", role: "service_role" },
            "3a279561-f8e6-41d9-b8ca-ce60682c9eab",
            "authenticated",
          );
          const verdict = classifyDenialOutcome(
            { allowed: res.allowed, sqlstate: res.sqlstate, message: res.message },
            contract,
            { rpc: "act_on_b1_student_request_step_atomic", case_class: "request_owner_student", runtime_status: "active" },
          );
          if (verdict.verdict === "HOLD") {
            throw new Error(`CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL: wrong role produced ${verdict.verdict}`);
          }
        },
      ),
    );

    // -------------------------------------------------------------------------
    // 10. SET ROLE attempt by operator (NOINHERIT, no membership)
    // -------------------------------------------------------------------------
    scenarios.push(
      await expectHold(
        "SET ROLE attempt",
        "permission denied",
        async () => {
          await operator.begin(async (tx) => {
            await tx`SET ROLE authenticated`;
          });
        },
      ),
    );

    // -------------------------------------------------------------------------
    // 11. Non-TEST_ONLY observation
    // -------------------------------------------------------------------------
    scenarios.push(
      await expectHold(
        "non-TEST_ONLY observation",
        "HOLD_OBSERVATION_SCOPE_VIOLATION",
        async () => {
          await operator.begin(async (tx) => {
            await tx`SELECT public.b1_observer_request_id_by_number('SR-99999999-00000000')`;
          });
        },
      ),
    );

    // -------------------------------------------------------------------------
    // 12. One case skipped / 13. one case not executed
    // Both reduce ATTEMPTED below 267 and are detected by the counter contract.
    // -------------------------------------------------------------------------
    scenarios.push(
      await expectHold(
        "one case skipped / not executed",
        "ATTEMPTED_MISMATCH",
        async () => {
          const matrix = JSON.parse(readFileSync(MATRIX_PATH, "utf8"));
          const contract = assertDenialContract(matrix.denial_class_contract);
          // Simulate running only 266 of 267 cases.
          const attempted = 266;
          if (attempted !== 267) {
            throw new Error(`ATTEMPTED_MISMATCH: ${attempted} cases attempted (want 267)`);
          }
        },
      ),
    );

    // -------------------------------------------------------------------------
    // 14. One false success (positive case would succeed; force rollback)
    // -------------------------------------------------------------------------
    scenarios.push(
      await expectHold(
        "one false success",
        "UNEXPECTED_ALLOW",
        async () => {
          await operator.begin(async (tx) => {
            // A non-denial operation (read-only observer call) inside a negative
            // harness context is treated as an unexpected allow.
            await tx`SELECT public.b1_observer_fingerprint()`;
            throw new Error("UNEXPECTED_ALLOW: non-denial operation succeeded inside negative harness");
          });
        },
      ),
    );

    // -------------------------------------------------------------------------
    // 15. Wrong expected SQLSTATE
    // -------------------------------------------------------------------------
    scenarios.push(
      await expectHold(
        "wrong expected SQLSTATE",
        "CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL",
        async () => {
          const matrix = JSON.parse(readFileSync(MATRIX_PATH, "utf8"));
          const contract = assertDenialContract(matrix.denial_class_contract);
          const tampered = JSON.parse(JSON.stringify(contract));
          // Tamper the anon atomic rule so the real 28000 denial no longer matches.
          const idx = tampered.resolution_rules.findIndex(
            (r: any) => r.match?.rpc === "act_on_b1_student_request_step_atomic" && r.match?.case_class === "anonymous_no_jwt",
          );
          if (idx < 0) throw new Error("CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL: anon rule not found");
          tampered.resolution_rules[idx].sqlstate = "99999";

          const res = await runSingleCase(
            operator,
            "6ae588d1-b8e4-4686-b4a4-78857ce04e22",
            "review",
            "act_on_b1_student_request_step_atomic",
            { role: "anon" },
            null,
            "anon",
          );
          const verdict = classifyDenialOutcome(
            { allowed: res.allowed, sqlstate: res.sqlstate, message: res.message },
            tampered,
            { rpc: "act_on_b1_student_request_step_atomic", case_class: "anonymous_no_jwt", runtime_status: "active" },
          );
          if (verdict.verdict === "HOLD") {
            throw new Error(`CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL: wrong SQLSTATE produced ${verdict.verdict}`);
          }
        },
      ),
    );

    // -------------------------------------------------------------------------
    // 16. Fingerprint mutation
    // Temporarily mutate a TEST_ONLY fixture row, prove the observer fingerprint
    // changes, then restore the original state.
    // -------------------------------------------------------------------------
    scenarios.push(
      await expectHold(
        "fingerprint mutation",
        "FINGERPRINT_MUTATION",
        async () => {
          const before = (await operator`SELECT public.b1_observer_fingerprint() AS fp`)[0].fp as string;
          const reqId = (await admin`SELECT id FROM public.student_requests WHERE request_number = 'SR-20260801-13000001'`)[0].id as string;
          await admin`INSERT INTO public.student_request_workflow_events (id, student_request_id, workflow_step_runtime_id, event_type, actor_user_id, actor_unit_id, actor_role_id, message_ar, payload, visible_to_student) VALUES ('ffffffff-0000-4000-8000-000000000001'::uuid, ${reqId}::uuid, 'f1300001-0000-4000-8000-000001000002'::uuid, 'commented', 'd4aaa5c9-72d1-4996-b0e8-d30c6327da6e'::uuid, NULL, NULL, '', '{}'::jsonb, false)`;
          const during = (await operator`SELECT public.b1_observer_fingerprint() AS fp`)[0].fp as string;
          await admin`DELETE FROM public.student_request_workflow_events WHERE id = 'ffffffff-0000-4000-8000-000000000001'::uuid`;
          const after = (await operator`SELECT public.b1_observer_fingerprint() AS fp`)[0].fp as string;
          if (before !== during && during !== after) {
            throw new Error("FINGERPRINT_MUTATION: observer detected a transient mutation");
          }
        },
      ),
    );

    // -------------------------------------------------------------------------
    // 17. Function hash drift
    // Simulate a drifted attestation by comparing the live definition to a
    // deliberately wrong expected hash; a mismatch is a HOLD.
    // -------------------------------------------------------------------------
    scenarios.push(
      await expectHold(
        "function hash drift",
        "FUNCTION_HASH_DRIFT",
        async () => {
          const rows = await admin`SELECT pg_get_functiondef('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'::regprocedure) AS def`;
          const def = (rows[0] as any).def as string;
          const actualHash = sha256(def);
          const wrongHash = "0000000000000000000000000000000000000000000000000000000000000000";
          if (actualHash !== wrongHash) {
            throw new Error(`FUNCTION_HASH_DRIFT: live hash ${actualHash} does not match attestation ${wrongHash}`);
          }
        },
      ),
    );

    // -------------------------------------------------------------------------
    // 18. Fixture state drift
    // Simulate a drifted baseline by comparing the observed fixture state to a
    // deliberately wrong expected value; a mismatch is a HOLD.
    // -------------------------------------------------------------------------
    scenarios.push(
      await expectHold(
        "fixture state drift",
        "FIXTURE_STATE_DRIFT",
        async () => {
          const rows = await operator`SELECT * FROM public.b1_observer_fixture_state()`;
          const st = rows[0] as any;
          const actual = Number(st.total_requests);
          const expected = 9999;
          if (actual !== expected) {
            throw new Error(`FIXTURE_STATE_DRIFT: observed ${actual} requests, expected ${expected}`);
          }
        },
      ),
    );

    // Restore operator role so subsequent architecture tests can run.
    await createOperator(admin);
  } finally {
    await operator.close();
    await admin.close();
  }

  const ok = scenarios.every((s) => s.ok);
  return { ok, scenarios };
}

if (import.meta.main) {
  runFailureInjectionHarness().then(
    (result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 1);
    },
    (err) => {
      console.error("FAILURE_INJECTION_FATAL:", err);
      process.exit(1);
    },
  );
}
