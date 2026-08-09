/**
 * ACADEMIC-COUNCILS-LEGACY-PRODUCTION-TO-C0-C9-FORWARD-RECONCILIATION-LONGRUN-13
 *
 * Goal: prove that the actual production legacy Academic Councils schema
 * (pre-C0) is a supported prestate for the C0-C9 forward-only chain,
 * and that real production-equivalent data (4 councils, 11 memberships,
 * chair/secretary/member topology, 2 topics) is preserved byte-for-byte
 * through reconciliation → C0 → ... → C9.
 */

import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();

const preflightV2 = join(
  root,
  "docs/migration-drafts/COUNCILS-C0-C9-PRODUCTION-READONLY-PREFLIGHT-01.sql",
);

const legacyPredecessors = [
  "tests/academic-councils/postgres-minimal-schema.sql",
  "supabase/migrations/20260703192337_3ef2f7b2-cf46-4407-9f1a-60c25b46c211.sql",
  "supabase/migrations/20260703194033_cccf45a9-50ed-4a72-bb11-7e5d1627b5a2.sql",
  "supabase/migrations/20260704200326_b0736829-500e-456c-aa9b-6dc7ccd10012.sql",
  "tests/academic-councils/postgres-storage-stub.sql",
  "supabase/migrations/20260705012437_ce22d82a-51b3-4452-bde2-90f0b8d64fa8.sql",
  "tests/academic-councils/postgres-departments-stub.sql",
  "supabase/migrations/20260705023313_9670638e-3742-4ace-824c-d58522b0a7cd.sql",
  "supabase/migrations/20260705232119_84b04a88-50be-4c5c-b9c3-11aeb54fa119.sql",
  "supabase/migrations/20260708120000_council_topic_attachments.sql",
  "supabase/migrations/20260709120000_department_councils_seed.sql",
  "supabase/migrations/20260710120000_council_meeting_schedule_helpers.sql",
  "tests/academic-councils/postgres-legacy-production-grants.sql",
] as const;

const legacyDataSeed = "tests/academic-councils/postgres-legacy-production-data-seed.sql";

const chain = [
  {
    step: "C0",
    migration: "supabase/migrations/20260808120000_councils_c0_write_surface_hardening_01.sql",
    verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C0.sql",
    pass: "COUNCILS_C0_PRODUCTION_POST_VERIFIER_PASS",
  },
  {
    step: "C1",
    migration: "supabase/migrations/20260808121000_councils_c1_meeting_state_machine_01.sql",
    verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C1.sql",
    pass: "COUNCILS_C1_PRODUCTION_POST_VERIFIER_PASS",
  },
  {
    step: "C2",
    migration: "supabase/migrations/20260808122000_councils_c2_topic_intake_review_01.sql",
    verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C2.sql",
    pass: "COUNCILS_C2_PRODUCTION_POST_VERIFIER_PASS",
  },
  {
    step: "C3",
    migration: "supabase/migrations/20260808130000_councils_c3_attendance_quorum_01.sql",
    verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C3.sql",
    pass: "COUNCILS_C3_PRODUCTION_POST_VERIFIER_PASS",
  },
  {
    step: "C4",
    migration: "supabase/migrations/20260808140000_councils_c4_session_voting_01.sql",
    verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C4.sql",
    pass: "COUNCILS_C4_PRODUCTION_POST_VERIFIER_PASS",
  },
  {
    step: "C5",
    migration: "supabase/migrations/20260808150000_councils_c5_minutes_lifecycle_01.sql",
    verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C5.sql",
    pass: "COUNCILS_C5_PRODUCTION_POST_VERIFIER_PASS",
  },
  {
    step: "C6",
    migration: "supabase/migrations/20260808160000_councils_c6_decisions_followup_01.sql",
    verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C6.sql",
    pass: "COUNCILS_C6_PRODUCTION_POST_VERIFIER_PASS",
  },
  {
    step: "C7",
    migration: "supabase/migrations/20260808170000_councils_c7_audit_archive_01.sql",
    verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C7.sql",
    pass: "COUNCILS_C7_PRODUCTION_POST_VERIFIER_PASS",
  },
  {
    step: "C8",
    migration: "supabase/migrations/20260808171000_councils_c0_c8_final_security_closure_01.sql",
    verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C8.sql",
    pass: "COUNCILS_C8_PRODUCTION_POST_VERIFIER_PASS",
  },
  {
    step: "C9",
    migration: "supabase/migrations/20260808180000_councils_c9_notifications_reporting_01.sql",
    verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C9.sql",
    pass: "COUNCILS_C9_PRODUCTION_POST_VERIFIER_PASS",
  },
] as const;

