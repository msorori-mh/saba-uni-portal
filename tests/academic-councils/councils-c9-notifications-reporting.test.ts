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
  c9: join(root, "supabase/migrations/20260808180000_councils_c9_notifications_reporting_01.sql"),
  verifier: join(root, "tests/academic-councils/postgres-c9-notifications-reporting-verifier.sql"),
};

const migrationC9 = readFileSync(paths.c9, "utf8");
const verifier = readFileSync(paths.verifier, "utf8");

const container = `councils-c9-${Date.now()}`;

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

describe("Academic Councils C9 Notifications and Reporting", () => {
  it("ships forward-only C9 migration with required markers", () => {
    expect(migrationC9).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
    expect(migrationC9).toContain("SET search_path = public, pg_temp");
    expect(migrationC9).toContain("SECURITY DEFINER");
    expect(migrationC9).toContain("academic_council_notifications");
    expect(migrationC9).toContain("get_my_council_notifications");
    expect(migrationC9).toContain("acknowledge_council_notification");
    expect(migrationC9).toContain("get_council_report_meetings_by_period");
    expect(migrationC9).toContain("get_council_chair_dashboard");
    expect(migrationC9).toContain("get_council_secretary_dashboard");
    expect(migrationC9).toContain("get_council_responsible_decisions");
    expect(migrationC9).toContain("COUNCIL_RESPONSIBLE_DECISIONS_IMPERSONATION_DENIED");
    expect(migrationC9).toContain("INTERNAL_ONLY");
    expect(migrationC9).toContain("C9_INTERNAL_RPC_ACL_UNEXPECTED");
    expect(migrationC9).toContain(
      "REVOKE ALL ON FUNCTION public.create_council_notification(uuid, text, uuid, uuid, text, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated",
    );
    expect(migrationC9).toContain(
      "REVOKE ALL ON FUNCTION public.dispatch_council_notification(text, uuid, uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated",
    );
    expect(migrationC9).not.toContain(
      "GRANT EXECUTE ON FUNCTION public.create_council_notification(uuid, text, uuid, uuid, text, uuid, text, text, jsonb) TO authenticated, service_role",
    );
    expect(migrationC9).toContain(
      "GRANT EXECUTE ON FUNCTION public.create_council_notification(uuid, text, uuid, uuid, text, uuid, text, text, jsonb) TO service_role",
    );
  });

  it("verifier proves C9 auth matrix and zero mutation", () => {
    expect(verifier).toContain("C9_OBJECTS_PRESENT");
    expect(verifier).toContain("NOTIFICATION_READ_ACK_PASS");
    expect(verifier).toContain("AUTHORIZATION_MATRIX_PASS");
    expect(verifier).toContain("ZERO_MUTATION_DENIALS_COUNTED");
    expect(verifier).toContain("REPORTS_SHAPE_PASS");
    expect(verifier).toContain("DASHBOARDS_SHAPE_PASS");
    expect(verifier).toContain("RESPONSIBLE_ACTOR_PII_PASS");
    expect(verifier).toContain("C9_INTERNAL_RPC_ACL_PASS");
    expect(verifier).toContain("FORGE_CREATE_");
    expect(verifier).toContain("CROSS_USER_ACK");
    expect(verifier).toContain("ACADEMIC_COUNCILS_C9_NOTIFICATIONS_REPORTING_VERIFIER_PASS");
    expect(verifier).toMatch(/^\s*begin;/im);
    expect(verifier).toMatch(/^\s*rollback;/im);
  });

  it("launches disposable PG17 and validates full C0→C9 chain", async () => {
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
      ["councils-c9", paths.c9],
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

    const verifierCheck = psqlFile(paths.verifier);
    if (!verifierCheck.ok) {
      throw new Error(`C9 verifier failed:\n${verifierCheck.out}`);
    }

    for (const notice of [
      "C9_OBJECTS_PRESENT",
      "NOTIFICATION_READ_ACK_PASS",
      "AUTHORIZATION_MATRIX_PASS",
      "ZERO_MUTATION_DENIALS_COUNTED",
      "REPORTS_SHAPE_PASS",
      "DASHBOARDS_SHAPE_PASS",
      "RESPONSIBLE_ACTOR_PII_PASS",
      "ACADEMIC_COUNCILS_C9_NOTIFICATIONS_REPORTING_VERIFIER_PASS",
    ]) {
      expect(verifierCheck.out).toContain(notice);
    }
  }, 300_000);
});
