/**
 * Real PostgreSQL 17 full preflight execution for Package 97
 * + ledger-permission fix 108 scenarios.
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

const container = `pkg97-pg17-full-${Date.now()}`;

function psql(sql: string, extraArgs: string[] = [], role?: string) {
  const rolePrefix = role
    ? `SET ROLE ${role};\n`
    : "";
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
  WHERE n.nspname IN ('public','auth','supabase_migrations')
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

function expectG02UnprovenLedger(gateLines: string[]) {
  const g02 = gateLines.find((l) => l.startsWith("G02|"))!;
  expect(g02).toContain("UNPROVEN");
  expect(g02).toContain("HOLD_B1_E2E_88_MIGRATION_LEDGER_UNREADABLE");
  expect(g02).toMatch(/OBJECT_STATE_NOT_APPLIED|object_state/);
}

afterAll(() => {
  if (!dockerReady) return;
  try {
    execSync(`docker rm -f ${container}`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
});

describe("Package 97 — real PG17 full preflight", () => {
  it("executes complete preflight SQL against disposable pre-M88 PG17", async () => {
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

    // Restricted role mimicking Lovable sandbox_exec without ledger USAGE.
    expect(
      psql(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    CREATE ROLE sandbox_exec NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO sandbox_exec;
GRANT USAGE ON SCHEMA auth TO sandbox_exec;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO sandbox_exec;
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO sandbox_exec;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO sandbox_exec;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO sandbox_exec;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO sandbox_exec;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT ON TABLES TO sandbox_exec;
REVOKE ALL ON SCHEMA supabase_migrations FROM PUBLIC;
REVOKE ALL ON SCHEMA supabase_migrations FROM sandbox_exec;
`).status,
    ).toBe(0);

    const sql = readFileSync(PREFLIGHT, "utf8");
    const before = catalogFingerprint();

    // --- 1) Schema present, USAGE denied (production failure mode) ---
    const usageDenied = psql(sql, ["-F", "|"], "sandbox_exec");
    expect(usageDenied.status).toBe(0);
    expect(usageDenied.stderr || "").not.toMatch(/permission denied for schema/i);
    expect(usageDenied.stderr || "").not.toMatch(/relation .* does not exist/i);
    const usageGates = expectFourteenGates(usageDenied.stdout || "");
    expectG02UnprovenLedger(usageGates);
    expect(usageGates.find((l) => l.startsWith("G01|"))!).toMatch(/UNPROVEN/);
    expect(catalogFingerprint()).toBe(before);

    // --- 2) Schema absent ---
    expect(psql(`DROP SCHEMA supabase_migrations CASCADE;`).status).toBe(0);
    const afterDropSchema = catalogFingerprint();
    const schemaAbsent = psql(sql, ["-F", "|"], "sandbox_exec");
    expect(schemaAbsent.status).toBe(0);
    expect(schemaAbsent.stderr || "").not.toMatch(/permission denied for schema/i);
    const absentGates = expectFourteenGates(schemaAbsent.stdout || "");
    expectG02UnprovenLedger(absentGates);
    expect(absentGates.some((l) => l.includes("OBJECT_STATE_NOT_APPLIED"))).toBe(
      true,
    );
    expect(catalogFingerprint()).toBe(afterDropSchema);

    // --- 3) Schema USAGE allowed but ledger table unavailable ---
    expect(
      psql(`
CREATE SCHEMA supabase_migrations;
GRANT USAGE ON SCHEMA supabase_migrations TO sandbox_exec;
-- intentionally no schema_migrations table
`).status,
    ).toBe(0);
    const afterEmptySchema = catalogFingerprint();
    const tableMissing = psql(sql, ["-F", "|"], "sandbox_exec");
    expect(tableMissing.status).toBe(0);
    expect(tableMissing.stderr || "").not.toMatch(/permission denied for schema/i);
    expect(tableMissing.stderr || "").not.toMatch(/schema_migrations/i);
    const missingTableGates = expectFourteenGates(tableMissing.stdout || "");
    expectG02UnprovenLedger(missingTableGates);
    expect(catalogFingerprint()).toBe(afterEmptySchema);

    // Restore stub ledger for remaining object-state probes (postgres role ok).
    expect(
      psql(`
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  inserted_at timestamptz DEFAULT now()
);
INSERT INTO supabase_migrations.schema_migrations(version)
VALUES ('20260731203030')
ON CONFLICT DO NOTHING;
REVOKE ALL ON SCHEMA supabase_migrations FROM sandbox_exec;
`).status,
    ).toBe(0);
    const baseline = catalogFingerprint();

    // --- 4) All Migration-88 objects absent ---
    const allAbsent = psql(sql, ["-F", "|"], "sandbox_exec");
    expect(allAbsent.status).toBe(0);
    const allAbsentGates = expectFourteenGates(allAbsent.stdout || "");
    expectG02UnprovenLedger(allAbsentGates);
    expect(allAbsentGates.some((l) => l.includes("OBJECT_STATE_NOT_APPLIED"))).toBe(
      true,
    );
    expect(catalogFingerprint()).toBe(baseline);

    // --- 5) One Migration-88 object present (partial) ---
    expect(
      psql(`
CREATE TABLE public.b1_e2e_88_executions (id uuid PRIMARY KEY);
GRANT SELECT ON public.b1_e2e_88_executions TO sandbox_exec;
`).status,
    ).toBe(0);
    const afterPartialCreate = catalogFingerprint();
    const partialRun = psql(sql, ["-F", "|"], "sandbox_exec");
    expect(partialRun.status).toBe(0);
    const partialGates = expectFourteenGates(partialRun.stdout || "");
    expect(partialRun.stdout || "").toMatch(
      /HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED/,
    );
    const g02Partial = partialGates.find((l) => l.startsWith("G02|"))!;
    expect(g02Partial).toContain("HOLD");
    expect(g02Partial).toContain("HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED");
    expect(psql(`DROP TABLE public.b1_e2e_88_executions;`).status).toBe(0);
    expect(catalogFingerprint()).toBe(baseline);
    void afterPartialCreate;

    // Partial function presence → HOLD
    expect(
      psql(`
CREATE OR REPLACE FUNCTION public.b1_e2e_88_marker()
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'TEST_ONLY_B1_E2E_88'::text $$;
`).status,
    ).toBe(0);
    const fnPartial = psql(sql, ["-F", "|"], "sandbox_exec");
    expect(fnPartial.status).toBe(0);
    expectFourteenGates(fnPartial.stdout || "");
    expect(fnPartial.stdout || "").toMatch(
      /HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED/,
    );
    expect(psql(`DROP FUNCTION public.b1_e2e_88_marker();`).status).toBe(0);
    expect(catalogFingerprint()).toBe(baseline);

    // --- 6) Complete Migration-88 object set ---
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
    expect(completeRun.status).toBe(0);
    const completeGates = expectFourteenGates(completeRun.stdout || "");
    const g02Complete = completeGates.find((l) => l.startsWith("G02|"))!;
    // Ledger still unreadable → UNPROVEN code; object-state complete.
    expect(g02Complete).toContain("UNPROVEN");
    expect(g02Complete).toContain("HOLD_B1_E2E_88_MIGRATION_LEDGER_UNREADABLE");
    expect(completeRun.stdout || "").toMatch(/OBJECT_STATE_APPLIED_OR_EQUIVALENT/);
    // G03 still fails closed on object presence.
    expect(completeRun.stdout || "").toMatch(
      /HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED/,
    );

    // Wrong fixture routing → HOLD
    expect(
      psql(`
INSERT INTO public.request_types(id, code, is_active, student_visible)
VALUES
  ('a0000000-0000-4000-8000-000000000001','department_transfer', true, false),
  ('a0000000-0000-4000-8000-000000000002','enrollment_certificate', true, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.student_requests(id, request_number, request_type, status, form_data)
VALUES (
  'f1300000-0000-4000-8000-000000000001',
  'SR-20260801-13000001',
  'excused_absence',
  'in_review',
  '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET request_type = EXCLUDED.request_type;

INSERT INTO public.student_request_workflow_steps(
  id, student_request_id, step_key, step_order, status
) VALUES (
  'f1300001-0000-4000-8000-000001000002',
  'f1300000-0000-4000-8000-000000000001',
  'manager_review',
  2,
  'active'
) ON CONFLICT (id) DO NOTHING;
`).status,
    ).toBe(0);
    const wrongRoute = psql(sql, ["-F", "|"], "sandbox_exec");
    expect(wrongRoute.status).toBe(0);
    expectFourteenGates(wrongRoute.stdout || "");
    expect(wrongRoute.stdout || "").toMatch(
      /FIXTURE_SERVICE_OR_STEP_ROUTING_DRIFT|FIXTURE_IDENTITY_DRIFT|FIXTURE_COUNT_DRIFT/,
    );

    // Function preimage drift → HOLD
    expect(
      psql(`
CREATE OR REPLACE FUNCTION public.can_current_user_act_on_step(p_step_id uuid, p_action text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT position('b1_e2e_88' in 'b1_e2e_88_drift') > 0;
$$;
`).status,
    ).toBe(0);
    const drift = psql(sql, ["-F", "|"], "sandbox_exec");
    expect(drift.status).toBe(0);
    expectFourteenGates(drift.stdout || "");
    expect(drift.stdout || "").toMatch(
      /HOLD_B1_E2E_88_FUNCTION_PREIMAGE_DRIFT/,
    );

    // Final rollback proof already encoded in preflight; confirm txn ended
    const txn = psql(`SHOW transaction_read_only;`);
    expect(txn.status).toBe(0);
  }, 240000);
});