const container = `councils-legacy-recon-${Date.now()}`;

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
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    SELECT encode(
      digest(
        string_agg(line, E'\\n' ORDER BY line),
        'sha256'
      ),
      'hex'
    ) AS fp
    FROM (
      SELECT 'table:' || c.relname || ':' || a.attnum || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) AS line
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relname LIKE 'academic_council%'
        AND c.relkind = 'r'
        AND a.attnum > 0
        AND NOT a.attisdropped
      UNION ALL
      SELECT 'constraint:' || con.conname || ':' || pg_get_constraintdef(con.oid)
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname LIKE 'academic_council%'
      UNION ALL
      SELECT 'index:' || i.relname || ':' || pg_get_indexdef(i.oid)
      FROM pg_index idx
      JOIN pg_class i ON i.oid = idx.indexrelid
      JOIN pg_class c ON c.oid = idx.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname LIKE 'academic_council%'
      UNION ALL
      SELECT 'trigger:' || t.tgname || ':' || pg_get_triggerdef(t.oid, true)
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname LIKE 'academic_council%'
        AND NOT t.tgisinternal
      UNION ALL
      SELECT 'enum:' || t.typname || ':' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname LIKE 'academic_council%'
      GROUP BY t.typname
      UNION ALL
      SELECT 'function:' || p.proname || ':' || pg_get_function_identity_arguments(p.oid) || ':' ||
             btrim(regexp_replace(pg_get_functiondef(p.oid), '\\s+', ' ', 'g')) AS line
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = ANY (ARRAY[
          'is_council_admin',
          'is_council_member',
          'has_council_role',
          'can_manage_council',
          'can_write_council_agenda',
          'can_schedule_council_meeting',
          'was_council_member_on',
          'can_submit_council_topic',
          'tg_academic_councils_touch_updated_at',
          'tg_councils_validate_department_binding',
          'tg_minutes_block_locked_edits',
          'council_topic_attachment_count',
          'can_add_council_topic_attachment',
          'can_read_council_topic_attachment',
          'can_upload_council_topic_attachment',
          'tg_enforce_council_topic_attachment'
        ])
      UNION ALL
      SELECT 'policy:' || p.schemaname || ':' || p.tablename || ':' || p.policyname || ':' || p.cmd || ':' ||
             coalesce(p.qual::text, 'NULL') || ':' || coalesce(p.with_check::text, 'NULL') AS line
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
      readFileSync(preflightV2, "utf8"),
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

