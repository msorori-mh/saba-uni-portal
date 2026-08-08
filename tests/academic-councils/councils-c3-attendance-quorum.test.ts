import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();
const migrationPath = join(
  root,
  "supabase",
  "migrations",
  "20260808130000_councils_c3_attendance_quorum_01.sql",
);
const createPath = join(
  root,
  "supabase",
  "migrations",
  "20260703192337_3ef2f7b2-cf46-4407-9f1a-60c25b46c211.sql",
);
const hardenPath = join(
  root,
  "supabase",
  "migrations",
  "20260703194033_cccf45a9-50ed-4a72-bb11-7e5d1627b5a2.sql",
);
const historyPath = join(
  root,
  "supabase",
  "migrations",
  "20260704200326_b0736829-500e-456c-aa9b-6dc7ccd10012.sql",
);
const schedulePath = join(
  root,
  "supabase",
  "migrations",
  "20260705232119_84b04a88-50be-4c5c-b9c3-11aeb54fa119.sql",
);
const minimalSchemaPath = join(
  root,
  "tests",
  "academic-councils",
  "postgres-minimal-schema.sql",
);
const verifierPath = join(
  root,
  "tests",
  "academic-councils",
  "postgres-c3-attendance-quorum-verifier.sql",
);

const migration = readFileSync(migrationPath, "utf8");
const verifier = readFileSync(verifierPath, "utf8");

const container = `councils-c3-aq-${Date.now()}`;

