import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();

const paths = {
  minimal: join(root, "tests/academic-councils/postgres-minimal-schema.sql"),
  create: join(root, "supabase/migrations/20260703192337_3ef2f7b2-cf46-4407-9f1a-60c25b46c211.sql"),
  harden: join(root, "supabase/migrations/20260703194033_cccf45a9-50ed-4a72-bb11-7e5d1627b5a2.sql"),
  history: join(root, "supabase/migrations/20260704200326_b0736829-500e-456c-aa9b-6dc7ccd10012.sql"),
  schedule: join(root, "supabase/migrations/20260705232119_84b04a88-50be-4c5c-b9c3-11aeb54fa119.sql"),
  c0: join(root, "supabase/migrations/20260808120000_councils_c0_write_surface_hardening_01.sql"),
  c1: join(root, "supabase/migrations/20260808121000_councils_c1_meeting_state_machine_01.sql"),
  c2: join(root, "supabase/migrations/20260808122000_councils_c2_topic_intake_review_01.sql"),
  c3: join(root, "supabase/migrations/20260808130000_councils_c3_attendance_quorum_01.sql"),
  c4: join(root, "supabase/migrations/20260808140000_councils_c4_session_voting_01.sql"),
  c5: join(root, "supabase/migrations/20260808150000_councils_c5_minutes_lifecycle_01.sql"),
  c6: join(root, "supabase/migrations/20260808160000_councils_c6_decisions_followup_01.sql"),
  c7: join(root, "supabase/migrations/20260808170000_councils_c7_audit_archive_01.sql"),
  closure: join(root, "supabase/migrations/20260808171000_councils_c0_c8_final_security_closure_01.sql"),
  verifier: join(root, "tests/academic-councils/postgres-c4-c8-verifier.sql"),
  shim: join(root, "tests/academic-councils/postgres-c1-contract-shim.sql"),
};

const migrationC4 = readFileSync(paths.c4, "utf8");
const migrationC5 = readFileSync(paths.c5, "utf8");
const migrationC6 = readFileSync(paths.c6, "utf8");
const migrationC7 = readFileSync(paths.c7, "utf8");
const migrationClosure = readFileSync(paths.closure, "utf8");
const migrationC1 = readFileSync(paths.c1, "utf8");
const verifier = readFileSync(paths.verifier, "utf8");
const shim = readFileSync(paths.shim, "utf8");

const container = `councils-c4c8-${Date.now()}`;

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

afterAll(() => {
  teardownContainer();
});

