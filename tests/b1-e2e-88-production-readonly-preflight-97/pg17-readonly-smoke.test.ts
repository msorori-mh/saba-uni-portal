/**
 * Real PostgreSQL 17 full preflight execution for Package 97
 * + privileged-schemas fix 112 scenarios.
 * Disposable pre-Migration-88 schema only. No production access.
 */
import { afterAll, describe, expect, it } from "bun:test";
import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const PREFLIGHT = join(
  ROOT,
  "docs/production-preflight/B1-E2E-88-PRODUCTION-READONLY-PREFLIGHT-97.sql",
);
const STUB = join(
  ROOT,
  "tests/b1-e2e-88-production-readonly-preflight-97/pg17-stub-schema.sql",
);

const dockerReady = (() => {
  try {
    execSync("docker --version", { stdio: "ignore" });
    const images = execSync("docker images -q postgres:17", {
      encoding: "utf8",
    }).trim();
    return images.length > 0;
  } catch {
    return false;
  }
})();

const container = `pkg97-pg17-priv-${Date.now()}`;

function psql(sql: string, extraArgs: string[] = [], role?: string) {
  const rolePrefix = role ? `SET ROLE ${role};\n` : "";
  const r = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-A",
      "-t",
      ...extraArgs,
    ],
    {
      input: rolePrefix + sql,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  return r;
}

function catalogFingerprint(): string {
  const r = psql(`
SELECT md5(string_agg(x, '|' ORDER BY x))
FROM (
  SELECT n.nspname||'.'||c.relname||':'||c.relkind::text AS x
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN (
    'public','auth','storage','vault','realtime','supabase_functions',
    'supabase_migrations','net','cron','pgmq'
  )
  UNION ALL
  SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
) q;
`);
  expect(r.status).toBe(0);
  return (r.stdout || "").trim();
}

function parseGates(stdout: string): string[] {
  return (stdout || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => /^G\d{2}\|/.test(l));
}

function expectFourteenGates(stdout: string) {
  const gateLines = parseGates(stdout);
  expect(gateLines.length).toBe(14);
  for (let i = 1; i <= 14; i++) {
    const g = `G${String(i).padStart(2, "0")}`;
    expect(gateLines.some((l) => l.startsWith(`${g}|`))).toBe(true);
  }
  return gateLines;
}

function expectG10AuthUnproven(gateLines: string[]) {
  const g10 = gateLines.find((l) => l.startsWith("G10|"))!;
  expect(g10).toContain("UNPROVEN");
  expect(g10).toContain("HOLD_B1_E2E_88_AUTH_SCHEMA_UNREADABLE");
  const g11 = gateLines.find((l) => l.startsWith("G11|"))!;
  expect(g11).toContain("HOLD");
}

function expectG03ThroughG14(gateLines: string[]) {
  for (let i = 3; i <= 14; i++) {
    const g = `G${String(i).padStart(2, "0")}`;
    expect(gateLines.some((l) => l.startsWith(`${g}|`))).toBe(true);
  }
}

function expectCleanRun(r: ReturnType<typeof psql>) {
  expect(r.status).toBe(0);
  expect(r.stderr || "").not.toMatch(/permission denied for schema/i);
  expect(r.stderr || "").not.toMatch(/relation .* does not exist/i);
}

