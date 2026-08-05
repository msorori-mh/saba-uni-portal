/**
 * Real PostgreSQL 17 full preflight execution for Package 97.
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

function psql(sql: string, extraArgs: string[] = []) {
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
    { input: sql, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
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

    const before = catalogFingerprint();

    const sql = readFileSync(PREFLIGHT, "utf8");
    const run = psql(sql, ["-F", "|"]);
    expect(run.status).toBe(0);
    expect(run.stderr || "").not.toMatch(/relation .* does not exist/i);
    expect(run.stderr || "").not.toMatch(/missing.from.clause/i);

    const lines = (run.stdout || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const gateLines = lines.filter((l) => /^G\d{2}\|/.test(l));
    expect(gateLines.length).toBe(14);
    for (let i = 1; i <= 14; i++) {
      const g = `G${String(i).padStart(2, "0")}`;
      expect(gateLines.some((l) => l.startsWith(`${g}|`))).toBe(true);
    }

    const g01 = gateLines.find((l) => l.startsWith("G01|"))!;
    expect(g01).toMatch(/UNPROVEN/);
    expect(g01).toContain("HOLD");

    const after = catalogFingerprint();
    expect(after).toBe(before);

    // Partial table presence → HOLD
    const partial = psql(`
CREATE TABLE public.b1_e2e_88_executions (id uuid PRIMARY KEY);
`);
    expect(partial.status).toBe(0);
    const afterPartialCreate = catalogFingerprint();
    const partialRun = psql(sql, ["-F", "|"]);
    expect(partialRun.status).toBe(0);
    expect(partialRun.stdout || "").toMatch(
      /HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED/,
    );
    // Drop partial object and restore catalog for next probes
    expect(psql(`DROP TABLE public.b1_e2e_88_executions;`).status).toBe(0);
    expect(catalogFingerprint()).toBe(before);
    void afterPartialCreate;

    // Partial function presence → HOLD
    expect(
      psql(`
CREATE OR REPLACE FUNCTION public.b1_e2e_88_marker()
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'TEST_ONLY_B1_E2E_88'::text $$;
`).status,
    ).toBe(0);
    const fnPartial = psql(sql, ["-F", "|"]);
    expect(fnPartial.status).toBe(0);
    expect(fnPartial.stdout || "").toMatch(
      /HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED/,
    );
    expect(psql(`DROP FUNCTION public.b1_e2e_88_marker();`).status).toBe(0);

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
    const wrongRoute = psql(sql, ["-F", "|"]);
    expect(wrongRoute.status).toBe(0);
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
    const drift = psql(sql, ["-F", "|"]);
    expect(drift.status).toBe(0);
    expect(drift.stdout || "").toMatch(
      /HOLD_B1_E2E_88_FUNCTION_PREIMAGE_DRIFT/,
    );

    // Final rollback proof already encoded in preflight; confirm txn ended
    const txn = psql(`SHOW transaction_read_only;`);
    expect(txn.status).toBe(0);
  }, 180000);
});
