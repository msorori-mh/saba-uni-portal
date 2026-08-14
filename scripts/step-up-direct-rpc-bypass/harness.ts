/**
 * Local-only direct-RPC bypass harness for PORTAL-MOBILE-BIOMETRIC-STEP-UP-01.
 *
 * Boots an ephemeral in-process PostgreSQL (PGlite), recreates the
 * PRE-migration production contract for
 * `submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])`
 * (SECURITY DEFINER, EXECUTE granted to `authenticated`), applies the migration
 * draft verbatim, and then exercises the RPC surface as the `authenticated`
 * role exactly the way a raw Data API caller would.
 *
 * No production connection, credentials or data are used.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

export const MIGRATION_PATH = join(
  import.meta.dir,
  "..",
  "..",
  "docs",
  "migration-drafts",
  "PORTAL-MOBILE-BIOMETRIC-STEP-UP-01.sql",
);

const STUDENT = "11111111-1111-1111-1111-111111111111";
const REQ_A = "22222222-2222-2222-2222-222222222222";
const REQ_B = "44444444-4444-4444-4444-444444444444";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

export type CaseOutcome = { ok: boolean; error?: string };

export type BypassMatrix = {
  cases: Record<string, CaseOutcome>;
  privileges: Record<string, boolean>;
  proacl: Record<string, string>;
};

const PRE_MIGRATION = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- Mirrors today's production 5-argument entry point.
CREATE OR REPLACE FUNCTION public.submit_b1_student_request_atomic(
  p_request_id uuid, p_canonical_code text, p_form_data jsonb,
  p_expected_updated_at timestamptz, p_attachment_ids uuid[]
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS
$$ SELECT jsonb_build_object('submitted', true, 'request_id', p_request_id) $$;
GRANT EXECUTE ON FUNCTION public.submit_b1_student_request_atomic(
  uuid, text, jsonb, timestamptz, uuid[]) TO authenticated;
`;

const FIXTURES = `
INSERT INTO auth.users(id) VALUES ('${STUDENT}') ON CONFLICT DO NOTHING;
INSERT INTO public.student_trusted_devices(user_id, device_id, public_key)
VALUES ('${STUDENT}', 'dev-1', repeat('A', 64)) ON CONFLICT DO NOTHING;

-- Stands in for the server-side ECDSA verification path (service_role only in
-- production): mints a proof without granting the client anything.
CREATE OR REPLACE FUNCTION public.__harness_mint(p_request_id uuid, p_action text, p_hash text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cid uuid; v_token text;
BEGIN
  INSERT INTO public.step_up_challenges(user_id, device_id, action_code, request_id,
    payload_hash, nonce, expires_at)
  VALUES ('${STUDENT}', 'dev-1', p_action, p_request_id, p_hash, 'n', now() + interval '120 seconds')
  RETURNING id INTO v_cid;
  SELECT proof_token INTO v_token FROM public.mint_step_up_proof(v_cid);
  RETURN v_token;
END; $$;
REVOKE ALL ON FUNCTION public.__harness_mint(uuid, text, text) FROM PUBLIC, anon, authenticated;
`;

const PRIVILEGE_TARGETS: Record<string, [string, string]> = {
  authenticated_5arg: [
    "authenticated",
    "public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])",
  ],
  authenticated_core: [
    "authenticated",
    "public.submit_b1_student_request_atomic_core(uuid,text,jsonb,timestamptz,uuid[])",
  ],
  authenticated_7arg: [
    "authenticated",
    "public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[],text,text)",
  ],
  authenticated_consume: ["authenticated", "public.consume_step_up_proof(text,text,uuid,text)"],
  authenticated_mint: ["authenticated", "public.mint_step_up_proof(uuid)"],
  anon_5arg: [
    "anon",
    "public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])",
  ],
  anon_7arg: [
    "anon",
    "public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[],text,text)",
  ],
};

export async function runDirectRpcBypassMatrix(): Promise<BypassMatrix> {
  const db = new PGlite({ extensions: { pgcrypto } });
  const cases: Record<string, CaseOutcome> = {};

  const asStudent = async (sql: string): Promise<CaseOutcome> => {
    try {
      await db.exec("SET ROLE authenticated;");
      await db.exec(`SET request.jwt.claim.sub = '${STUDENT}';`);
      await db.query(sql);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    } finally {
      await db.exec("RESET ROLE;");
    }
  };

  const mint = async (requestId: string, action: string, hash: string): Promise<string> => {
    const res = await db.query<{ t: string }>(
      `SELECT public.__harness_mint($1::uuid, $2, $3) AS t`,
      [requestId, action, hash],
    );
    return res.rows[0]!.t;
  };

  try {
    await db.exec(PRE_MIGRATION);
    await db.exec(readFileSync(MIGRATION_PATH, "utf8"));
    await db.exec(FIXTURES);

    cases["5_ARG_SENSITIVE_DIRECT_RPC"] = await asStudent(
      `SELECT public.submit_b1_student_request_atomic('${REQ_A}'::uuid, 'file_withdrawal',
         '{}'::jsonb, now(), '{}'::uuid[])`,
    );
    cases["5_ARG_CORE_DIRECT_RPC"] = await asStudent(
      `SELECT public.submit_b1_student_request_atomic_core('${REQ_A}'::uuid, 'file_withdrawal',
         '{}'::jsonb, now(), '{}'::uuid[])`,
    );
    cases["7_ARG_WITHOUT_PROOF"] = await asStudent(
      `SELECT public.submit_b1_student_request_atomic('${REQ_A}'::uuid, 'file_withdrawal',
         '{}'::jsonb, now(), '{}'::uuid[], NULL, NULL)`,
    );
    cases["MINT_DIRECT_BY_AUTHENTICATED"] = await asStudent(
      `SELECT public.mint_step_up_proof('00000000-0000-0000-0000-000000000000'::uuid)`,
    );
    cases["CONSUME_DIRECT_BY_AUTHENTICATED"] = await asStudent(
      `SELECT public.consume_step_up_proof('x', 'submit_file_withdrawal', '${REQ_A}'::uuid,
         '${HASH_A}')`,
    );
    cases["NON_SENSITIVE_LEGACY_5_ARG"] = await asStudent(
      `SELECT public.submit_b1_student_request_atomic('${REQ_B}'::uuid, 'enrollment_certificate',
         '{}'::jsonb, now(), '{}'::uuid[])`,
    );

    const proof = await mint(REQ_A, "submit_file_withdrawal", HASH_A);
    cases["7_ARG_VALID_PROOF"] = await asStudent(
      `SELECT public.submit_b1_student_request_atomic('${REQ_A}'::uuid, 'file_withdrawal',
         '{}'::jsonb, now(), '{}'::uuid[], '${proof}', '${HASH_A}')`,
    );
    cases["REPLAY"] = await asStudent(
      `SELECT public.submit_b1_student_request_atomic('${REQ_A}'::uuid, 'file_withdrawal',
         '{}'::jsonb, now(), '{}'::uuid[], '${proof}', '${HASH_A}')`,
    );
    // A proof consumed in an earlier transaction must not unlock the 5-arg path.
    cases["5_ARG_AFTER_CONSUMED_PROOF"] = await asStudent(
      `SELECT public.submit_b1_student_request_atomic('${REQ_A}'::uuid, 'file_withdrawal',
         '{}'::jsonb, now(), '{}'::uuid[])`,
    );

    const proof2 = await mint(REQ_B, "submit_department_transfer", HASH_B);
    cases["PAYLOAD_TAMPER"] = await asStudent(
      `SELECT public.submit_b1_student_request_atomic('${REQ_B}'::uuid, 'department_transfer',
         '{}'::jsonb, now(), '{}'::uuid[], '${proof2}', '${"c".repeat(64)}')`,
    );

    const privileges: Record<string, boolean> = {};
    for (const [key, [role, target]] of Object.entries(PRIVILEGE_TARGETS)) {
      const res = await db.query<{ v: boolean }>(
        `SELECT has_function_privilege($1, $2, 'EXECUTE') AS v`,
        [role, target],
      );
      privileges[key] = res.rows[0]!.v;
    }

    const aclRows = await db.query<{ sig: string; acl: string }>(
      `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig,
              coalesce(array_to_string(p.proacl, ' | '), 'OWNER_ONLY_DEFAULT') AS acl
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('submit_b1_student_request_atomic',
                            'submit_b1_student_request_atomic_core',
                            'consume_step_up_proof', 'mint_step_up_proof')
        ORDER BY 1`,
    );
    const proacl: Record<string, string> = {};
    for (const row of aclRows.rows) proacl[row.sig] = row.acl;

    return { cases, privileges, proacl };
  } finally {
    await db.close();
  }
}

if (import.meta.main) {
  const matrix = await runDirectRpcBypassMatrix();
  console.log(JSON.stringify(matrix, null, 2));
}