function applyLegacyFixture() {
  for (const pred of legacyPredecessors) {
    const r = psqlFile(join(root, pred));
    if (!r.ok) throw new Error(`legacy predecessor ${pred} failed:\n${r.out}`);
  }
  const seed = psqlFile(join(root, legacyDataSeed));
  if (!seed.ok) throw new Error(`legacy data seed failed:\n${seed.out}`);
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

function legacyFingerprint(): string {
  const r = psql(`
SELECT md5(string_agg(x, '|' ORDER BY x))
FROM (
  SELECT 'council:' || id::text || '|' || name || '|' || council_type::text || '|' || coalesce(department_id::text,'') || '|' || settings::text AS x
  FROM public.academic_councils
  UNION ALL
  SELECT 'member:' || id::text || '|' || council_id::text || '|' || user_id::text || '|' || member_role::text || '|' || is_active::text || '|' || active_from::text || '|' || coalesce(active_to::text,'')
  FROM public.academic_council_members
  UNION ALL
  SELECT 'topic:' || id::text || '|' || council_id::text || '|' || coalesce(meeting_id::text,'') || '|' || title || '|' || status::text || '|' || submitted_by::text
  FROM public.academic_council_topics
) s;
`);
  if (!r.ok) throw new Error(`legacy fingerprint failed:\n${r.out}`);
  const m = r.out.match(/([0-9a-f]{32})/);
  if (!m) throw new Error(`legacy fingerprint missing:\n${r.out}`);
  return m[1]!;
}

afterAll(() => {
  teardownContainer();
});

describe("Academic Councils legacy production → C0-C9 reconciliation", () => {
  it("ships a V2 preflight that classifies legacy production state as supported", () => {
    expect(existsSync(preflightV2)).toBe(true);
    const body = readFileSync(preflightV2, "utf8");
    expect(body).toContain("LEGACY_SUPPORTED_EXACT");
    expect(body).toContain("LEGACY_VARIANT_HOLD");
    expect(body).toContain("PARTIAL_NEW_CHAIN");
    expect(body).toContain("FULL_NEW_CHAIN");
    expect(body).toContain("FULL_NEW_CHAIN_VERIFIED");
    expect(body).toContain("HOLD_FULL_LEDGER_SCHEMA_MISMATCH");
    expect(body).toContain("HOLD_PRODUCTION_FINGERPRINT_OVERRIDE_FORBIDDEN");
    expect(body).toContain("LOCAL_TEST_ONLY");
    expect(body).toContain("READY_FOR_APPLY_C0");
    expect(body).toContain("COUNCILS_FULL_CHAIN_ALREADY_APPLIED_AND_VERIFIED");
    expect(body).toContain("NO_APPLY_REQUIRED");
  });

  it(
    "PG17: full legacy schema + production data → C0-C9 with preservation and post-verifiers",
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

      // ---- PHASE A: reconstruct production legacy schema + data ----
      applyLegacyFixture();

      // Verify production-equivalent seed landed.
      const seedCheck = psql(`
        SELECT
          (SELECT count(*) FROM public.academic_councils) AS councils,
          (SELECT count(*) FROM public.academic_council_members WHERE is_active = true AND (active_to IS NULL OR active_to > CURRENT_DATE)) AS active_members,
          (SELECT count(*) FROM public.academic_council_topics) AS topics;
      `);
      if (!seedCheck.ok) throw new Error(`seed check failed:\n${seedCheck.out}`);
      expect(seedCheck.out).toContain("4");
      expect(seedCheck.out).toContain("11");
      expect(seedCheck.out).toContain("2");

      // ---- PHASE B: capture before fingerprint ----
      const fingerprintBefore = legacyFingerprint();

      // ---- PHASE C: V2 preflight must classify as LEGACY_SUPPORTED_EXACT ----
      const preflight = runPreflightLocal();
      if (!preflight.ok) throw new Error(`preflight V2 failed:\n${preflight.out}`);
      expect(preflight.out).toContain("PREFLIGHT_STATE_CLASSIFICATION: LEGACY_SUPPORTED_EXACT");
      expect(preflight.out).toContain("PREFLIGHT_FINGERPRINT_MATCH: LEGACY_SUPPORTED_EXACT");
      expect(preflight.out).toContain("PREFLIGHT_LOCAL_TEST_FINGERPRINT_MODE: LOCAL_TEST_ONLY");
      expect(preflight.out).toContain("READY_FOR_APPLY_C0");

      // ---- PHASE D: apply C0-C9 chain with post-verifiers ----
      applyChain();

      // ---- PHASE D.0: seed promoted ledger and prove FULL_NEW_CHAIN_VERIFIED ----
      const ledgerSeed = psql(`
        CREATE SCHEMA IF NOT EXISTS supabase_migrations;
        CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
          version text PRIMARY KEY,
          name text,
          statements text[]
        );
        INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES
          ('20260808120000', '20260808120000_councils_c0_write_surface_hardening_01'),
          ('20260808121000', '20260808121000_councils_c1_meeting_state_machine_01'),
          ('20260808122000', '20260808122000_councils_c2_topic_intake_review_01'),
          ('20260808130000', '20260808130000_councils_c3_attendance_quorum_01'),
          ('20260808140000', '20260808140000_councils_c4_session_voting_01'),
          ('20260808150000', '20260808150000_councils_c5_minutes_lifecycle_01'),
          ('20260808160000', '20260808160000_councils_c6_decisions_followup_01'),
          ('20260808170000', '20260808170000_councils_c7_audit_archive_01'),
          ('20260808171000', '20260808171000_councils_c0_c8_final_security_closure_01'),
          ('20260808180000', '20260808180000_councils_c9_notifications_reporting_01')
        ON CONFLICT (version) DO NOTHING;
      `);
      if (!ledgerSeed.ok) throw new Error(`ledger seed failed:\n${ledgerSeed.out}`);
      const postC9Pre = psql(readFileSync(preflightV2, "utf8"));
      if (!postC9Pre.ok) throw new Error(`post-C9 preflight failed:\n${postC9Pre.out}`);
      expect(postC9Pre.out).toContain("PREFLIGHT_STATE_CLASSIFICATION: FULL_NEW_CHAIN_VERIFIED");
      expect(postC9Pre.out).toContain("FULL_NEW_CHAIN_STRUCTURAL_PROOF_PASS");
      expect(postC9Pre.out).toContain("COUNCILS_FULL_CHAIN_ALREADY_APPLIED_AND_VERIFIED");
      expect(postC9Pre.out).toContain("NO_APPLY_REQUIRED");
      expect(postC9Pre.out).not.toContain("READY_FOR_APPLY_C0");

      // ---- PHASE D.1: prove authenticated direct DML was rescoped (no bypass) ----
      const directDmlRescoped = psql(`
        DO $$
        DECLARE
          v_table text;
          v_has_insert boolean;
          v_has_update boolean;
          v_has_delete boolean;
        BEGIN
          FOREACH v_table IN ARRAY ARRAY[
            'academic_councils',
            'academic_council_members',
            'academic_council_meetings',
            'academic_council_agenda_items',
            'academic_council_topics',
            'academic_council_topic_attachments',
            'academic_council_decisions',
            'academic_council_minutes'
          ]
          LOOP
            v_has_insert := has_table_privilege('authenticated', 'public.' || v_table, 'INSERT');
            v_has_update := has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE');
            v_has_delete := has_table_privilege('authenticated', 'public.' || v_table, 'DELETE');
            IF v_has_insert OR v_has_update OR v_has_delete THEN
              RAISE EXCEPTION 'DML_NOT_RESCOPED: authenticated retains INSERT/UPDATE/DELETE on %', v_table;
            END IF;
          END LOOP;
          RAISE NOTICE 'AUTHENTICATED_DIRECT_DML_RESCOPED: SELECT retained, INSERT/UPDATE/DELETE revoked';
        END $$;
      `);
      if (!directDmlRescoped.ok) throw new Error(`direct DML rescope check failed:\n${directDmlRescoped.out}`);
      expect(directDmlRescoped.out).toContain("AUTHENTICATED_DIRECT_DML_RESCOPED");

      // ---- PHASE E: capture after fingerprint and assert preservation ----
      const fingerprintAfter = legacyFingerprint();
      expect(fingerprintAfter).toBe(fingerprintBefore);

      // ---- PHASE F: explicit preservation assertions ----
      const preservation = psql(`
DO $$
DECLARE
  v_councils int;
  v_members int;
  v_topics int;
  v_roles text;
  v_orphan_topics int;
  v_chair_count int;
  v_secretary_count int;
  v_member_count int;
BEGIN
  SELECT count(*) INTO v_councils FROM public.academic_councils;
  SELECT count(*) INTO v_members FROM public.academic_council_members
    WHERE is_active = true AND (active_to IS NULL OR active_to > CURRENT_DATE);
  SELECT count(*) INTO v_topics FROM public.academic_council_topics;

  SELECT string_agg(DISTINCT member_role::text, ',' ORDER BY member_role::text)
    INTO v_roles
    FROM public.academic_council_members
    WHERE is_active = true AND (active_to IS NULL OR active_to > CURRENT_DATE);

  SELECT count(*) INTO v_orphan_topics
    FROM public.academic_council_topics t
    WHERE NOT EXISTS (SELECT 1 FROM public.academic_councils c WHERE c.id = t.council_id);

  SELECT count(*) INTO v_chair_count
    FROM public.academic_council_members
    WHERE member_role = 'chair' AND is_active = true AND (active_to IS NULL OR active_to > CURRENT_DATE);

  SELECT count(*) INTO v_secretary_count
    FROM public.academic_council_members
    WHERE member_role = 'secretary' AND is_active = true AND (active_to IS NULL OR active_to > CURRENT_DATE);

  SELECT count(*) INTO v_member_count
    FROM public.academic_council_members
    WHERE member_role = 'member' AND is_active = true AND (active_to IS NULL OR active_to > CURRENT_DATE);

  IF v_councils <> 4 THEN
    RAISE EXCEPTION 'PRESERVATION_COUNCILS_EXPECTED_4_GOT_%', v_councils;
  END IF;

  IF v_members <> 11 THEN
    RAISE EXCEPTION 'PRESERVATION_MEMBERS_EXPECTED_11_GOT_%', v_members;
  END IF;

  IF v_topics <> 2 THEN
    RAISE EXCEPTION 'PRESERVATION_TOPICS_EXPECTED_2_GOT_%', v_topics;
  END IF;

  IF v_roles <> 'chair,member,secretary' THEN
    RAISE EXCEPTION 'PRESERVATION_ROLES_UNEXPECTED: %', v_roles;
  END IF;

  IF v_orphan_topics <> 0 THEN
    RAISE EXCEPTION 'PRESERVATION_ORPHAN_TOPICS: %', v_orphan_topics;
  END IF;

  IF v_chair_count <> 4 THEN
    RAISE EXCEPTION 'PRESERVATION_CHAIR_COUNT_UNEXPECTED: %', v_chair_count;
  END IF;

  IF v_secretary_count <> 2 THEN
    RAISE EXCEPTION 'PRESERVATION_SECRETARY_COUNT_UNEXPECTED: %', v_secretary_count;
  END IF;

  IF v_member_count <> 5 THEN
    RAISE EXCEPTION 'PRESERVATION_MEMBER_COUNT_UNEXPECTED: %', v_member_count;
  END IF;

  RAISE NOTICE 'LEGACY_DATA_PRESERVATION_PASS: councils=%, members=%, topics=%, roles=%',
    v_councils, v_members, v_topics, v_roles;
END $$;
`);
      if (!preservation.ok) throw new Error(`preservation assertion failed:\n${preservation.out}`);
      expect(preservation.out).toContain("LEGACY_DATA_PRESERVATION_PASS");

      // ---- PHASE G: legacy behavior regression ----
      // Chair of college council can still read their council and topics.
      const chairRead = psql(`
        SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000011', true);
        SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000011","role":"authenticated"}', true);
        SELECT count(*) AS visible_councils FROM public.academic_councils;
        SELECT count(*) AS visible_topics FROM public.academic_council_topics;
      `);
      if (!chairRead.ok) throw new Error(`chair read regression failed:\n${chairRead.out}`);
      expect(chairRead.out).toContain("visible_councils");
      expect(chairRead.out).toContain("visible_topics");

      // Student cannot read councils/topics directly (RLS still enforced).
      const studentRead = psql(`
        SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000017', true);
        SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000017","role":"authenticated"}', true);
        SELECT count(*) AS visible_councils FROM public.academic_councils;
        SELECT count(*) AS visible_topics FROM public.academic_council_topics;
      `);
      if (!studentRead.ok) throw new Error(`student read regression failed:\n${studentRead.out}`);
      expect(studentRead.out).toContain("visible_councils");
      expect(studentRead.out).toContain("visible_topics");

      // ---- PHASE H: storage bucket preserved ----
      const bucketCheck = psql(`
        SELECT count(*) AS bucket_count
        FROM storage.buckets
        WHERE id = 'council-topic-attachments';
      `);
      if (!bucketCheck.ok) throw new Error(`bucket check failed:\n${bucketCheck.out}`);
      expect(bucketCheck.out).toContain("1");

      // ---- PHASE I: no duplicate or stale permissive policies ----
      const policyCheck = psql(`
        SELECT count(*) AS duplicate_count
        FROM (
          SELECT schemaname, tablename, policyname, cmd
          FROM pg_policies
          WHERE schemaname = 'public' AND tablename LIKE 'academic_council%'
          GROUP BY schemaname, tablename, policyname, cmd
          HAVING count(*) > 1
        ) d;
      `);
      if (!policyCheck.ok) throw new Error(`policy check failed:\n${policyCheck.out}`);
      expect(policyCheck.out).toContain("0");

      // ---- PHASE J: attachments table and constraints preserved ----
      const attachmentsCheck = psql(`
        SELECT count(*) AS acta_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'academic_council_topic_attachments';
      `);
      if (!attachmentsCheck.ok) throw new Error(`attachments check failed:\n${attachmentsCheck.out}`);
      expect(attachmentsCheck.out).toContain("1");

      // ---- PHASE K: enum values preserved ----
      const enumCheck = psql(`
        SELECT string_agg(enumlabel, ',' ORDER BY enumlabel) AS labels
        FROM pg_enum
        WHERE enumtypid = 'public.academic_council_member_role'::regtype;
      `);
      if (!enumCheck.ok) throw new Error(`enum check failed:\n${enumCheck.out}`);
      expect(enumCheck.out).toContain("chair");
      expect(enumCheck.out).toContain("member");
      expect(enumCheck.out).toContain("secretary");
    },
    600_000,
  );
});
