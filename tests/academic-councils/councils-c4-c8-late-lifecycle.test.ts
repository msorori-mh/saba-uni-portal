import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();

const mC3Path = join(root, "supabase", "migrations", "20260808130000_councils_c3_attendance_quorum_01.sql");
const mC4Path = join(root, "supabase", "migrations", "20260808140000_councils_c4_session_voting_01.sql");
const mC5Path = join(root, "supabase", "migrations", "20260808150000_councils_c5_minutes_lifecycle_01.sql");
const mC6Path = join(root, "supabase", "migrations", "20260808160000_councils_c6_decisions_followup_01.sql");
const mC7Path = join(root, "supabase", "migrations", "20260808170000_councils_c7_audit_archive_01.sql");

const createPath = join(root, "supabase", "migrations", "20260703192337_3ef2f7b2-cf46-4407-9f1a-60c25b46c211.sql");
const hardenPath = join(root, "supabase", "migrations", "20260703194033_cccf45a9-50ed-4a72-bb11-7e5d1627b5a2.sql");
const historyPath = join(root, "supabase", "migrations", "20260704200326_b0736829-500e-456c-aa9b-6dc7ccd10012.sql");
const schedulePath = join(root, "supabase", "migrations", "20260705232119_84b04a88-50be-4c5c-b9c3-11aeb54fa119.sql");

const minimalSchemaPath = join(root, "tests", "academic-councils", "postgres-minimal-schema.sql");
const c1ShimPath = join(root, "tests", "academic-councils", "postgres-c1-contract-shim.sql");
const verifierPath = join(root, "tests", "academic-councils", "postgres-c4-c8-verifier.sql");

const migrationC4 = readFileSync(mC4Path, "utf8");
const migrationC5 = readFileSync(mC5Path, "utf8");
const migrationC6 = readFileSync(mC6Path, "utf8");
const migrationC7 = readFileSync(mC7Path, "utf8");
const verifier = readFileSync(verifierPath, "utf8");

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
    { input: sql, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }
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
      { encoding: "utf8" }
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

describe("Academic Councils C4-C8 Late Lifecycle & Governance Suite", () => {
  it("ships forward-only C4-C7 migrations without production apply", () => {
    for (const m of [migrationC4, migrationC5, migrationC6, migrationC7]) {
      expect(m).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
      expect(m).toContain("SET search_path = public, pg_temp");
      expect(m).toContain("SECURITY DEFINER");
    }

    // C4 session & voting checks
    expect(migrationC4).toContain("open_council_session");
    expect(migrationC4).toContain("cast_council_vote");
    expect(migrationC4).toContain("COUNCIL_C1_TRANSITION_CONTRACT_ABSENT");
    expect(migrationC4).toContain("COUNCIL_CHAIR_AUTHORITY_REQUIRED");

    // C5 minutes & lock guard checks
    expect(migrationC5).toContain("approve_and_lock_council_minutes");
    expect(migrationC5).toContain("trg_ac_minutes_lock_guard");
    expect(migrationC5).toContain("COUNCIL_MINUTES_LOCKED_DELETE_DENIED");
    expect(migrationC5).toContain("academic_council_minutes_amendments");

    // C6 decisions & follow-up checks
    expect(migrationC6).toContain("issue_council_decision");
    expect(migrationC6).toContain("update_council_decision_followup");
    expect(migrationC6).toContain("COUNCIL_DECISION_LOCKED_IMMUTABLE");

    // C7 audit & archive checks
    expect(migrationC7).toContain("academic_council_audit_events");
    expect(migrationC7).toContain("archive_council_meeting");
    expect(migrationC7).toContain("get_council_archive_summary");
    expect(migrationC7).toContain("get_council_historical_minutes");
  });

  it("launches disposable PG17 and validates the complete C4-C8 verifier matrix", async () => {
    if (!dockerReady) {
      throw new Error("docker is required for the PG17 disposable harness");
    }

    teardownContainer();
    execSync(
      `docker run -d --name ${container} -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17`,
      { stdio: "ignore" }
    );

    const ready = await waitReady();
    expect(ready).toBe(true);
    await Bun.sleep(1000);
    const settled = await waitReady();
    expect(settled).toBe(true);

    const pipeline = [
      ["minimal-schema", minimalSchemaPath],
      ["councils-create", createPath],
      ["councils-harden-anon", hardenPath],
      ["councils-history", historyPath],
      ["councils-schedule-helper", schedulePath],
      ["councils-c3-attendance-quorum", mC3Path],
      ["councils-c1-shim", c1ShimPath],
      ["councils-c4-session-voting", mC4Path],
      ["councils-c5-minutes-lifecycle", mC5Path],
      ["councils-c6-decisions-followup", mC6Path],
      ["councils-c7-audit-archive", mC7Path],
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

    const verifierCheck = psqlFile(verifierPath);
    if (!verifierCheck.ok) {
      throw new Error(`C4-C8 verifier failed:\n${verifierCheck.out}`);
    }

    for (const notice of [
      "DIRECT_WRITE_DENIED_ZERO_MUTATION",
      "SESSION_OPEN_NEGATIVE_MATRIX_PASS",
      "SESSION_OPENED_SUCCESS",
      "SESSION_CLOSED_SUCCESS",
      "MINUTES_LOCKED_SUCCESS",
      "LOCKED_MINUTES_IMMUTABILITY_PASS",
      "DECISION_FOLLOWUP_PASS",
      "C7_ARCHIVE_READ_MODELS_PASS",
      "ACADEMIC_COUNCILS_C4_C8_VERIFIER_PASS",
    ]) {
      expect(verifierCheck.out).toContain(notice);
    }
  }, 180_000);
});
