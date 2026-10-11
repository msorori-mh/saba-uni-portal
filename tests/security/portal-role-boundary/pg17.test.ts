import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../..");
const container = `portal-role-boundary-${process.pid}-${Math.random().toString(16).slice(2, 8)}`;
const files = [
  "tests/security/portal-role-boundary/schema.sql",
  "supabase/migrations/20261011011000_document_and_grade_write_boundaries.sql",
  "supabase/migrations/20261011012000_student_request_role_boundary.sql",
  "tests/security/portal-role-boundary/matrix.sql",
  "tests/security/portal-role-boundary/acl-schema.sql",
  "supabase/migrations/20261011001000_lock_internal_account_and_schedule_rpc_execute.sql",
  "supabase/migrations/20261011002000_lock_staff_and_p1_internal_rpc_execute.sql",
  "tests/security/portal-role-boundary/acl-matrix.sql",
  "tests/security/portal-role-boundary/submission-schema.sql",
  "supabase/migrations/20261011003000_require_student_receipts_submitted_on_insert.sql",
  "supabase/migrations/20261011010000_submit_student_request_requires_workflow.sql",
  "supabase/migrations/20261011013000_verify_official_document_by_opaque_code_only.sql",
  "tests/security/portal-role-boundary/submission-matrix.sql",
];

function docker(args: string[], input?: string) {
  return spawnSync("docker", args, { encoding: "utf8", input, timeout: 90_000 });
}

test("PG17 enforces request, document, and grade role boundaries", async () => {
  try {
    const started = docker(["run", "--rm", "-d", "--name", container,
      "-e", "POSTGRES_PASSWORD=local_only", "postgres:17"]);
    expect(started.status, started.stderr).toBe(0);
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (docker(["exec", container, "pg_isready", "-U", "postgres"]).status === 0) {
        ready = true;
        break;
      }
      await Bun.sleep(250);
    }
    expect(ready).toBe(true);
    // pg_isready can see the temporary initdb server just before it restarts.
    // Require a successful query on the final server before applying fixtures.
    let queryReady = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const probe = docker(["exec", container, "psql", "-X", "-U", "postgres",
        "-d", "postgres", "-c", "SELECT 1"]);
      if (probe.status === 0) {
        await Bun.sleep(500);
        const stableProbe = docker(["exec", container, "psql", "-X", "-U", "postgres",
          "-d", "postgres", "-c", "SELECT 1"]);
        if (stableProbe.status === 0) {
          queryReady = true;
          break;
        }
      }
      await Bun.sleep(500);
    }
    expect(queryReady).toBe(true);
    for (const file of files) {
      const sql = readFileSync(join(root, file), "utf8");
      const result = docker(["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1",
        "-U", "postgres", "-d", "postgres"], sql);
      expect(result.status, `${file}\n${result.stdout}\n${result.stderr}`).toBe(0);
    }
  } finally {
    docker(["rm", "-f", container]);
  }
}, 180_000);
