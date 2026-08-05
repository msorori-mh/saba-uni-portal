import { describe, expect, it, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();
const dir = join(root, "tests", "b1-e2e-request-scoped-support-88");
const harnessSqlPath = join(dir, "pg17-disposable-harness.sql");
const decomSeedPath = join(dir, "pg17-decommission-harness.sql");
const schemaPath = join(dir, "pg", "10-minimal-schema.sql");
const migrationPath = join(
  root,
  "supabase",
  "migrations",
  "20260804120000_b1_88_request_scoped_e2e_support.sql",
);
const cleanupDraftPath = join(
  root,
  "docs",
  "migration-drafts",
  "B1-E2E-88-REQUEST-SCOPED-SUPPORT-CLEANUP.NOT_APPLIED.sql",
);
const fingerprintsPath = join(root, ".tmp-base-functions", "fingerprints.json");

const sqlContent = readFileSync(harnessSqlPath, "utf8");
const cleanupDraft = readFileSync(cleanupDraftPath, "utf8");
const container = `test-pg17-b1-e2e-88-${Date.now()}`;

const FN_IDS = [
  "public.create_student_request(text,text,jsonb,text)",
  "public.user_matches_workflow_runtime_step(uuid)",
  "public.current_user_matches_transfer_department_scope(uuid,text)",
  "public.can_current_user_act_on_step(uuid,text)",
] as const;

const FP_HELPER = `
CREATE OR REPLACE FUNCTION pg_temp.b1_e2e_88_fn_fingerprint(p_identity text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $fp$
DECLARE
  v_oid oid;
  v_def text;
  v_owner text;
  v_acl text;
  v_vol "char";
  v_strict boolean;
  v_parallel "char";
  v_sec boolean;
  v_config text;
  v_args text;
BEGIN
  IF to_regprocedure(p_identity) IS NULL THEN
    RAISE EXCEPTION 'B1_E2E_88_FP_IDENTITY_AMBIGUOUS_OR_MISSING:%', p_identity;
  END IF;
  v_oid := to_regprocedure(p_identity);

  SELECT
    regexp_replace(pg_get_functiondef(p.oid), E'[\\n\\r\\t ]+', ' ', 'g'),
    pg_get_userbyid(p.proowner),
    p.prosecdef,
    p.provolatile,
    p.proisstrict,
    p.proparallel,
    coalesce(array_to_string(p.proconfig, ','), ''),
    pg_get_function_identity_arguments(p.oid),
    (
      SELECT coalesce(
        string_agg(grantee::regrole::text || '=' || privilege_type, ',' ORDER BY 1),
        ''
      )
      FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))
    )
  INTO v_def, v_owner, v_sec, v_vol, v_strict, v_parallel, v_config, v_args, v_acl
  FROM pg_proc p
  WHERE p.oid = v_oid;

  RETURN md5(
    v_def || '|' || v_owner || '|' || v_sec::text || '|' || v_vol::text || '|' ||
    v_strict::text || '|' || v_parallel::text || '|' || v_config || '|' ||
    v_acl || '|' || v_args
  );
END;
$fp$;
`;

const RPA_FP_HELPER = `
CREATE OR REPLACE FUNCTION pg_temp.b1_e2e_88_rpa_fingerprint()
RETURNS text
LANGUAGE sql
STABLE
AS $r$
  SELECT md5(coalesce(string_agg(row_text, '|' ORDER BY row_text), ''))
  FROM (
    SELECT
      id::text || ':' ||
      unit_id::text || ':' ||
      role_id::text || ':' ||
      assignment_type || ':' ||
      coalesce(user_id::text, '') || ':' ||
      coalesce(staff_profile_id::text, '') || ':' ||
      coalesce(faculty_profile_id::text, '') || ':' ||
      coalesce(position_assignment_id::text, '') || ':' ||
      coalesce(department_id::text, '') || ':' ||
      is_active::text || ':' ||
      coalesce(starts_at::text, '') || ':' ||
      coalesce(ends_at::text, '') AS row_text
    FROM public.request_processing_assignments
  ) q;
$r$;
`;

function teardownContainer() {
  try {
    execSync(`docker stop ${container}`, { stdio: "ignore" });
  } catch {}
  try {
    execSync(`docker rm -f ${container}`, { stdio: "ignore" });
  } catch {}
}

function psql(
  sql: string,
  opts?: { allowFailure?: boolean },
): { ok: boolean; out: string } {
  const res = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  const out = `${res.stdout || ""}\n${res.stderr || ""}`;
  if (res.status !== 0) {
    if (opts?.allowFailure) return { ok: false, out };
    throw new Error(`PSQL Error:\n${out}`);
  }
  return { ok: true, out };
}

function psqlFile(filePath: string) {
  psql(readFileSync(filePath, "utf8"));
}

function psqlAt(sql: string): string {
  const res = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  if (res.status !== 0) {
    throw new Error(`PSQL-At Error:\n${res.stderr || res.stdout}`);
  }
  return (res.stdout || "").trim();
}

function extractBaseRestores(draft: string): string {
  const start = draft.indexOf("-- 5/6) Restore exact base");
  const end = draft.indexOf("-- 7) Revoke/drop only E2E");
  if (start < 0 || end < 0) {
    throw new Error("Decommission draft missing base restore markers");
  }
  return draft.slice(start, end);
}

async function waitReady() {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const logs = execSync(`docker logs ${container}`).toString("utf8");
      if (logs.includes("PostgreSQL init process complete")) {
        execSync(`docker exec ${container} pg_isready -U postgres`);
        ready = true;
        break;
      }
    } catch {
      // not ready
    }
    await Bun.sleep(500);
  }
  expect(ready).toBe(true);
}

