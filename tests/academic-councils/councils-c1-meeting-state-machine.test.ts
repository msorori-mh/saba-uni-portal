import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();
const migrationPath = join(
  root,
  "supabase",
  "migrations",
  "20260808121000_councils_c1_meeting_state_machine_01.sql",
);
const c0MigrationPath = join(
  root,
  "supabase",
  "migrations",
  "20260808120000_councils_c0_write_surface_hardening_01.sql",
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
  "postgres-c1-meeting-state-machine-verifier.sql",
);
const adminFnPath = join(root, "src", "lib", "admin-councils.functions.ts");

const migration = readFileSync(migrationPath, "utf8");
const verifier = readFileSync(verifierPath, "utf8");
const adminFn = readFileSync(adminFnPath, "utf8");

const container = `councils-c1-sm-${Date.now()}`;

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

describe("Academic Councils C1 meeting state machine", () => {
  it("ships a forward-only transition RPC migration without production apply", () => {
    expect(migration).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
    expect(migration).toContain("minutes_review");
    expect(migration).toContain("AFTER 'minutes_draft'");
    expect(migration).toContain("academic_council_meeting_transition_events");
    expect(migration).toContain("council_meeting_transition_is_legal");
    expect(migration).toContain("council_transition_meeting");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("p_expected_status");
    expect(migration).toContain("COUNCIL_MEETING_STALE_STATE");
    expect(migration).toContain("meeting_has_valid_quorum");
    expect(migration).toContain("COUNCIL_QUORUM_GATE_UNAVAILABLE");
    expect(migration).toContain("COUNCIL_QUORUM_NOT_MET");
    expect(migration).toContain("can_schedule_council_meeting");
    expect(migration).toContain("COUNCIL_MEETING_STATUS_RPC_ONLY");
    expect(migration).toContain("fail-closed");
    expect(migration).not.toMatch(/DROP\s+POLICY/i);
    expect(migration).not.toMatch(/DROP\s+TABLE/i);
    expect(migration).not.toMatch(/TRUNCATE/i);
    expect(migration).not.toMatch(/TO\s+anon\b/i);
    expect(migration).toMatch(/SET search_path = public, pg_temp/);
    expect(migration).toContain("council_require_auth_uid");
    // Chair-only authority — no admin/dean/secretary automatic transition grant.
    const transitionBody = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.council_transition_meeting"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.council_update_meeting_metadata"),
    );
    expect(transitionBody).toContain("can_schedule_council_meeting");
    expect(transitionBody).not.toMatch(/is_council_admin\s*\(/);
    expect(transitionBody).toContain("COUNCIL_TRANSITION_DENIED");
  });

  it("rewires finalize to approve-only and exposes transitionCouncilMeeting", () => {
    expect(adminFn).toContain("transitionCouncilMeeting");
    expect(adminFn).toContain("council_transition_meeting");
    expect(adminFn).toContain("minutes_review");
    expect(adminFn).toContain("council_finalize_meeting_agenda");
    const finalizeSlice = adminFn.slice(
      adminFn.indexOf("export const finalizeMeetingAgenda"),
      adminFn.length,
    );
    expect(finalizeSlice).not.toMatch(/status:\s*"agenda_ready"/);
    const updateSlice = adminFn.slice(
      adminFn.indexOf("export const updateCouncilMeeting"),
      adminFn.indexOf("export const getAgendaItemsForMeeting"),
    );
    expect(updateSlice).not.toMatch(/p_status:\s*data\.status/);
  });

  it("ships a transactional PG17 verifier for legal/illegal transitions", () => {
    expect(verifier).toMatch(/^\s*begin;/im);
    expect(verifier).toMatch(/^\s*rollback;/im);
    expect(verifier).not.toMatch(/^\s*commit;/im);
    for (const fragment of [
      "HAPPY_PATH_TO_AGENDA_READY",
      "QUORUM_GATE_FAIL_CLOSED",
      "DENIED_ACTOR_ZERO_MUTATION",
      "ILLEGAL_EDGE_ZERO_MUTATION",
      "STALE_CONCURRENT_DENIED",
      "CANCEL_ONLY_BEFORE_IN_SESSION",
      "ACADEMIC_COUNCILS_C1_MEETING_STATE_MACHINE_VERIFIER_PASS",
      "assert_zero_mutation",
      "meeting_has_valid_quorum",
      "minutes_review",
      "STALE_EXPECTED",
      "STALE_CONCURRENT",
    ]) {
      expect(verifier).toContain(fragment);
    }
  });

  it("launches disposable PG17 and proves the C0→C1 meeting state machine chain", async () => {
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
      ["councils-c0-hardening", c0MigrationPath],
      ["councils-c1-state-machine", migrationPath],
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
      "councils-c0-hardening",
      "councils-c1-state-machine",
    ]);

    const noticeCheck = psqlFile(verifierPath);
    if (!noticeCheck.ok) {
      throw new Error(`C1 verifier failed:\n${noticeCheck.out}`);
    }
    expect(noticeCheck.out).toContain("HAPPY_PATH_TO_AGENDA_READY");
    expect(noticeCheck.out).toContain("QUORUM_GATE_FAIL_CLOSED");
    expect(noticeCheck.out).toContain("DENIED_ACTOR_ZERO_MUTATION");
    expect(noticeCheck.out).toContain("STALE_CONCURRENT_DENIED");
    expect(noticeCheck.out).toContain("CANCEL_ONLY_BEFORE_IN_SESSION");
    expect(noticeCheck.out).toContain(
      "ACADEMIC_COUNCILS_C1_MEETING_STATE_MACHINE_VERIFIER_PASS",
    );
  }, 180_000);
});
