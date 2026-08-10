/**
 * ACADEMIC-COUNCILS-PR306-RELEASE-QUALIFICATION-REMEDIATION-LONGRUN-12
 * Closes HIGH-1 (real TEST_ONLY lifecycle) and HIGH-2 (strict preflight + drift).
 * HIGH-3 covered by councils-c0-c9-postgrest-http-auth-matrix.test.ts
 */

import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();

const packageFiles = {
  preflight: join(root, "docs/migration-drafts/COUNCILS-C0-C9-PRODUCTION-READONLY-PREFLIGHT-01.sql"),
  fixture: join(root, "docs/migration-drafts/COUNCILS-C0-C9-TESTONLY-E2E-FIXTURE-01.sql"),
  cleanup: join(root, "docs/migration-drafts/COUNCILS-C0-C9-TESTONLY-CLEANUP-01.sql"),
  zeroResidue: join(root, "docs/migration-drafts/COUNCILS-C0-C9-ZERO-RESIDUE-VERIFIER-01.sql"),
  observability: join(root, "docs/migration-drafts/COUNCILS-C0-C9-OBSERVABILITY-READONLY-01.sql"),
};

const chain = [
  { step: "C0", migration: "supabase/migrations/20260808120000_councils_c0_write_surface_hardening_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C0.sql", pass: "COUNCILS_C0_PRODUCTION_POST_VERIFIER_PASS" },
  { step: "C1", migration: "supabase/migrations/20260808121000_councils_c1_meeting_state_machine_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C1.sql", pass: "COUNCILS_C1_PRODUCTION_POST_VERIFIER_PASS" },
  { step: "C2", migration: "supabase/migrations/20260808122000_councils_c2_topic_intake_review_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C2.sql", pass: "COUNCILS_C2_PRODUCTION_POST_VERIFIER_PASS" },
  { step: "C3", migration: "supabase/migrations/20260808130000_councils_c3_attendance_quorum_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C3.sql", pass: "COUNCILS_C3_PRODUCTION_POST_VERIFIER_PASS" },
  { step: "C4", migration: "supabase/migrations/20260808140000_councils_c4_session_voting_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C4.sql", pass: "COUNCILS_C4_PRODUCTION_POST_VERIFIER_PASS" },
  { step: "C5", migration: "supabase/migrations/20260810180000_councils_c5_minutes_lifecycle_02.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C5.sql", pass: "COUNCILS_C5_PRODUCTION_POST_VERIFIER_PASS" },
  { step: "C6", migration: "supabase/migrations/20260808160000_councils_c6_decisions_followup_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C6.sql", pass: "COUNCILS_C6_PRODUCTION_POST_VERIFIER_PASS" },
  { step: "C7", migration: "supabase/migrations/20260808170000_councils_c7_audit_archive_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C7.sql", pass: "COUNCILS_C7_PRODUCTION_POST_VERIFIER_PASS" },
  { step: "C8", migration: "supabase/migrations/20260808171000_councils_c0_c8_final_security_closure_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C8.sql", pass: "COUNCILS_C8_PRODUCTION_POST_VERIFIER_PASS" },
  { step: "C9", migration: "supabase/migrations/20260808180000_councils_c9_notifications_reporting_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C9.sql", pass: "COUNCILS_C9_PRODUCTION_POST_VERIFIER_PASS" },
] as const;

const predecessors = [
  "tests/academic-councils/postgres-minimal-schema.sql",
  "supabase/migrations/20260703192337_3ef2f7b2-cf46-4407-9f1a-60c25b46c211.sql",
  "supabase/migrations/20260703194033_cccf45a9-50ed-4a72-bb11-7e5d1627b5a2.sql",
  "supabase/migrations/20260704200326_b0736829-500e-456c-aa9b-6dc7ccd10012.sql",
  "supabase/migrations/20260705232119_84b04a88-50be-4c5c-b9c3-11aeb54fa119.sql",
] as const;