describe("Academic Councils C4-C8 Final Integration (real C0-C7)", () => {
  it("ships forward-only C4-C7 migrations wired to real C1 (no shim contract)", () => {
    for (const m of [migrationC4, migrationC5, migrationC6, migrationC7]) {
      expect(m).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
      expect(m).toContain("SET search_path = public, pg_temp");
      expect(m).toContain("SECURITY DEFINER");
    }

    expect(migrationC1).toContain("council_transition_meeting");
    expect(migrationC1).toContain("council_meeting_transition_is_legal");

    expect(migrationC4).toContain("open_council_session");
    expect(migrationC4).toContain("cast_council_vote");
    expect(migrationC4).toContain("COUNCIL_C1_TRANSITION_CONTRACT_ABSENT");
    expect(migrationC4).toContain("council_transition_meeting");
    expect(migrationC4).toContain("council_meeting_transition_is_legal");
    expect(migrationC4).toContain("COUNCIL_CHAIR_AUTHORITY_REQUIRED");
    // Real C1 assert must not accept the shim-only function as sufficient.
    expect(migrationC4).toMatch(
      /Test-only shims \(e\.g\. can_transition_council_meeting_state\) are NOT accepted/,
    );

    expect(migrationC5).toContain("approve_and_lock_council_minutes");
    expect(migrationC5).toContain("trg_ac_minutes_lock_guard");
    expect(migrationC5).toContain("COUNCIL_MINUTES_LOCKED_DELETE_DENIED");
    expect(migrationC5).toContain("academic_council_minutes_amendments");
    expect(migrationC5).toContain("minutes_review");

    expect(migrationC6).toContain("issue_council_decision");
    expect(migrationC6).toContain("update_council_decision_followup");
    expect(migrationC6).toContain("COUNCIL_DECISION_LOCKED_IMMUTABLE");

    expect(migrationC7).toContain("academic_council_audit_events");
    expect(migrationC7).toContain("archive_council_meeting");
    expect(migrationC7).toContain("get_council_archive_summary");
    expect(migrationC7).toContain("get_council_historical_minutes");

    expect(migrationClosure).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
    expect(migrationClosure).toContain("cast_council_vote");
    expect(migrationClosure).toContain("FOR UPDATE");
    expect(migrationClosure).toContain("council_decision_transition_is_legal");
    expect(migrationClosure).toContain("COUNCIL_DECISION_SOURCE_MEETING_MISMATCH");
    expect(migrationClosure).toContain("COUNCIL_DECISION_FSM_TRANSITION_DENIED");
    expect(migrationClosure).toContain("unresolved decision follow-up");
    expect(migrationClosure).toContain("trg_ac_archived_decisions_guard");

    // Shim may remain as isolated unit artifact but must not be the C1 contract.
    expect(shim).toContain("TEST_ONLY");
    expect(shim).toContain("can_transition_council_meeting_state");
  });

  it("verifier proves real C1+C3+C4 integration markers", () => {
    expect(verifier).toContain("REAL_C1_CONTRACT_PRESENT");
    expect(verifier).toContain("POSITIVE_FULL_LIFECYCLE_PASS");
    expect(verifier).toContain("AUTHORIZATION_MATRIX_PASS");
    expect(verifier).toContain("VOTING_SECURITY_PASS");
    expect(verifier).toContain("MINUTES_IMMUTABILITY_PASS");
    expect(verifier).toContain("DECISION_FOLLOWUP_PASS");
    expect(verifier).toContain("H2_DECISION_SOURCE_INTEGRITY_PASS");
    expect(verifier).toContain("H3_DECISION_FSM_PASS");
    expect(verifier).toContain("H4_ARCHIVE_FOLLOWUP_PASS");
    expect(verifier).toContain("ARCHIVE_IMMUTABILITY_PASS");
    expect(verifier).toContain("CONCURRENCY_PASS");
    expect(verifier).toContain("deny_zero");
    expect(verifier).toContain("ACADEMIC_COUNCILS_C4_C8_VERIFIER_PASS");
    expect(verifier).not.toMatch(/postgres-c1-contract-shim/i);
    expect(verifier).toMatch(/^\s*begin;/im);
    expect(verifier).toMatch(/^\s*rollback;/im);
    // Static contract: every deny_zero label is paired with fingerprint equality.
    expect(verifier).toContain("_MUTATED_STATE");
    expect(verifier).toContain("pg_temp.deny_zero");
  });

  it("launches disposable PG17 and validates full C0→C7 chain without C1 shim", async () => {
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

    const pipeline = [
      ["minimal-schema", paths.minimal],
      ["councils-create", paths.create],
      ["councils-harden-anon", paths.harden],
      ["councils-history", paths.history],
      ["councils-schedule-helper", paths.schedule],
      ["councils-c0", paths.c0],
      ["councils-c1-real", paths.c1],
      ["councils-c2", paths.c2],
      ["councils-c3", paths.c3],
      ["councils-c4", paths.c4],
      ["councils-c5", paths.c5],
      ["councils-c6", paths.c6],
      ["councils-c7", paths.c7],
      ["councils-c0-c8-security-closure", paths.closure],
    ] as const;

    const applied: string[] = [];
    for (const [label, path] of pipeline) {
      let result = psqlFile(path);
      if (!result.ok) {
        await Bun.sleep(1000);
        if (!(await waitReady())) {
          throw new Error(`${label} failed (postgres not ready):\n${result.out}`);
        }
        result = psqlFile(path);
      }
      if (!result.ok) {
        throw new Error(`${label} failed:\n${result.out}`);
      }
      applied.push(label);
    }

    expect(applied).toHaveLength(pipeline.length);
    expect(applied).not.toContain("councils-c1-shim");

    // Prove real C1 is loaded and shim contract is absent.
    const contractProbe = psql(`
      select
        to_regprocedure('public.council_transition_meeting(uuid,public.academic_council_meeting_status,public.academic_council_meeting_status,jsonb)') is not null as has_c1_rpc,
        to_regprocedure('public.can_transition_council_meeting_state(uuid,text)') is null as shim_absent;
    `);
    expect(contractProbe.ok).toBe(true);
    expect(contractProbe.out).toMatch(/t\s*\|\s*t/);

    const verifierCheck = psqlFile(paths.verifier);
    if (!verifierCheck.ok) {
      throw new Error(`C4-C8 verifier failed:\n${verifierCheck.out}`);
    }

    for (const notice of [
      "REAL_C1_CONTRACT_PRESENT",
      "POSITIVE_FULL_LIFECYCLE_PASS",
      "AUTHORIZATION_MATRIX_PASS",
      "VOTING_SECURITY_PASS",
      "MINUTES_IMMUTABILITY_PASS",
      "DECISION_FOLLOWUP_PASS",
      "H2_DECISION_SOURCE_INTEGRITY_PASS",
      "H3_DECISION_FSM_PASS",
      "H4_ARCHIVE_FOLLOWUP_PASS",
      "ARCHIVE_IMMUTABILITY_PASS",
      "CONCURRENCY_PASS",
      "ZERO_MUTATION_DENIALS_COUNTED",
      "ACADEMIC_COUNCILS_C4_C8_VERIFIER_PASS",
    ]) {
      expect(verifierCheck.out).toContain(notice);
    }
  }, 300_000);
});