const dockerReady = (() => {
  try {
    execSync("docker --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const RPCS = [
  "council_approve_quorum_policy",
  "record_council_meeting_attendance",
  "evaluate_council_meeting_quorum",
  "finalize_council_meeting_attendance",
  "meeting_has_valid_quorum",
] as const;

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

describe("Academic Councils C3 attendance and quorum foundation", () => {
  it("ships a forward-only attendance/quorum migration without production apply", () => {
    expect(migration).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
    expect(migration).toContain("academic_council_quorum_policies");
    expect(migration).toContain("academic_council_meeting_attendance");
    expect(migration).toContain("academic_council_meeting_quorum_evaluations");
    expect(migration).toContain("academic_council_attendance_audit_events");
    expect(migration).toContain("REVOKE ALL ON TABLE public.academic_council_meeting_attendance");
    expect(migration).toContain("GRANT SELECT ON TABLE public.academic_council_meeting_attendance");
    expect(migration).not.toMatch(/GRANT\s+INSERT/i);
    expect(migration).toContain("Non-goals");
    expect(migration).toContain("Proxy voting/attendance");
    expect(migration).not.toMatch(/CREATE TYPE[\s\S]*proxy/i);
    expect(migration).not.toMatch(/attendance_state[\s\S]*proxy/i);
    for (const name of RPCS) {
      expect(migration).toContain(`FUNCTION public.${name}(`);
      expect(migration).toContain(`SET search_path = public, pg_temp`);
    }
    expect(migration).toContain("'present'");
    expect(migration).toContain("'present_remote'");
    expect(migration).toContain("'excused'");
    expect(migration).toContain("'absent'");
    expect(migration).toContain("COUNCIL_QUORUM_POLICY_REQUIRED");
    expect(migration).toContain("in_session");
  });

  it("keeps quorum evaluation server-side and fail-closed without approved policy", () => {
    expect(migration).toContain("meeting_has_valid_quorum");
    expect(migration).toContain("council_current_approved_quorum_policy");
    expect(migration).toContain("council_compute_required_member_count");
    expect(migration).not.toMatch(/p_quorum_met/);
    expect(migration).not.toMatch(/client.?provided.?quorum/i);
    const gate = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.meeting_has_valid_quorum"),
      migration.indexOf("REVOKE ALL ON FUNCTION public.council_approve_quorum_policy"),
    );
    expect(gate).toContain("RETURN false");
    expect(gate).toContain("is_final");
    expect(gate).toContain("quorum_met");
  });

  it("assigns secretary record and chair finalize authorities without admin bypass", () => {
    const record = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.record_council_meeting_attendance"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.evaluate_council_meeting_quorum"),
    );
    const finalize = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.finalize_council_meeting_attendance"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.meeting_has_valid_quorum"),
    );
    const policy = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.council_approve_quorum_policy"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.record_council_meeting_attendance"),
    );
    expect(record).toContain("'secretary'");
    expect(record).not.toMatch(/is_council_admin\s*\(/);
    expect(finalize).toContain("'chair'");
    expect(finalize).not.toMatch(/is_council_admin\s*\(/);
    expect(policy).toContain("'chair'");
    expect(policy).not.toMatch(/is_council_admin\s*\(/);
    expect(finalize).toContain("FOR UPDATE");
  });

  it("ships a transactional PG17 verifier covering the required matrix", () => {
    expect(verifier).toMatch(/^\s*begin;/im);
    expect(verifier).toMatch(/^\s*rollback;/im);
    expect(verifier).not.toMatch(/^\s*commit;/im);
    for (const fragment of [
      "DIRECT_WRITE_DENIED_ZERO_MUTATION",
      "NO_POLICY_FAIL_CLOSED",
      "NEGATIVE_MATRIX_ZERO_MUTATION",
      "EXCUSED_ABSENT_NOT_PRESENT_REMOTE_COUNTS",
      "EXACT_THRESHOLD_QUORUM_MET",
      "EXCESS_THRESHOLD_QUORUM_MET",
      "FINALIZED_ATTENDANCE_MUTATION_DENIED",
      "INACTIVE_AFTER_MEETING_SNAPSHOT_VALID",
      "CONCURRENT_FINALIZATION_SERIALIZED",
      "IN_SESSION_IMMUTABLE_PASS",
      "AUDIT_EVIDENCE_PASS",
      "ACADEMIC_COUNCILS_C3_ATTENDANCE_QUORUM_VERIFIER_PASS",
      "assert_zero_mutation",
    ]) {
      expect(verifier).toContain(fragment);
    }
  });

  it("launches disposable PG17 and proves the C3 attendance/quorum chain", async () => {
    if (!dockerReady) {
      throw new Error("docker is required for the PG17 disposable harness");
    }

    teardownContainer();
    execSync(
      `docker run -d --name ${container} -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17`,
      { stdio: "ignore" },
    );
    const ready = await waitReady();
    expect(ready).toBe(true);
    await Bun.sleep(1000);
    const settled = await waitReady();
    expect(settled).toBe(true);

    const applied: string[] = [];
    for (const [label, path] of [
      ["minimal-schema", minimalSchemaPath],
      ["councils-create", createPath],
      ["councils-harden-anon", hardenPath],
      ["councils-history", historyPath],
      ["councils-schedule-helper", schedulePath],
      ["councils-c3-attendance-quorum", migrationPath],
    ] as const) {
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
    expect(applied).toEqual([
      "minimal-schema",
      "councils-create",
      "councils-harden-anon",
      "councils-history",
      "councils-schedule-helper",
      "councils-c3-attendance-quorum",
    ]);

    const noticeCheck = psqlFile(verifierPath);
    if (!noticeCheck.ok) {
      throw new Error(`C3 verifier failed:\n${noticeCheck.out}`);
    }
    for (const fragment of [
      "DIRECT_WRITE_DENIED_ZERO_MUTATION",
      "NO_POLICY_FAIL_CLOSED",
      "NEGATIVE_MATRIX_ZERO_MUTATION",
      "EXACT_THRESHOLD_QUORUM_MET",
      "INACTIVE_AFTER_MEETING_SNAPSHOT_VALID",
      "CONCURRENT_FINALIZATION_SERIALIZED",
      "ACADEMIC_COUNCILS_C3_ATTENDANCE_QUORUM_VERIFIER_PASS",
    ]) {
      expect(noticeCheck.out).toContain(fragment);
    }
  }, 180_000);
});
