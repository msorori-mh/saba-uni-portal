/**
 * ACADEMIC-COUNCILS-PR311-FINAL-PREFLIGHT-ANTI-FALSE-PASS-AND-PRODUCTION-STATE-CLOSURE-LONGRUN-15
 *
 * Closes HIGH ledger-only FULL_NEW_CHAIN false-pass and production fingerprint override risk.
 */

import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();
const preflightPath = join(
  root,
  "docs/migration-drafts/COUNCILS-C0-C9-PRODUCTION-READONLY-PREFLIGHT-01.sql",
);
const fingerprintDoc = join(
  root,
  "docs/migration-drafts/COUNCILS-LEGACY-SCHEMA-FINGERPRINT-ALGORITHM-01.md",
);
const catalogAssertions = join(
  root,
  "docs/migration-drafts/councils-c0-c9-verifiers/FULL-CHAIN-CATALOG-ASSERTIONS-01.sql",
);

const promoted = [
  "20260808120000_councils_c0_write_surface_hardening_01",
  "20260808121000_councils_c1_meeting_state_machine_01",
  "20260808122000_councils_c2_topic_intake_review_01",
  "20260808130000_councils_c3_attendance_quorum_01",
  "20260808140000_councils_c4_session_voting_01",
  "20260808150000_councils_c5_minutes_lifecycle_01",
  "20260808160000_councils_c6_decisions_followup_01",
  "20260808170000_councils_c7_audit_archive_01",
  "20260808171000_councils_c0_c8_final_security_closure_01",
  "20260808180000_councils_c9_notifications_reporting_01",
] as const;

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

const chainMigrations = [
  "supabase/migrations/20260808120000_councils_c0_write_surface_hardening_01.sql",
  "supabase/migrations/20260808121000_councils_c1_meeting_state_machine_01.sql",
  "supabase/migrations/20260808122000_councils_c2_topic_intake_review_01.sql",
  "supabase/migrations/20260808130000_councils_c3_attendance_quorum_01.sql",
  "supabase/migrations/20260808140000_councils_c4_session_voting_01.sql",
  "supabase/migrations/20260808150000_councils_c5_minutes_lifecycle_01.sql",
  "supabase/migrations/20260808160000_councils_c6_decisions_followup_01.sql",
  "supabase/migrations/20260808170000_councils_c7_audit_archive_01.sql",
  "supabase/migrations/20260808171000_councils_c0_c8_final_security_closure_01.sql",
  "supabase/migrations/20260808180000_councils_c9_notifications_reporting_01.sql",
] as const;

const container = `councils-anti-false-pass-${Date.now()}`;
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

function psqlFile(path: string): { ok: boolean; out: string } {
  return psql(readFileSync(join(root, path), "utf8"));
}

function runPreflight(extraPrefix = ""): { ok: boolean; out: string } {
  return psql(extraPrefix + readFileSync(preflightPath, "utf8"));
}

