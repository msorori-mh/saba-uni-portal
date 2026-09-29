import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../..");
const container = `portal-role-boundary-${process.pid}-${Math.random().toString(16).slice(2, 8)}`;
const files = [
  "tests/security/portal-role-boundary/schema.sql",
  "supabase/migrations/20260930020000_document_and_grade_write_boundaries.sql",
  "supabase/migrations/20260930021000_student_request_role_boundary.sql",
  "tests/security/portal-role-boundary/matrix.sql",
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
