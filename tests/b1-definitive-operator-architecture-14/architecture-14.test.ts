import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SQL } from "bun";
import { createHash } from "node:crypto";
import { runLocal267Harness } from "../../scripts/b1-definitive-operator-architecture-14/harness/run-local-267-harness.ts";
import { runFailureInjectionHarness } from "../../scripts/b1-definitive-operator-architecture-14/harness/failure-injection-harness.ts";

const root = process.cwd();
const arch = join(root, "scripts/b1-definitive-operator-architecture-14");
const manifestPath = join(root, "scripts/b1-rpc-principal-harness-01/readonly-attestation/function-graph-2026-08-08.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function normalizeHash(fdef: string): string {
  const norm = fdef.replace(/\s+/g, ' ').trim();
  return createHash("sha256").update(norm, "utf8").digest("hex");
}

describe("PORTAL-B1-PR310-DEFINITIVE-OPERATOR-ARCHITECTURE-16", () => {
  it("required architecture artifacts exist and source migrations are untouched", () => {
    for (const f of [
      "ARCHITECTURE.md",
      "build-canonical-b1-fixture.ts",
      "canonical-fixture/00-roles.sql",
      "canonical-fixture/02-canonical-36-functions.sql",
      "canonical-fixture/05-migration-head.sql",
      "canonical-fixture/07-enrollment-certificate-prestate.sql",
      "canonical-fixture/08-assignment-prestate.sql",
      "canonical-fixture/09-production-sentinel-requests.sql",
      "canonical-fixture/10-fixture-13-direct-assignees.sql",
      "operator-role/01-preflight.sql",
      "operator-role/02-provision.sql",
      "operator-role/03-post-verifier.sql",
      "operator-role/04-cleanup.sql",
      "operator-role/05-effective-grants-verifier.sql",
      "observer/01-observer-functions.sql",
      "observer/02-observer-cleanup.sql",
      "observer/03-observer-acl-verifier.sql",
      "harness/00-harness-functions.sql",
      "harness/run-local-267-harness.ts",
      "harness/failure-injection-harness.ts",
      "EXECUTION-TARGET-MAP.json",
      "FUNCTION-HASH-COMPARISON.json",
    ]) {
      expect(existsSync(join(arch, f))).toBe(true);
    }
  });

  it("verifies 36/36 canonical functions exist with correct owner, security, and search path matching manifest", async () => {
    const url = process.env.B1_OPERATOR_DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:54329/postgres";
    const sql = new SQL(url);

    let matchCount = 0;
    for (const item of manifest) {
      const sig = item.signature;
      const res = await sql`
        SELECT p.oid, p.prosecdef, pg_get_userbyid(p.proowner) AS owner,
               coalesce(pg_catalog.array_to_string(p.proconfig, ','), '') AS search_path
        FROM pg_proc p WHERE p.oid = to_regprocedure(${sig})
      `;

      expect(res.length).toBeGreaterThan(0);
      expect(res[0].owner).toBe(item.owner);
      expect(res[0].prosecdef ? "DEFINER" : "INVOKER").toBe(item.security);
      expect(res[0].search_path).toBe(item.search_path);
      matchCount++;
    }

    expect(matchCount).toBe(36);
    await sql.close();
  });

  it("verifies zero observer functions leak EXECUTE to PUBLIC, anon, authenticated, or service_role", async () => {
    const url = process.env.B1_OPERATOR_DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:54329/postgres";
    const sql = new SQL(url);

    const res = await sql`
      SELECT count(*) AS count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname LIKE 'b1_observer_%'
        AND (
          has_function_privilege('public', p.oid, 'EXECUTE') OR
          has_function_privilege('anon', p.oid, 'EXECUTE') OR
          has_function_privilege('authenticated', p.oid, 'EXECUTE') OR
          has_function_privilege('service_role', p.oid, 'EXECUTE')
        )
    `;

    expect(Number(res[0].count)).toBe(0);
    await sql.close();
  });

  it("runs all 267 negative RPC cases under b1_matrix_operator with explicit transaction control and zero mutation", async () => {
    const result = await runLocal267Harness();
    expect(result.ok).toBe(true);
    expect(result.counters.ATTEMPTED).toBe(267);
    expect(result.counters.EXPECTED_DENIALS).toBe(267);
    expect(result.counters.UNEXPECTED_ALLOWS).toBe(0);
    expect(result.counters.UNEXPECTED_DENIALS).toBe(0);
    expect(result.counters.SKIPPED).toBe(0);
    expect(result.counters.BEGIN_COUNT).toBe(267);
    expect(result.counters.ROLLBACK_COUNT).toBe(267);
    expect(result.counters.COMMIT_COUNT).toBe(0);
    expect(result.counters.DATABASE_BEGIN_OBSERVED).toBe(267);
    expect(result.counters.DATABASE_ROLLBACK_OBSERVED).toBe(267);
    expect(result.counters.DATABASE_COMMIT_OBSERVED).toBe(0);
    expect(result.counters.ROLLBACK_MARKER_RESIDUE).toBe(0);
    expect(result.counters.SENTINEL_EXECUTION_TARGET_COUNT).toBe(0);
    expect(result.counters.SENTINEL_UNCHANGED).toBe(true);
    expect(result.counters.ZERO_MUTATION_CASES).toBe(267);
    expect(result.failures).toHaveLength(0);
    expect(result.fixtureState).not.toBeNull();
    expect(result.fixtureState!.requestCount).toBe(28);
    expect(result.fixtureState!.stepCount).toBe(128);
    expect(result.fixtureState!.activeStepCount).toBe(24);
  }, 60000);

  it("runs 17 real PostgreSQL failure injection scenarios resulting in HOLD", async () => {
    const result = await runFailureInjectionHarness();
    expect(result.ok).toBe(true);
    expect(result.scenarios.length).toBeGreaterThanOrEqual(17);
    for (const s of result.scenarios) {
      expect(s.ok).toBe(true);
    }
  }, 60000);
});
