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
const mC9Path = join(root, "supabase", "migrations", "20260808180000_councils_c9_notifications_reports_ux_01.sql");

const createPath = join(root, "supabase", "migrations", "20260703192337_3ef2f7b2-cf46-4407-9f1a-60c25b46c211.sql");
const hardenPath = join(root, "supabase", "migrations", "20260703194033_cccf45a9-50ed-4a72-bb11-7e5d1627b5a2.sql");
const historyPath = join(root, "supabase", "migrations", "20260704200326_b0736829-500e-456c-aa9b-6dc7ccd10012.sql");
const schedulePath = join(root, "supabase", "migrations", "20260705232119_84b04a88-50be-4c5c-b9c3-11aeb54fa119.sql");

const minimalSchemaPath = join(root, "tests", "academic-councils", "postgres-minimal-schema.sql");
const c1ShimPath = join(root, "tests", "academic-councils", "postgres-c1-contract-shim.sql");
const verifierPath = join(root, "tests", "academic-councils", "postgres-c9-notifications-reports-ux-verifier.sql");

const migrationC9 = readFileSync(mC9Path, "utf8");
const verifier = readFileSync(verifierPath, "utf8");

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

describe("Academic Councils C9 Notifications, Reports, and Operational UX Suite", () => {
  it("ships forward-only C9 migration without production apply", () => {
    expect(migrationC9).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
    expect(migrationC9).toContain("SET search_path = public, pg_temp");
    expect(migrationC9).toContain("SECURITY DEFINER");

    // Notification foundation
    expect(migrationC9).toContain("academic_council_notifications");
    expect(migrationC9).toContain("academic_council_notification_outbox");
    expect(migrationC9).toContain("get_my_council_notifications");
    expect(migrationC9).toContain("mark_council_notification_read");

    // Reports
    expect(migrationC9).toContain("get_council_report_meeting_summary");
    expect(migrationC9).toContain("get_council_report_attendance_rate");
    expect(migrationC9).toContain("get_council_report_quorum_history");
    expect(migrationC9).toContain("get_council_report_topic_disposition");
    expect(migrationC9).toContain("get_council_report_agenda_completion");
    expect(migrationC9).toContain("get_council_report_voting_summary");
    expect(migrationC9).toContain("get_council_report_decision_status");
    expect(migrationC9).toContain("get_council_report_decision_overdue");
    expect(migrationC9).toContain("get_council_report_meeting_archive");
    expect(migrationC9).toContain("get_council_activity_period");

    // Dashboards
    expect(migrationC9).toContain("get_council_chair_dashboard");
    expect(migrationC9).toContain("get_council_secretary_dashboard");
    expect(migrationC9).toContain("get_council_member_dashboard");
    expect(migrationC9).toContain("get_council_admin_operational_dashboard");

    // Arabic safety
    expect(migrationC9).toContain("build_council_notification_message");
  });

  it("launches disposable PG17 and validates the C9 verifier matrix", async () => {
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
      ["councils-c9-notifications-reports-ux", mC9Path],
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
      throw new Error(`C9 verifier failed:\n${verifierCheck.out}`);
    }

    for (const notice of [
      "NOTIFICATION_RECIPIENT_SCOPE_PASS",
      "CROSS_COUNCIL_DENIAL_PASS",
      "READ_UNREAD_OWNERSHIP_PASS",
      "REPORT_AUTHORIZATION_PASS",
      "CHAIR_DASHBOARD_PASS",
      "SECRETARY_DASHBOARD_PASS",
      "MEMBER_READ_PASS",
      "VIEWER_MUTATION_ABSENCE_PASS",
      "ADMIN_ACADEMIC_ACTION_ABSENCE_PASS",
      "ARABIC_ERROR_MAPPING_PASS",
      "DUE_DATE_NOTIFICATION_PASS",
      "ACADEMIC_COUNCILS_C9_NOTIFICATIONS_REPORTS_UX_VERIFIER_PASS",
    ]) {
      expect(verifierCheck.out).toContain(notice);
    }
  }, 240_000);
});