function captureFingerprints(): Record<string, string> {
  const rows = psqlAt(`${FP_HELPER}
SELECT identity || '=' || pg_temp.b1_e2e_88_fn_fingerprint(identity)
FROM (VALUES
  ('public.create_student_request(text,text,jsonb,text)'),
  ('public.user_matches_workflow_runtime_step(uuid)'),
  ('public.current_user_matches_transfer_department_scope(uuid,text)'),
  ('public.can_current_user_act_on_step(uuid,text)')
) AS t(identity);
`);
  const out: Record<string, string> = {};
  for (const line of rows.split("\n").filter(Boolean)) {
    const eq = line.indexOf("=");
    out[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return out;
}

function captureRpaFingerprint(): string {
  return psqlAt(`${RPA_FP_HELPER}
SELECT pg_temp.b1_e2e_88_rpa_fingerprint();
`);
}

function restoreMig88CleanState() {
  // Re-install base bodies first so migration preflight succeeds even after
  // DROP FUNCTION / broken-body mutants. Reset ownership — CREATE OR REPLACE
  // preserves a mutated OWNER TO from prior mutants.
  psql(extractBaseRestores(cleanupDraft));
  psql(`
ALTER FUNCTION public.create_student_request(text, text, jsonb, text) OWNER TO postgres;
ALTER FUNCTION public.user_matches_workflow_runtime_step(uuid) OWNER TO postgres;
ALTER FUNCTION public.current_user_matches_transfer_department_scope(uuid, text) OWNER TO postgres;
ALTER FUNCTION public.can_current_user_act_on_step(uuid, text) OWNER TO postgres;
`);
  psqlFile(migrationPath);
  psql(`
ALTER FUNCTION public.create_student_request(text, text, jsonb, text) OWNER TO postgres;
ALTER FUNCTION public.user_matches_workflow_runtime_step(uuid) OWNER TO postgres;
ALTER FUNCTION public.current_user_matches_transfer_department_scope(uuid, text) OWNER TO postgres;
ALTER FUNCTION public.can_current_user_act_on_step(uuid, text) OWNER TO postgres;
`);
  psqlFile(decomSeedPath);
}

afterAll(() => {
  teardownContainer();
});

describe("B1 E2E 88 PG17 disposable harness", () => {
  it("is transactional and covers the required proof surfaces", () => {
    expect(sqlContent).toMatch(/^\s*BEGIN;/m);
    expect(sqlContent).toMatch(/^\s*ROLLBACK;/m);
    expect(sqlContent).not.toMatch(/^\s*COMMIT;/m);
    expect(sqlContent).toContain("PASS_B1_E2E_88_PG17_DISPOSABLE_HARNESS");
    expect(sqlContent).toContain("A_REAL_ASSIGNMENT_SHOULD_PASS");
    expect(sqlContent).toContain("B_BOUND_ACTOR_SHOULD_PASS");
    expect(sqlContent).toContain("C_E2E_CREATE_SHOULD_PASS");
    expect(sqlContent).toContain("D_RPA_FINGERPRINT_DRIFT");
    expect(sqlContent).toContain("SR-20260801-13");
    expect(sqlContent).toContain("B1_E2E_88_HARNESS_UNEXPECTED_SUCCESS");
    expect(sqlContent).toContain("B1_E2E_88_CLEANUP_ASSIGNEE_DRIFT");
    expect(sqlContent).toContain("D_CAS_LATER_ASSIGNMENT_NOT_PRESERVED");
    expect(sqlContent).not.toMatch(
      /RAISE EXCEPTION '[A-Z0-9_]*SHOULD_DENY'[\s\S]{0,80}EXCEPTION WHEN others THEN\s*NULL;/i,
    );
  });

  it("decommission draft is fully executable (no paste placeholders)", () => {
    expect(cleanupDraft).toContain("CREATE OR REPLACE FUNCTION public.create_student_request");
    expect(cleanupDraft).toContain(
      "CREATE OR REPLACE FUNCTION public.user_matches_workflow_runtime_step",
    );
    expect(cleanupDraft).toContain(
      "CREATE OR REPLACE FUNCTION public.current_user_matches_transfer_department_scope",
    );
    expect(cleanupDraft.toLowerCase()).toContain(
      "create or replace function public.can_current_user_act_on_step",
    );
    expect(cleanupDraft).toContain("pg_temp.b1_e2e_88_fn_fingerprint");
    expect(cleanupDraft).toContain("ed11125e55df36b154c432c7e28d7285");
    expect(cleanupDraft).toContain("9c9090f29458975b197b92dc86b0e587");
    expect(cleanupDraft).not.toMatch(/Operator must paste/i);
    expect(cleanupDraft).not.toMatch(/\bgit show\b/i);
    expect(cleanupDraft).not.toMatch(/placeholder/i);
  });

  it("launches PostgreSQL 17 and proves A/B/C/D locally", async () => {
    try {
      execSync(
        `docker run --rm --detach --name ${container} -e POSTGRES_PASSWORD=local_only postgres:17-alpine`,
      );

      await waitReady();

      psqlFile(schemaPath);
      psqlFile(migrationPath);
      const out = psql(readFileSync(harnessSqlPath, "utf8")).out;
      expect(out).toContain("PASS_B1_E2E_88_PG17_DISPOSABLE_HARNESS");
    } finally {
      teardownContainer();
    }
  }, 180_000);

  it(
    "proves complete executable decommission and fail-closed mutants",
    async () => {
      try {
        execSync(
          `docker run --rm --detach --name ${container} -e POSTGRES_PASSWORD=local_only postgres:17-alpine`,
        );
        await waitReady();

        // --- A: schema + exact base restores, capture base fingerprints ---
        psqlFile(schemaPath);
        psql(extractBaseRestores(cleanupDraft));
        const baseFp = captureFingerprints();
        const helperFpBefore = psqlAt(`${FP_HELPER}
SELECT pg_temp.b1_e2e_88_fn_fingerprint('public.is_owner_of_request(uuid,uuid)');
`);

        let expectedBase: Record<string, string> | null = null;
        let expectedMig: Record<string, string> | null = null;
        try {
          const pins = JSON.parse(readFileSync(fingerprintsPath, "utf8"));
          expectedBase = pins.base;
          expectedMig = pins.migration_88;
        } catch {
          // fingerprints.json optional; draft pins remain authoritative for decommission
        }
        if (expectedBase) {
          for (const id of FN_IDS) {
            expect(baseFp[id]).toBe(expectedBase[id]);
          }
        }

        // --- B: apply migration 88 ---
        psqlFile(migrationPath);
        const migFp = captureFingerprints();
        const helperFpAfter = psqlAt(`${FP_HELPER}
SELECT pg_temp.b1_e2e_88_fn_fingerprint('public.is_owner_of_request(uuid,uuid)');
`);

        // --- C: only the four expected functions differ; unrelated helper unchanged ---
        for (const id of FN_IDS) {
          expect(migFp[id]).not.toBe(baseFp[id]);
        }
        expect(helperFpAfter).toBe(helperFpBefore);
        if (expectedMig) {
          for (const id of FN_IDS) {
            expect(migFp[id]).toBe(expectedMig[id]);
          }
        }

        // --- D: seed + operational cleanup (no open/active) ---
        const seedOut = psql(readFileSync(decomSeedPath, "utf8")).out;
        expect(seedOut).toContain("PASS_B1_E2E_88_DECOM_SEED");
        const rpaBefore = captureRpaFingerprint();

        // --- E: execute complete decommission draft ---
        const decomOut = psql(cleanupDraft).out;
        expect(decomOut).toMatch(/B1_E2E_88_DECOMMISSION_OK|COMMIT/i);

        // --- F: post-decommission proofs ---
        const restoredFp = captureFingerprints();
        for (const id of FN_IDS) {
          expect(restoredFp[id]).toBe(baseFp[id]);
        }

        const post = psqlAt(`
SELECT public.can_current_user_act_on_step(
  '17171717-1717-4171-8171-171717171711'::uuid, 'review'
)::text
FROM (SELECT set_config('e_rpcmatrix.uid', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', false)) s;
SELECT public.can_current_user_act_on_step(
  '17171717-1717-4171-8171-171717171711'::uuid, 'review'
)::text
FROM (SELECT set_config('e_rpcmatrix.uid', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', false)) s;
SELECT (position('b1_e2e_88' IN pg_get_functiondef(
  'public.create_student_request(text,text,jsonb,text)'::regprocedure
)) = 0)::text;
SELECT (position('b1_e2e_88' IN pg_get_functiondef(
  'public.can_current_user_act_on_step(uuid,text)'::regprocedure
)) = 0)::text;
SELECT (NOT has_function_privilege(
  'service_role',
  'public.open_b1_e2e_88_execution(uuid,uuid,text,timestamptz,jsonb)',
  'EXECUTE'
))::text;
SELECT (NOT has_function_privilege(
  'service_role',
  'public.bind_b1_e2e_88_actor_to_runtime_step(uuid,uuid,uuid,uuid,text,uuid,text)',
  'EXECUTE'
))::text;
SELECT count(*)::text FROM public.b1_e2e_88_audit_events;
SELECT count(*)::text FROM public.student_requests
  WHERE request_number LIKE 'SR-20260801-13%';
SELECT count(*)::text FROM public.request_types
  WHERE code IN (
    'enrollment_suspension','excused_absence','department_transfer',
    'final_chance','file_withdrawal'
  ) AND student_visible IS DISTINCT FROM false;
SELECT student_visible::text FROM public.request_types
  WHERE code = 'enrollment_certificate';
SELECT count(*)::text FROM public.b1_e2e_88_executions
  WHERE status = 'active' AND closed_at IS NULL;
SELECT count(*)::text FROM public.b1_e2e_88_actor_bindings WHERE active;
`);
        const lines = post.split("\n").filter(Boolean);
        const realCan = lines[0];
        const unboundCan = lines[1];
        const createClean = lines[2];
        const canActClean = lines[3];
        const openRevoked = lines[4];
        const bindRevoked = lines[5];
        const auditCount = lines[6];
        const fixtureCount = lines[7];
        const visFive = lines[8];
        const enrollVis = lines[9];
        const openCount = lines[10];
        const activeCount = lines[11];

        expect(realCan).toBe("true");
        expect(unboundCan).toBe("false");
        expect(createClean).toBe("true");
        expect(canActClean).toBe("true");
        expect(openRevoked).toBe("true");
        expect(bindRevoked).toBe("true");
        expect(Number(auditCount)).toBeGreaterThanOrEqual(1);
        expect(fixtureCount).toBe("19");
        expect(visFive).toBe("0");
        expect(enrollVis).toBe("true");
        expect(openCount).toBe("0");
        expect(activeCount).toBe("0");
        expect(captureRpaFingerprint()).toBe(rpaBefore);

        // --- G: mutation cases — each must refuse and roll back ---
        type Mutant = {
          name: string;
          token: RegExp;
          apply: () => void;
          expectMigFp?: boolean;
        };

        const mutants: Mutant[] = [
          {
            name: "altered_body",
            token: /B1_E2E_88_DECOMMISSION_PREIMAGE_MISMATCH|PREIMAGE/i,
            apply: () => {
              psql(`
CREATE OR REPLACE FUNCTION public.create_student_request(
  p_request_type text, p_title text,
  p_form_data jsonb DEFAULT '{}'::jsonb, p_student_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'mutated_b1_e2e_88_body';
END;
$$;
`);
            },
            expectMigFp: false,
          },
          {
            name: "missing_function",
            token: /B1_E2E_88_DECOMMISSION_PREIMAGE_MISMATCH|FP_IDENTITY|PREIMAGE|missing/i,
            apply: () => {
              psql(
                `DROP FUNCTION public.user_matches_workflow_runtime_step(uuid);`,
              );
            },
            expectMigFp: false,
          },
          {
            name: "wrong_acl",
            token: /B1_E2E_88_DECOMMISSION_PREIMAGE_MISMATCH|PREIMAGE/i,
            apply: () => {
              psql(`
REVOKE ALL ON FUNCTION public.can_current_user_act_on_step(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_current_user_act_on_step(uuid, text) TO anon;
`);
            },
            expectMigFp: false,
          },
          {
            name: "wrong_owner",
            token: /B1_E2E_88_DECOMMISSION_PREIMAGE_MISMATCH|PREIMAGE/i,
            apply: () => {
              psql(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'b1_e2e_88_mutant_owner') THEN
    CREATE ROLE b1_e2e_88_mutant_owner NOLOGIN;
  END IF;
END $$;
ALTER FUNCTION public.current_user_matches_transfer_department_scope(uuid, text)
  OWNER TO b1_e2e_88_mutant_owner;
`);
            },
            expectMigFp: false,
          },
          {
            name: "wrong_search_path",
            token: /B1_E2E_88_DECOMMISSION_PREIMAGE_MISMATCH|PREIMAGE/i,
            apply: () => {
              psql(`
ALTER FUNCTION public.user_matches_workflow_runtime_step(uuid)
  SET search_path TO pg_catalog, public;
`);
            },
            expectMigFp: false,
          },
          {
            name: "open_execution",
            token: /B1_E2E_88_DECOMMISSION_REFUSED_OPEN_EXECUTION|CLEANUP_STILL_ACTIVE|REFUSED_OPEN/i,
            apply: () => {
              // cleanup at start of draft closes open executions — leave one that
              // cleanup cannot close? Draft calls cleanup first which closes them.
              // Open AFTER... no, mutant is before decommission. cleanup will close it.
              // Need open that survives cleanup, OR fail at preflight before cleanup?
              // Preflight only NOTICES open count; cleanup closes; decommission_guard
              // asserts no open. So cleanup will close our open execution!
              // Use a broken cleanup path: disable cleanup by renaming? Or insert a
              // row that cleanup skips?
              // Looking at cleanup — it closes all matching executions.
              // So open_execution mutant cannot survive cleanup unless cleanup fails.
              // Alternative: make cleanup missing so decommission fails earlier.
              // User asked for open execution mutant specifically.
              // Trick: open execution AFTER mocking cleanup to no-op.
              // Or: revoke execute on cleanup from everyone including making a
              // wrapper... Superuser still runs cleanup.
              // Best approach: replace cleanup_b1_e2e_88_package with a no-op that
              // does not close, then open an execution.
              psql(`
CREATE OR REPLACE FUNCTION public.cleanup_b1_e2e_88_package(
  p_correlation_id uuid DEFAULT NULL,
  p_restore_assignees boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN jsonb_build_object('noop', true);
END;
$$;
SELECT public.open_b1_e2e_88_execution(
  gen_random_uuid(),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
  'enrollment_suspension',
  now() + interval '1 hour'
);
`);
            },
            expectMigFp: true,
          },
          {
            name: "active_binding",
            token: /B1_E2E_88_DECOMMISSION_REFUSED_ACTIVE_BINDING|CLEANUP_STILL_ACTIVE|REFUSED_ACTIVE/i,
            apply: () => {
              psql(`
CREATE OR REPLACE FUNCTION public.cleanup_b1_e2e_88_package(
  p_correlation_id uuid DEFAULT NULL,
  p_restore_assignees boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN jsonb_build_object('noop', true);
END;
$$;
WITH e AS (
  INSERT INTO public.b1_e2e_88_executions(
    correlation_id, student_user_id, service_code, status, expires_at, closed_at
  ) VALUES (
    gen_random_uuid(),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'enrollment_suspension',
    'closed',
    now() + interval '1 hour',
    now()
  )
  RETURNING id, correlation_id
)
INSERT INTO public.b1_e2e_88_actor_bindings(
  execution_id, request_id, workflow_step_id, runtime_step_id,
  actor_user_id, processing_unit_id, processing_role_id,
  action, expires_at, active, correlation_id
)
SELECT
  e.id,
  '16161616-1616-4161-8161-161616161611'::uuid,
  '14141414-1414-4141-8141-141414141411'::uuid,
  '17171717-1717-4171-8171-171717171711'::uuid,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid,
  'ffffffff-ffff-4fff-8fff-fffffffffff1'::uuid,
  'ffffffff-ffff-4fff-8fff-fffffffffff3'::uuid,
  'review',
  now() + interval '1 hour',
  true,
  e.correlation_id
FROM e;
`);
            },
            expectMigFp: true,
          },
          {
            name: "fixture_drift",
            token: /B1_E2E_88_CLEANUP_FIXTURE_DRIFT/i,
            apply: () => {
              psql(`
DELETE FROM public.student_requests
WHERE request_number = 'SR-20260801-13000001';
`);
            },
            expectMigFp: true,
          },
          {
            name: "visibility_drift",
            token: /B1_E2E_88_CLEANUP_VISIBILITY_DRIFT/i,
            apply: () => {
              psql(`
UPDATE public.request_types
SET student_visible = true
WHERE code = 'enrollment_suspension';
`);
            },
            expectMigFp: true,
          },
          {
            name: "rpa_drift",
            token: /B1_E2E_88_RPA_FINGERPRINT_DRIFT/i,
            apply: () => {
              // RPA fingerprint is captured in preflight THEN compared after cleanup.
              // Mutating RPA after preflight capture requires mutation during draft —
              // outside we mutate before draft so preflight stores mutated fp, then
              // cleanup must not touch RPA so post-cleanup compare still matches.
              // That would NOT fail!
              // Looking at draft: preflight captures rpa fp, cleanup runs (must not
              // touch RPA), then assert same. So external mutation before draft
              // won't fail RPA check.
              // Need cleanup to somehow change RPA, OR mutate between capture and
              // assert — only possible via replacing cleanup to mutate RPA.
              psql(`
CREATE OR REPLACE FUNCTION public.cleanup_b1_e2e_88_package(
  p_correlation_id uuid DEFAULT NULL,
  p_restore_assignees boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.request_processing_assignments
  SET is_active = false
  WHERE id = (SELECT id FROM public.request_processing_assignments ORDER BY id LIMIT 1);
  RETURN jsonb_build_object('drift', true);
END;
$$;
`);
            },
            expectMigFp: true,
          },
        ];

        for (const mutant of mutants) {
          restoreMig88CleanState();
          const migFpFresh = captureFingerprints();
          for (const id of FN_IDS) {
            expect(migFpFresh[id]).toBe(migFp[id]);
          }

          mutant.apply();
          const failed = psql(cleanupDraft, { allowFailure: true });
          expect(failed.ok).toBe(false);
          expect(failed.out).toMatch(mutant.token);

          if (mutant.expectMigFp !== false) {
            const afterFail = captureFingerprints();
            for (const id of FN_IDS) {
              expect(afterFail[id]).toBe(migFp[id]);
            }
          } else {
            // Function catalog mutants: decommission must not have committed base restore
            const afterFail = (() => {
              try {
                return captureFingerprints();
              } catch {
                return null;
              }
            })();
            if (afterFail) {
              for (const id of FN_IDS) {
                expect(afterFail[id]).not.toBe(baseFp[id]);
              }
            } else {
              // missing function — fingerprint capture itself fails; prove not fully base
              const stillMissing = psqlAt(`
SELECT (to_regprocedure('public.user_matches_workflow_runtime_step(uuid)') IS NULL)::text;
`);
              expect(stillMissing).toBe("true");
            }
          }
        }
      } finally {
        teardownContainer();
      }
    },
    300_000,
  );
});
