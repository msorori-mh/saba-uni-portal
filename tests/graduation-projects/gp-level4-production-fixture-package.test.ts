import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

/**
 * GP-LEVEL4-PRODUCTION-TESTONLY-FIXTURE-PACKAGE-01
 * SOURCE-ONLY contract + disposable PG17 replay. No production connection.
 */

const root = process.cwd();
const fixturesDir = join(root, "docs", "production-test-fixtures");
const fixturesPath = join(
  fixturesDir,
  "GP-LEVEL4-PRODUCTION-TESTONLY-FIXTURES-01.sql",
);
const cleanupPath = join(
  fixturesDir,
  "GP-LEVEL4-PRODUCTION-TESTONLY-CLEANUP-01.sql",
);
const fingerprintPath = join(
  fixturesDir,
  "GP-LEVEL4-PRODUCTION-TESTONLY-FINGERPRINT-01.sql",
);
const runbookPath = join(
  fixturesDir,
  "GP-LEVEL4-PRODUCTION-E2E-RUNBOOK-01.md",
);
const localVerifierPath = join(
  root,
  "tests",
  "graduation-projects",
  "postgres-gp-level4-production-fixture-package-verifier.sql",
);
const minimalSchemaPath = join(
  root,
  "tests",
  "graduation-projects",
  "postgres-minimal-schema.sql",
);
const a1Path = join(
  root,
  "supabase",
  "migrations",
  "20260806235348_8f36000d-c62c-416f-a84b-eeee7d400dd8.sql",
);
const a2Path = join(
  root,
  "supabase",
  "migrations",
  "20260807000230_a6771356-c3f3-4cba-9b90-e3f70afbb72b.sql",
);
const a3Path = join(
  root,
  "supabase",
  "migrations",
  "20260807001114_c22e6009-1472-43ef-9443-b002872bbba5.sql",
);
const storageFixPath = join(
  root,
  "supabase",
  "migrations",
  "20260807023229_7adcb3fb-73a1-483c-8ca2-4c93645fb84b.sql",
);
const promotedL4Path = join(
  root,
  "supabase",
  "migrations",
  "20260808010000_gp_student_level4_only_eligibility_guard_01.sql",
);

const MARKER = "TEST_ONLY_GP_LEVEL4_RECLOSURE_01";
const UUID_BAND = "a4e40100-0000-4000";

const fixtures = readFileSync(fixturesPath, "utf8");
const cleanup = readFileSync(cleanupPath, "utf8");
const fingerprint = readFileSync(fingerprintPath, "utf8");
const runbook = readFileSync(runbookPath, "utf8");
const localVerifier = readFileSync(localVerifierPath, "utf8");

const container = `gp-l4-fixture-pkg-${Date.now()}`;

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
    [
      "exec",
      "-i",
      container,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  const out = `${res.stdout || ""}\n${res.stderr || ""}`;
  return { ok: res.status === 0, out };
}

function psqlFile(filePath: string): { ok: boolean; out: string } {
  return psql(readFileSync(filePath, "utf8"));
}

async function waitReady(): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    const r = spawnSync(
      "docker",
      ["exec", container, "pg_isready", "-U", "postgres"],
      { encoding: "utf8" },
    );
    if (r.status === 0) {
      const probe = psql("select 1;");
      if (probe.ok) return true;
    }
    await Bun.sleep(500);
  }
  return false;
}

afterAll(() => {
  teardownContainer();
});

