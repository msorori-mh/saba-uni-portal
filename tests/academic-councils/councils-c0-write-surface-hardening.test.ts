import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();
const migrationPath = join(
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
  "postgres-c0-write-surface-verifier.sql",
);
const adminFnPath = join(root, "src", "lib", "admin-councils.functions.ts");
const facultyFnPath = join(root, "src", "lib", "faculty-councils.functions.ts");

const migration = readFileSync(migrationPath, "utf8");
const verifier = readFileSync(verifierPath, "utf8");
const adminFn = readFileSync(adminFnPath, "utf8");
const facultyFn = readFileSync(facultyFnPath, "utf8");

const container = `councils-c0-ws-${Date.now()}`;

const dockerReady = (() => {
  try {
    execSync("docker --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const RPCS = [
  "council_link_membership",
  "council_deactivate_membership",
  "council_schedule_meeting",
  "council_update_meeting_metadata",
  "council_submit_topic",
  "council_update_own_topic_draft",
  "council_review_topic",
  "council_add_topic_to_agenda",
  "council_add_manual_agenda_item",
  "council_update_agenda_item",
  "council_reorder_agenda_items",
  "council_finalize_meeting_agenda",
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

describe("Academic Councils C0 write-surface hardening", () => {
  it("ships a forward-only revoke + RPC migration without production apply", () => {
    expect(migration).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE ON TABLE public.academic_councils");
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE ON TABLE public.academic_council_topics");
    expect(migration).toContain("GRANT SELECT ON TABLE public.academic_councils TO authenticated");
    expect(migration).not.toMatch(/GRANT\s+INSERT/i);
    expect(migration).not.toMatch(/TO\s+anon\b/i);
    for (const name of RPCS) {
      expect(migration).toContain(`FUNCTION public.${name}(`);
      expect(migration).toContain(`SET search_path = public, pg_temp`);
    }
    expect(migration).toContain("council_require_auth_uid");
    expect(migration).toContain("auth.uid()");
  });

  it("removes system_admin/admin academic bypass from operational helpers", () => {
    const agendaStart = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.can_write_council_agenda",
    );
    const scheduleStart = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.can_schedule_council_meeting",
    );
    const manageStart = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.can_manage_council",
    );
    const agendaBody = migration.slice(agendaStart, scheduleStart);
    const scheduleBody = migration.slice(scheduleStart, manageStart);
    expect(agendaBody).not.toMatch(/is_council_admin\s*\(/);
    expect(scheduleBody).not.toMatch(/is_council_admin\s*\(/);
    expect(agendaBody).toContain("has_council_role");
    expect(scheduleBody).toContain("'chair'");
    const manage = migration.slice(
      manageStart,
      migration.indexOf("REVOKE ALL ON FUNCTION public.can_write_council_agenda"),
    );
    expect(manage).toContain("is_council_admin");
  });

  it("pins topic owner draft allowlist and rejects immutable field mutation surface", () => {
    const draft = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.council_update_own_topic_draft"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.council_review_topic"),
    );
    expect(draft).toContain("title");
    expect(draft).toContain("body");
    expect(draft).toContain("category");
    expect(draft).toContain("COUNCIL_TOPIC_OWNER_DENIED");
    expect(draft).not.toMatch(/SET\s+council_id\s*=/i);
    expect(draft).not.toMatch(/SET\s+meeting_id\s*=/i);
    expect(draft).not.toMatch(/SET\s+status\s*=/i);
    expect(draft).not.toMatch(/SET\s+submitted_by\s*=/i);
    expect(draft).not.toMatch(/SET\s+reviewed_by\s*=/i);
  });

  it("rewires app writers to action RPCs and drops admin academic fallbacks", () => {
    expect(adminFn).toContain("council_link_membership");
    expect(adminFn).toContain("council_deactivate_membership");
    expect(adminFn).toContain("council_schedule_meeting");
    expect(adminFn).toContain("council_update_meeting_metadata");
    expect(adminFn).toContain("council_review_topic");
    expect(adminFn).toContain("council_add_topic_to_agenda");
    expect(adminFn).toContain("council_finalize_meeting_agenda");
    expect(adminFn).toContain("never treat system_admin/admin as academic authority");
    expect(facultyFn).toContain("council_submit_topic");
    expect(adminFn).not.toMatch(
      /\.from\("academic_council_topics"\)\s*\n\s*\.update/,
    );
    expect(adminFn).not.toMatch(
      /\.from\("academic_council_meetings"\)\s*\n\s*\.insert/,
    );
    expect(facultyFn).not.toMatch(
      /\.from\("academic_council_topics"\)\s*\n\s*\.insert/,
    );
  });

  it("ships a transactional PG17 negative/positive verifier matrix", () => {
    expect(verifier).toMatch(/^\s*begin;/im);
    expect(verifier).toMatch(/^\s*rollback;/im);
    expect(verifier).not.toMatch(/^\s*commit;/im);
    for (const fragment of [
      "DIRECT_WRITE_DENIED_ZERO_MUTATION",
      "NEGATIVE_MATRIX_ZERO_MUTATION",
      "ADMIN_BYPASS_VERDICT_REMOVED",
      "TOPIC_OWNER_ALLOWLIST_PASS",
      "ACADEMIC_COUNCILS_C0_WRITE_SURFACE_HARDENING_VERIFIER_PASS",
      "ADMINISH_REVIEW",
      "OTHER_CHAIR_REVIEW",
      "SECRETARY_FINALIZE",
      "VIEWER_SUBMIT",
      "OWNER_DRAFT_ON_SUBMITTED",
      "assert_zero_mutation",
    ]) {
      expect(verifier).toContain(fragment);
    }
  });

  it("launches disposable PG17 and proves the C0 write-surface chain", async () => {
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
      ["councils-c0-hardening", migrationPath],
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
    ]);

    const noticeCheck = psqlFile(verifierPath);
    if (!noticeCheck.ok) {
      throw new Error(`C0 verifier failed:\n${noticeCheck.out}`);
    }
    expect(noticeCheck.out).toContain("DIRECT_WRITE_DENIED_ZERO_MUTATION");
    expect(noticeCheck.out).toContain("NEGATIVE_MATRIX_ZERO_MUTATION");
    expect(noticeCheck.out).toContain("ADMIN_BYPASS_VERDICT_REMOVED");
    expect(noticeCheck.out).toContain("TOPIC_OWNER_ALLOWLIST_PASS");
    expect(noticeCheck.out).toContain(
      "ACADEMIC_COUNCILS_C0_WRITE_SURFACE_HARDENING_VERIFIER_PASS",
    );
  }, 180_000);
});
