/**
 * Real PostgreSQL 17 full preflight execution for Package 97
 * + UUID/text fix 116 scenarios.
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

const container = `pkg97-pg17-uuid-${Date.now()}`;

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

describe("Package 97 — real PG17 UUID/text + privileged-schema preflight", () => {
  it("proves G01–G14 continuity across faculty UUID and privileged-schema scenarios", async () => {
    if (!dockerReady) {
      throw new Error(
        "postgres:17 image required locally for Package 97 full preflight proof",
      );
    }

    // Best-effort cleanup of stale Package-97 containers from interrupted runs.
    try {
      const stale = execSync(
        'docker ps -aq --filter "name=pkg97-pg17-"',
        { encoding: "utf8" },
      )
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      for (const id of stale) {
        try {
          execSync(`docker rm -f ${id}`, { stdio: "ignore" });
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
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

    // --- 1) faculty_id NULL (production UUID regression) ---
    {
      expect(
        psql(`
INSERT INTO public.faculty_profiles(id, user_id, faculty_id, employee_number, full_name_ar, full_name_en)
VALUES (
  'c1000001-0000-4000-8000-000000000001',
  NULL,
  NULL,
  NULL,
  'عضو هيئة بدون معرف',
  'Faculty NULL id'
) ON CONFLICT (id) DO NOTHING;
GRANT SELECT ON public.faculty_profiles TO sandbox_exec;
`).status,
      ).toBe(0);
      const fp = catalogFingerprint();
      const r = psql(sql, ["-F", "|"], "sandbox_exec");
      expectCleanRun(r);
      expect(r.stderr || "").not.toMatch(/invalid input syntax for type uuid/i);
      const gates = expectFourteenGates(r.stdout || "");
      expectG10AuthUnproven(gates);
      expectG03ThroughG14(gates);
      expect(catalogFingerprint()).toBe(fp);
    }

    // --- 2) faculty_id populated with a valid UUID ---
    {
      expect(
        psql(`
INSERT INTO public.faculty_profiles(id, user_id, faculty_id, employee_number, full_name_ar, full_name_en)
VALUES (
  'c1000002-0000-4000-8000-000000000002',
  'c1e20002-0000-4000-8000-000000000002',
  'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  'FAC-VALID-01',
  'عضو هيئة صالح',
  'Valid Faculty'
) ON CONFLICT (id) DO NOTHING;
`).status,
      ).toBe(0);
      const fp = catalogFingerprint();
      const r = psql(sql, ["-F", "|"], "sandbox_exec");
      expectCleanRun(r);
      expect(r.stderr || "").not.toMatch(/invalid input syntax for type uuid/i);
      const gates = expectFourteenGates(r.stdout || "");
      expectG10AuthUnproven(gates);
      expect(catalogFingerprint()).toBe(fp);
    }

    // --- 3) faculty profile absent (delete seeded faculty rows) ---
    {
      expect(
        psql(`
DELETE FROM public.faculty_profiles
 WHERE id IN (
   'c1000001-0000-4000-8000-000000000001',
   'c1000002-0000-4000-8000-000000000002'
 );
`).status,
      ).toBe(0);
      const fp = catalogFingerprint();
      const r = psql(sql, ["-F", "|"], "sandbox_exec");
      expectCleanRun(r);
      const gates = expectFourteenGates(r.stdout || "");
      expectG10AuthUnproven(gates);
      expect(catalogFingerprint()).toBe(fp);
    }

    // --- 4) auth schema present, USAGE denied ---
    {
      const baselineAfterFaculty = catalogFingerprint();
      const r = psql(sql, ["-F", "|"], "sandbox_exec");
      expectCleanRun(r);
      const gates = expectFourteenGates(r.stdout || "");
      expectG10AuthUnproven(gates);
      expectG03ThroughG14(gates);
      expect(gates.find((l) => l.startsWith("G01|"))!).toMatch(/UNPROVEN/);
      expect(catalogFingerprint()).toBe(baselineAfterFaculty);
    }

    // --- 5) auth.users present but unreadable (USAGE denied already) ---
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

    // --- 6) all privileged schemas simultaneously inaccessible ---
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

      // --- 7) Migration-88 objects absent ---
      expect(gates.some((l) => l.includes("OBJECT_STATE_NOT_APPLIED"))).toBe(true);

      // --- 8) one Migration-88 object present (partial) ---
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
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
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
      expect(r.stderr || "").not.toMatch(/invalid input syntax for type uuid/i);
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