describe("GP Level-4 production TEST_ONLY fixture package", () => {
  it("ships operator SQL/docs outside supabase/migrations with canonical marker", () => {
    expect(fixturesPath.replace(/\\/g, "/")).toContain(
      "docs/production-test-fixtures/",
    );
    expect(fixtures).toContain(MARKER);
    expect(fixtures).toContain("SOURCE-ONLY");
    expect(fixtures).toContain("gp.l4_fixture.execute");
    expect(fixtures).toContain("GP_L4_FIXTURE_DRY_RUN");
    expect(fixtures).toContain("GP_L4_TEST_LEADER");
    expect(fixtures).toContain("GP_DUAL_ROLE");
    expect(fixtures).toContain("GP_LEVEL_AMBIGUOUS_NEGATIVE");
    expect(fixtures).toContain(UUID_BAND);
    expect(fixtures).toContain("DO NOT place under supabase/migrations");
    expect(fixturesPath.replace(/\\/g, "/")).not.toMatch(
      /supabase\/migrations\//,
    );

    expect(cleanup).toContain(MARKER);
    expect(cleanup).toContain("gp.l4_fixture.cleanup_execute");
    expect(cleanup).toContain("GP_L4_CLEANUP_DRY_RUN");
    expect(cleanup).toContain("GP_L4_CLEANUP_SUCCESS");
    expect(cleanup).toContain("refuse unmarked");

    expect(fingerprint).toContain("PRE_E2E");
    expect(fingerprint).toContain("POST_E2E");
    expect(fingerprint).toContain("POST_CLEANUP");
    expect(fingerprint).toContain("dual_role_student_deny_topology");
    expect(fingerprint).toContain("ROLLBACK");

    expect(runbook).toContain("GATE 1");
    expect(runbook).toContain("GATE 11");
    expect(runbook).toContain("ZERO side effects");
    expect(runbook).toContain("GATE 7 — Storage");
  });

  it("defines the required actor/project/storage topology in source", () => {
    for (const actor of [
      "GP_L4_TEST_LEADER",
      "GP_L4_TEST_MEMBER",
      "GP_L1_NEGATIVE",
      "GP_L2_NEGATIVE",
      "GP_L3_NEGATIVE",
      "GP_LEVEL_UNKNOWN_NEGATIVE",
      "GP_LEVEL_AMBIGUOUS_NEGATIVE",
      "GP_DUAL_ROLE",
      "GP_TEST_COORDINATOR",
      "GP_TEST_SUPERVISOR",
      "GP_TEST_UNRELATED_SUPERVISOR",
      "GP_TEST_PANEL_1",
      "GP_TEST_PANEL_2",
      "GP_TEST_UNAUTHORIZED_STAFF",
      "GP_TEST_ADMIN_VIEWER",
    ]) {
      expect(fixtures).toContain(actor);
    }
    expect(fixtures).toContain("P1 POSITIVE L4");
    expect(fixtures).toContain("P2 DUAL STUDENT DENY");
    expect(fixtures).toContain("P3 DUAL STAFF ALLOW");
    expect(fixtures).toContain("P4 ARCHIVE IMMUTABLE");
    expect(fixtures).toContain("pending-demotion");
    expect(fixtures).toContain("signed-download");
    expect(fixtures).toContain("updated_at DESC NULLS LAST");
    expect(localVerifier).toContain("DUAL_ROLE_STAFF_ALLOW_FAILED");
    expect(localVerifier).toContain("ZERO_SIDE_EFFECT_DENIAL_FAILED");
  });

  it("replays provisioning/fingerprint/cleanup on disposable PG17", async () => {
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

    for (const [label, path] of [
      ["minimal-schema", minimalSchemaPath],
      ["U1-A1", a1Path],
      ["U2-A2", a2Path],
      ["U3-A3", a3Path],
      ["U4-storage-fix", storageFixPath],
      ["L4-promoted", promotedL4Path],
    ] as const) {
      let result = psqlFile(path);
      if (!result.ok) {
        await Bun.sleep(1000);
        expect(await waitReady()).toBe(true);
        result = psqlFile(path);
      }
      if (!result.ok) {
        throw new Error(`${label} failed:\n${result.out}`);
      }
    }

    // GATE-style dry-run: must fail closed with DRY_RUN and leave zero package projects
    const dry = psqlFile(fixturesPath);
    expect(dry.ok).toBe(false);
    expect(dry.out).toContain("GP_L4_FIXTURE_DRY_RUN");
    const dryCount = psql(
      "select count(*)::text from public.graduation_projects where id::text like 'a4e40100-0000-4000-a500-%';",
    );
    expect(dryCount.ok).toBe(true);
    expect(dryCount.out).toMatch(/\b0\b/);

    // Execute provisioning
    const provision = psql(
      "select set_config('gp.l4_fixture.execute','true',false);\n" +
        readFileSync(fixturesPath, "utf8"),
    );
    if (!provision.ok) {
      throw new Error(`fixture provision failed:\n${provision.out}`);
    }
    expect(provision.out).toContain("GP_L4_FIXTURE_PROVISION_COMMIT");

    // Already-exists fail-closed
    const replayFail = psql(
      "select set_config('gp.l4_fixture.execute','true',false);\n" +
        readFileSync(fixturesPath, "utf8"),
    );
    expect(replayFail.ok).toBe(false);
    expect(replayFail.out).toContain("GP_L4_FIXTURE_ALREADY_EXISTS");

    // PRE_E2E fingerprint
    const preFp = psql(
      "select set_config('gp.l4_fixture.fingerprint_phase','PRE_E2E',false);\n" +
        readFileSync(fingerprintPath, "utf8"),
    );
    if (!preFp.ok) {
      throw new Error(`PRE_E2E fingerprint failed:\n${preFp.out}`);
    }
    expect(preFp.out).toContain("GP_L4_FINGERPRINT_PASS");

    // Behavioral local verifier (negatives, dual-role, download, archive)
    const behavior = psqlFile(localVerifierPath);
    if (!behavior.ok) {
      throw new Error(`local verifier failed:\n${behavior.out}`);
    }
    expect(behavior.out).toContain(
      "GP_L4_PRODUCTION_FIXTURE_PACKAGE_LOCAL_VERIFIER_PASS",
    );

    // Cleanup dry-run
    const cleanupDry = psqlFile(cleanupPath);
    expect(cleanupDry.ok).toBe(false);
    expect(cleanupDry.out).toContain("GP_L4_CLEANUP_DRY_RUN");
    expect(cleanupDry.out).toContain("GP_L4_CLEANUP_INVENTORY");

    // Package still present after dry-run
    const stillThere = psql(
      "select count(*)::text from public.graduation_projects where id::text like 'a4e40100-0000-4000-a500-%';",
    );
    expect(stillThere.out).toMatch(/\b4\b/);

    // Cleanup execute
    const cleanupLive = psql(
      "select set_config('gp.l4_fixture.cleanup_execute','true',false);\n" +
        readFileSync(cleanupPath, "utf8"),
    );
    if (!cleanupLive.ok) {
      throw new Error(`cleanup execute failed:\n${cleanupLive.out}`);
    }
    expect(cleanupLive.out).toContain("GP_L4_CLEANUP_SUCCESS");

    // POST_CLEANUP fingerprint
    const postFp = psql(
      "select set_config('gp.l4_fixture.fingerprint_phase','POST_CLEANUP',false);\n" +
        readFileSync(fingerprintPath, "utf8"),
    );
    if (!postFp.ok) {
      throw new Error(`POST_CLEANUP fingerprint failed:\n${postFp.out}`);
    }
    expect(postFp.out).toContain("POST_CLEANUP_ZERO_RESIDUE_PASS");

    // Deterministic re-provision after cleanup
    const reprovision = psql(
      "select set_config('gp.l4_fixture.execute','true',false);\n" +
        readFileSync(fixturesPath, "utf8"),
    );
    if (!reprovision.ok) {
      throw new Error(`re-provision failed:\n${reprovision.out}`);
    }
    expect(reprovision.out).toContain("GP_L4_FIXTURE_PROVISION_COMMIT");

    const preFp2 = psql(
      "select set_config('gp.l4_fixture.fingerprint_phase','PRE_E2E',false);\n" +
        readFileSync(fingerprintPath, "utf8"),
    );
    expect(preFp2.ok).toBe(true);
    expect(preFp2.out).toContain("GP_L4_FINGERPRINT_PASS");

    // Cleanup predicates must not select ordinary harness identities
    const nonTestLeak = psql(`
      select count(*)::text
      from public.graduation_projects p
      where p.id::text not like 'a4e40100-0000-4000-%'
        and coalesce(p.title,'') like '%${MARKER}%';
    `);
    expect(nonTestLeak.ok).toBe(true);
    expect(nonTestLeak.out).toMatch(/\b0\b/);
  }, 300_000);
});