function discoverSchemaFingerprint(): string {
  const r = psql(`
    CREATE SCHEMA IF NOT EXISTS extensions;
    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
    SELECT encode(
      extensions.digest(string_agg(line, E'\\n' ORDER BY line), 'sha256'),
      'hex'
    ) AS fp
    FROM (
      SELECT 'table:' || c.relname || ':' || a.attnum || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) AS line
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public' AND c.relname LIKE 'academic_council%' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped
      UNION ALL
      SELECT 'constraint:' || con.conname || ':' || pg_get_constraintdef(con.oid)
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname LIKE 'academic_council%'
      UNION ALL
      SELECT 'index:' || i.relname || ':' || pg_get_indexdef(i.oid)
      FROM pg_index idx
      JOIN pg_class i ON i.oid = idx.indexrelid
      JOIN pg_class c ON c.oid = idx.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname LIKE 'academic_council%'
      UNION ALL
      SELECT 'trigger:' || t.tgname || ':' || pg_get_triggerdef(t.oid, true)
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname LIKE 'academic_council%' AND NOT t.tgisinternal
      UNION ALL
      SELECT 'enum:' || t.typname || ':' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname LIKE 'academic_council%'
      GROUP BY t.typname
      UNION ALL
      SELECT 'function:' || p.proname || ':' || pg_get_function_identity_arguments(p.oid) || ':' ||
             btrim(regexp_replace(pg_get_functiondef(p.oid), '\\s+', ' ', 'g'))
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
        'is_council_admin', 'is_council_member', 'has_council_role', 'can_manage_council',
        'can_write_council_agenda', 'can_schedule_council_meeting', 'was_council_member_on',
        'can_submit_council_topic', 'tg_academic_councils_touch_updated_at',
        'tg_councils_validate_department_binding', 'tg_minutes_block_locked_edits',
        'council_topic_attachment_count', 'can_add_council_topic_attachment',
        'can_read_council_topic_attachment', 'can_upload_council_topic_attachment',
        'tg_enforce_council_topic_attachment'
      ])
      UNION ALL
      SELECT 'policy:' || p.schemaname || ':' || p.tablename || ':' || p.policyname || ':' || p.cmd || ':' ||
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

function runPreflightLocal(expected = discoverSchemaFingerprint()): { ok: boolean; out: string } {
  return runPreflight(
    `SET councils.local_test_fingerprint_mode = 'LOCAL_TEST_ONLY';\n` +
      `SET councils.local_test_fingerprint_expected = '${expected}';\n`,
  );
}

function ensureLedgerTable() {
  const r = psql(`
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      name text,
      statements text[]
    );
    TRUNCATE supabase_migrations.schema_migrations;
  `);
  if (!r.ok) throw new Error(`ledger table failed:\n${r.out}`);
}

function seedLedger(names: readonly string[]) {
  ensureLedgerTable();
  if (names.length === 0) return;
  const values = names
    .map((n, i) => `('${n.slice(0, 14)}_${i}', '${n}')`)
    .join(",\n");
  const r = psql(
    `INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES\n${values};`,
  );
  if (!r.ok) throw new Error(`seedLedger failed:\n${r.out}`);
}

function applyLegacy() {
  for (const pred of legacyPredecessors) {
    const r = psqlFile(pred);
    if (!r.ok) throw new Error(`legacy ${pred} failed:\n${r.out}`);
  }
}

let appliedThrough = -1;

function applyThrough(indexInclusive: number) {
  for (let i = appliedThrough + 1; i <= indexInclusive; i++) {
    const r = psqlFile(chainMigrations[i]!);
    if (!r.ok) throw new Error(`apply ${chainMigrations[i]} failed:\n${r.out}`);
  }
  appliedThrough = indexInclusive;
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

async function resetDb() {
  teardownContainer();
  appliedThrough = -1;
  execSync(`docker run -d --name ${container} -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17`, {
    stdio: "ignore",
  });
  expect(await waitReady()).toBe(true);
  await Bun.sleep(800);
  expect(await waitReady()).toBe(true);
}

afterAll(() => {
  teardownContainer();
});

describe("PR311 preflight anti-false-pass classifier", () => {
  it("ships correlated classifier, fingerprint algorithm doc, and catalog assertions", () => {
    const body = readFileSync(preflightPath, "utf8");
    expect(body).toContain("PREFLIGHT_LEDGER_STATE");
    expect(body).toContain("PREFLIGHT_SCHEMA_STATE");
    expect(body).toContain("FULL_NEW_CHAIN_VERIFIED");
    expect(body).toContain("HOLD_FULL_LEDGER_SCHEMA_MISMATCH");
    expect(body).toContain("HOLD_FULL_SCHEMA_INCOMPLETE_LEDGER");
    expect(body).toContain("HOLD_NONCONTIGUOUS_LEDGER");
    expect(body).toContain("PARTIAL_NEW_CHAIN_EXACT_PREFIX");
    expect(body).toContain("COUNCILS_FULL_CHAIN_ALREADY_APPLIED_AND_VERIFIED");
    expect(body).toContain("NO_APPLY_REQUIRED");
    expect(body).toContain("HOLD_PRODUCTION_FINGERPRINT_OVERRIDE_FORBIDDEN");
    expect(body).toContain("LOCAL_TEST_ONLY");
    expect(body).toContain("3985ae87d59f5bb50b8088c8a620846fcb2203e9238d59d98db18e18210d44a9");
    // Must not early-return READY_FOR_APPLY_C0 from ledger-only FULL classification.
    expect(body).not.toMatch(
      /FULL_NEW_CHAIN[\s\S]{0,120}READY_FOR_APPLY_C0 \(FULL_NEW_CHAIN: nothing to do\)/,
    );
    expect(existsSync(fingerprintDoc)).toBe(true);
    const algo = readFileSync(fingerprintDoc, "utf8");
    expect(algo).toContain("string_agg(line, E'\\n' ORDER BY line)");
    expect(algo).toContain("16 allowlisted");
    expect(algo).toContain("23 public");
    expect(algo).toContain("LOCAL_TEST_ONLY");
    expect(existsSync(catalogAssertions)).toBe(true);
    expect(readFileSync(catalogAssertions, "utf8")).toContain("POST-VERIFIER-C9.sql");
  });

  it(
    "PG17 classifier matrix + HIGH ledger-only false-pass + fingerprint authority",
    async () => {
      if (!dockerReady) throw new Error("docker is required");

      // ------------------------------------------------------------------
      // 4 / HIGH: full ledger + empty schema => HOLD
      // ------------------------------------------------------------------
      await resetDb();
      seedLedger(promoted);
      const councilCount = psql(`
        SELECT count(*)::int AS c
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'academic_council%';
      `);
      expect(councilCount.out).toMatch(/\b0\b/);
      const high = runPreflight();
      expect(high.ok).toBe(false);
      expect(high.out).toContain("HOLD_FULL_LEDGER_SCHEMA_MISMATCH");
      expect(high.out).toContain("PREFLIGHT_LEDGER_STATE: LEDGER_FULL");
      expect(high.out).toContain("PREFLIGHT_SCHEMA_STATE: SCHEMA_NONE");
      expect(high.out).not.toContain("COUNCILS_FULL_CHAIN_ALREADY_APPLIED_AND_VERIFIED");
      expect(high.out).not.toContain("READY_FOR_APPLY_C0");

      // 5: partial ledger + no schema => HOLD
      seedLedger(promoted.slice(0, 4));
      const partialLedgerEmpty = runPreflight();
      expect(partialLedgerEmpty.ok).toBe(false);
      expect(partialLedgerEmpty.out).toMatch(/HOLD_/);

      // 3: no schema, no ledger => UNKNOWN
      await resetDb();
      const noSchema = runPreflight();
      expect(noSchema.ok).toBe(false);
      expect(noSchema.out).toMatch(/UNKNOWN_UNSAFE|HOLD:/);

      // ------------------------------------------------------------------
      // 1: exact legacy PASS
      // ------------------------------------------------------------------
      await resetDb();
      applyLegacy();
      const legacyPass = runPreflightLocal();
      if (!legacyPass.ok) throw new Error(`legacy PASS failed:\n${legacyPass.out}`);
      expect(legacyPass.out).toContain("PREFLIGHT_LEDGER_STATE: LEDGER_NONE");
      expect(legacyPass.out).toContain("PREFLIGHT_SCHEMA_STATE: SCHEMA_LEGACY_EXACT");
      expect(legacyPass.out).toContain("PREFLIGHT_STATE_CLASSIFICATION: LEGACY_SUPPORTED_EXACT");
      expect(legacyPass.out).toContain("READY_FOR_APPLY_C0");
      const goodLegacyFingerprint = discoverSchemaFingerprint();

      // 18 / L: production override rejected even when equal to actual
      ensureLedgerTable(); // production ledger context, no promoted rows
      const override = runPreflight(
        `SET councils.fingerprint_expected = '3985ae87d59f5bb50b8088c8a620846fcb2203e9238d59d98db18e18210d44a9';\n`,
      );
      expect(override.ok).toBe(false);
      expect(override.out).toContain("HOLD_PRODUCTION_FINGERPRINT_OVERRIDE_FORBIDDEN");

      // local test mode forbidden in production ledger context
      const localForbidden = runPreflight(
        `SET councils.local_test_fingerprint_mode = 'LOCAL_TEST_ONLY';\n`,
      );
      expect(localForbidden.ok).toBe(false);
      expect(localForbidden.out).toContain("HOLD_PRODUCTION_LOCAL_TEST_FINGERPRINT_MODE_FORBIDDEN");

      // 2: legacy variant (column change) => HOLD, cannot self-match mutated
      const dropLedger = psql(`DROP SCHEMA supabase_migrations CASCADE;`);
      if (!dropLedger.ok) throw new Error(dropLedger.out);
      const mutateCol = psql(
        `ALTER TABLE public.academic_councils ADD COLUMN anti_false_pass_drift text;`,
      );
      if (!mutateCol.ok) throw new Error(mutateCol.out);
      const variant = runPreflightLocal(goodLegacyFingerprint);
      expect(variant.ok).toBe(false);
      expect(variant.out).toMatch(/HOLD:/);
      // restore for further cases
      const restoreCol = psql(
        `ALTER TABLE public.academic_councils DROP COLUMN anti_false_pass_drift;`,
      );
      if (!restoreCol.ok) throw new Error(restoreCol.out);

      // Fingerprint false-pass matrix mutations
      const falsePassMutations: { label: string; mutate: string; restore: string }[] = [
        {
          label: "one_table_changed",
          mutate: `CREATE TABLE public.academic_council_false_pass_extra(id uuid primary key);`,
          restore: `DROP TABLE public.academic_council_false_pass_extra;`,
        },
        {
          label: "one_column_changed",
          mutate: `ALTER TABLE public.academic_council_members ADD COLUMN fp_drift int;`,
          restore: `ALTER TABLE public.academic_council_members DROP COLUMN fp_drift;`,
        },
        {
          label: "one_constraint_changed",
          mutate: `ALTER TABLE public.academic_councils ADD CONSTRAINT academic_councils_fp_drift_chk CHECK (char_length(name) > 0);`,
          restore: `ALTER TABLE public.academic_councils DROP CONSTRAINT academic_councils_fp_drift_chk;`,
        },
        {
          label: "one_enum_label_changed",
          mutate: `ALTER TYPE public.academic_council_member_role ADD VALUE IF NOT EXISTS 'fp_drift_role';`,
          restore: `-- enum label cannot be dropped cheaply; recreate DB after this case`,
        },
        {
          label: "one_function_body_changed",
          mutate: `
            CREATE OR REPLACE FUNCTION public.is_council_admin(_user uuid)
            RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
              SELECT false;
            $$;`,
          restore: `-- restored by DB reset after enum case; placeholder`,
        },
        {
          label: "one_policy_changed",
          mutate: `DROP POLICY councils_select ON public.academic_councils; CREATE POLICY councils_select ON public.academic_councils FOR SELECT TO authenticated USING (true);`,
          restore: `-- reset`,
        },
        {
          label: "one_storage_policy_changed",
          mutate: `DROP POLICY IF EXISTS acta_storage_select ON storage.objects;`,
          restore: `-- reset`,
        },
      ];

      for (const fp of falsePassMutations) {
        if (fp.label === "one_enum_label_changed") {
          await resetDb();
          applyLegacy();
        }
        const preMutationFingerprint = discoverSchemaFingerprint();
        const m = psql(fp.mutate);
        if (!m.ok) throw new Error(`${fp.label} mutate failed:\n${m.out}`);
        const hold = runPreflightLocal(preMutationFingerprint);
        expect(hold.ok, `${fp.label} must HOLD`).toBe(false);
        expect(hold.out, fp.label).toMatch(/HOLD:/);
        if (fp.label === "one_enum_label_changed" || fp.label === "one_function_body_changed" || fp.label === "one_policy_changed" || fp.label === "one_storage_policy_changed") {
          await resetDb();
          applyLegacy();
        } else if (fp.restore.startsWith("ALTER") || fp.restore.startsWith("DROP") || fp.restore.startsWith("CREATE")) {
          const r = psql(fp.restore);
          if (!r.ok) throw new Error(`${fp.label} restore failed:\n${r.out}`);
        }
      }

      // ------------------------------------------------------------------
      // 11: noncontiguous ledger
      // ------------------------------------------------------------------
      seedLedger([promoted[0]!, promoted[2]!]);
      const noncontig = runPreflight();
      expect(noncontig.ok).toBe(false);
      expect(noncontig.out).toContain("HOLD_NONCONTIGUOUS_LEDGER");

      // ------------------------------------------------------------------
      // 7/8/9: contiguous partial prefixes
      // ------------------------------------------------------------------
      await resetDb();
      applyLegacy();
      applyThrough(0); // C0
      seedLedger(promoted.slice(0, 1));
      const c0 = runPreflight();
      if (!c0.ok) throw new Error(`C0 partial failed:\n${c0.out}`);
      expect(c0.out).toContain("PARTIAL_NEW_CHAIN_EXACT_PREFIX");
      expect(c0.out).toContain(`PARTIAL_LAST_APPLIED: ${promoted[0]}`);
      expect(c0.out).toContain(`PARTIAL_NEXT_EXPECTED: ${promoted[1]}`);
      expect(c0.out).not.toContain("READY_FOR_APPLY_C0");

      applyThrough(3); // through C3 (indices 1..3)
      seedLedger(promoted.slice(0, 4));
      const c0c3 = runPreflight();
      if (!c0c3.ok) throw new Error(`C0-C3 partial failed:\n${c0c3.out}`);
      expect(c0c3.out).toContain("PARTIAL_NEW_CHAIN_EXACT_PREFIX");
      expect(c0c3.out).toContain(`PARTIAL_LAST_APPLIED: ${promoted[3]}`);
      expect(c0c3.out).toContain(`PARTIAL_NEXT_EXPECTED: ${promoted[4]}`);

      applyThrough(8); // through C8
      seedLedger(promoted.slice(0, 9));
      const c0c8 = runPreflight();
      if (!c0c8.ok) throw new Error(`C0-C8 partial failed:\n${c0c8.out}`);
      expect(c0c8.out).toContain("PARTIAL_NEW_CHAIN_EXACT_PREFIX");
      expect(c0c8.out).toContain(`PARTIAL_LAST_APPLIED: ${promoted[8]}`);
      expect(c0c8.out).toContain(`PARTIAL_NEXT_EXPECTED: ${promoted[9]}`);

      // 12: ledger/schema prefix mismatch (full ledger, C0-C8 schema)
      seedLedger(promoted);
      const mismatch = runPreflight();
      expect(mismatch.ok).toBe(false);
      expect(mismatch.out).toContain("HOLD_FULL_LEDGER_SCHEMA_MISMATCH");

      // 6: full schema, incomplete ledger
      applyThrough(9); // C9
      seedLedger(promoted.slice(0, 6));
      const incompleteLedger = runPreflight();
      expect(incompleteLedger.ok).toBe(false);
      expect(incompleteLedger.out).toContain("HOLD_FULL_SCHEMA_INCOMPLETE_LEDGER");

      const noLedger = psql(`DROP SCHEMA supabase_migrations CASCADE;`);
      if (!noLedger.ok) throw new Error(noLedger.out);
      const fullSchemaNoLedger = runPreflight();
      expect(fullSchemaNoLedger.ok).toBe(false);
      expect(fullSchemaNoLedger.out).toContain("HOLD_FULL_SCHEMA_INCOMPLETE_LEDGER");

      // 10: full C0-C9 exact verified
      seedLedger(promoted);
      const full = runPreflight();
      if (!full.ok) throw new Error(`FULL_NEW_CHAIN_VERIFIED failed:\n${full.out}`);
      expect(full.out).toContain("PREFLIGHT_LEDGER_STATE: LEDGER_FULL");
      expect(full.out).toContain("PREFLIGHT_SCHEMA_STATE: SCHEMA_FULL_EXACT");
      expect(full.out).toContain("PREFLIGHT_STATE_CLASSIFICATION: FULL_NEW_CHAIN_VERIFIED");
      expect(full.out).toContain("FULL_NEW_CHAIN_STRUCTURAL_PROOF_PASS");
      expect(full.out).toContain("COUNCILS_FULL_CHAIN_ALREADY_APPLIED_AND_VERIFIED");
      expect(full.out).toContain("NO_APPLY_REQUIRED");
      expect(full.out).not.toContain("READY_FOR_APPLY_C0");

      // E: ledger full + partial/security drifts => HOLD
      const securityDrifts: { label: string; mutate: string; restore: string; needle: RegExp }[] = [
        {
          label: "c9_objects_missing",
          mutate: `DROP TABLE public.academic_council_notifications CASCADE;`,
          restore: `-- requires rebuild`,
          needle: /HOLD_FULL_LEDGER_SCHEMA_MISMATCH|HOLD:/,
        },
        {
          label: "one_final_function_missing",
          mutate: `DROP FUNCTION public.get_council_chair_dashboard(uuid);`,
          restore: `-- rebuild`,
          needle: /HOLD:/,
        },
        {
          label: "one_policy_missing",
          mutate: `DROP POLICY ac_notifications_select_own ON public.academic_council_notifications;`,
          restore: `-- rebuild`,
          needle: /HOLD:/,
        },
        {
          label: "wrong_acl",
          mutate: `GRANT EXECUTE ON FUNCTION public.create_council_notification(uuid,text,uuid,uuid,text,uuid,text,text,jsonb) TO authenticated;`,
          restore: `REVOKE EXECUTE ON FUNCTION public.create_council_notification(uuid,text,uuid,uuid,text,uuid,text,text,jsonb) FROM authenticated;`,
          needle: /HOLD:/,
        },
        {
          label: "rls_disabled",
          mutate: `ALTER TABLE public.academic_council_notifications DISABLE ROW LEVEL SECURITY;`,
          restore: `ALTER TABLE public.academic_council_notifications ENABLE ROW LEVEL SECURITY;`,
          needle: /HOLD:/,
        },
        {
          label: "c9_internal_exposed",
          mutate: `GRANT EXECUTE ON FUNCTION public.get_council_notification_recipients(uuid,text,jsonb) TO authenticated;`,
          restore: `REVOKE EXECUTE ON FUNCTION public.get_council_notification_recipients(uuid,text,jsonb) FROM authenticated;`,
          needle: /HOLD:/,
        },
      ];

      for (const drift of securityDrifts) {
        await resetDb();
        applyLegacy();
        applyThrough(9);
        seedLedger(promoted);
        const m = psql(drift.mutate);
        if (!m.ok) throw new Error(`${drift.label} mutate failed:\n${m.out}`);
        const hold = runPreflight();
        expect(hold.ok, drift.label).toBe(false);
        expect(hold.out, drift.label).toMatch(drift.needle);
      }
    },
    900_000,
  );

  it(
    "PG17 production guard regressions: forbidden settings hold before any successful terminal",
    async () => {
      if (!dockerReady) throw new Error("docker is required");

      const results = {
        FULL_CHAIN_OVERRIDE_REJECTION: "FAIL",
        FULL_CHAIN_LOCAL_TEST_MODE_REJECTION: "FAIL",
        LEGACY_OVERRIDE_REJECTION: "FAIL",
        LEGACY_LOCAL_TEST_MODE_REJECTION: "FAIL",
        FULL_NEW_CHAIN_VERIFIED_NORMAL_PATH: "FAIL",
        LEGACY_SUPPORTED_EXACT_NORMAL_PATH: "FAIL",
        LOCAL_TEST_ONLY_DISPOSABLE_PATH: "FAIL",
        LEDGER_ONLY_FALSE_PASS: "FAIL",
      } as const;

      // 8: ledger-only + empty schema => HOLD_FULL_LEDGER_SCHEMA_MISMATCH
      await resetDb();
      seedLedger(promoted);
      const ledgerOnly = runPreflight();
      expect(ledgerOnly.ok).toBe(false);
      expect(ledgerOnly.out).toContain("HOLD_FULL_LEDGER_SCHEMA_MISMATCH");
      results.LEDGER_ONLY_FALSE_PASS = "HOLD";

      // 1: full C0-C9 + fingerprint_expected override => HOLD
      await resetDb();
      applyLegacy();
      applyThrough(9);
      seedLedger(promoted);
      const fullOverride = runPreflight(
        `SET councils.fingerprint_expected = '3985ae87d59f5bb50b8088c8a620846fcb2203e9238d59d98db18e18210d44a9';\n`,
      );
      expect(fullOverride.ok).toBe(false);
      expect(fullOverride.out).toContain("HOLD_PRODUCTION_FINGERPRINT_OVERRIDE_FORBIDDEN");
      results.FULL_CHAIN_OVERRIDE_REJECTION = "PASS";

      // 2: full C0-C9 + LOCAL_TEST_ONLY => HOLD
      await resetDb();
      applyLegacy();
      applyThrough(9);
      seedLedger(promoted);
      const fullLocalForbidden = runPreflight(
        `SET councils.local_test_fingerprint_mode = 'LOCAL_TEST_ONLY';\n`,
      );
      expect(fullLocalForbidden.ok).toBe(false);
      expect(fullLocalForbidden.out).toContain("HOLD_PRODUCTION_LOCAL_TEST_FINGERPRINT_MODE_FORBIDDEN");
      results.FULL_CHAIN_LOCAL_TEST_MODE_REJECTION = "PASS";

      // 5: full C0-C9 with no forbidden settings => FULL_NEW_CHAIN_VERIFIED
      await resetDb();
      applyLegacy();
      applyThrough(9);
      seedLedger(promoted);
      const fullNormal = runPreflight();
      if (!fullNormal.ok) throw new Error(`full normal path failed:\n${fullNormal.out}`);
      expect(fullNormal.out).toContain("PREFLIGHT_STATE_CLASSIFICATION: FULL_NEW_CHAIN_VERIFIED");
      expect(fullNormal.out).toContain("NO_APPLY_REQUIRED");
      results.FULL_NEW_CHAIN_VERIFIED_NORMAL_PATH = "PASS";

      // 3: legacy exact + override => HOLD
      await resetDb();
      applyLegacy();
      ensureLedgerTable();
      const legacyOverride = runPreflight(
        `SET councils.fingerprint_expected = '3985ae87d59f5bb50b8088c8a620846fcb2203e9238d59d98db18e18210d44a9';\n`,
      );
      expect(legacyOverride.ok).toBe(false);
      expect(legacyOverride.out).toContain("HOLD_PRODUCTION_FINGERPRINT_OVERRIDE_FORBIDDEN");
      results.LEGACY_OVERRIDE_REJECTION = "PASS";

      // 4: legacy exact + LOCAL_TEST_ONLY => HOLD
      await resetDb();
      applyLegacy();
      ensureLedgerTable();
      const legacyLocalForbidden = runPreflight(
        `SET councils.local_test_fingerprint_mode = 'LOCAL_TEST_ONLY';\n`,
      );
      expect(legacyLocalForbidden.ok).toBe(false);
      expect(legacyLocalForbidden.out).toContain("HOLD_PRODUCTION_LOCAL_TEST_FINGERPRINT_MODE_FORBIDDEN");
      results.LEGACY_LOCAL_TEST_MODE_REJECTION = "PASS";

      // 6: exact legacy with no forbidden settings => READY_FOR_APPLY_C0
      await resetDb();
      applyLegacy();
      const legacyNormal = runPreflightLocal();
      if (!legacyNormal.ok) throw new Error(`legacy normal path failed:\n${legacyNormal.out}`);
      expect(legacyNormal.out).toContain("PREFLIGHT_STATE_CLASSIFICATION: LEGACY_SUPPORTED_EXACT");
      expect(legacyNormal.out).toContain("READY_FOR_APPLY_C0");
      results.LEGACY_SUPPORTED_EXACT_NORMAL_PATH = "PASS";

      // 7: local disposable LOCAL_TEST_ONLY expected-digest path => valid
      await resetDb();
      applyLegacy();
      const expected = discoverSchemaFingerprint();
      const localTest = runPreflight(
        `SET councils.local_test_fingerprint_mode = 'LOCAL_TEST_ONLY';\n` +
          `SET councils.local_test_fingerprint_expected = '${expected}';\n`,
      );
      if (!localTest.ok) throw new Error(`LOCAL_TEST_ONLY disposable path failed:\n${localTest.out}`);
      expect(localTest.out).toContain("PREFLIGHT_LOCAL_TEST_FINGERPRINT_MODE: LOCAL_TEST_ONLY");
      expect(localTest.out).toContain("READY_FOR_APPLY_C0");
      results.LOCAL_TEST_ONLY_DISPOSABLE_PATH = "PASS";

      console.log(JSON.stringify({ PRODUCTION_GUARD_REGRESSIONS: results }));
    },
    600_000,
  );
});