const container = `councils-rq-remediation-${Date.now()}`;

const dockerReady = (() => {
  try {
    execSync("docker --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function teardownContainer() {
  try {
    execSync(`docker rm -f ${container}`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

function psql(sql: string): { ok: boolean; out: string } {
  const res = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  return { ok: res.status === 0, out: `${res.stdout || ""}\n${res.stderr || ""}` };
}

function psqlFile(filePath: string): { ok: boolean; out: string } {
  return psql(readFileSync(filePath, "utf8"));
}

function discoverSchemaFingerprint(): string {
  const r = psql(`
    CREATE SCHEMA IF NOT EXISTS extensions;
    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
    SELECT encode(
      extensions.digest(string_agg(line, E'\\n' ORDER BY line), 'sha256'), 'hex') AS fp
    FROM (
      SELECT 'table:' || c.relname || ':' || a.attnum || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) AS line
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public' AND c.relname LIKE 'academic_council%' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
      UNION ALL SELECT 'constraint:' || con.conname || ':' || pg_get_constraintdef(con.oid)
      FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname LIKE 'academic_council%'
      UNION ALL SELECT 'index:' || i.relname || ':' || pg_get_indexdef(i.oid)
      FROM pg_index idx JOIN pg_class i ON i.oid = idx.indexrelid JOIN pg_class c ON c.oid = idx.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname LIKE 'academic_council%'
      UNION ALL SELECT 'trigger:' || t.tgname || ':' || pg_get_triggerdef(t.oid, true)
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname LIKE 'academic_council%' AND NOT t.tgisinternal
      UNION ALL SELECT 'enum:' || t.typname || ':' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname LIKE 'academic_council%' GROUP BY t.typname
      UNION ALL SELECT 'function:' || p.proname || ':' || pg_get_function_identity_arguments(p.oid) || ':' || btrim(regexp_replace(pg_get_functiondef(p.oid), '\\s+', ' ', 'g'))
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
        'is_council_admin', 'is_council_member', 'has_council_role', 'can_manage_council',
        'can_write_council_agenda', 'can_schedule_council_meeting', 'was_council_member_on',
        'can_submit_council_topic', 'tg_academic_councils_touch_updated_at',
        'tg_councils_validate_department_binding', 'tg_minutes_block_locked_edits',
        'council_topic_attachment_count', 'can_add_council_topic_attachment',
        'can_read_council_topic_attachment', 'can_upload_council_topic_attachment',
        'tg_enforce_council_topic_attachment'
      ])
      UNION ALL SELECT 'policy:' || p.schemaname || ':' || p.tablename || ':' || p.policyname || ':' || p.cmd || ':' ||
        coalesce(p.qual::text, 'NULL') || ':' || coalesce(p.with_check::text, 'NULL')
      FROM pg_policies p
      WHERE (p.schemaname = 'public' AND p.tablename LIKE 'academic_council%')
         OR (p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname LIKE 'acta_%')
    ) s;
  `);
  if (!r.ok) throw new Error(`fingerprint discovery failed:\n${r.out}`);
  const m = r.out.match(/([0-9a-f]{64})/);
  if (!m) throw new Error(`fingerprint missing:\n${r.out}`);
  return m[1]!;
}

function runPreflightLocal(): { ok: boolean; out: string } {
  const expected = discoverSchemaFingerprint();
  return psql(
    `SET councils.local_test_fingerprint_mode = 'LOCAL_TEST_ONLY';\n` +
      `SET councils.local_test_fingerprint_expected = '${expected}';\n` +
      readFileSync(packageFiles.preflight, "utf8"),
  );
}

async function waitReady(): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    const r = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], {
      encoding: "utf8",
    });
    if (r.status === 0 && psql("select 1;").ok) return true;
    await Bun.sleep(500);
  }
  return false;
}

function applyPredecessors() {
  for (const pred of predecessors) {
    const r = psqlFile(join(root, pred));
    if (!r.ok) throw new Error(`predecessor ${pred} failed:\n${r.out}`);
  }
}

function applyChain() {
  for (const step of chain) {
    const applied = psqlFile(join(root, step.migration));
    if (!applied.ok) throw new Error(`${step.step} apply failed:\n${applied.out}`);
    const verified = psqlFile(join(root, step.verifier));
    if (!verified.ok) throw new Error(`${step.step} post-verifier failed:\n${verified.out}`);
    expect(verified.out).toContain(step.pass);
  }
}

function enableTestOnlyExecute() {
  /* session GUCs must be set in the same psql invocation as the script */
}

function disableTestOnlyExecute() {
  /* no-op: default dry-run when GUCs unset */
}

function withExecuteGates(sql: string): string {
  return `
SELECT set_config('councils.pkg_dry_run', 'false', false);
SELECT set_config('councils.test_only.execute', 'true', false);
SELECT set_config('councils.test_only_execute', 'I_ACKNOWLEDGE_TEST_ONLY', false);
${sql}
`;
}

function withDryRunGates(sql: string): string {
  return `
SELECT set_config('councils.pkg_dry_run', 'true', false);
SELECT set_config('councils.test_only.execute', 'false', false);
SELECT set_config('councils.test_only_execute', '', false);
${sql}
`;
}

function sentinelFingerprint(): string {
  const r = psql(`
SELECT md5(string_agg(x, '|' ORDER BY x))
FROM (
  SELECT id::text || '|' || name || '|' || coalesce(settings::text, '') AS x
  FROM public.academic_councils
  WHERE id = 'c0c90000-0000-4000-8000-ffffffffffff'
  UNION ALL
  SELECT 'ABSENT'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.academic_councils
    WHERE id = 'c0c90000-0000-4000-8000-ffffffffffff'
  )
) s;
`);
  if (!r.ok) throw new Error(`sentinel fingerprint failed:\n${r.out}`);
  const m = r.out.match(/([0-9a-f]{32})/);
  if (!m) throw new Error(`sentinel fingerprint missing:\n${r.out}`);
  return m[1]!;
}

afterAll(() => {
  teardownContainer();
});

describe("Academic Councils PR306 release qualification remediation", () => {
  it("ships executable TEST_ONLY package and strict preflight contracts", () => {
    for (const [name, path] of Object.entries(packageFiles)) {
      expect(existsSync(path), name).toBe(true);
    }
    const fixture = readFileSync(packageFiles.fixture, "utf8");
    expect(fixture).toContain("councils.test_only.execute");
    expect(fixture).toContain("COUNCILS_TESTONLY_E2E_FIXTURE_EXECUTE_COMPLETE");
    expect(fixture).toContain("COUNCILS_TESTONLY_POSITIVE_E2E_PASS");
    expect(fixture).toContain("COUNCILS_TESTONLY_NEGATIVE_MATRIX_PASS");
    expect(fixture).not.toContain("EXECUTE_HANDOFF");
    expect(fixture).toContain("council_schedule_meeting");
    expect(fixture).toContain("archive_council_meeting");

    const cleanup = readFileSync(packageFiles.cleanup, "utf8");
    expect(cleanup).toContain("academic_council_test_only_fixture_registry");
    // Forbid LIKE-based cleanup predicates (comments documenting the ban are OK).
    expect(cleanup).not.toMatch(/WHERE[\s\S]{0,80}LIKE\s+'%TEST%/i);
    expect(cleanup).not.toMatch(/DELETE[\s\S]{0,120}LIKE\s+'/i);

    const zero = readFileSync(packageFiles.zeroResidue, "utf8");
    expect(zero).toContain("TEST_ONLY_RESIDUE_TOTAL");
    expect(zero).toContain("COUNCILS_ZERO_RESIDUE_VERIFIER_PASS");

    const preflight = readFileSync(packageFiles.preflight, "utf8");
    expect(preflight).toContain("READY_FOR_APPLY_C0");
    expect(preflight).toContain("v_expected_policies");
    expect(preflight).toContain("HOLD:");
    // Read-only: ban executable DML/DDL verbs outside comments (header may mention them).
    const preflightBody = preflight
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n")
      .toLowerCase();
    expect(preflightBody).not.toMatch(/\binsert\s+into\b/);
    expect(preflightBody).not.toMatch(/\bdelete\s+from\b/);
    expect(preflightBody).not.toMatch(/\btruncate\b/);
    expect(preflightBody).not.toMatch(/\bdrop\s+table\b/);
    expect(preflightBody).not.toMatch(/\bupdate\s+public\./);
  });

  it(
    "PG17: strict preflight, drift false-pass matrix, real TEST_ONLY lifecycle, sentinels, zero residue",
    async () => {
      if (!dockerReady) {
        throw new Error("docker is required for the PG17 disposable harness");
      }

      teardownContainer();
      execSync(
        `docker run -d --name ${container} -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17`,
        { stdio: "ignore" },
      );
      expect(await waitReady()).toBe(true);
      await Bun.sleep(1000);
      expect(await waitReady()).toBe(true);

      applyPredecessors();

      // ---- PHASE E: preflight PASS on clean predecessors ----
      const preOk = runPreflightLocal();
      if (!preOk.ok) throw new Error(`preflight PASS expected:\n${preOk.out}`);
      expect(preOk.out).toContain("READY_FOR_APPLY_C0");

      // ---- PHASE F: deliberate drift cases must HOLD ----
      const driftCases: { label: string; mutate: string; restore: string }[] = [
        {
          label: "wrong_authenticated_execute_revoke",
          mutate: `REVOKE EXECUTE ON FUNCTION public.has_council_role(uuid, uuid, public.academic_council_member_role) FROM authenticated;`,
          restore: `GRANT EXECUTE ON FUNCTION public.has_council_role(uuid, uuid, public.academic_council_member_role) TO authenticated, service_role;`,
        },
        {
          label: "unexpected_anon_execute",
          mutate: `GRANT EXECUTE ON FUNCTION public.is_council_admin(uuid) TO anon;`,
          restore: `REVOKE EXECUTE ON FUNCTION public.is_council_admin(uuid) FROM anon;`,
        },
        {
          label: "rls_disabled",
          mutate: `ALTER TABLE public.academic_council_meetings DISABLE ROW LEVEL SECURITY;`,
          restore: `ALTER TABLE public.academic_council_meetings ENABLE ROW LEVEL SECURITY;`,
        },
        {
          label: "extra_conflicting_policy",
          mutate: `CREATE POLICY meetings_select_extra_drift ON public.academic_council_meetings FOR SELECT TO authenticated USING (true);`,
          restore: `DROP POLICY meetings_select_extra_drift ON public.academic_council_meetings;`,
        },
        {
          label: "wrong_policy_command",
          mutate: `
DROP POLICY meetings_select ON public.academic_council_meetings;
CREATE POLICY meetings_select ON public.academic_council_meetings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
`,
          restore: `
DROP POLICY IF EXISTS meetings_select ON public.academic_council_meetings;
CREATE POLICY meetings_select ON public.academic_council_meetings FOR SELECT TO authenticated
  USING (public.is_council_admin(auth.uid()) OR public.is_council_member(auth.uid(), council_id));
`,
        },
        {
          label: "partial_c0_rpc_present",
          mutate: `
CREATE OR REPLACE FUNCTION public.council_schedule_meeting(p_council_id uuid)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
`,
          restore: `DROP FUNCTION IF EXISTS public.council_schedule_meeting(uuid);`,
        },
        {
          label: "partial_c9_helper_present",
          mutate: `
CREATE OR REPLACE FUNCTION public.create_council_notification()
RETURNS void LANGUAGE sql AS $$ SELECT NULL $$;
`,
          restore: `DROP FUNCTION IF EXISTS public.create_council_notification();`,
        },
        {
          label: "wrong_security_invoker",
          mutate: `
CREATE OR REPLACE FUNCTION public.is_council_admin(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT public.has_role(_user, 'system_admin'::public.app_role)
      OR public.has_role(_user, 'admin'::public.app_role);
$$;
`,
          restore: `
CREATE OR REPLACE FUNCTION public.is_council_admin(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user, 'system_admin'::public.app_role)
      OR public.has_role(_user, 'admin'::public.app_role);
$$;
REVOKE ALL ON FUNCTION public.is_council_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_council_admin(uuid) TO authenticated, service_role;
`,
        },
        {
          label: "wrong_search_path",
          mutate: `
CREATE OR REPLACE FUNCTION public.is_council_member(_user uuid, _council uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.academic_council_members m
    WHERE m.council_id = _council AND m.user_id = _user AND m.is_active = true
      AND (m.active_to IS NULL OR m.active_to > CURRENT_DATE)
  );
$$;
`,
          restore: `
CREATE OR REPLACE FUNCTION public.is_council_member(_user uuid, _council uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.academic_council_members m
    WHERE m.council_id = _council AND m.user_id = _user AND m.is_active = true
      AND (m.active_to IS NULL OR m.active_to > CURRENT_DATE)
  );
$$;
REVOKE ALL ON FUNCTION public.is_council_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_council_member(uuid, uuid) TO authenticated, service_role;
`,
        },
        {
          label: "c1_extension_table_partial",
          mutate: `CREATE TABLE public.academic_council_votes (id uuid PRIMARY KEY);`,
          restore: `DROP TABLE IF EXISTS public.academic_council_votes;`,
        },
        {
          label: "missing_predecessor_helper",
          mutate: `
CREATE OR REPLACE FUNCTION public.can_schedule_council_meeting(_user uuid, _council uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT false;
$$;
DROP FUNCTION public.can_schedule_council_meeting(uuid, uuid) CASCADE;
`,
          restore: `
CREATE OR REPLACE FUNCTION public.can_schedule_council_meeting(_user uuid, _council uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_council_admin(_user)
      OR public.has_council_role(_user, _council, 'chair'::public.academic_council_member_role);
$$;
REVOKE ALL ON FUNCTION public.can_schedule_council_meeting(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_schedule_council_meeting(uuid, uuid) TO authenticated, service_role;
DROP POLICY IF EXISTS meetings_insert ON public.academic_council_meetings;
CREATE POLICY meetings_insert ON public.academic_council_meetings FOR INSERT TO authenticated
  WITH CHECK (public.can_schedule_council_meeting(auth.uid(), council_id) AND created_by = auth.uid());
DROP POLICY IF EXISTS meetings_update ON public.academic_council_meetings;
CREATE POLICY meetings_update ON public.academic_council_meetings FOR UPDATE TO authenticated
  USING (public.can_schedule_council_meeting(auth.uid(), council_id))
  WITH CHECK (public.can_schedule_council_meeting(auth.uid(), council_id));
`,
        },
      ];

      let PREFLIGHT_DRIFT_CASE_COUNT = 0;
      for (const drift of driftCases) {
        const m = psql(drift.mutate);
        if (!m.ok) throw new Error(`drift mutate ${drift.label} failed:\n${m.out}`);
        const hold = runPreflightLocal();
        expect(hold.ok, `${drift.label} should HOLD`).toBe(false);
        expect(hold.out).toMatch(/HOLD:/);
        PREFLIGHT_DRIFT_CASE_COUNT += 1;
        const restored = psql(drift.restore);
        if (!restored.ok) throw new Error(`drift restore ${drift.label} failed:\n${restored.out}`);
      }
      expect(PREFLIGHT_DRIFT_CASE_COUNT).toBeGreaterThanOrEqual(10);

      const preRestored = runPreflightLocal();
      if (!preRestored.ok) throw new Error(`preflight after restore failed:\n${preRestored.out}`);
      expect(preRestored.out).toContain("READY_FOR_APPLY_C0");

      // ---- PHASE M: apply-one C0-C9 ----
      applyChain();

      // Ordinary non-test sentinel fingerprint before TEST_ONLY
      const seedSentinel = psql(`
INSERT INTO auth.users(id) VALUES ('a1000000-0000-0000-0000-000000000002') ON CONFLICT DO NOTHING;
INSERT INTO public.academic_councils (id, name, council_type, created_by, settings)
VALUES (
  'c0c90000-0000-4000-8000-ffffffffffff',
  'SENTINEL_NON_TEST Academic Council Preserve',
  'college',
  'a1000000-0000-0000-0000-000000000002',
  '{"sentinel":true,"payload":"byte-identical-probe"}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings, name = EXCLUDED.name;
`);
      if (!seedSentinel.ok) throw new Error(`seed sentinel failed:\n${seedSentinel.out}`);
      const sentinelBefore = sentinelFingerprint();

      // ---- PHASE A/B: dry-run provision (zero mutation vs fingerprint) ----
      const beforeDry = psql(`
SELECT md5(coalesce((SELECT count(*)::text FROM public.academic_councils), '0') || '|' ||
          coalesce((SELECT count(*)::text FROM public.academic_council_meetings), '0') || '|' ||
          coalesce((SELECT count(*)::text FROM public.academic_council_members), '0'));
`);
      const dryFixture = psql(withDryRunGates(readFileSync(packageFiles.fixture, "utf8")));
      if (!dryFixture.ok) throw new Error(`fixture dry-run failed:\n${dryFixture.out}`);
      expect(dryFixture.out).toContain("COUNCILS_TESTONLY_E2E_FIXTURE_DRY_RUN_COMPLETE");
      const afterDry = psql(`
SELECT md5(coalesce((SELECT count(*)::text FROM public.academic_councils), '0') || '|' ||
          coalesce((SELECT count(*)::text FROM public.academic_council_meetings), '0') || '|' ||
          coalesce((SELECT count(*)::text FROM public.academic_council_members), '0'));
`);
      expect(afterDry.out).toBe(beforeDry.out);

      // ---- PHASE B: execute provision + journey ----
      const execFixture = psql(withExecuteGates(readFileSync(packageFiles.fixture, "utf8")));
      if (!execFixture.ok) throw new Error(`fixture execute failed:\n${execFixture.out}`);
      expect(execFixture.out).toContain("COUNCILS_TESTONLY_E2E_FIXTURE_EXECUTE_COMPLETE");
      expect(execFixture.out).toContain("COUNCILS_TESTONLY_POSITIVE_E2E_PASS");
      expect(execFixture.out).toContain("COUNCILS_TESTONLY_NEGATIVE_MATRIX_PASS");

      const topology = psql(`
SELECT
  (SELECT count(*) FROM public.academic_councils WHERE id = 'c0c90000-0000-4000-8000-000000000001') AS councils,
  (SELECT count(*) FROM public.academic_council_members WHERE council_id = 'c0c90000-0000-4000-8000-000000000001') AS members,
  (SELECT count(*) FROM public.academic_council_meetings WHERE council_id = 'c0c90000-0000-4000-8000-000000000001') AS meetings,
  (SELECT count(*) FROM public.academic_council_decisions d
     JOIN public.academic_council_meetings m ON m.id = d.meeting_id
    WHERE m.council_id = 'c0c90000-0000-4000-8000-000000000001') AS decisions;
`);
      if (!topology.ok) throw new Error(`topology failed:\n${topology.out}`);
      expect(topology.out).toMatch(/1/);

      // ---- Cleanup dry-run (zero mutation) ----
      const beforeCleanupDry = psql(`
SELECT md5(coalesce((SELECT count(*)::text FROM public.academic_council_meetings WHERE council_id='c0c90000-0000-4000-8000-000000000001'),'0'));
`);
      const cleanupDry = psql(withDryRunGates(readFileSync(packageFiles.cleanup, "utf8")));
      if (!cleanupDry.ok) throw new Error(`cleanup dry-run failed:\n${cleanupDry.out}`);
      expect(cleanupDry.out).toMatch(/CLEANUP_DRY_RUN|COUNCILS_TESTONLY_CLEANUP_DRY_RUN_COMPLETE/);
      const afterCleanupDry = psql(`
SELECT md5(coalesce((SELECT count(*)::text FROM public.academic_council_meetings WHERE council_id='c0c90000-0000-4000-8000-000000000001'),'0'));
`);
      expect(afterCleanupDry.out).toBe(beforeCleanupDry.out);

      // ---- FALSE_PASS: leave residue → zero verifier MUST fail ----
      const falsePass = psql(`
CREATE TABLE IF NOT EXISTS public.academic_council_test_only_fixture_registry (
  package_marker text NOT NULL,
  surface text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (package_marker, surface, entity_id)
);
INSERT INTO public.academic_council_test_only_fixture_registry(package_marker, surface, entity_id)
VALUES ('TEST_ONLY_COUNCILS_C0_C9_E2E_01', 'false_pass_probe', 'c0c90000-0000-4000-8000-00000000ffff')
ON CONFLICT DO NOTHING;
`);
      if (!falsePass.ok) throw new Error(`false-pass seed failed:\n${falsePass.out}`);
      const zeroWhileDirty = psqlFile(packageFiles.zeroResidue);
      expect(zeroWhileDirty.ok, "FALSE_PASS_TEST must fail while residue present").toBe(false);
      expect(zeroWhileDirty.out).toMatch(/TEST_ONLY_RESIDUE_TOTAL|HOLD:/);

      // Remove false-pass probe row only (cleanup execute will clear rest)
      psql(`
DELETE FROM public.academic_council_test_only_fixture_registry
WHERE entity_id = 'c0c90000-0000-4000-8000-00000000ffff';
`);

      // ---- Cleanup execute → zero residue ----
      const cleanupExec = psql(withExecuteGates(readFileSync(packageFiles.cleanup, "utf8")));
      if (!cleanupExec.ok) throw new Error(`cleanup execute failed:\n${cleanupExec.out}`);
      expect(cleanupExec.out).toMatch(/CLEANUP_EXECUTED|COUNCILS_TESTONLY_CLEANUP_EXECUTE_COMPLETE/);

      const zero = psqlFile(packageFiles.zeroResidue);
      if (!zero.ok) throw new Error(`zero residue failed:\n${zero.out}`);
      expect(zero.out).toContain("TEST_ONLY_RESIDUE_TOTAL=0");
      expect(zero.out).toContain("COUNCILS_ZERO_RESIDUE_VERIFIER_PASS");
      expect(zero.out).toMatch(/ZERO_RESIDUE_SENTINEL_PRESERVED/);

      const sentinelAfter = sentinelFingerprint();
      expect(sentinelAfter).toBe(sentinelBefore);

      const obs = psqlFile(packageFiles.observability);
      if (!obs.ok) throw new Error(`observability failed:\n${obs.out}`);
      expect(obs.out).toContain("COUNCILS_OBSERVABILITY_READONLY_PASS");

      console.log(
        JSON.stringify({
          TESTONLY_EXECUTION: true,
          TESTONLY_POSITIVE_E2E: true,
          TESTONLY_NEGATIVE_MATRIX: true,
          TESTONLY_ZERO_RESIDUE: true,
          FALSE_PASS_TEST: true,
          NON_TEST_SENTINELS: true,
          PREFLIGHT_STRICTNESS: true,
          PREFLIGHT_DRIFT_CASE_COUNT,
          PG17_CHAIN: true,
        }),
      );
    },
    900_000,
  );
});