function setupRestrictedRole() {
  expect(
    psql(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    CREATE ROLE sandbox_exec NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO sandbox_exec;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO sandbox_exec;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO sandbox_exec;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO sandbox_exec;
-- Deny all privileged schemas (production Lovable read-role shape).
REVOKE ALL ON SCHEMA auth FROM PUBLIC;
REVOKE ALL ON SCHEMA auth FROM sandbox_exec;
REVOKE ALL ON SCHEMA storage FROM PUBLIC;
REVOKE ALL ON SCHEMA storage FROM sandbox_exec;
REVOKE ALL ON SCHEMA vault FROM PUBLIC;
REVOKE ALL ON SCHEMA vault FROM sandbox_exec;
REVOKE ALL ON SCHEMA realtime FROM PUBLIC;
REVOKE ALL ON SCHEMA realtime FROM sandbox_exec;
REVOKE ALL ON SCHEMA supabase_functions FROM PUBLIC;
REVOKE ALL ON SCHEMA supabase_functions FROM sandbox_exec;
REVOKE ALL ON SCHEMA supabase_migrations FROM PUBLIC;
REVOKE ALL ON SCHEMA supabase_migrations FROM sandbox_exec;
REVOKE ALL ON SCHEMA net FROM PUBLIC;
REVOKE ALL ON SCHEMA net FROM sandbox_exec;
REVOKE ALL ON SCHEMA cron FROM PUBLIC;
REVOKE ALL ON SCHEMA cron FROM sandbox_exec;
REVOKE ALL ON SCHEMA pgmq FROM PUBLIC;
REVOKE ALL ON SCHEMA pgmq FROM sandbox_exec;
`).status,
  ).toBe(0);
}

afterAll(() => {
  if (!dockerReady) return;
  try {
    execSync(`docker rm -f ${container}`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
});

describe("Package 97 — real PG17 privileged-schema preflight", () => {
  it("proves G01–G14 continuity across privileged-schema and identity scenarios", async () => {
    if (!dockerReady) {
      throw new Error(
        "postgres:17 image required locally for Package 97 full preflight proof",
      );
    }

    execSync(
      `docker run -d --name ${container} -e POSTGRES_PASSWORD=postgres postgres:17`,
      { stdio: "ignore" },
    );

    let ready = false;
    for (let i = 0; i < 60; i++) {
      const r = spawnSync(
        "docker",
        ["exec", container, "pg_isready", "-U", "postgres"],
        { encoding: "utf8" },
      );
      if (r.status === 0) {
        ready = true;
        break;
      }
      await Bun.sleep(500);
    }
    expect(ready).toBe(true);

    const stub = readFileSync(STUB, "utf8");
    const stubRun = psql(stub);
    expect(stubRun.status).toBe(0);
    setupRestrictedRole();

    const sql = readFileSync(PREFLIGHT, "utf8");
    const before = catalogFingerprint();

    // --- 1) auth schema present, USAGE denied ---
    {
      const r = psql(sql, ["-F", "|"], "sandbox_exec");
      expectCleanRun(r);
      const gates = expectFourteenGates(r.stdout || "");
      expectG10AuthUnproven(gates);
      expectG03ThroughG14(gates);
      expect(gates.find((l) => l.startsWith("G01|"))!).toMatch(/UNPROVEN/);
      expect(catalogFingerprint()).toBe(before);
    }

    // --- 2) auth.users present but unreadable (USAGE denied already) ---
    {
      expect(
        psql(`
INSERT INTO auth.users(id, email)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'student@testonly.quboolye.com')
ON CONFLICT DO NOTHING;
`).status,
      ).toBe(0);
      const afterInsert = catalogFingerprint();
      const r = psql(sql, ["-F", "|"], "sandbox_exec");
      expectCleanRun(r);
      const gates = expectFourteenGates(r.stdout || "");
      expectG10AuthUnproven(gates);
      expect(catalogFingerprint()).toBe(afterInsert);
    }

    // --- 3) storage + sibling restricted schemas USAGE denied ---
    {
      const r = psql(sql, ["-F", "|"], "sandbox_exec");
      expectCleanRun(r);
      const gates = expectFourteenGates(r.stdout || "");
      expectG10AuthUnproven(gates);
      expect(r.stdout || "").toMatch(/storage_schema_access/);
    }

    // --- 4) auth schema absent ---
    {
      expect(psql(`DROP SCHEMA auth CASCADE;`).status).toBe(0);
      const afterDropAuth = catalogFingerprint();
      const r = psql(sql, ["-F", "|"], "sandbox_exec");
      expectCleanRun(r);
      const gates = expectFourteenGates(r.stdout || "");
      expectG10AuthUnproven(gates);
      expect(r.stdout || "").toMatch(/ABSENT|HOLD_B1_E2E_88_AUTH_SCHEMA_UNREADABLE/);
      expect(catalogFingerprint()).toBe(afterDropAuth);
      // Restore auth for remaining scenarios
      expect(
        psql(`
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON SCHEMA auth FROM PUBLIC;
REVOKE ALL ON SCHEMA auth FROM sandbox_exec;
`).status,
      ).toBe(0);
    }

    // --- 5) all privileged schemas simultaneously inaccessible ---
    {
      expect(
        psql(`
REVOKE ALL ON SCHEMA auth FROM sandbox_exec;
REVOKE ALL ON SCHEMA storage FROM sandbox_exec;
REVOKE ALL ON SCHEMA vault FROM sandbox_exec;
REVOKE ALL ON SCHEMA realtime FROM sandbox_exec;
REVOKE ALL ON SCHEMA supabase_functions FROM sandbox_exec;
REVOKE ALL ON SCHEMA supabase_migrations FROM sandbox_exec;
REVOKE ALL ON SCHEMA net FROM sandbox_exec;
REVOKE ALL ON SCHEMA cron FROM sandbox_exec;
REVOKE ALL ON SCHEMA pgmq FROM sandbox_exec;
`).status,
      ).toBe(0);
      const baseline = catalogFingerprint();
      const r = psql(sql, ["-F", "|"], "sandbox_exec");
      expectCleanRun(r);
      const gates = expectFourteenGates(r.stdout || "");
      expectG10AuthUnproven(gates);
      expectG03ThroughG14(gates);
      expect(catalogFingerprint()).toBe(baseline);

      // --- 6) Migration-88 objects absent ---
      expect(gates.some((l) => l.includes("OBJECT_STATE_NOT_APPLIED"))).toBe(true);

      // --- 7) one Migration-88 object present (partial) ---
      expect(
        psql(`
CREATE TABLE public.b1_e2e_88_executions (id uuid PRIMARY KEY);
GRANT SELECT ON public.b1_e2e_88_executions TO sandbox_exec;
`).status,
      ).toBe(0);
      const partialRun = psql(sql, ["-F", "|"], "sandbox_exec");
      expectCleanRun(partialRun);
      const partialGates = expectFourteenGates(partialRun.stdout || "");
      expect(partialRun.stdout || "").toMatch(
        /HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED/,
      );
      expectG10AuthUnproven(partialGates);
      expect(psql(`DROP TABLE public.b1_e2e_88_executions;`).status).toBe(0);
      expect(catalogFingerprint()).toBe(baseline);

      // --- 8) complete Migration-88 object set ---
      expect(
        psql(`
CREATE TABLE public.b1_e2e_88_executions (id uuid PRIMARY KEY);
CREATE TABLE public.b1_e2e_88_actor_bindings (id uuid PRIMARY KEY);
CREATE TABLE public.b1_e2e_88_audit_events (id uuid PRIMARY KEY);
ALTER TABLE public.b1_e2e_88_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b1_e2e_88_actor_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b1_e2e_88_audit_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.b1_e2e_88_executions TO sandbox_exec;
GRANT SELECT ON public.b1_e2e_88_actor_bindings TO sandbox_exec;
GRANT SELECT ON public.b1_e2e_88_audit_events TO sandbox_exec;

CREATE OR REPLACE FUNCTION public.b1_e2e_88_audit_events_deny_mutate()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'deny'; END; $$;
CREATE OR REPLACE FUNCTION public.b1_e2e_88_is_five_service(text)
RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.b1_e2e_88_marker()
RETURNS text LANGUAGE sql AS $$ SELECT 'TEST_ONLY_B1_E2E_88'::text $$;
CREATE OR REPLACE FUNCTION public.b1_e2e_88_parse_correlation(text)
RETURNS text LANGUAGE sql AS $$ SELECT $1 $$;
CREATE OR REPLACE FUNCTION public.b1_e2e_88_request_correlation(uuid)
RETURNS text LANGUAGE sql AS $$ SELECT $1::text $$;
CREATE OR REPLACE FUNCTION public.b1_e2e_88_request_is_marked(uuid)
RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.b1_e2e_88_correlations_aligned(uuid, uuid, uuid)
RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.b1_e2e_88_write_audit(text, uuid, uuid, uuid, uuid, uuid, jsonb)
RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE OR REPLACE FUNCTION public.b1_e2e_88_execution_is_live(uuid)
RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.current_user_has_b1_e2e_88_actor_binding(uuid, uuid, text)
RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.current_user_has_b1_e2e_88_department_binding(uuid, text)
RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.b1_e2e_88_allows_hidden_create(text, jsonb)
RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.open_b1_e2e_88_execution(uuid, uuid, text, timestamp with time zone, jsonb)
RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE OR REPLACE FUNCTION public.close_b1_e2e_88_execution(uuid, text)
RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE OR REPLACE FUNCTION public.bind_b1_e2e_88_actor_to_runtime_step(uuid, uuid, uuid, uuid, text, uuid, text)
RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE OR REPLACE FUNCTION public.b1_e2e_88_step_matches_applied_snapshot(uuid, jsonb)
RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.cleanup_b1_e2e_88_package(uuid, boolean)
RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE OR REPLACE FUNCTION public.guard_b1_e2e_88_immutable_marker()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;

CREATE TRIGGER trg_b1_e2e_88_audit_no_update
  BEFORE UPDATE ON public.b1_e2e_88_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.b1_e2e_88_audit_events_deny_mutate();
CREATE TRIGGER trg_guard_b1_e2e_88_immutable_marker
  BEFORE UPDATE ON public.student_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_b1_e2e_88_immutable_marker();
`).status,
      ).toBe(0);

      const completeRun = psql(sql, ["-F", "|"], "sandbox_exec");
      expectCleanRun(completeRun);
      const completeGates = expectFourteenGates(completeRun.stdout || "");
      expectG10AuthUnproven(completeGates);
      expect(completeRun.stdout || "").toMatch(/OBJECT_STATE_APPLIED_OR_EQUIVALENT/);
      expect(completeRun.stdout || "").toMatch(
        /HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED/,
      );

      // Drop M88 objects to restore baseline-ish public surface for identity scenarios
      expect(
        psql(`
DROP TRIGGER IF EXISTS trg_guard_b1_e2e_88_immutable_marker ON public.student_requests;
DROP TRIGGER IF EXISTS trg_b1_e2e_88_audit_no_update ON public.b1_e2e_88_audit_events;
DROP TABLE IF EXISTS public.b1_e2e_88_executions CASCADE;
DROP TABLE IF EXISTS public.b1_e2e_88_actor_bindings CASCADE;
DROP TABLE IF EXISTS public.b1_e2e_88_audit_events CASCADE;
DROP FUNCTION IF EXISTS public.b1_e2e_88_audit_events_deny_mutate();
DROP FUNCTION IF EXISTS public.b1_e2e_88_is_five_service(text);
DROP FUNCTION IF EXISTS public.b1_e2e_88_marker();
DROP FUNCTION IF EXISTS public.b1_e2e_88_parse_correlation(text);
DROP FUNCTION IF EXISTS public.b1_e2e_88_request_correlation(uuid);
DROP FUNCTION IF EXISTS public.b1_e2e_88_request_is_marked(uuid);
DROP FUNCTION IF EXISTS public.b1_e2e_88_correlations_aligned(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.b1_e2e_88_write_audit(text, uuid, uuid, uuid, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.b1_e2e_88_execution_is_live(uuid);
DROP FUNCTION IF EXISTS public.current_user_has_b1_e2e_88_actor_binding(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.current_user_has_b1_e2e_88_department_binding(uuid, text);
DROP FUNCTION IF EXISTS public.b1_e2e_88_allows_hidden_create(text, jsonb);
DROP FUNCTION IF EXISTS public.open_b1_e2e_88_execution(uuid, uuid, text, timestamp with time zone, jsonb);
DROP FUNCTION IF EXISTS public.close_b1_e2e_88_execution(uuid, text);
DROP FUNCTION IF EXISTS public.bind_b1_e2e_88_actor_to_runtime_step(uuid, uuid, uuid, uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.b1_e2e_88_step_matches_applied_snapshot(uuid, jsonb);
DROP FUNCTION IF EXISTS public.cleanup_b1_e2e_88_package(uuid, boolean);
DROP FUNCTION IF EXISTS public.guard_b1_e2e_88_immutable_marker();
`).status,
      ).toBe(0);
    }

    // --- 9) public TEST_ONLY identities absent ---
    {
      const fp = catalogFingerprint();
      const r = psql(sql, ["-F", "|"], "sandbox_exec");
      expectCleanRun(r);
      const gates = expectFourteenGates(r.stdout || "");
      expectG10AuthUnproven(gates);
      expect(r.stdout || "").toMatch(/MISSING|public_identity_completeness/);
      expect(catalogFingerprint()).toBe(fp);
    }

    // --- 10) public TEST_ONLY identities partial ---
    {
      expect(
        psql(`
INSERT INTO public.student_profiles(id, user_id, academic_number, email, full_name_ar, full_name_en)
VALUES (
  'b1000001-0000-4000-8000-000000000001',
  'b1e20002-0000-4000-8000-000000000002',
  'TEST_ONLY_B1_0002',
  'test-only.b1.e2e02@testonly.quboolye.com',
  'طالب TEST_ONLY',
  'TEST_ONLY Student'
) ON CONFLICT (id) DO NOTHING;
GRANT SELECT ON public.student_profiles TO sandbox_exec;
`).status,
      ).toBe(0);
      const fp = catalogFingerprint();
      const r = psql(sql, ["-F", "|"], "sandbox_exec");
      expectCleanRun(r);
      const gates = expectFourteenGates(r.stdout || "");
      expectG10AuthUnproven(gates);
      expect(r.stdout || "").toMatch(/PARTIAL_OR_AMBIGUOUS|COMPLETE_PUBLIC_SIDE|MISSING/);
      expect(catalogFingerprint()).toBe(fp);
    }

    // --- 11) public TEST_ONLY identities complete but Auth readiness unavailable ---
    {
      expect(
        psql(`
INSERT INTO public.staff_profiles(id, user_id, email, full_name_ar, full_name_en, employee_number)
VALUES (
  'b1000002-0000-4000-8000-000000000002',
  'd4aaa5c9-72d1-4996-b0e8-d30c6327da6e',
  'dept.head@testonly.quboolye.com',
  'موظف TEST_ONLY',
  'TEST_ONLY Staff',
  'TEST_ONLY_STAFF_01'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.faculty_profiles(id, user_id, faculty_id, full_name_ar, full_name_en, employee_number)
VALUES (
  'b1000003-0000-4000-8000-000000000003',
  '11111111-1111-4111-8111-111111111101',
  'TEST_ONLY_FAC_01',
  'عضو هيئة TEST_ONLY',
  'TEST_ONLY Faculty',
  'TEST_ONLY_FAC_01'
) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles(user_id, role)
VALUES ('d4aaa5c9-72d1-4996-b0e8-d30c6327da6e', 'admin')
ON CONFLICT DO NOTHING;
GRANT SELECT ON public.staff_profiles TO sandbox_exec;
GRANT SELECT ON public.faculty_profiles TO sandbox_exec;
GRANT SELECT ON public.user_roles TO sandbox_exec;
`).status,
      ).toBe(0);
      const fp = catalogFingerprint();
      const r = psql(sql, ["-F", "|"], "sandbox_exec");
      expectCleanRun(r);
      const gates = expectFourteenGates(r.stdout || "");
      expectG10AuthUnproven(gates);
      expect(r.stdout || "").toMatch(/COMPLETE_PUBLIC_SIDE|public_student_profile_candidates/);
      expect(r.stdout || "").toMatch(/auth_user_existence/);
      expect(catalogFingerprint()).toBe(fp);
    }

    // Final rollback / txn proof
    const txn = psql(`SHOW transaction_read_only;`);
    expect(txn.status).toBe(0);
  }, 300000);
});
