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

const promotedVersions = promoted.map((n) => n.slice(0, 14));
const promotedShortNames = promoted.map((n) => n.slice(15));

const c1SplitA = {
  version: "20260810003111",
  shortName: "01d86704-d31c-42e9-9efa-aa5fe4d6a8c9",
} as const;
const c1SplitB = {
  version: "20260810003305",
  shortName: "c75271d6-2ef1-407a-96f5-66aaf2386afe",
} as const;
const c2LovableAlias = {
  version: "20260810010400",
  shortName: "4e2c4b05-5ff0-4b23-9084-18d8b1b29c86",
} as const;
const c3LovableAlias = {
  version: "20260810011456",
  shortName: "430aac8f-1f38-4e9d-99aa-022ea2680fc4",
} as const;

type LedgerEntry = { version: string; name: string };

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
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    SELECT encode(
      digest(string_agg(line, E'\\n' ORDER BY line), 'sha256'),
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

function seedLedgerEntries(entries: readonly LedgerEntry[]) {
  ensureLedgerTable();
  if (entries.length === 0) return;
  const values = entries.map((e) => `('${e.version}', '${e.name}')`).join(",\n");
  const r = psql(
    `INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES\n${values};`,
  );
  if (!r.ok) throw new Error(`seedLedgerEntries failed:\n${r.out}`);
}

/** Full composite name format (historical fixture). */
function seedLedger(names: readonly string[]) {
  seedLedgerEntries(names.map((n) => ({ version: n.slice(0, 14), name: n })));
}

/** Production-like short name format (version + short name). */
function seedLedgerShort(names: readonly string[]) {
  seedLedgerEntries(
    names.map((n) => ({ version: n.slice(0, 14), name: n.slice(15) })),
  );
}

function seedLogicalPrefixOriginal(throughInclusive: number, format: "full" | "short") {
  const slice = promoted.slice(0, throughInclusive + 1);
  if (format === "full") seedLedger(slice);
  else seedLedgerShort(slice);
}

function seedC0PlusC1Split(format: "full" | "short" = "short") {
  const c0Name =
    format === "full" ? promoted[0]! : promotedShortNames[0]!;
  seedLedgerEntries([
    { version: promotedVersions[0]!, name: c0Name },
    {
      version: c1SplitA.version,
      name: format === "full" ? `${c1SplitA.version}_${c1SplitA.shortName}` : c1SplitA.shortName,
    },
    {
      version: c1SplitB.version,
      name: format === "full" ? `${c1SplitB.version}_${c1SplitB.shortName}` : c1SplitB.shortName,
    },
  ]);
}

function seedC0C1SplitPlusC2C3Aliases() {
  seedLedgerEntries([
    { version: promotedVersions[0]!, name: promotedShortNames[0]! },
    { version: c1SplitA.version, name: c1SplitA.shortName },
    { version: c1SplitB.version, name: c1SplitB.shortName },
    { version: c2LovableAlias.version, name: c2LovableAlias.shortName },
    { version: c3LovableAlias.version, name: c3LovableAlias.shortName },
  ]);
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
    expect(body).toContain("PREFLIGHT_LEDGER_STORAGE_FORMAT");
    expect(body).toContain("PREFLIGHT_C0_LEDGER_IDENTITY");
    expect(body).toContain("PREFLIGHT_C1_LINEAGE");
    expect(body).toContain("PREFLIGHT_C1_SPLIT_PART_A");
    expect(body).toContain("PREFLIGHT_C1_SPLIT_PART_B");
    expect(body).toContain("PREFLIGHT_C2_LINEAGE");
    expect(body).toContain("PREFLIGHT_C2_LEDGER_IDENTITY");
    expect(body).toContain("PREFLIGHT_C3_LINEAGE");
    expect(body).toContain("PREFLIGHT_C3_LEDGER_IDENTITY");
    expect(body).toContain("PREFLIGHT_LOGICAL_LEDGER_PREFIX");
    expect(body).toContain("PREFLIGHT_SCHEMA_PREFIX");
    expect(body).toContain("PREFLIGHT_LAST_APPLIED_LOGICAL");
    expect(body).toContain("PREFLIGHT_NEXT_EXPECTED_LOGICAL");
    expect(body).toContain("HOLD_C1_SPLIT_INCOMPLETE");
    expect(body).toContain("HOLD_C1_LINEAGE_AMBIGUOUS");
    expect(body).toContain("HOLD_LOGICAL_STEP_DUPLICATE_LINEAGE");
    expect(body).toContain("HOLD_LEDGER_IDENTITY_MISMATCH");
    expect(body).toContain("LOVABLE_MANAGED_ALIAS");
    expect(body).toContain("20260810003111");
    expect(body).toContain("20260810003305");
    expect(body).toContain("01d86704-d31c-42e9-9efa-aa5fe4d6a8c9");
    expect(body).toContain("c75271d6-2ef1-407a-96f5-66aaf2386afe");
    expect(body).toContain("20260810010400");
    expect(body).toContain("4e2c4b05-5ff0-4b23-9084-18d8b1b29c86");
    expect(body).toContain("20260810011456");
    expect(body).toContain("430aac8f-1f38-4e9d-99aa-022ea2680fc4");
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
      expect(c0.out).toContain("PREFLIGHT_LAST_APPLIED_LOGICAL: C0");
      expect(c0.out).toContain("PREFLIGHT_NEXT_EXPECTED_LOGICAL: C1");
      expect(c0.out).toContain("PREFLIGHT_LOGICAL_LEDGER_PREFIX: 1");
      expect(c0.out).toContain("PREFLIGHT_SCHEMA_PREFIX: 1");
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

  it(
    "PG17 logical ledger lineage: short names + C1 split + anti-false-pass",
    async () => {
      if (!dockerReady) throw new Error("docker is required");

      // 1: legacy / no promoted ledger
      await resetDb();
      applyLegacy();
      const legacy = runPreflightLocal();
      if (!legacy.ok) throw new Error(`legacy failed:\n${legacy.out}`);
      expect(legacy.out).toContain("PREFLIGHT_LEDGER_STATE: LEDGER_NONE");
      expect(legacy.out).toContain("READY_FOR_APPLY_C0");

      // 2: C0 full-name format
      await resetDb();
      applyLegacy();
      applyThrough(0);
      seedLogicalPrefixOriginal(0, "full");
      const c0Full = runPreflight();
      if (!c0Full.ok) throw new Error(`C0 full-name failed:\n${c0Full.out}`);
      expect(c0Full.out).toContain("PARTIAL_NEW_CHAIN_EXACT_PREFIX");
      expect(c0Full.out).toContain("PREFLIGHT_LAST_APPLIED_LOGICAL: C0");
      expect(c0Full.out).toContain("PREFLIGHT_NEXT_EXPECTED_LOGICAL: C1");
      expect(c0Full.out).toContain("PREFLIGHT_C1_LINEAGE: ABSENT");

      // 3: C0 short-name format (production Lovable)
      seedLogicalPrefixOriginal(0, "short");
      const c0Short = runPreflight();
      if (!c0Short.ok) throw new Error(`C0 short-name failed:\n${c0Short.out}`);
      expect(c0Short.out).toContain("PARTIAL_NEW_CHAIN_EXACT_PREFIX");
      expect(c0Short.out).toContain(
        `PREFLIGHT_C0_LEDGER_IDENTITY: version=${promotedVersions[0]};name=${promotedShortNames[0]}`,
      );
      expect(c0Short.out).toContain("PREFLIGHT_LOGICAL_LEDGER_PREFIX: 1");
      expect(c0Short.out).toContain("PREFLIGHT_SCHEMA_PREFIX: 1");

      // 4: original C0+C1 lineage
      applyThrough(1);
      seedLogicalPrefixOriginal(1, "short");
      const origC1 = runPreflight();
      if (!origC1.ok) throw new Error(`original C1 failed:\n${origC1.out}`);
      expect(origC1.out).toContain("PARTIAL_NEW_CHAIN_EXACT_PREFIX");
      expect(origC1.out).toContain("PREFLIGHT_C1_LINEAGE: ORIGINAL");
      expect(origC1.out).toContain("PREFLIGHT_LOGICAL_LEDGER_PREFIX: 2");
      expect(origC1.out).toContain("PREFLIGHT_SCHEMA_PREFIX: 2");
      expect(origC1.out).toContain("PREFLIGHT_LAST_APPLIED_LOGICAL: C1");
      expect(origC1.out).toContain("PREFLIGHT_NEXT_EXPECTED_LOGICAL: C2");
      expect(origC1.out).not.toContain("READY_FOR_C3");

      // 5: C0 + complete C1 split => logical prefix 2
      await resetDb();
      applyLegacy();
      applyThrough(1);
      seedC0PlusC1Split("short");
      const splitComplete = runPreflight();
      if (!splitComplete.ok) throw new Error(`split complete failed:\n${splitComplete.out}`);
      expect(splitComplete.out).toContain("PARTIAL_NEW_CHAIN_EXACT_PREFIX");
      expect(splitComplete.out).toContain("PREFLIGHT_C1_LINEAGE: SPLIT_COMPLETE");
      expect(splitComplete.out).toContain(
        `PREFLIGHT_C1_SPLIT_PART_A: version=${c1SplitA.version};name=${c1SplitA.shortName}`,
      );
      expect(splitComplete.out).toContain(
        `PREFLIGHT_C1_SPLIT_PART_B: version=${c1SplitB.version};name=${c1SplitB.shortName}`,
      );
      expect(splitComplete.out).toContain("PREFLIGHT_LOGICAL_LEDGER_PREFIX: 2");
      expect(splitComplete.out).toContain("PREFLIGHT_SCHEMA_PREFIX: 2");
      expect(splitComplete.out).toContain("PREFLIGHT_LAST_APPLIED_LOGICAL: C1");
      expect(splitComplete.out).toContain("PREFLIGHT_NEXT_EXPECTED_LOGICAL: C2");
      expect(splitComplete.out).toContain(
        "PREFLIGHT_STATE_CLASSIFICATION: PARTIAL_NEW_CHAIN_EXACT_PREFIX",
      );

      // 6: C0 + only split part A => HOLD
      seedLedgerEntries([
        { version: promotedVersions[0]!, name: promotedShortNames[0]! },
        { version: c1SplitA.version, name: c1SplitA.shortName },
      ]);
      const onlyA = runPreflight();
      expect(onlyA.ok).toBe(false);
      expect(onlyA.out).toContain("HOLD_C1_SPLIT_INCOMPLETE");

      // 7: C0 + only split part B => HOLD
      seedLedgerEntries([
        { version: promotedVersions[0]!, name: promotedShortNames[0]! },
        { version: c1SplitB.version, name: c1SplitB.shortName },
      ]);
      const onlyB = runPreflight();
      expect(onlyB.ok).toBe(false);
      expect(onlyB.out).toContain("HOLD_C1_SPLIT_INCOMPLETE");

      // 8: original C1 + split C1 ambiguous => HOLD
      seedLedgerEntries([
        { version: promotedVersions[0]!, name: promotedShortNames[0]! },
        { version: promotedVersions[1]!, name: promotedShortNames[1]! },
        { version: c1SplitA.version, name: c1SplitA.shortName },
        { version: c1SplitB.version, name: c1SplitB.shortName },
      ]);
      const ambiguous = runPreflight();
      expect(ambiguous.ok).toBe(false);
      expect(ambiguous.out).toContain("HOLD_C1_LINEAGE_AMBIGUOUS");

      // 9: correct version + arbitrary name => HOLD
      seedLedgerEntries([
        { version: promotedVersions[0]!, name: "arbitrary_wrong_name" },
      ]);
      const wrongName = runPreflight();
      expect(wrongName.ok).toBe(false);
      expect(wrongName.out).toContain("HOLD_LEDGER_IDENTITY_MISMATCH");

      // 10: correct name + wrong version => HOLD
      seedLedgerEntries([
        { version: "19990101000000", name: promotedShortNames[0]! },
      ]);
      const wrongVersion = runPreflight();
      expect(wrongVersion.ok).toBe(false);
      expect(wrongVersion.out).toContain("HOLD_LEDGER_IDENTITY_MISMATCH");

      // 11: C0+C1 ledger + schema prefix2 => PARTIAL exact / NEXT C2
      seedLogicalPrefixOriginal(1, "short");
      const exactPrefix2 = runPreflight();
      if (!exactPrefix2.ok) throw new Error(`prefix2 failed:\n${exactPrefix2.out}`);
      expect(exactPrefix2.out).toContain("PARTIAL_NEW_CHAIN_EXACT_PREFIX");
      expect(exactPrefix2.out).toContain("PREFLIGHT_NEXT_EXPECTED_LOGICAL: C2");

      // 12: ledger prefix2 + schema prefix1 => HOLD
      await resetDb();
      applyLegacy();
      applyThrough(0); // schema prefix 1
      seedLogicalPrefixOriginal(1, "short"); // ledger claims C0+C1
      const ledgerAhead = runPreflight();
      expect(ledgerAhead.ok).toBe(false);
      expect(ledgerAhead.out).toContain("HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH");

      // 13: ledger prefix1 + schema prefix2 => HOLD
      await resetDb();
      applyLegacy();
      applyThrough(1); // schema prefix 2
      seedLogicalPrefixOriginal(0, "short"); // ledger only C0
      const schemaAhead = runPreflight();
      expect(schemaAhead.ok).toBe(false);
      expect(schemaAhead.out).toContain("HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH");

      // 14: C2 short-name ledger + C2 marker => prefix3
      await resetDb();
      applyLegacy();
      applyThrough(2);
      seedLogicalPrefixOriginal(2, "short");
      const prefix3 = runPreflight();
      if (!prefix3.ok) throw new Error(`prefix3 failed:\n${prefix3.out}`);
      expect(prefix3.out).toContain("PARTIAL_NEW_CHAIN_EXACT_PREFIX");
      expect(prefix3.out).toContain("PREFLIGHT_LOGICAL_LEDGER_PREFIX: 3");
      expect(prefix3.out).toContain("PREFLIGHT_SCHEMA_PREFIX: 3");
      expect(prefix3.out).toContain("PREFLIGHT_LAST_APPLIED_LOGICAL: C2");
      expect(prefix3.out).toContain("PREFLIGHT_NEXT_EXPECTED_LOGICAL: C3");

      // 15: C3 later marker without C2 => HOLD
      await resetDb();
      applyLegacy();
      applyThrough(1);
      // Force C3 marker without C2 by creating attendance table only
      const forceC3 = psql(`
        CREATE TABLE public.academic_council_meeting_attendance (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid()
        );
      `);
      if (!forceC3.ok) throw new Error(`force C3 marker failed:\n${forceC3.out}`);
      seedLogicalPrefixOriginal(1, "short");
      const laterWithoutPred = runPreflight();
      expect(laterWithoutPred.ok).toBe(false);
      expect(laterWithoutPred.out).toMatch(/HOLD_|UNKNOWN_UNSAFE/);

      // 16: full logical chain remains FULL_NEW_CHAIN_VERIFIED only with full proof
      await resetDb();
      applyLegacy();
      applyThrough(9);
      seedLogicalPrefixOriginal(9, "short");
      const fullShort = runPreflight();
      if (!fullShort.ok) throw new Error(`full short-name failed:\n${fullShort.out}`);
      expect(fullShort.out).toContain("PREFLIGHT_STATE_CLASSIFICATION: FULL_NEW_CHAIN_VERIFIED");
      expect(fullShort.out).toContain("COUNCILS_FULL_CHAIN_ALREADY_APPLIED_AND_VERIFIED");
      expect(fullShort.out).toContain("NO_APPLY_REQUIRED");
      expect(fullShort.out).toContain("PREFLIGHT_C1_LINEAGE: ORIGINAL");

      // full ledger alone still HOLD
      await resetDb();
      seedLogicalPrefixOriginal(9, "short");
      const ledgerOnly = runPreflight();
      expect(ledgerOnly.ok).toBe(false);
      expect(ledgerOnly.out).toContain("HOLD_FULL_LEDGER_SCHEMA_MISMATCH");
    },
    900_000,
  );

  it(
    "PG17 C2/C3 Lovable managed alias lineage + anti-false-pass",
    async () => {
      if (!dockerReady) throw new Error("docker is required");

      // 1: C0 + C1 split + C2/C3 managed aliases + schema prefix4 => PASS / NEXT C4
      await resetDb();
      applyLegacy();
      applyThrough(3);
      seedC0C1SplitPlusC2C3Aliases();
      const aliasPass = runPreflight();
      if (!aliasPass.ok) throw new Error(`C2/C3 alias pass failed:\n${aliasPass.out}`);
      expect(aliasPass.out).toContain("PARTIAL_NEW_CHAIN_EXACT_PREFIX");
      expect(aliasPass.out).toContain("PREFLIGHT_C1_LINEAGE: SPLIT_COMPLETE");
      expect(aliasPass.out).toContain("PREFLIGHT_C2_LINEAGE: LOVABLE_MANAGED_ALIAS");
      expect(aliasPass.out).toContain("PREFLIGHT_C3_LINEAGE: LOVABLE_MANAGED_ALIAS");
      expect(aliasPass.out).toContain(
        `PREFLIGHT_C2_LEDGER_IDENTITY: version=${c2LovableAlias.version};name=${c2LovableAlias.shortName}`,
      );
      expect(aliasPass.out).toContain(
        `PREFLIGHT_C3_LEDGER_IDENTITY: version=${c3LovableAlias.version};name=${c3LovableAlias.shortName}`,
      );
      expect(aliasPass.out).toContain("PREFLIGHT_LOGICAL_LEDGER_PREFIX: 4");
      expect(aliasPass.out).toContain("PREFLIGHT_SCHEMA_PREFIX: 4");
      expect(aliasPass.out).toContain("PREFLIGHT_LAST_APPLIED_LOGICAL: C3");
      expect(aliasPass.out).toContain("PREFLIGHT_NEXT_EXPECTED_LOGICAL: C4");

      // 2: C2 alias wrong version => HOLD
      seedLedgerEntries([
        { version: promotedVersions[0]!, name: promotedShortNames[0]! },
        { version: c1SplitA.version, name: c1SplitA.shortName },
        { version: c1SplitB.version, name: c1SplitB.shortName },
        { version: "19990101000000", name: c2LovableAlias.shortName },
        { version: c3LovableAlias.version, name: c3LovableAlias.shortName },
      ]);
      const c2WrongVer = runPreflight();
      expect(c2WrongVer.ok).toBe(false);
      expect(c2WrongVer.out).toContain("HOLD_LEDGER_IDENTITY_MISMATCH");

      // 3: C2 alias right version wrong name => HOLD
      seedLedgerEntries([
        { version: promotedVersions[0]!, name: promotedShortNames[0]! },
        { version: c1SplitA.version, name: c1SplitA.shortName },
        { version: c1SplitB.version, name: c1SplitB.shortName },
        { version: c2LovableAlias.version, name: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
        { version: c3LovableAlias.version, name: c3LovableAlias.shortName },
      ]);
      const c2WrongName = runPreflight();
      expect(c2WrongName.ok).toBe(false);
      expect(c2WrongName.out).toContain("HOLD_LEDGER_IDENTITY_MISMATCH");

      // 4: C3 alias wrong version => HOLD
      seedLedgerEntries([
        { version: promotedVersions[0]!, name: promotedShortNames[0]! },
        { version: c1SplitA.version, name: c1SplitA.shortName },
        { version: c1SplitB.version, name: c1SplitB.shortName },
        { version: c2LovableAlias.version, name: c2LovableAlias.shortName },
        { version: "19990101000000", name: c3LovableAlias.shortName },
      ]);
      const c3WrongVer = runPreflight();
      expect(c3WrongVer.ok).toBe(false);
      expect(c3WrongVer.out).toContain("HOLD_LEDGER_IDENTITY_MISMATCH");

      // 5: C3 alias right version wrong name => HOLD
      seedLedgerEntries([
        { version: promotedVersions[0]!, name: promotedShortNames[0]! },
        { version: c1SplitA.version, name: c1SplitA.shortName },
        { version: c1SplitB.version, name: c1SplitB.shortName },
        { version: c2LovableAlias.version, name: c2LovableAlias.shortName },
        { version: c3LovableAlias.version, name: "ffffffff-1111-2222-3333-444444444444" },
      ]);
      const c3WrongName = runPreflight();
      expect(c3WrongName.ok).toBe(false);
      expect(c3WrongName.out).toContain("HOLD_LEDGER_IDENTITY_MISMATCH");

      // 6: duplicate C2 canonical+alias => HOLD
      seedLedgerEntries([
        { version: promotedVersions[0]!, name: promotedShortNames[0]! },
        { version: c1SplitA.version, name: c1SplitA.shortName },
        { version: c1SplitB.version, name: c1SplitB.shortName },
        { version: promotedVersions[2]!, name: promotedShortNames[2]! },
        { version: c2LovableAlias.version, name: c2LovableAlias.shortName },
        { version: c3LovableAlias.version, name: c3LovableAlias.shortName },
      ]);
      const dupC2 = runPreflight();
      expect(dupC2.ok).toBe(false);
      expect(dupC2.out).toContain("HOLD_LOGICAL_STEP_DUPLICATE_LINEAGE");
      expect(dupC2.out).toContain("logical=C2");

      // 7: duplicate C3 canonical+alias => HOLD
      seedLedgerEntries([
        { version: promotedVersions[0]!, name: promotedShortNames[0]! },
        { version: c1SplitA.version, name: c1SplitA.shortName },
        { version: c1SplitB.version, name: c1SplitB.shortName },
        { version: c2LovableAlias.version, name: c2LovableAlias.shortName },
        { version: promotedVersions[3]!, name: promotedShortNames[3]! },
        { version: c3LovableAlias.version, name: c3LovableAlias.shortName },
      ]);
      const dupC3 = runPreflight();
      expect(dupC3.ok).toBe(false);
      expect(dupC3.out).toContain("HOLD_LOGICAL_STEP_DUPLICATE_LINEAGE");
      expect(dupC3.out).toContain("logical=C3");

      // 8: C3 alias without C2 => HOLD (noncontiguous)
      seedLedgerEntries([
        { version: promotedVersions[0]!, name: promotedShortNames[0]! },
        { version: c1SplitA.version, name: c1SplitA.shortName },
        { version: c1SplitB.version, name: c1SplitB.shortName },
        { version: c3LovableAlias.version, name: c3LovableAlias.shortName },
      ]);
      const c3WithoutC2 = runPreflight();
      expect(c3WithoutC2.ok).toBe(false);
      expect(c3WithoutC2.out).toContain("HOLD_NONCONTIGUOUS_LEDGER");

      // 9: C2 alias ledger + no C2 schema => HOLD
      await resetDb();
      applyLegacy();
      applyThrough(1); // schema through C1 only
      seedLedgerEntries([
        { version: promotedVersions[0]!, name: promotedShortNames[0]! },
        { version: c1SplitA.version, name: c1SplitA.shortName },
        { version: c1SplitB.version, name: c1SplitB.shortName },
        { version: c2LovableAlias.version, name: c2LovableAlias.shortName },
      ]);
      const c2LedgerNoSchema = runPreflight();
      expect(c2LedgerNoSchema.ok).toBe(false);
      expect(c2LedgerNoSchema.out).toContain("HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH");

      // 10: C2 schema + no accepted C2 ledger => HOLD
      await resetDb();
      applyLegacy();
      applyThrough(2);
      seedC0PlusC1Split("short");
      const c2SchemaNoLedger = runPreflight();
      expect(c2SchemaNoLedger.ok).toBe(false);
      expect(c2SchemaNoLedger.out).toContain("HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH");

      // 11: C3 alias ledger + schema prefix2 => HOLD
      await resetDb();
      applyLegacy();
      applyThrough(1); // schema prefix 2
      seedC0C1SplitPlusC2C3Aliases();
      const c3LedgerSchema2 = runPreflight();
      expect(c3LedgerSchema2.ok).toBe(false);
      expect(c3LedgerSchema2.out).toContain("HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH");

      // 12: schema prefix3/4 without accepted C3 ledger => HOLD
      await resetDb();
      applyLegacy();
      applyThrough(3);
      seedLedgerEntries([
        { version: promotedVersions[0]!, name: promotedShortNames[0]! },
        { version: c1SplitA.version, name: c1SplitA.shortName },
        { version: c1SplitB.version, name: c1SplitB.shortName },
        { version: c2LovableAlias.version, name: c2LovableAlias.shortName },
      ]);
      const schemaNoC3Ledger = runPreflight();
      expect(schemaNoC3Ledger.ok).toBe(false);
      expect(schemaNoC3Ledger.out).toContain("HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH");

      // 13: arbitrary UUID names never accepted (even with C2/C3 versions)
      seedLedgerEntries([
        { version: promotedVersions[0]!, name: promotedShortNames[0]! },
        { version: c1SplitA.version, name: c1SplitA.shortName },
        { version: c1SplitB.version, name: c1SplitB.shortName },
        { version: c2LovableAlias.version, name: "00000000-0000-0000-0000-000000000000" },
        { version: c3LovableAlias.version, name: "11111111-1111-1111-1111-111111111111" },
      ]);
      const arbitraryUuid = runPreflight();
      expect(arbitraryUuid.ok).toBe(false);
      expect(arbitraryUuid.out).toContain("HOLD_LEDGER_IDENTITY_MISMATCH");

      // 14: known C1 split still PASS
      await resetDb();
      applyLegacy();
      applyThrough(1);
      seedC0PlusC1Split("short");
      const splitStill = runPreflight();
      if (!splitStill.ok) throw new Error(`C1 split still pass failed:\n${splitStill.out}`);
      expect(splitStill.out).toContain("PREFLIGHT_C1_LINEAGE: SPLIT_COMPLETE");
      expect(splitStill.out).toContain("PARTIAL_NEW_CHAIN_EXACT_PREFIX");
      expect(splitStill.out).toContain("PREFLIGHT_NEXT_EXPECTED_LOGICAL: C2");

      // 15: incomplete C1 split still HOLD
      seedLedgerEntries([
        { version: promotedVersions[0]!, name: promotedShortNames[0]! },
        { version: c1SplitA.version, name: c1SplitA.shortName },
      ]);
      const incompleteSplit = runPreflight();
      expect(incompleteSplit.ok).toBe(false);
      expect(incompleteSplit.out).toContain("HOLD_C1_SPLIT_INCOMPLETE");

      // 16: full canonical C0-C9 behavior remains valid
      await resetDb();
      applyLegacy();
      applyThrough(9);
      seedLogicalPrefixOriginal(9, "short");
      const fullCanon = runPreflight();
      if (!fullCanon.ok) throw new Error(`full canonical failed:\n${fullCanon.out}`);
      expect(fullCanon.out).toContain("PREFLIGHT_STATE_CLASSIFICATION: FULL_NEW_CHAIN_VERIFIED");
      expect(fullCanon.out).toContain("COUNCILS_FULL_CHAIN_ALREADY_APPLIED_AND_VERIFIED");
      expect(fullCanon.out).toContain("PREFLIGHT_C2_LINEAGE: CANONICAL");
      expect(fullCanon.out).toContain("PREFLIGHT_C3_LINEAGE: CANONICAL");
    },
    900_000,
  );
});
